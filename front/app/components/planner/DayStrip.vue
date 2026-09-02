<script setup lang="ts">
/** The endless horizontal strip of day cards — the whole planner, replacing the old two-week
 *  grid. Starts docked on today at the left edge; extends both directions as the user nears
 *  an edge (lazy date-range fetch + windowed DOM via useDayStrip). Dragging a task near
 *  either edge auto-scrolls the strip so a day off-screen can still be a drop target.
 *
 *  Deliberately no CSS scroll-snap: even `proximity` was cutting a flick's momentum short.
 *  Native momentum runs completely untouched WHILE IT'S STILL FAST — see the early-takeover
 *  physics below for how the dock itself happens; the old settle-then-dock (native 'scrollend',
 *  with a debounced-scroll fallback for browsers that don't fire it — Safari at time of
 *  writing) survives as the fallback for whatever takeover misses. */
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { fmtISO } from '~/utils/dates'
import { useDayStrip } from '~/composables/useDayStrip'
import { decelerationFor, planDock, positionAt, stopTime } from '~/utils/dockPhysics'

const { days, todayISO, initialFetch, extendFuture, extendPast } = useDayStrip()

const container = ref<HTMLElement | null>(null)
const busyFuture = ref(false)
const busyPast = ref(false)

/** How close (px) to an edge before the window grows — generous, so the fetch/render lands
 *  well before the user actually reaches blank space. */
const EDGE_PX = 900

/** Matches .day-strip's own left padding (1.25rem) — a docked card's left edge should land
 *  exactly at the strip's visible content start, not at raw scrollLeft 0. */
const STRIP_INSET_PX = 20

function dayEl(dateISO: string): HTMLElement | null {
  return container.value?.querySelector<HTMLElement>(`[data-date="${dateISO}"]`) ?? null
}

/** The date currently at (or just past) the container's left edge — used to keep the strip
 *  visually still when days are added/removed ahead of it. */
function leadingVisibleDate(): string | null {
  const el = container.value
  if (!el) return null
  const left = el.getBoundingClientRect().left
  const kids = el.querySelectorAll<HTMLElement>('[data-date]')
  for (const k of kids) {
    if (k.getBoundingClientRect().right > left) return k.dataset.date ?? null
  }
  return kids[kids.length - 1]?.dataset.date ?? null
}

/** Run a window mutation, then restore scroll position relative to whichever date was
 *  leading the viewport before the mutation — so growing/trimming the window never causes a
 *  visible jump. */
async function withAnchor(mutate: () => Promise<void>): Promise<void> {
  const el = container.value
  if (!el) { await mutate(); return }
  const anchor = leadingVisibleDate()
  const beforeLeft = anchor ? dayEl(anchor)?.getBoundingClientRect().left : undefined

  await mutate()
  await nextTick()

  if (!anchor || beforeLeft === undefined) return
  const afterLeft = dayEl(anchor)?.getBoundingClientRect().left
  if (afterLeft !== undefined) el.scrollLeft += afterLeft - beforeLeft
}

async function onScroll(): Promise<void> {
  const el = container.value
  if (!el) return
  const distRight = el.scrollWidth - (el.scrollLeft + el.clientWidth)
  const distLeft = el.scrollLeft

  if (distRight < EDGE_PX && !busyFuture.value) {
    busyFuture.value = true
    await withAnchor(extendFuture)
    busyFuture.value = false
  }
  if (distLeft < EDGE_PX && !busyPast.value) {
    busyPast.value = true
    await withAnchor(extendPast)
    busyPast.value = false
  }

  scheduleDockFallback()
}

// --- Settle-then-dock: native momentum runs free; once it stops, the nearest card is docked
// flush to the left edge. ------------------------------------------------------------------

let dockTimer: ReturnType<typeof setTimeout> | null = null
let dockInFlight = false

/** Whichever card's left-docked scrollLeft is closest to where the strip actually is right
 *  now — the one requiring the least further travel to dock. */
