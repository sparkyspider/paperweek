import { describe, expect, it } from 'vitest'
import {
  decelerationFor,
  naturalLanding,
  nearestDock,
  planDock,
  positionAt,
  stopTime,
  travelDistance,
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

describe('planDock — clamp policy', () => {
  // Shared rig: x=0, v=10, a0=0.5 → naturalLanding = v²/(2·a0) = 100. Fit range for a
  // candidate's distance from x is [0.4·landing, 2.5·landing] = [40, 250].
  const x = 0
  const v = 10
  const a0 = 0.5
  const landing = naturalLanding(x, v, a0)

  it('uses the nearest dock outright when its solved deceleration already fits', () => {
    const plan = planDock(x, v, [landing], a0)
    expect(plan).not.toBeNull()
    expect(plan!.target).toBeCloseTo(landing, 6)
    expect(plan!.a).toBeCloseTo(a0, 6)
  })

  it('steps to the next dock further along when the nearest is too close, and lands there', () => {
    // 30 is nearest to the landing (100) among [30, 200] and needs a > 2.5·a0 (too abrupt).
    // 200 is the next dock further along the direction of travel, and fits.
    const plan = planDock(x, v, [30, 200], a0)
    expect(plan).not.toBeNull()
    expect(plan!.target).toBe(200)
    expect(plan!.a).toBeGreaterThanOrEqual(0.4 * a0)
    expect(plan!.a).toBeLessThanOrEqual(2.5 * a0)
    // And it's an exact closed-form solution: positionAt(stopTime) lands on it precisely.
    const st = stopTime(v, plan!.a)
    expect(positionAt(st, x, v, plan!.a)).toBeCloseTo(200, 6)
  })

  it('falls back to A0 toward the natural landing when even the stepped dock is too far', () => {
    // 30 is nearest (too close); the only other dock, 500, is too FAR once stepped to
    // (distance 500 needs a well below 0.4·a0) — no dock within one step fits either way.
    const plan = planDock(x, v, [30, 500], a0)
    expect(plan).not.toBeNull()
    expect(plan!.target).toBeCloseTo(landing, 6)
    expect(plan!.a).toBeCloseTo(a0, 6)
  })

  it('falls back to A0 when the only dock is too far and there is no nearer neighbor to step to', () => {
    const plan = planDock(x, v, [300], a0)
    expect(plan).not.toBeNull()
    expect(plan!.target).toBeCloseTo(landing, 6)
    expect(plan!.a).toBeCloseTo(a0, 6)
  })

  it('never reaches ahead of the natural direction of travel for the fallback plan', () => {
    // A dock that only exists BEHIND x (wrong direction) is not reachable at all; planDock
    // must fall back to A0 rather than solving a manoeuvre that would require reversing.
    const plan = planDock(x, v, [-50], a0)
    expect(plan).not.toBeNull()
    expect(plan!.target).toBeCloseTo(landing, 6)
    expect(plan!.a).toBeCloseTo(a0, 6)
  })
})
