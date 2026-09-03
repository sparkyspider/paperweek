/**
 * Constant-deceleration docking kinematics for the day strip's "early takeover" (see
 * DayStrip.vue). Pure functions only — no DOM, no Vue, no rAF — so the whole manoeuvre can be
 * reasoned about and unit-tested as plain arithmetic before a single frame of it ever touches a
 * scrollLeft.
 *
 * THE IDEA: at the moment native momentum has decelerated enough that we take over (see
 * DayStrip.vue's TAKEOVER_VELOCITY), we know where the strip is (`x`) and how fast it's still
 * moving (`v`, px/tick). Left alone, at the canvas's own natural friction `A0` it would glide a
 * further `travelDistance(v, A0)` px and stop at `naturalLanding`. Instead of letting it stop
 * there (off a card edge) and THEN animating a correction (the old two-phase "settle, then
 * dock" — a visible seam), we pick whichever dock is nearest that natural landing and solve the
 * ONE deceleration (`decelerationFor`) that lands EXACTLY there, starting from the exact (x, v)
 * we already have. Because the target is the dock nearest where we were already headed, the
 * solved deceleration is automatically close to A0 — the manoeuvre reads as one continuous
 * glide, never a visible brake or a snap.
 *
 * BOUNDED (2026-09-03): the duration T = 2·d/|v| that falls out of that solve is kept inside
 * [MIN_TICKS, MAX_TICKS] by choosing a different DAY (never by changing the model), and only when
 * no day at all fits the band does a cubic Hermite profile over T = FALLBACK_TICKS stand in — see
 * `planDock`. Constant deceleration solved from distance stays THE model.
 *
 * MARK'S RULING (2026-09-03): "If it looks like it'll get there in less than 3 seconds, let it
 * get there by itself. If not, do what you do." So MAX_TICKS is 180 (3s at 60Hz): any pure
 * constant-deceleration solve that lands in under 3s runs as pure physics, however long it
 * glides; only when no day is reachable that way does the bounded Hermite fallback step in, and
 * THAT keeps its own, separate duration, FALLBACK_TICKS = 48 (0.8s).
 *
 * Units: `x` in px (scrollLeft), `v` in px/tick, `a` in px/tick², `t` in ticks — a "tick" is
 * one rAF frame (~16.67ms), matching how DayStrip.vue already samples velocity
 * (`el.scrollLeft - lastScrollLeft` once per frame). Keeping everything in tick-space rather
 * than seconds means the call site never has to convert; DayStrip.vue's own rAF loop IS the
 * clock these functions assume.
 */

/** How far (px) a glide moving at `v` (px/tick) travels before stopping under constant
 *  deceleration `a` (px/tick²). Standard v² = 2·a·d, solved for d. */
export function travelDistance(v: number, a: number): number {
  return (v * v) / (2 * a)
}

/** Where a glide starting at `x` with velocity `v` would naturally come to rest under constant
 *  deceleration `a`, if nothing intervened. Symmetric in the sign of `v`: reversing velocity
 *  reverses which direction the landing sits from `x`, never how far. */
export function naturalLanding(x: number, v: number, a: number): number {
  return x + Math.sign(v) * travelDistance(v, a)
}

/** The dock (from `docks`, a list of scrollLeft values) nearest `landing`. Ties broken TOWARD
 *  the direction of motion — continuing the glide reads as one gesture; picking the dock that'd
 *  require the tiniest reversal does not. `direction` is `Math.sign(v)` at the call site: a
 *  scalar `landing` alone can't recover which way the glide was heading, so the caller supplies
 *  it explicitly rather than this function guessing from the sign of `landing - x` (which it
 *  doesn't even have `x` to compute). Returns `null` for an empty dock list. */
export function nearestDock(landing: number, docks: number[], direction: 1 | -1): number | null {
  if (docks.length === 0) return null
  let best = docks[0]!
  let bestDist = Math.abs(best - landing)
  for (let i = 1; i < docks.length; i++) {
    const d = docks[i]!
    const dist = Math.abs(d - landing)
    if (dist < bestDist - 1e-9) {
      best = d
      bestDist = dist
    } else if (Math.abs(dist - bestDist) <= 1e-9) {
      // Exact tie: prefer whichever of the two sits further along the motion direction.
      if ((d - best) * direction > 0) best = d
    }
  }
  return best
}

