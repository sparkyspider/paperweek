<script setup lang="ts">
/** The endless horizontal strip of day cards — the whole planner, replacing the old two-week
 *  grid. Starts docked on today at the left edge; extends both directions as the user nears
 *  an edge (lazy date-range fetch + windowed DOM via useDayStrip). Dragging a task near
 *  either edge auto-scrolls the strip so a day off-screen can still be a drop target.
 *
 *  Deliberately no CSS scroll-snap: even `proximity` was cutting a flick's momentum short.
 *
 *  SCROLL OWNERSHIP (WHEEL_OWNERSHIP = true, the default): the strip owns wheel-driven scrolling
 *  outright rather than observing native momentum and grabbing it partway through. A single
 *  non-passive `wheel` listener (`onWheel`) `preventDefault()`s every horizontal-intent event
 *  and drives `scrollLeft` by hand — during the actual touch, `wheelIntent.ts` classifies each
 *  delta as FINGER (apply it directly, same as before) or MOMENTUM (the browser's own synthetic
 *  tail after lift-off — IGNORED entirely, never applied); the moment a genuine release is
 *  detected (a confirmed MOMENTUM sample, or silence past RELEASE_GAP_MS), `handleFingerRelease`
 *  runs dockPhysics's closed-form manoeuvre from the TRUE last finger velocity — one continuous
 *  glide from the exact instant of release, not from wherever native momentum happened to have
 *  decayed to by the time an observer could react. A DISCRETE sample (an isolated mouse-wheel
 *  notch) gets its own small immediate scroll + settle, no glide. New finger input arriving
 *  mid-manoeuvre cancels it and resumes hands-on driving instantly (see `onWheel`).
 *
 *  While a wheel gesture is OWNED (`wheelGestureActive`, from its first owned event until its
 *  own landing/settle completes) the AMBIENT dock triggers — native 'scrollend' and the 140ms
 *  scroll-debounce — are gated off: Chromium fires 'scrollend' after every discrete scrollLeft
 *  write, so during the finger phase and the glide they were calling dockToNearest() dozens of
 *  times per gesture (25 in one diagnosed flick), each one a native smooth scroll fighting the
 *  hand-driven position. The gesture's own paths (`runTakeover`'s `finish`, the release/settle
 *  handlers) dock deterministically and clear the gate; non-wheel scrolling (scrollbar drag,
 *  touch, programmatic) never sets it, so its scrollend/debounce docking is unchanged.
 *
 *  Keyboard arrows, scrollbar dragging, drag-edge auto-scroll (`onDragOverStrip`), and every
 *  programmatic scroll (week-nav, Today, docking itself) are native/programmatic throughout and
 *  entirely unaffected — only the wheel/trackpad input CHANNEL is intercepted.
 *
 *  FALLBACK (WHEEL_OWNERSHIP = false): the previous design — native momentum runs completely
 *  untouched while it's still fast, a continuous rAF sampler (`velocityTick`/`maybeTakeOver`)
 *  watches scrollLeft and grabs the manoeuvre once its velocity decays into a takeover window
 *  (the earliest point a mere OBSERVER can legally intervene, since it can't preventDefault
 *  anything). Flip the flag back to this if wheel ownership ever misbehaves on some device/
 *  browser; both paths share the exact same dockPhysics-driven `runTakeover`/`clampedPlan`
 *  machinery below, only how (and how early) a manoeuvre gets triggered differs. The old
 *  settle-then-dock fallback (native 'scrollend', with a debounced-scroll fallback for browsers
 *  that don't fire it) survives under BOTH paths as the safety net for whatever either one
 *  misses. */
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { fmtISO } from '~/utils/dates'
import { useDayStrip } from '~/composables/useDayStrip'
import { planDock, planPositionAt, planToTarget, type DockPlan } from '~/utils/dockPhysics'
import { BURST_GAP_MS, createWheelIntentTracker, normalizeWheelDelta, type WheelIntent } from '~/utils/wheelIntent'

