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

/** Same as `nearestDockLeft`, but against an arbitrary reference x rather than the strip's
 *  CURRENT scrollLeft — used by early-takeover to find the card nearest a PROJECTED endpoint,
 *  not where the strip happens to be right now. */
function nearestDockLeftTo(x: number): number | null {
  const el = container.value
  if (!el) return null
  const kids = el.querySelectorAll<HTMLElement>('[data-date]')
  let best: number | null = null
  let bestDist = Infinity
  for (const k of kids) {
    const candidate = k.offsetLeft - STRIP_INSET_PX
    const dist = Math.abs(candidate - x)
    if (dist < bestDist) { bestDist = dist; best = candidate }
  }
  return best
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
 *  starting slope) reads as a continuation, not a correction. */
const TAKEOVER_VELOCITY = 2.2
/** Below this, treat the glide as already stopped — let the existing scrollend/debounce
 *  fallback handle it instead (a slow deliberate drag never gets fast enough to cross
 *  TAKEOVER_VELOCITY at all, so it always ends up here — exactly the "still works" case). */
const STOPPED_VELOCITY = 0.05
/** How many rAF ticks' worth of the CURRENT velocity to project forward, to guess which card
 *  the free glide was heading toward. Deliberately rough — this only has to pick the right
 *  CARD; nearestDockLeftTo snaps to its exact edge regardless of how close the projection is. */
const PROJECT_TICKS = 10

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

/** Custom scrollLeft animation, x0 -> target, along an exponential ease-out whose derivative at
 *  t=0 equals v0 (px/tick, tick ~= 16.67ms) — the SAME rate native momentum was already moving
 *  at, so there's no visible acceleration/deceleration blip at the handoff. Runs via its own
 *  rAF loop (not `scrollTo({behavior:'smooth'})`) because that API gives no control over the
 *  curve's initial slope, only its destination. */
function runTakeover(el: HTMLElement, target: number, v0: number): void {
  const x0 = el.scrollLeft
  const distance = target - x0
  if (Math.abs(v0) < 0.001 || Math.abs(distance) < 0.5) {
    if (Math.abs(distance) >= 1) { dockInFlight = true; el.scrollTo({ left: target, behavior: 'smooth' }) }
    return
  }
  const TICK_MS = 1000 / 60
  const tau = (distance / v0) * TICK_MS
  if (tau <= 0) { dockInFlight = true; el.scrollTo({ left: target, behavior: 'smooth' }); return }
  const start = performance.now()
  takeoverActive = true
  dockInFlight = true // reuse the existing flag so the eventual native 'scrollend' no-ops

  function step(now: number): void {
    if (!takeoverActive) return
    const t = now - start
    const remaining = distance * Math.exp(-t / tau)
    if (Math.abs(remaining) < 0.5) {
      el.scrollLeft = target
      takeoverActive = false
      takeoverRafId = null
      return
    }
    el.scrollLeft = target - remaining
    takeoverRafId = requestAnimationFrame(step)
  }
  takeoverRafId = requestAnimationFrame(step)
}

function maybeTakeOver(el: HTMLElement, v: number): void {
  const speed = Math.abs(v)
  if (speed >= TAKEOVER_VELOCITY || speed < STOPPED_VELOCITY) return
  const projected = el.scrollLeft + v * PROJECT_TICKS
  const target = nearestDockLeftTo(projected)
  if (target === null) return
  const clamped = Math.max(0, Math.min(target, el.scrollWidth - el.clientWidth))
  if (Math.abs(clamped - el.scrollLeft) < 1) return
  runTakeover(el, clamped, v)
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
 *  reliable (it previously wasn't — scroll-snap-type was quietly overriding it). */
function scrollToToday(smooth = true): void {
  const el = container.value
  const target = dayEl(todayISO)
  if (!el || !target) return
  const left = Math.max(0, target.offsetLeft - STRIP_INSET_PX)
  if (smooth) el.scrollTo({ left, behavior: 'smooth' })
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
