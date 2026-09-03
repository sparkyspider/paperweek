import { describe, expect, it } from 'vitest'
import {
  decelerationFor,
  hermitePositionAt,
  MAX_TICKS,
  MIN_TICKS,
  naturalLanding,
  nearestDock,
  planDock,
  planPositionAt,
  planToTarget,
  positionAt,
  stopTime,
  ticksFor,
  travelDistance,
  type DockPlan,
} from './dockPhysics'

describe('travelDistance / decelerationFor round-trip', () => {
  it('recovers the original deceleration from the landing it implies, both directions', () => {
    const x = 100
    const a = 0.5
    for (const v of [5, 12, -7, -20]) {
      const target = naturalLanding(x, v, a)
      const solved = decelerationFor(x, v, target)
      expect(solved).not.toBeNull()
      expect(solved!).toBeCloseTo(a, 6)
    }
  })

  it('positionAt(stopTime) lands EXACTLY on target for the solved a*, both directions', () => {
    const x = 50
    for (const v of [8, -8, 15, -3]) {
      const target = x + (v > 0 ? 40 : -40)
      const a = decelerationFor(x, v, target)
      expect(a).not.toBeNull()
      const st = stopTime(v, a!)
      expect(positionAt(st, x, v, a!)).toBeCloseTo(target, 6)
      // Clamped: querying past the stop stays put rather than reversing.
      expect(positionAt(st + 5, x, v, a!)).toBeCloseTo(target, 6)
    }
  })

  it('never overshoots or undershoots partway through the manoeuvre', () => {
    const x = 0
    const v = 12
    const target = 150
    const a = decelerationFor(x, v, target)!
    const st = stopTime(v, a)
    let prev = x
    for (let t = 0; t <= st; t += st / 20) {
      const p = positionAt(t, x, v, a)
      expect(p).toBeGreaterThanOrEqual(prev - 1e-9)
      expect(p).toBeLessThanOrEqual(target + 1e-9)
      prev = p
    }
  })
})

describe('naturalLanding', () => {
  it('is symmetric under a velocity sign flip', () => {
    const x = 200
    const a = 0.4
    for (const v of [3, 9, 21]) {
      const posLanding = naturalLanding(x, v, a) - x
      const negLanding = naturalLanding(x, -v, a) - x
      expect(negLanding).toBeCloseTo(-posLanding, 9)
    }
  })

  it('is x itself when v is 0 (nothing moving, nowhere to land)', () => {
    expect(naturalLanding(77, 0, 0.5)).toBe(77)
  })
})

describe('nearestDock', () => {
  it('picks the strictly closer dock', () => {
    expect(nearestDock(95, [0, 100, 300], 1)).toBe(100)
  })

  it('breaks an exact tie toward the motion direction', () => {
    expect(nearestDock(100, [90, 110], 1)).toBe(110)
    expect(nearestDock(100, [90, 110], -1)).toBe(90)
  })

  it('returns null for an empty dock list', () => {
    expect(nearestDock(50, [], 1)).toBeNull()
  })

  it('returns the only dock when there is just one, however far', () => {
    expect(nearestDock(9999, [42], 1)).toBe(42)
  })
})

describe('decelerationFor guards', () => {
  it('returns null when v is 0 — nothing to decelerate', () => {
    expect(decelerationFor(0, 0, 100)).toBeNull()
  })

  it('returns null when the target sits behind the direction of motion', () => {
    expect(decelerationFor(100, 5, 50)).toBeNull() // moving +, target is behind
    expect(decelerationFor(100, -5, 150)).toBeNull() // moving -, target is behind (i.e. ahead of a + motion)
  })

  it('returns null when the target is within epsilon of the current position', () => {
    expect(decelerationFor(100, 5, 100.1)).toBeNull()
  })

  it('solves a positive deceleration for a valid forward target', () => {
    // v²/(2d) = 100/200 = 0.5
    expect(decelerationFor(0, 10, 100)).toBeCloseTo(0.5, 6)
  })

  it('solves symmetrically for a valid backward target', () => {
    expect(decelerationFor(0, -10, -100)).toBeCloseTo(0.5, 6)
  })
})

describe('planDock — degenerate cases', () => {
  it('returns null when there is no velocity', () => {
    expect(planDock(0, 0, [10, 20], 0.5)).toBeNull()
  })

  it('returns null when there are no docks', () => {
    expect(planDock(0, 10, [], 0.5)).toBeNull()
  })
})

