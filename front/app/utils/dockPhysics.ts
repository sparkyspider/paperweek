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

/** A solved takeover manoeuvre: decelerate from the caller's current (x, v) at `a` (px/tick²)
 *  and come to rest at `target` (px). */
export interface DockPlan {
  target: number
  a: number
}

/** A solved manoeuvre feels alien once its deceleration strays too far from the canvas's own
 *  natural friction A0 — too gentle (a dock so far past the natural landing the glide visibly
 *  free-wheels an extra beat) or too sharp (a dock so close it reads as a stomped brake). Same
 *  multiplier either side of A0 the spec calls for. */
const CLAMP_LOW = 0.4
const CLAMP_HIGH = 2.5

/**
 * Full policy: given the strip's current (x, v) and the set of dock points, produce the ONE
 * takeover manoeuvre to run — or `null` if there's nothing to solve (no motion, no docks) and
 * the caller should fall back to its existing immediate settle-dock instead.
 *
 * 1. Project the natural landing at friction `A0` and find the dock nearest it — the manoeuvre
 *    a free glide would already be "aiming at."
 * 2. Solve the one deceleration that lands exactly there. If it falls inside
 *    `[CLAMP_LOW·A0, CLAMP_HIGH·A0]`, that's the answer.
 * 3. Otherwise the nearest dock was a bad fit — too close (solved `a` too high) or too far
 *    (solved `a` too low). Step ONE dock further in whichever direction fixes that (farther
 *    along the motion direction if too close; back toward `x` if too far) and re-solve once.
 * 4. If that step doesn't exist, or still doesn't fit, give up on landing exactly on a dock at
 *    all: run the takeover at plain `A0` toward the (unclamped) natural landing, and let the
 *    existing settle-then-dock fallback (DayStrip.vue's scrollend/debounce path) correct
 *    whatever small offset that leaves once it actually stops — "use A0 and the settle-fallback
 *    docks the remainder."
 */
export function planDock(x: number, v: number, docks: number[], a0: number): DockPlan | null {
  if (v === 0 || docks.length === 0) return null
  const direction: 1 | -1 = v > 0 ? 1 : -1

  // Only docks at or ahead of `x` in the direction of travel are reachable by decelerating
  // (never by reversing) — the same set `decelerationFor` would accept — ordered by distance
  // from `x` so "one dock further/nearer" is a plain index step.
  const ahead = docks
    .filter(d => (d - x) * direction >= -EPSILON_PX)
    .sort((p, q) => Math.abs(p - x) - Math.abs(q - x))
  if (ahead.length === 0) return { target: naturalLanding(x, v, a0), a: a0 }

  const landing = naturalLanding(x, v, a0)
  const primary = nearestDock(landing, ahead, direction)
  if (primary === null) return { target: landing, a: a0 }

  const primaryIndex = ahead.indexOf(primary)
  const primaryA = decelerationFor(x, v, primary)

  const fits = (a: number | null): a is number => a !== null && a >= CLAMP_LOW * a0 && a <= CLAMP_HIGH * a0

  if (fits(primaryA)) return { target: primary, a: primaryA }

  // Too close (a* too high) → the manoeuvre would be an abrupt brake: step to the dock FARTHER
  // along the direction of travel, which needs less deceleration.
  // Too far (a* too low, or the primary target was rejected outright) → step to the dock
  // NEARER `x`, which needs more.
  const tooClose = primaryA !== null && primaryA > CLAMP_HIGH * a0
  const stepIndex = tooClose ? primaryIndex + 1 : primaryIndex - 1
  const stepped = ahead[stepIndex]
  const steppedA = stepped === undefined ? null : decelerationFor(x, v, stepped)

  if (stepped !== undefined && fits(steppedA)) return { target: stepped, a: steppedA! }

  // Nothing in clamp range within one step either way — give up on an exact dock and let the
  // existing settle-fallback finish the job once natural-A0 deceleration actually stops.
  return { target: landing, a: a0 }
}