/** Distance below which a target counts as "already there" — solving for a deceleration that
 *  lands within a fraction of a pixel is meaningless and can blow up toward infinity as the
 *  distance approaches zero. */
const EPSILON_PX = 0.5

/** Reverse-solves the ONE constant deceleration that carries a glide currently at `x` moving at
 *  `v` (px/tick) to a dead stop EXACTLY at `target`. From v² = 2·a·d with d = |target − x|:
 *  a = v² / (2·|target − x|). Guarded per the spec: `null` (never an error) when
 *  - `v` is zero (nothing to decelerate — no glide to solve a curve for), or
 *  - `target` sits BEHIND the direction of motion (this glide is already moving away from it —
 *    "decelerating" toward it would mean first reversing, which isn't a deceleration at all),
 *    or
 *  - `target` is within `EPSILON_PX` of `x` (already there in every way that matters).
 *  Every guard means the same thing to the caller: don't attempt a takeover manoeuvre here,
 *  fall back to the existing immediate settle-dock instead. */
export function decelerationFor(x: number, v: number, target: number): number | null {
  if (v === 0) return null
  const distance = target - x
  if (Math.abs(distance) < EPSILON_PX) return null
  if (Math.sign(distance) !== Math.sign(v)) return null
  return (v * v) / (2 * Math.abs(distance))
}

/** How long (ticks) a glide at `v` (px/tick) takes to stop under constant deceleration `a`
 *  (px/tick²). From v = a·t. */
export function stopTime(v: number, a: number): number {
  return Math.abs(v) / a
}

/** Position at tick `t` of a glide that started at `x0` with velocity `v0` (px/tick), under
 *  constant deceleration `a` (px/tick²) opposing its motion: x0 + v0·t − ½·sign(v0)·a·t².
 *  Clamped to `[0, stopTime(v0, a)]` — querying at or past the stop simply returns the (fixed)
 *  stop position, the same way a real glide doesn't reverse once it's stopped. `v0 === 0` short
 *  -circuits to `x0` (nothing moving, nowhere to go). */
export function positionAt(t: number, x0: number, v0: number, a: number): number {
  if (v0 === 0) return x0
  const st = stopTime(v0, a)
  const tc = Math.min(Math.max(t, 0), st)
  return x0 + v0 * tc - 0.5 * Math.sign(v0) * a * tc * tc
}

/** A solved takeover manoeuvre: from the caller's current (x, v), come to rest EXACTLY at
 *  `target` (px) after `T` ticks. `profile` says which curve `planPositionAt` drives:
 *  - 'constant': constant deceleration `a` (px/tick²) — THE model (Mark, 2026-09-03: "the
 *    deceleration rate is based on distance, not on time. We adjust the time to match the
 *    distance"); T = 2·d/|v| falls out of the distance, and a = |v|/T = v²/(2d).
 *  - 'hermite': the bounded fallback (see `planDock`), T = FALLBACK_TICKS; `a` is then the MEAN
 *    deceleration |v|/FALLBACK_TICKS, reported for the HUD, not a constant the curve runs at. */
export interface DockPlan {
  target: number
  a: number
  T: number
  profile: 'constant' | 'hermite'
}

/** The sane band for a PURE-PHYSICS manoeuvre's duration, in ticks (0.2s – 3s at 60Hz).
 *  Constant deceleration solved purely from distance can produce any duration at all: gesture-09
 *  /10 (2026-09-03) glided 4080px in 3.1s at a healthy release speed, and crept 226px over 5.5s at
 *  a mis-measured one (live/CREEP-FINDINGS.md). The band bounds the OUTCOME only when it leaves
 *  sanity — inside it the model is untouched. MAX is Mark's 3-second ruling (2026-09-03: "If it
 *  looks like it'll get there in less than 3 seconds, let it get there by itself. If not, do what
 *  you do."): the ceiling on a pure solve, and so how far a fast flick may travel (≤ v·MAX/2 px).
 *  MIN keeps a dock right under the finger from reading as a stomped brake. */