/** Drives `plan` from (x, v) tick by tick the way runTakeover does and returns the trace —
 *  positions at every tick through T, then the landing. */
function trace(x: number, v: number, plan: DockPlan, steps = 200): number[] {
  const out: number[] = []
  for (let i = 0; i <= steps; i++) out.push(planPositionAt((plan.T * i) / steps, x, v, plan))
  return out
}
function isMonotone(xs: number[], direction: 1 | -1): boolean {
  return xs.every((p, i) => i === 0 || (p - xs[i - 1]!) * direction >= -1e-9)
}

describe('ticksFor', () => {
  it('is the constant-deceleration stop time 2d/|v|, sign-free', () => {
    expect(ticksFor(100, 10)).toBe(20)
    expect(ticksFor(-100, -10)).toBe(20)
    expect(ticksFor(226, -1.33)).toBeCloseTo(339.8, 1)
  })
})

describe('hermitePositionAt — the bounded fallback profile', () => {
  it('is algebraically the constant deceleration when T = 2d/v (unclamped)', () => {
    const x0 = 500
    for (const [v, d] of [[10, 100], [-8, -60], [30, 336]] as const) {
      const T = ticksFor(d, v)
      const a = decelerationFor(x0, v, x0 + d)!
      for (let i = 0; i <= 40; i++) {
        const t = (T * i) / 40
        expect(hermitePositionAt(t, x0, v, d, T)).toBeCloseTo(positionAt(t, x0, v, a), 6)
      }
    }
  })

  it('starts at exactly slope v (no seam) and lands exactly, both directions', () => {
    for (const [v, d, T] of [[1.33, 226, MAX_TICKS], [-1.33, -226, MAX_TICKS], [5, 380, MAX_TICKS]] as const) {
      const h = 1e-4
      const slope = (hermitePositionAt(h, 0, v, d, T) - hermitePositionAt(0, 0, v, d, T)) / h
      expect(slope).toBeCloseTo(v, 3)
      expect(hermitePositionAt(T, 0, v, d, T)).toBeCloseTo(d, 9)
      expect(hermitePositionAt(T + 10, 0, v, d, T)).toBeCloseTo(d, 9) // fixed past T
    }
  })

  it('is monotone whenever T is clamped DOWN from 2d/v (the creep case)', () => {
    const v = -1.33
    const d = -226
    const T = MAX_TICKS // 2d/v = 340 → clamped to 48
    const xs = Array.from({ length: 201 }, (_, i) => hermitePositionAt((T * i) / 200, 0, v, d, T))
    expect(isMonotone(xs, -1)).toBe(true)
  })
})

describe('planToTarget — one specific target, bounded', () => {
  it('is constant deceleration with T = 2d/|v| when that fits the band', () => {
    const plan = planToTarget(0, 10, 200)!
    expect(plan).toEqual({ target: 200, a: 0.25, T: 40, profile: 'constant' })
  })

  it('ACCEPTS a T under MIN (a brief firm stop lands exactly; a stretched curve would overshoot)', () => {
    const plan = planToTarget(0, 10, 30)!
    expect(plan.profile).toBe('constant')
    expect(plan.T).toBe(6)
    expect(positionAt(plan.T, 0, 10, plan.a)).toBeCloseTo(30, 9)
  })

  it('falls back to Hermite at T = MAX when the target is too far for the speed', () => {
    const plan = planToTarget(0, 10, 500)! // 2d/v = 100 > 48
    expect(plan.profile).toBe('hermite')
    expect(plan.T).toBe(MAX_TICKS)
    expect(plan.a).toBeCloseTo(10 / MAX_TICKS, 9)
    expect(planPositionAt(plan.T, 0, 10, plan)).toBeCloseTo(500, 9)
  })

  it('is null for a target behind, under, or with no velocity — same guards as decelerationFor', () => {
    expect(planToTarget(100, 5, 50)).toBeNull()
    expect(planToTarget(100, 5, 100.2)).toBeNull()
    expect(planToTarget(0, 0, 100)).toBeNull()
  })
})

describe('planDock — degenerate cases', () => {
  it('returns null when there is no velocity', () => {
    expect(planDock(0, 0, [10, 20], 0.5)).toBeNull()
  })

  it('returns null when there are no docks', () => {
    expect(planDock(0, 10, [], 0.5)).toBeNull()
  })
})