function nearestDockLeft(): number | null {
  const el = container.value
  if (!el) return null
  const kids = el.querySelectorAll<HTMLElement>('[data-date]')
  let best: number | null = null
  let bestDist = Infinity
  for (const k of kids) {
    const candidate = k.offsetLeft - STRIP_INSET_PX
    const dist = Math.abs(candidate - el.scrollLeft)
    if (dist < bestDist) { bestDist = dist; best = candidate }
  }
  return best
}

/** Every card's own docked scrollLeft (offsetLeft, corrected by the strip's own inset) — the
 *  full candidate set `planDock` picks from. Plain array, not a single "nearest" answer: the
 *  physics needs to see every dock to run its own nearest-then-clamp-then-step policy, not just
 *  whichever one a simpler linear projection would have guessed. */
function allDockLefts(el: HTMLElement): number[] {
  const kids = el.querySelectorAll<HTMLElement>('[data-date]')
  return Array.from(kids, k => k.offsetLeft - STRIP_INSET_PX)
}

function dockToNearest(): void {
  const el = container.value
  if (!el) return
  const target = nearestDockLeft()
  if (target === null) return
  const clamped = Math.max(0, Math.min(target, el.scrollWidth - el.clientWidth))
  if (Math.abs(clamped - el.scrollLeft) < 1) return
  dockInFlight = true
  el.scrollTo({ left: clamped, behavior: 'smooth' })
}

// --- Early takeover: blend deceleration into docking as one motion, instead of letting native
// momentum run all the way to a dead stop and THEN animating a correction (the visible seam). --

/** px moved per rAF tick below which native momentum is "slow enough to take over" — tuned by
 *  feel within the suggested 1.5-3 range: fast enough that we're not fighting the satisfying
 *  part of a flick, slow enough that the handoff (which matches this exact speed as its
 *  starting slope) reads as a continuation, not a correction. This is also, necessarily, the
 *  EARLIEST point we can legally take over at all: macOS (and most trackpad/OS momentum
 *  implementations) owns the scroll outright for the fast part of a flick — there is no hook to
 *  intervene sooner, so "early takeover" means "as early as physically possible," not "as early
 *  as we'd like." */
const TAKEOVER_VELOCITY = 2.2
/** Below this, treat the glide as already stopped — let the existing scrollend/debounce
 *  fallback handle it instead (a slow deliberate drag never gets fast enough to cross
 *  TAKEOVER_VELOCITY at all, so it always ends up here — exactly the "still works" case). */
const STOPPED_VELOCITY = 0.05
/** The canvas's own natural deceleration, in px/tick² (tick ≈ 16.67ms, matching how velocity is
 *  sampled below) — see dockPhysics.ts's file doc comment for the full algorithm this drives.
 *  Derived from the takeover system's OLD linear projection constant (`PROJECT_TICKS = 10`,
 *  "assume the glide travels `v * 10` more ticks' worth of distance") as the starting point the
 *  spec asked for: solving `travelDistance(v, A0) = v * PROJECT_TICKS` for A0 gives
 *  `A0 = v / (2 * PROJECT_TICKS)`, evaluated at the takeover threshold itself (the fastest a
 *  handoff ever happens, so the most representative single point to anchor the constant on).
 *  Tunable by feel from here; this is deliberately just the seed, not a physically measured
 *  number. */
const PROJECT_TICKS = 10
const TAKEOVER_A0 = TAKEOVER_VELOCITY / (2 * PROJECT_TICKS)

let velocityRafId: number | null = null
let lastScrollLeft = 0
let takeoverRafId: number | null = null
let takeoverActive = false

/** Cancel takeover if the user scrolls again mid-animation (spec requirement) — detected via
 *  real input events (wheel, touch) rather than trying to distinguish "our own scrollLeft
 *  writes" from "a genuine new scroll" via the scroll event stream itself (which would see
 *  both indiscriminately). Observation only — neither listener calls preventDefault, so native
 *  wheel/touch scrolling is never intercepted; this only watches for the NEXT gesture to arrive
 *  while we're mid-animation. */