export const MIN_TICKS = 12
export const MAX_TICKS = 180

/** Duration (ticks, 0.8s at 60Hz) of the cubic Hermite FALLBACK only — the "do what you do"
 *  half of the ruling. Deliberately separate from MAX_TICKS: a pure solve may run up to 3s
 *  because it is real physics; the fallback is a substitute curve and stays short. */
export const FALLBACK_TICKS = 48

/** Stop time (ticks) of the constant deceleration that lands a glide at `v` exactly `d` px
 *  away: from d = ½·|v|·T. */
export function ticksFor(d: number, v: number): number {
  return (2 * Math.abs(d)) / Math.abs(v)
}

/** Position at tick `t` on the cubic Hermite profile from `x0` (slope `v0` px/tick at t=0) to
 *  `x0 + d` (slope 0 at t=T): x(s) = x0 + d·(3s² − 2s³) + v0·T·(s³ − 2s² + s), s = t/T clamped to
 *  [0, 1]. Starts at EXACTLY the release velocity (no seam), lands EXACTLY on the dock, and when
 *  T = 2d/v0 it is algebraically the constant deceleration `positionAt` runs (proven in the
 *  spec) — so it only ever differs from the model where the model's own T left the band.
 *  Clamping T DOWN (the creep case) keeps it monotone; clamping UP overshoots only if
 *  T > 3d/v0, which `planDock` never asks for. */
export function hermitePositionAt(t: number, x0: number, v0: number, d: number, T: number): number {
  if (T <= 0) return x0 + d
  const s = Math.min(Math.max(t / T, 0), 1)
  const s2 = s * s
  const s3 = s2 * s
  return x0 + d * (3 * s2 - 2 * s3) + v0 * T * (s3 - 2 * s2 + s)
}

/** Position at tick `t` along `plan`, whichever profile it carries. Past `plan.T` it is the
 *  target, fixed. */
export function planPositionAt(t: number, x0: number, v0: number, plan: DockPlan): number {
  if (plan.profile === 'hermite') return hermitePositionAt(t, x0, v0, plan.target - x0, plan.T)
  return positionAt(t, x0, v0, plan.a)
}

/** The bounded plan for ONE specific target: constant deceleration whenever its own T = 2d/|v|
 *  is at or under MAX_TICKS (a T under MIN_TICKS is ACCEPTED here — a brief firm stop lands
 *  exactly and never overshoots, which a stretched curve toward a dock this close would); the
 *  Hermite fallback at T = FALLBACK_TICKS when the target is too far for the speed
 *  (T > MAX_TICKS — the creep case: the model alone would take more than 3s). `null` when
 *  `target` is not ahead of `x` in the direction of `v`, or already under it (same guards as
 *  `decelerationFor`). */
export function planToTarget(x: number, v: number, target: number): DockPlan | null {
  const a = decelerationFor(x, v, target)
  if (a === null) return null
  const T = ticksFor(target - x, v)
  if (T <= MAX_TICKS) return { target, a, T, profile: 'constant' }
  return { target, a: Math.abs(v) / FALLBACK_TICKS, T: FALLBACK_TICKS, profile: 'hermite' }
}