/** The fallback flag (see file doc comment above): flip to `false` to restore the previous
 *  observe-and-takeover-only design if full wheel ownership ever misbehaves on some device. */
const WHEEL_OWNERSHIP = true

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
/** Feel multiplier on the seed above. 1 = the seed. Mark, 2026-09-03, on the real trackpad after
 *  the latched-tail fix: "we need more friction, maybe double" — so 2. Bigger = shorter glides,
 *  the planner still lands every one flush on a day. */
const FRICTION = 2
const PROJECT_TICKS = 10
const TAKEOVER_A0 = FRICTION * TAKEOVER_VELOCITY / (2 * PROJECT_TICKS)

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
  // A touch abandons any owned wheel gesture outright (no landing of ours will follow to clear
  // the gate) — hand docking back to the ambient scrollend/debounce path for the touch scroll.
  wheelGestureActive = false
  setGestureState('STILL') // gesture: touch abandons whatever was in flight -> STILL
}

/** Closed-form drive, x0 -> target, along the ONE plan dockPhysics.ts solved for this release —
 *  constant deceleration at exactly the solved `a` (the model), or, only when the model's own
 *  duration left the sane band, its bounded Hermite fallback (see `planDock`). NOT an
 *  exponential ease (the old approach): a single continuous deceleration is what makes the
 *  manoeuvre read as one motion rather than a glide-then-correct. Runs via its own rAF loop (not
 *  `scrollTo({behavior:'smooth'})`) because that API gives no control over the curve's initial
 *  slope, only its destination — the whole point here is that the curve's slope at t=0 has to
 *  equal v0, the rate the finger released at, so there's no visible blip at the handoff.
 *
 *  LANDING (2026-09-03, the 0.5px-every-80ms tail): the loop finishes and writes `target`
 *  outright the moment the planned position is within 0.5px of it OR t ≥ T — it never lets the
 *  curve's sub-pixel remainder creep in on its own. Every intermediate write is rounded to 0.5px
 *  (Chromium quantises scrollLeft to 0.5px at DPR 2; writing 17600.74 then 17600.53 and having
 *  both paint as 17600.5 is the stutter). */
function runTakeover(el: HTMLElement, plan: DockPlan, v0: number, onDock: boolean): void {
  const x0 = el.scrollLeft
  const { target, T } = plan
  setGestureState('DECELERATING', target) // gesture: manoeuvre starts -> DECELERATING

  // `onDock` is false only when planDock had NO dock ahead to land on (its step 6 — since
  // 2026-09-03 it never gives up while one exists: "Always lands on a day perfectly"), so this
  // remainder-dock is now the rare edge, not the common tail. Relying on the
  // AMBIENT scroll/scrollend listeners for that remainder turned out fragile in practice:
  // Chromium can fire 'scrollend' after almost every discrete per-frame scrollLeft write during
  // this very manoeuvre (not just once at the true end), which consumes `dockInFlight` early and
  // can leave the 140ms debounce fallback racing this animation instead of running cleanly after
  // it. Calling `dockToNearest()` explicitly, synchronously, the instant we KNOW the manoeuvre is
  // over is deterministic and doesn't depend on that event timing at all. This is also where an
  // owned wheel gesture ENDS (`wheelGestureActive` cleared) — the ambient triggers stay gated
  // until the manoeuvre has actually landed (or handed its remainder to one explicit dock).
  function finish(): void {
    if (!onDock) dockToNearest()
    wheelGestureActive = false
    setGestureState('STILL') // gesture: manoeuvre landed (or handed its remainder to one dock) -> STILL
  }

  if (!Number.isFinite(T) || T <= 0) {
    // Degenerate plan (unreachable with a solved plan, kept as a guard): place it directly rather
    // than a native smooth scroll — no second animated motion may ever follow a glide.
    if (Math.abs(target - x0) >= 0.5) el.scrollLeft = target
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
    const p = planPositionAt(tTicks, x0, v0, plan)
    if (tTicks >= T || Math.abs(target - p) < 0.5) {
      el.scrollLeft = target // snap the last half pixel — never a creeping remainder
      takeoverActive = false
      takeoverRafId = null
      finish()
      return
    }
    el.scrollLeft = Math.round(p * 2) / 2
    takeoverRafId = requestAnimationFrame(step)
  }
  takeoverRafId = requestAnimationFrame(step)
}