function cancelTakeover(): void {
  if (takeoverRafId !== null) { cancelAnimationFrame(takeoverRafId); takeoverRafId = null }
  takeoverActive = false
}
function onUserInputDuringTakeover(): void {
  if (takeoverActive) cancelTakeover()
}

/** Closed-form constant-deceleration drive, x0 -> target, at exactly the deceleration `a`
 *  dockPhysics.ts solved for — NOT an exponential ease (the old approach): a single continuous
 *  deceleration is what makes the manoeuvre read as one motion rather than a glide-then-correct.
 *  Runs via its own rAF loop (not `scrollTo({behavior:'smooth'})`) because that API gives no
 *  control over the curve's initial slope, only its destination — the whole point here is that
 *  the curve's slope at t=0 has to equal v0, the rate native momentum was already moving at, so
 *  there's no visible blip at the handoff. */
function runTakeover(el: HTMLElement, target: number, v0: number, a: number, onDock: boolean): void {
  const x0 = el.scrollLeft
  const st = stopTime(v0, a)

  // The manoeuvre landed somewhere that ISN'T a real dock — planDock's own documented "give up,
  // use A0" case ("if none fits ... the settle-fallback docks the remainder"). Relying on the
  // AMBIENT scroll/scrollend listeners for that remainder turned out fragile in practice:
  // Chromium can fire 'scrollend' after almost every discrete per-frame scrollLeft write during
  // this very manoeuvre (not just once at the true end), which consumes `dockInFlight` early and
  // can leave the 140ms debounce fallback racing this animation instead of running cleanly after
  // it. Calling `dockToNearest()` explicitly, synchronously, the instant we KNOW the manoeuvre is
  // over is deterministic and doesn't depend on that event timing at all.
  function finish(): void {
    if (!onDock) dockToNearest()
  }

  if (!Number.isFinite(st) || st <= 0) {
    if (Math.abs(target - x0) >= 1) { dockInFlight = true; el.scrollTo({ left: target, behavior: 'smooth' }) }
    finish()
    return
  }
  const TICK_MS = 1000 / 60
  const start = performance.now()
  takeoverActive = true
  dockInFlight = true // reuse the existing flag so the eventual native 'scrollend' no-ops

  function step(now: number): void {
    if (!takeoverActive) return
    const tTicks = (now - start) / TICK_MS
    if (tTicks >= st) {
      el.scrollLeft = target
      takeoverActive = false
      takeoverRafId = null
      finish()
      return
    }
    el.scrollLeft = positionAt(tTicks, x0, v0, a)
    takeoverRafId = requestAnimationFrame(step)
  }
  takeoverRafId = requestAnimationFrame(step)
}

/** `planDock`'s docks, clamped to the strip's actual scrollable range — and, when clamping
 *  changes the chosen target, `a` re-solved for the clamped target rather than reused (the
 *  original `a` was solved for a different distance; driving `positionAt` with it toward a
 *  DIFFERENT target would over/undershoot). Falls back to `null` (no takeover, let the existing
 *  settle-then-dock fallback handle it) on the rare edge where even the clamped target can't be
 *  reached by decelerating from here (e.g. it's now behind the direction of travel). `onDock`
 *  tells the caller whether `target` is actually one of the real dock points, or planDock's own
 *  "gave up" natural-landing point — see runTakeover's `finish()`. */
function clampedPlan(el: HTMLElement, v: number): { target: number; a: number; onDock: boolean } | null {
  const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth)
  const docks = allDockLefts(el).map(d => Math.max(0, Math.min(d, maxScrollLeft)))
  const plan = planDock(el.scrollLeft, v, docks, TAKEOVER_A0)
  if (!plan) return null
  const onDock = docks.some(d => Math.abs(d - plan.target) < 0.5)
  const target = Math.max(0, Math.min(plan.target, maxScrollLeft))
  if (target === plan.target) return { ...plan, onDock }
  const a = decelerationFor(el.scrollLeft, v, target)
  return a === null ? null : { target, a, onDock }
}