describe('planDock — the time band [MIN_TICKS, MAX_TICKS]', () => {
  // Shared rig: x=0, v=10, a0=0.5 → naturalLanding = v²/(2·a0) = 100. T = 2d/10 = d/5, so the
  // band [12, 48] ticks admits docks 60–240 px ahead; the cap |v|·MAX/2 = 240.
  const x = 0
  const v = 10
  const a0 = 0.5
  const landing = naturalLanding(x, v, a0)

  it('uses the nearest dock outright when its own T sits inside the band — the model, untouched', () => {
    const plan = planDock(x, v, [landing], a0)!
    expect(plan.target).toBeCloseTo(landing, 6)
    expect(plan.a).toBeCloseTo(a0, 6)
    expect(plan.T).toBe(20)
    expect(plan.profile).toBe('constant')
  })

  it('too close (T < MIN): steps to the next dock ahead when that one fits, and lands there exactly', () => {
    // 30 is nearest to the landing (100) among [30, 200]; T = 6 < MIN. 200 fits (T = 40).
    const plan = planDock(x, v, [30, 200], a0)!
    expect(plan).toEqual({ target: 200, a: 0.25, T: 40, profile: 'constant' })
    expect(positionAt(plan.T, x, v, plan.a)).toBeCloseTo(200, 6)
  })

  it('too close, and the next dock does not fit either: accepts the close one (a firm, exact stop)', () => {
    // Was "closest to A0 in log-ratio" (same answer, different reason): 30 is T = 6, 500 is
    // T = 100 > MAX — accept 30 with its exact solved a.
    const plan = planDock(x, v, [30, 500], a0)!
    expect(plan.target).toBe(30)
    expect(plan.a).toBeCloseTo(100 / 60, 6)
    expect(plan.T).toBe(6)
    expect(positionAt(plan.T, x, v, plan.a)).toBeCloseTo(30, 6)
  })

  it('too close, next dock over the cap: accepts the close one rather than the far one (was: log-ratio picked 260)', () => {
    // 35 (T = 7) is the primary; 260 is T = 52 > MAX. Old log-ratio preferred 260; the band
    // prefers the exact short stop over a glide that leaves the band.
    const plan = planDock(x, v, [35, 260], a0)!
    expect(plan.target).toBe(35)
    expect(plan.profile).toBe('constant')
  })

  it('too far (T > MAX) with nothing nearer inside the band: the Hermite fallback to the nearest dock ahead, T = MAX', () => {
    // Was "lands on the only dock ahead with a = a0/3" (T = 60, outside the band). 300 is the
    // only day ahead and beyond the 240 cap → bounded fallback, still landing exactly.
    const plan = planDock(x, v, [300], a0)!
    expect(plan.target).toBe(300)
    expect(plan.profile).toBe('hermite')
    expect(plan.T).toBe(MAX_TICKS)
    expect(planPositionAt(plan.T, x, v, plan)).toBeCloseTo(300, 9)
    expect(isMonotone(trace(x, v, plan), 1)).toBe(true)
  })

  it('too far: takes the FARTHEST dock inside the cap, never nearer than the nearest dock ahead', () => {
    // Landing 100; docks every 80 from 80: primary 80 (T = 16, fits) — so push the landing out:
    // v = 30, a0 = 0.5 → landing 900, primary 880 (T = 58.7 > MAX); cap = 720 → farthest ≤ 720
    // is 720 (T = 48, on the band edge).
    const docks = [80, 160, 240, 320, 400, 480, 560, 640, 720, 800, 880, 960]
    const plan = planDock(x, 30, docks, a0)!
    expect(plan.target).toBe(720)
    expect(plan.T).toBeCloseTo(48, 9)
    expect(plan.profile).toBe('constant')
  })

  it('(a) very short glide: the nearest dock ahead is the target, never the natural landing', () => {
    // Mark's real flick tail: takeover at a low velocity, a few px from stopping, next day 20px
    // on. v=2, a0=0.5 → natural landing 4px ahead (384); dock 400: T = 20, in band.
    const plan = planDock(380, 2, [0, 400, 800], 0.5)!
    expect(plan.target).toBe(400)
    expect(plan.a).toBeCloseTo(0.1, 9)
    expect(plan.T).toBe(20)
    expect(positionAt(plan.T, 380, 2, plan.a)).toBeCloseTo(400, 6)
  })

  it('(b) a0 landing 60% of the way between two docks, the nearer beyond the cap: Hermite to it', () => {
    // Docks every 500 at [-200, 300, 800]; -200 is behind x. 300 is T = 60 > MAX and beyond the
    // 240 cap (was: a = a0/3 over 60 ticks by log-ratio) → bounded fallback to 300.
    const plan = planDock(x, v, [-200, 300, 800], a0)!
    expect(plan.target).toBe(300)
    expect(plan.profile).toBe('hermite')
    expect(planPositionAt(plan.T, x, v, plan)).toBeCloseTo(300, 9)
  })

  it('(c) no dock ahead: natural landing at a0 (unchanged)', () => {
    const plan = planDock(x, v, [-50], a0)!
    expect(plan.target).toBeCloseTo(landing, 6)
    expect(plan.a).toBeCloseTo(a0, 6)
    expect(plan.profile).toBe('constant')
  })

  it('(c) the only dock ahead is already under x (unsolvable): natural landing at a0', () => {
    const plan = planDock(x, v, [0], a0)!
    expect(plan.target).toBeCloseTo(landing, 6)
    expect(plan.a).toBeCloseTo(a0, 6)
  })

  it('a dock under x is skipped in favour of the nearest solvable dock ahead', () => {
    // [0, 700]: 0 is under x; 700 is the only dock ahead, T = 140 > MAX and beyond the cap
    // (was: a = a0/7 over 140 ticks) → bounded fallback to 700.
    const plan = planDock(x, v, [0, 700], a0)!
    expect(plan.target).toBe(700)
    expect(plan.profile).toBe('hermite')
    expect(plan.T).toBe(MAX_TICKS)
  })
})