/** `planDock`'s docks, clamped to the strip's actual scrollable range — and, when clamping
 *  changes the chosen target, the plan re-solved for the clamped target (`planToTarget`, the
 *  same bounded solve) rather than reused (the original was solved for a different distance;
 *  driving it toward a DIFFERENT target would over/undershoot). Falls back to `null` (no
 *  takeover, let the existing settle-then-dock fallback handle it) on the rare edge where even
 *  the clamped target can't be reached by decelerating from here (e.g. it's now behind the
 *  direction of travel). `onDock` tells the caller whether the target is actually one of the
 *  real dock points, or planDock's no-dock-ahead natural-landing point — see runTakeover's
 *  `finish()`. */
function clampedPlan(el: HTMLElement, v: number): { plan: DockPlan; onDock: boolean } | null {
  const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth)
  const docks = allDockLefts(el).map(d => Math.max(0, Math.min(d, maxScrollLeft)))
  const plan = planDock(el.scrollLeft, v, docks, TAKEOVER_A0)
  if (!plan) return null
  const onDock = docks.some(d => Math.abs(d - plan.target) < 0.5)
  const target = Math.max(0, Math.min(plan.target, maxScrollLeft))
  if (target === plan.target) return { plan, onDock }
  const bounded = planToTarget(el.scrollLeft, v, target)
  return bounded === null ? null : { plan: bounded, onDock }
}

// --- Full scroll ownership (WHEEL_OWNERSHIP): a non-passive wheel listener owns horizontal
// wheel/trackpad input outright — preventDefault on every such event, drive scrollLeft by hand
// during the touch, and run the SAME dockPhysics manoeuvre (clampedPlan/runTakeover above) from
// the true release velocity the instant a release is detected. See the file doc comment for the
// full picture; wheelIntent.ts does the FINGER/MOMENTUM/DISCRETE classification this depends on.
// -------------------------------------------------------------------------------------------

const wheelTracker = createWheelIntentTracker()
/** tick-normalised (px/tick, tick ≈ 16.67ms — the same unit dockPhysics assumes throughout) EMA
 *  of recent FINGER-sample velocity, fed from the tracker's own `lastRate()` — the ONE
 *  speedometer (wheelIntent.ts file doc comment: rate over the event's OS timestamp, guarded),
 *  not a second one on the dispatch clock (which read Mark's sawtooth at ~1.5 px/tick by
 *  release, 2026-09-03). Blended, not the bare last-sample rate, so one unusual inter-event gap
 *  right at release doesn't single-handedly set the manoeuvre's whole starting speed. */
let wheelVelocity = 0
let wheelReleaseTimer: ReturnType<typeof setTimeout> | null = null
/** Guards `handleFingerRelease` against running twice for the same lift-off: a confirmed
 *  MOMENTUM sample and the silence timer below are two independent triggers racing to detect
 *  the SAME release, and only the first to arrive should actually start a manoeuvre. Reset the
 *  moment fresh finger input arrives (a new gesture — or new input cancelling an in-flight
 *  manoeuvre — always gets to release again). */
let wheelReleasedThisGesture = false
/** The ambient-dock GATE (see the file doc comment): true from the first owned wheel event of a
 *  gesture until the gesture's own landing/settle path completes (`runTakeover`'s `finish`, or
 *  the explicit dock in `handleFingerRelease`/`handleDiscreteSettle`), or a touch abandons it.
 *  While set, `onScrollEndNative` and the scroll-debounce fallback do nothing. */