function maybeTakeOver(el: HTMLElement, v: number): void {
  // A programmatic dock scroll is already in flight (dockToNearest, scrollToToday — anything
  // that set `dockInFlight` before calling native `scrollTo({behavior:'smooth'})`) — that's not
  // a real flick decelerating toward a dock point, it's our own animation, whose slow start/end
  // reads the same as a flick settling. Without this guard, velocityTick samples that slow
  // phase and hijacks it via runTakeover, snapping back toward wherever the scroll started.
  if (dockInFlight) return
  const speed = Math.abs(v)
  if (speed >= TAKEOVER_VELOCITY || speed < STOPPED_VELOCITY) return
  const plan = clampedPlan(el, v)
  if (plan === null) return
  if (Math.abs(plan.target - el.scrollLeft) < 1) return
  runTakeover(el, plan.target, v, plan.a, plan.onDock)
}

/** Continuous rAF sampler — cheap (a subtraction and a comparison most frames) and simpler than
 *  precisely starting/stopping it around scroll activity. `takeoverActive` guards re-entrancy:
 *  while our own animation is driving scrollLeft, its deltas aren't "native momentum" to react
 *  to. */
function velocityTick(): void {
  const el = container.value
  if (el) {
    const v = el.scrollLeft - lastScrollLeft
    lastScrollLeft = el.scrollLeft
    if (!takeoverActive) maybeTakeOver(el, v)
  }
  velocityRafId = requestAnimationFrame(velocityTick)
}

/** Safari (and any other browser without 'scrollend') fallback: dock once no further scroll
 *  event has arrived for a beat. Harmless to also have this armed on browsers that DO fire
 *  'scrollend' — by the time it would fire, the position is already docked and dockToNearest
 *  no-ops (distance < 1px). */
function scheduleDockFallback(): void {
  if (dockTimer !== null) clearTimeout(dockTimer)
  dockTimer = setTimeout(dockToNearest, 140)
}

/** Native settle signal — fires once momentum/inertial scrolling has actually finished. */
function onScrollEndNative(): void {
  if (dockInFlight) { dockInFlight = false; return }
  if (dockTimer !== null) { clearTimeout(dockTimer); dockTimer = null }
  dockToNearest()
}

let autoScrollTimer: ReturnType<typeof setInterval> | null = null
function stopAutoScroll(): void {
  if (autoScrollTimer !== null) { clearInterval(autoScrollTimer); autoScrollTimer = null }
  armDirection = null
}

/** Dwell required in an edge zone before auto-scroll actually engages — so a drag that merely
 *  TRANSITS the zone (e.g. dragging between two lines within today's own card, which sits
 *  flush against the strip's left edge and therefore occupies the same x-range as the left edge
 *  zone) doesn't trip it; only a drag that's genuinely lingering there, reaching for an
 *  off-screen day, does. */
const EDGE_DWELL_MS = 250
let armDirection: 'left' | 'right' | null = null
let armSince = 0

/** Auto-scroll toward an off-screen day while dragging near either edge. Two guards fix the
 *  "ultra-weird" bug where a drag entirely WITHIN today's own docked card (or a transit toward
 *  the sidebar) would spuriously engage this: (1) never arm a direction there's nothing to
 *  scroll TOWARD — today docks flush at scrollLeft 0, so the left zone covers today's own card,
 *  and arming it with no scroll room left would still fire scrollBy/onScroll every 16ms for
 *  nothing, disrupting elementFromPoint under a stationary cursor; (2) the dwell above, for the
 *  same failure mode when scrolled forward (any docked day still starts flush at the visible
 *  left edge). */