/** The seven manoeuvres of live/CREEP-FINDINGS.md (2026-09-03), replayed through the band with
 *  the strip's real geometry: docks every 400px, A0 = 0.22. Both failure modes of the old
 *  policy are covered — the creep (v ≈ 1.3, 5.5s) and the over-glide (v = 43, 4080px in 3.1s). */
describe('planDock — Mark\'s recorded releases, bounded', () => {
  const A0 = 0.22
  const docks = Array.from({ length: 60 }, (_, i) => i * 400)

  it('the creep (gesture-10 second flick as the old code measured it): 226px in 0.8s, not 5.5s', () => {
    const plan = planDock(17826, -1.33, docks, A0)!
    expect(plan.target).toBe(17600)
    expect(plan.profile).toBe('hermite')
    expect(plan.T).toBe(MAX_TICKS) // 48 ticks = 0.8s (was 340 ticks = 5.66s)
    expect(planPositionAt(plan.T, 17826, -1.33, plan)).toBe(17600)
    expect(isMonotone(trace(17826, -1.33, plan), -1)).toBe(true)
  })

  it('the same flick at its TRUE release velocity (rate speedometer, v ≈ -30): constant deceleration, in band', () => {
    const plan = planDock(17936, -30, docks, A0)!
    expect(plan.target).toBe(17600)
    expect(plan.profile).toBe('constant')
    expect(plan.T).toBeCloseTo(22.4, 1) // 0.37s
    expect(plan.T).toBeGreaterThanOrEqual(MIN_TICKS)
    expect(plan.T).toBeLessThanOrEqual(MAX_TICKS)
    expect(positionAt(plan.T, 17936, -30, plan.a)).toBeCloseTo(17600, 6)
  })

  it('the over-glide (gesture-09, v = 43): two days in 0.62s, not ten days in 3.1s', () => {
    const plan = planDock(12000, 43, docks, A0)!
    expect(plan.target).toBe(12800)
    expect(plan.profile).toBe('constant')
    expect(plan.T).toBeCloseTo(37.2, 1)
  })

  it('every recorded release lands exactly on a dock inside the band', () => {
    const releases: [number, number][] = [
      [18872, -2.06], [17826, -1.33], [18180.5, 1.49], [22290, -1.59], [21238, -1.68], [20560, -1.36], [19990.5, -1.7],
    ]
    for (const [x0, v] of releases) {
      const plan = planDock(x0, v, docks, A0)!
      expect(plan.target % 400, `x0=${x0}`).toBe(0)
      expect(plan.T, `x0=${x0}`).toBeLessThanOrEqual(MAX_TICKS)
      expect(planPositionAt(plan.T, x0, v, plan), `x0=${x0}`).toBeCloseTo(plan.target, 6)
      expect(isMonotone(trace(x0, v, plan), v > 0 ? 1 : -1), `x0=${x0}`).toBe(true)
    }
  })
})