let wheelGestureActive = false
/** `performance.now()` of the last wheel event this handler OWNED (any intent, momentum
 *  included — the tracker's own `t` clock sees the same events). Bounds
 *  the diagonal-sample rule in `onWheel` to the live burst, not the whole glide. */
let wheelLastOwnedT = 0

/** Silence past this long, with no further wheel event at all, reads as a release even on a
 *  device/browser that never sends synthetic momentum events after lift-off — the fallback
 *  trigger alongside a confirmed MOMENTUM classification (whichever fires first wins, see
 *  `wheelReleasedThisGesture`). */
const WHEEL_RELEASE_GAP_MS = 80
/** Below this (px/tick) at release, there's nothing worth gliding for — just settle onto
 *  whichever dock is already nearest, same as a discrete notch's own settle. */
const WHEEL_STOPPED_VELOCITY = 0.05

// --- Dev-only wheel debug overlay (?wheeldebug=1) ------------------------------------------
// Mark can't be watched flicking his own trackpad the way a screen-share session could be, and
// this whole feature is Firefox-first behaviour that's genuinely hard to verify without his own
// hand on his own hardware — so the app becomes the instrument instead. `wheelDebugEnabled` is
// resolved once on mount from the URL query AND `import.meta.dev` (Nuxt's own dev-build compile
// -time flag — this whole block, template included, is entirely absent from a production
// build, never just hidden). The state below is only ever written to when the overlay is
// actually on, so there's zero cost to a normal (non-debug) session either way.
const wheelDebugEnabled = ref(false)
interface WheelDebugState {
  intent: WheelIntent | 'idle'
  normalizedDelta: number
  velocity: number
  ownership: 'native' | 'manual' | 'manoeuvre'
  plannedTarget: number | null
  solvedA: number | null
  plannedT: number | null
  profile: DockPlan['profile'] | null
}
const wheelDebug = ref<WheelDebugState>({
  intent: 'idle', normalizedDelta: 0, velocity: 0, ownership: 'native', plannedTarget: null, solvedA: null, plannedT: null, profile: null,
})
const wheelDebugText = computed(() => {
  const d = wheelDebug.value
  const fmt = (n: number | null) => (n === null ? '—' : n.toFixed(2))
  return [
    `wheel debug  (A0=${TAKEOVER_A0.toFixed(4)}) rev rate+band`,
    `intent:      ${d.intent}`,
    `delta:       ${fmt(d.normalizedDelta)} px`,
    `velocity:    ${fmt(d.velocity)} px/tick`,
    `ownership:   ${d.ownership}`,
    `target:      ${fmt(d.plannedTarget)}`,
    `solved a*:   ${fmt(d.solvedA)}`,
    `duration:    ${fmt(d.plannedT)} ticks ${d.profile ?? ''}`,
  ].join('\n')
})