function onDragOverStrip(e: DragEvent): void {
  const el = container.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const EDGE = 90
  const maxScrollLeft = el.scrollWidth - el.clientWidth

  let step = 0
  if (e.clientX < rect.left + EDGE && el.scrollLeft > 0) step = -16
  else if (e.clientX > rect.right - EDGE && el.scrollLeft < maxScrollLeft) step = 16

  if (step === 0) { stopAutoScroll(); return }

  const dir: 'left' | 'right' = step < 0 ? 'left' : 'right'
  if (armDirection !== dir) {
    // Just entered this zone (or reversed direction) — start the dwell clock, don't engage yet.
    stopAutoScroll()
    armDirection = dir
    armSince = performance.now()
    return
  }
  if (autoScrollTimer !== null) return
  if (performance.now() - armSince < EDGE_DWELL_MS) return

  autoScrollTimer = setInterval(() => {
    container.value?.scrollBy({ left: step })
    onScroll()
  }, 16)
}

/** Docks today flush at the strip's left edge — same STRIP_INSET_PX math as dockToNearest,
 *  so "jump to today" and "settle after a flick" always agree on where a docked card sits.
 *  Now that the container carries no CSS scroll-snap at all, a plain scrollLeft assignment is
 *  reliable (it previously wasn't — scroll-snap-type was quietly overriding it).
 *  The smooth branch is a native `scrollTo({behavior:'smooth'})` just like dockToNearest's — it
 *  needs the same `dockInFlight` guard (see maybeTakeOver's doc comment) so early-takeover can't
 *  sample its slow start/end and hijack it: a long smooth scroll (docking from far away) spends
 *  longer in the low-velocity band where an unguarded maybeTakeOver would misfire and snap the
 *  strip back toward its starting position instead of docking on today. */
function scrollToToday(smooth = true): void {
  const el = container.value
  const target = dayEl(todayISO)
  if (!el || !target) return
  const left = Math.max(0, target.offsetLeft - STRIP_INSET_PX)
  if (smooth) { dockInFlight = true; el.scrollTo({ left, behavior: 'smooth' }) }
  else el.scrollLeft = left
}

/** The very first centering has to wait for the strip's own box to settle to its final width
 *  (sidebar/header layout, scrollbars) — a single rAF isn't always enough. A ResizeObserver
 *  that only fires the centering once the size has been quiet for a beat is more robust than
 *  guessing a frame count. */
let centered = false
let settleTimer: ReturnType<typeof setTimeout> | null = null
let resizeObserver: ResizeObserver | null = null

function scheduleInitialCenter(): void {
  if (centered) return
  if (settleTimer !== null) clearTimeout(settleTimer)
  settleTimer = setTimeout(() => {
    if (centered) return
    centered = true
    scrollToToday(false)
    resizeObserver?.disconnect()
  }, 120)
}

onMounted(async () => {
  await initialFetch()
  await nextTick()
  if (container.value) {
    resizeObserver = new ResizeObserver(scheduleInitialCenter)
    resizeObserver.observe(container.value)
    lastScrollLeft = container.value.scrollLeft
  }
  scheduleInitialCenter()
  velocityRafId = requestAnimationFrame(velocityTick)
})

onBeforeUnmount(() => {
  if (velocityRafId !== null) cancelAnimationFrame(velocityRafId)
  cancelTakeover()
})

defineExpose({ scrollToToday })
</script>

<template>
  <div
    ref="container"
    class="day-strip thin-scroll"
    @scroll="onScroll"
    @scrollend="onScrollEndNative"
    @wheel.passive="onUserInputDuringTakeover"
    @touchstart.passive="onUserInputDuringTakeover"
    @dragover.prevent="onDragOverStrip"
    @dragleave="stopAutoScroll"
    @drop="stopAutoScroll"
  >
    <DayCard
      v-for="d in days"
      :key="fmtISO(d)"
      :data-date="fmtISO(d)"
      :date="d"
      :is-today="fmtISO(d) === todayISO"
    />
  </div>
</template>