/**
 * Full policy: given the strip's current (x, v) and the set of dock points, produce the ONE
 * takeover manoeuvre to run — or `null` if there's nothing to solve (no motion, no docks) and
 * the caller should fall back to its existing immediate settle-dock instead. Solved ONCE per
 * release, from the true release velocity (Mark, 2026-09-03: "It should only ever calculate
 * ONCE. The deceleration required to land." / "Always lands on a day perfectly! Seamless to
 * the user.").
 *
 * THE RULE (Mark, 2026-09-03): "If it looks like it'll get there in less than 3 seconds, let it
 * get there by itself. If not, do what you do." Read: if the pure constant-deceleration solve to
 * the chosen day lands in under 3s (T ≤ MAX_TICKS = 180), run pure physics — steps 2–4 below;
 * only otherwise (step 5) use the bounded cubic-Hermite fallback, which keeps its own 0.8s
 * (FALLBACK_TICKS = 48).
 *
 * 1. Project the natural landing at friction `A0` and find the dock nearest it among the docks
 *    AHEAD (reachable by decelerating, never by reversing) — the "primary", the day a free glide
 *    was already aiming at. A0 now only ever chooses WHICH day; never how long.
 * 2. Solve the constant deceleration that lands exactly there: T = 2d/|v|. If T sits inside
 *    [MIN_TICKS, MAX_TICKS], that is the answer — the model, untouched.
 * 3. T > MAX_TICKS — the flick is too fast for the day it chose (or, at a slow release, the day
 *    is too far for the speed): take the FARTHEST dock ahead the band can reach, d ≤ |v|·MAX/2,
 *    never nearer than the nearest dock ahead, and solve the constant deceleration for it. If
 *    that dock's own T is under MIN (nothing beyond it fits either, by construction) accept it —
 *    a firm stop, still exact.
 * 4. T < MIN_TICKS — the dock is too close: step to the next dock ahead if that one fits
 *    (T ≤ MAX), else accept the close one.
 * 5. If NO constant-deceleration solution reaches any dock ahead within the band — the nearest
 *    dock ahead is already beyond |v|·MAX/2 (typically a slow release far from a day) — then and
 *    only then drive the cubic Hermite profile (`hermitePositionAt`) toward the nearest dock
 *    ahead over T = FALLBACK_TICKS (48, 0.8s — a T > MAX = 180 is always clamped DOWN to it):
 *    same starting slope, exact landing, monotone, 0.8s instead of the 4–8s creep of 2026-09-03.
 *    This is the bounded fallback, not a second model.
 * 6. Only when there is genuinely no dock ahead (none in the direction of travel, or every one
 *    is already under `x`) return the natural landing at `A0` as a constant-deceleration plan;
 *    DayStrip.vue's settle fallback then docks it.
 *
 * REMOVED (2026-09-03): the CLAMP_LOW/CLAMP_HIGH preference (0.4–2.5 × A0 on the solved `a`) and
 * its closest-in-log-ratio fallback. Both bounded the deceleration, never the duration — the
 * exact hole every creep fell through (a/A0 ≈ 0.02 was "closest to A0" and still 5.5s long).
 */
export function planDock(x: number, v: number, docks: number[], a0: number): DockPlan | null {
  if (v === 0 || docks.length === 0) return null
  const direction: 1 | -1 = v > 0 ? 1 : -1
  const natural = (): DockPlan => {
    const landing = naturalLanding(x, v, a0)
    return { target: landing, a: a0, T: stopTime(v, a0), profile: 'constant' }
  }

  // Docks ahead of `x` (solvable by decelerating), nearest first — "one dock further" is an
  // index step. A dock under `x` (within EPSILON_PX) is not ahead.
  const ahead = docks
    .filter(d => (d - x) * direction >= EPSILON_PX)
    .sort((p, q) => Math.abs(p - x) - Math.abs(q - x))
  if (ahead.length === 0) return natural()

  const primary = nearestDock(naturalLanding(x, v, a0), ahead, direction)
  if (primary === null) return natural()
  const primaryIndex = ahead.indexOf(primary)
  const T = ticksFor(primary - x, v)

  const constant = (target: number): DockPlan => ({
    target, a: decelerationFor(x, v, target)!, T: ticksFor(target - x, v), profile: 'constant',
  })

  if (T >= MIN_TICKS && T <= MAX_TICKS) return constant(primary)

  if (T > MAX_TICKS) {
    // Step 3: the farthest dock the band reaches, never nearer than ahead[0].
    const cap = (Math.abs(v) * MAX_TICKS) / 2
    let chosen: number | null = null
    for (const d of ahead) {
      if (Math.abs(d - x) <= cap) chosen = d
      else break
    }
    if (chosen !== null) return constant(chosen)
    // Step 5: even the nearest dock ahead is beyond the band — the bounded Hermite fallback.
    return planToTarget(x, v, ahead[0]!)
  }

  // Step 4: T < MIN — too close. The next dock ahead if it fits, else accept.
  const next = ahead[primaryIndex + 1]
  if (next !== undefined && ticksFor(next - x, v) <= MAX_TICKS) return constant(next)
  return constant(primary)
}