// --- Gesture state machine (Mark, 2026-09-03: "STILL, DRAGGING, DECELLERATING") --------------
// Observation only — nothing reads it back to steer behaviour. STILL: no wheel input applied and
// no manoeuvre running. DRAGGING: finger/discrete wheel input is driving scrollLeft by hand.
// DECELERATING: `runTakeover` is driving the strip from release velocity to its target. Each
// transition is set at exactly one documented point (grep `setGestureState`). The console line
// is the live recorder's feed (rig/live-recorder.mjs) — dev-only and gated on the HUD, so a
// production build never logs (the deliberate exception to rules-autodoc-logging.md §3).
type GestureState = 'STILL' | 'DRAGGING' | 'DECELERATING'
const gestureState = ref<GestureState>('STILL')
const GESTURE_STATE_CLASS: Record<GestureState, string> = {
  STILL: 'text-neutral-400', DRAGGING: 'text-sky-400', DECELERATING: 'text-red-400',
}
function setGestureState(to: GestureState, target: number | null = null): void {
  const from = gestureState.value
  if (from === to) return
  gestureState.value = to
  // Plan counter rule (Marlow, 2026-09-03): the counter counts plans SINCE THE LAST NEW TOUCH, so
  // it resets on every entry into DRAGGING (STILL→DRAGGING or DECELERATING→DRAGGING — a re-touch
  // that cancels a manoeuvre is a new touch too). Mark's "resets every time it's been still for
  // 2 seconds" is kept as well: armed on entering STILL, disarmed the moment the state leaves it.
  if (planResetTimer !== null) { clearTimeout(planResetTimer); planResetTimer = null }
  if (to === 'DRAGGING') resetPlanCount()
  else if (to === 'STILL') planResetTimer = setTimeout(resetPlanCount, PLAN_RESET_STILL_MS)
  if (wheelDebugEnabled.value) {
    const x = container.value ? container.value.scrollLeft.toFixed(1) : '-'
    console.log(`[gesture] ${from} -> ${to} t=${performance.now().toFixed(1)} x=${x} v=${wheelVelocity.toFixed(3)} target=${target === null ? '-' : target.toFixed(1)}`)
  }
}

// Mark, 2026-09-03: "a fading PING when it calculates. It should only ever calculate ONCE. The
// deceleration required to land." `notePlan` is called at the ONE place the release manoeuvre
// is solved (handleFingerRelease's clampedPlan) — the HUD flashes "PING" and fades over 1.5s,
// and a small `plans: N` counter on the HUD counts the solves SINCE THE LAST NEW TOUCH: it is
// reset on every transition into DRAGGING and after 2s of continuous STILL (`setGestureState`).
// "Once" means once per touch, so ten quick flicks are ten separate plans, not a violation (the
// first HUD counted them cumulatively across the 2s window and cried "PING x10" — a false alarm).
// A violation is a second solve WITHOUT the machine having passed through DRAGGING since the
// previous one (planCount > 1): shown red as "PING xN", kept visible until the counter resets,
// and logged as a `[plan-violation]` console line for the live recorder.
const PLAN_RESET_STILL_MS = 2000
const planCount = ref(0)
let planResetTimer: ReturnType<typeof setTimeout> | null = null
const pingVisible = ref(false)
const pingViolation = ref(false)
const pingText = ref('PING')
let pingTimer: ReturnType<typeof setTimeout> | null = null
function resetPlanCount(): void {
  planResetTimer = null
  planCount.value = 0
  pingViolation.value = false
}
function notePlan(plan: DockPlan | null): void {
  planCount.value++
  if (!wheelDebugEnabled.value) return
  const x = container.value ? container.value.scrollLeft.toFixed(1) : '-'
  console.log(`[plan] #${planCount.value} t=${performance.now().toFixed(1)} x=${x} v=${wheelVelocity.toFixed(3)} target=${plan ? plan.target.toFixed(1) : '-'} a=${plan ? plan.a.toFixed(4) : '-'} T=${plan ? plan.T.toFixed(1) : '-'} profile=${plan ? plan.profile : '-'}`)
  pingViolation.value = planCount.value > 1
  pingText.value = planCount.value > 1 ? `PING x${planCount.value}` : 'PING'
  if (pingViolation.value) console.log(`[plan-violation] #${planCount.value} plans since the last new touch (no DRAGGING between them) t=${performance.now().toFixed(1)} x=${x} target=${plan ? plan.target.toFixed(1) : '-'}`)
  pingVisible.value = true
  if (pingTimer !== null) clearTimeout(pingTimer)
  pingTimer = setTimeout(() => { pingVisible.value = false }, 50) // one paint at full opacity, then the CSS fade
}

function clearWheelReleaseTimer(): void {
  if (wheelReleaseTimer !== null) { clearTimeout(wheelReleaseTimer); wheelReleaseTimer = null }
}

/** Runs the ONE manoeuvre from the true release state — the user's original algorithm in full,
 *  triggered from an actual measured finger velocity instead of a later, already-decayed
 *  observation of native momentum. Idempotent per gesture (see `wheelReleasedThisGesture`). */
function handleFingerRelease(): void {
  if (wheelReleasedThisGesture) return
  wheelReleasedThisGesture = true
  clearWheelReleaseTimer()
  const el = container.value
  if (!el) return
  if (Math.abs(wheelVelocity) < WHEEL_STOPPED_VELOCITY) {
    if (wheelDebugEnabled.value) wheelDebug.value = { ...wheelDebug.value, ownership: 'native', plannedTarget: null, solvedA: null, plannedT: null, profile: null }
    dockToNearest()
    wheelGestureActive = false
    setGestureState('STILL') // gesture: released stopped, no manoeuvre -> STILL
    return
  }
  const solved = clampedPlan(el, wheelVelocity)
  notePlan(solved?.plan ?? null) // the ONE solve per gesture (HUD "PING" + `[plan]` line)
  if (solved === null) {
    if (wheelDebugEnabled.value) wheelDebug.value = { ...wheelDebug.value, ownership: 'native', plannedTarget: null, solvedA: null, plannedT: null, profile: null }
    dockToNearest()
    wheelGestureActive = false
    setGestureState('STILL') // gesture: released with no reachable plan -> STILL
    return
  }
  const { plan, onDock } = solved
  if (wheelDebugEnabled.value) wheelDebug.value = { ...wheelDebug.value, ownership: 'manoeuvre', plannedTarget: plan.target, solvedA: plan.a, plannedT: plan.T, profile: plan.profile }
  if (Math.abs(plan.target - el.scrollLeft) < 1) { wheelGestureActive = false; setGestureState('STILL'); return } // gesture: already on target -> STILL
  runTakeover(el, plan, wheelVelocity, onDock)
}

/** A discrete notch has no meaningful "release velocity" to carry into a glide the way a
 *  finger-flick does — after a short idle with no further notch, it just settles onto the
 *  nearest dock directly, no closed-form deceleration. */
function handleDiscreteSettle(): void {
  wheelReleasedThisGesture = true
  clearWheelReleaseTimer()
  if (wheelDebugEnabled.value) wheelDebug.value = { ...wheelDebug.value, ownership: 'native', plannedTarget: null, solvedA: null, plannedT: null, profile: null }
  dockToNearest()
  wheelGestureActive = false
  setGestureState('STILL') // gesture: discrete notch settled -> STILL
}

/** The strip's own wheel listener when WHEEL_OWNERSHIP is on — bound WITHOUT `.passive` (Vue's
 *  default for a plain `@wheel` binding) specifically so `preventDefault()` is legal here. Every
 *  horizontal-intent event (dominant deltaX, or shift+wheel — the standard convention for "make
 *  this vertical wheel motion scroll horizontally") is owned outright: native scrolling for it
 *  is fully suppressed, and this drives `scrollLeft` itself instead, sourced from the SAME wheel
 *  stream `wheelIntent.ts` classifies into FINGER (apply directly), MOMENTUM (discard — the
 *  glide is ours now, not the browser's), or DISCRETE (apply, then settle without a glide). A
 *  vertical-intent wheel event over the strip is left completely alone (no preventDefault, no
 *  handling at all) — this strip only ever scrolls horizontally, so vertical input here isn't
 *  this component's to take.
 *
 *  DIAGONAL SAMPLES INSIDE AN OWNED GESTURE: once a gesture is owned (`wheelGestureActive`) and
 *  its burst is still live (an owned event within BURST_GAP_MS), any event carrying a non-zero
 *  deltaX is owned too — even one whose deltaY happens to be larger — and its deltaX is fed to
 *  the tracker. A trackpad tail is rarely perfectly axis-aligned, and a single slightly-diagonal
 *  sample judged per-event would slip past the horizontal gate, scroll natively underneath the
 *  manoeuvre AND leave a hole in the classifier's stream. Pure-vertical events (deltaX 0) and
 *  vertical-first gestures (nothing owned yet, or the burst gap has elapsed) are still left
 *  alone entirely.
 *
 *  Raw event deltas are normalized by `deltaMode` FIRST, before anything else sees them —
 *  Firefox frequently reports DOM_DELTA_LINE (small integers, "N lines") for gestures Chromium
 *  reports as DOM_DELTA_PIXEL for; every threshold downstream (wheelIntent.ts's cadence-in-ms
 *  and sample-to-sample RATIOS, this handler's own velocity math) assumes one consistent pixel
 *  unit, and normalizing here is the one place that has to hold for both to agree. See
 *  wheelIntent.ts's own doc comment on `normalizeWheelDelta` for why the classifier itself needs
 *  no further changes for this — its thresholds are either time-based or scale-invariant
 *  ratios. */
function onWheel(e: WheelEvent): void {
  if (!WHEEL_OWNERSHIP) { onUserInputDuringTakeover(); return }

  const now = performance.now()
  const byMagnitude = Math.abs(e.deltaX) >= Math.abs(e.deltaY)
  const horizontal = byMagnitude || e.shiftKey
  const diagonalInGesture = wheelGestureActive && e.deltaX !== 0 && now - wheelLastOwnedT < BURST_GAP_MS
  if (!horizontal && !diagonalInGesture) return

  e.preventDefault()
  const el = container.value
  if (!el) return
  wheelGestureActive = true
  wheelLastOwnedT = now

  // shift+wheel maps the vertical axis onto the strip; everything else owned here rides deltaX.
  const rawDx = byMagnitude ? e.deltaX : e.shiftKey ? e.deltaY : e.deltaX
  const dx = normalizeWheelDelta(rawDx, e.deltaMode, el.clientWidth)
  // Two clocks, deliberately: `t` is when WE saw the event (cadence, burst gaps); `ts` is the
  // event's own OS timestamp, which the delta was measured against (rate) — wheelIntent.ts.
  const intent = wheelTracker.push({ dx, t: now, ts: e.timeStamp })
  if (wheelDebugEnabled.value) wheelDebug.value = { ...wheelDebug.value, intent, normalizedDelta: dx }

  if (intent === 'momentum') {
    // Discard entirely — never applied to scrollLeft. This IS the release signal (see the file
    // doc comment): run the manoeuvre now, from the velocity already measured during the finger
    // phase, not from whatever this (or any later) momentum sample happens to say.
    handleFingerRelease()
    return
  }

  // New real input (finger or discrete) always wins over anything in flight — cancel any
  // manoeuvre already running and hand control straight back to direct manual driving.
  if (takeoverActive) cancelTakeover()
  wheelReleasedThisGesture = false
  setGestureState('DRAGGING') // gesture: first owned finger/discrete sample, or a re-touch cancelling a manoeuvre -> DRAGGING

  const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth)
  el.scrollLeft = Math.max(0, Math.min(el.scrollLeft + dx, maxScrollLeft))

  const instantV = wheelTracker.lastRate()
  wheelVelocity = intent === 'discrete' ? instantV : wheelVelocity * 0.5 + instantV * 0.5

  if (wheelDebugEnabled.value) {
    wheelDebug.value = { ...wheelDebug.value, ownership: 'manual', velocity: wheelVelocity, plannedTarget: null, solvedA: null, plannedT: null, profile: null }
  }

  clearWheelReleaseTimer()
  wheelReleaseTimer = setTimeout(intent === 'discrete' ? handleDiscreteSettle : handleFingerRelease, WHEEL_RELEASE_GAP_MS)
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
  const solved = clampedPlan(el, v)
  if (solved === null) return
  if (Math.abs(solved.plan.target - el.scrollLeft) < 1) return
  runTakeover(el, solved.plan, v, solved.onDock)
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
  dockTimer = setTimeout(() => {
    dockTimer = null
    // Gated off during an owned wheel gesture — its own landing docks (file doc comment).
    if (wheelGestureActive) return
    dockToNearest()
  }, 140)
}

/** Native settle signal — fires once momentum/inertial scrolling has actually finished. Gated
 *  off during an owned wheel gesture (Chromium fires this after EVERY discrete scrollLeft write,
 *  so it would otherwise dock dozens of times mid-gesture — see the file doc comment); the
 *  `dockInFlight` handshake below is for the native smooth scrolls this component starts itself. */
function onScrollEndNative(): void {
  if (wheelGestureActive) return
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
  // Dev-only wheel debug overlay — `import.meta.dev` is Nuxt's own compile-time flag (false,
  // and this whole branch dead-code-eliminated, in a production build; never merely hidden by
  // runtime state in prod). `?wheeldebug=1` opts in per-session on top of that.
  if (import.meta.dev) {
    wheelDebugEnabled.value = new URLSearchParams(window.location.search).get('wheeldebug') === '1'
  }
  await initialFetch()
  await nextTick()
  if (container.value) {
    resizeObserver = new ResizeObserver(scheduleInitialCenter)
    resizeObserver.observe(container.value)
    lastScrollLeft = container.value.scrollLeft
  }
  scheduleInitialCenter()
  // The rAF velocity sampler only has a job under the FALLBACK path — under full wheel
  // ownership, scrollLeft is never driven by anything this sampler would need to observe
  // (native wheel momentum never runs at all, since every horizontal wheel event is
  // preventDefault'd; the ownership path triggers its own manoeuvre directly from the wheel
  // stream instead, see onWheel). Leaving it running under ownership would just have it watch
  // OUR OWN scrollLeft writes and risk a redundant/competing takeover attempt.
  if (!WHEEL_OWNERSHIP) velocityRafId = requestAnimationFrame(velocityTick)
})

onBeforeUnmount(() => {
  if (velocityRafId !== null) cancelAnimationFrame(velocityRafId)
  cancelTakeover()
  if (planResetTimer !== null) clearTimeout(planResetTimer)
  if (pingTimer !== null) clearTimeout(pingTimer)
})

defineExpose({ scrollToToday })
</script>

<template>
  <div
    ref="container"
    class="day-strip thin-scroll"
    @scroll="onScroll"
    @scrollend="onScrollEndNative"
    @wheel="onWheel"
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

  <!-- Dev-only wheel debug overlay — see the onMounted doc comment above for the two gates
       (import.meta.dev at BUILD time, ?wheeldebug=1 per-session on top). Deliberately plain,
       technical HUD styling (monospace, dark, top-left) rather than anything matching the app's
       own paper look — it should read unmistakably as instrumentation, not UI. -->
  <div
    v-if="wheelDebugEnabled"
    class="pointer-events-none fixed left-2 top-2 z-50 whitespace-pre rounded-none bg-black/80 px-2 py-1.5 font-mono text-[11px] leading-[15px] text-lime-300"
    aria-hidden="true"
  ><div class="flex items-baseline gap-3"><span :class="['text-[22px] font-bold leading-7', GESTURE_STATE_CLASS[gestureState]]">{{ gestureState }}</span><span
      :class="['text-[22px] font-bold leading-7 transition-opacity ease-out', pingViolation ? 'text-red-500' : 'text-amber-300']"
      :style="{ opacity: pingVisible || pingViolation ? 1 : 0, transitionDuration: pingVisible || pingViolation ? '0ms' : '1500ms' }"
    >{{ pingText }}</span></div><div :class="pingViolation ? 'text-red-400' : 'text-lime-300'">plans:       {{ planCount }}</div>{{ wheelDebugText }}</div>
</template>
