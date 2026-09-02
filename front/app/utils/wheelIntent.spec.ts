import { describe, expect, it } from 'vitest'
import {
  createWheelIntentTracker,
  DOM_DELTA_LINE,
  DOM_DELTA_PAGE,
  DOM_DELTA_PIXEL,
  LINE_HEIGHT_PX,
  normalizeWheelDelta,
  type WheelIntent,
} from './wheelIntent'

/** Feeds a whole synthetic sequence through a fresh tracker and returns the classification for
 *  every sample, in order — the shape every test below asserts against. */
function classifyAll(samples: { dx: number; t: number }[]): WheelIntent[] {
  const tracker = createWheelIntentTracker()
  return samples.map(s => tracker.push(s))
}

/** Builds a tight-cadence sequence (16ms apart, a typical trackpad rate) from a list of deltas
 *  starting at t=0. */
function tight(deltas: number[], startT = 0, stepMs = 16): { dx: number; t: number }[] {
  return deltas.map((dx, i) => ({ dx, t: startT + i * stepMs }))
}

describe('wheelIntent — finger burst → momentum tail', () => {
  it('classifies an accelerating touch as finger throughout, then confirms momentum only after a SUSTAINED decay', () => {
    // Growing (accelerating finger), then decaying (released — browser's synthetic tail).
    const growing = tight([2, 5, 9, 14, 20])
    const decaying = tight([18, 14, 10, 7, 5, 3, 2], 5 * 16)
    const intents = classifyAll([...growing, ...decaying])

    // The whole growing phase is finger.
    expect(intents.slice(0, growing.length)).toEqual(['discrete', 'finger', 'finger', 'finger', 'finger'])

    // The decay phase starts as finger too — one or two dips alone don't prove release — and
    // only becomes momentum once MOMENTUM_CONFIRM_COUNT consecutive decaying samples have
    // actually been seen.
    const decayIntents = intents.slice(growing.length)
    expect(decayIntents[0]).toBe('finger') // 18 < 20, 1st decay — not yet confirmed
    expect(decayIntents[1]).toBe('finger') // 14 < 18, 2nd decay — still not yet confirmed
    expect(decayIntents[2]).toBe('momentum') // 10 < 14, 3rd consecutive decay — confirmed
    // And it stays momentum for the rest of the clean decaying tail.
    expect(decayIntents.slice(2)).toEqual(['momentum', 'momentum', 'momentum', 'momentum', 'momentum'])
  })

  it('never confirms momentum without a finger phase having happened first this burst', () => {
    // A decaying-looking sequence that opens the burst cold, no growth ever seen.
    const samples = tight([20, 16, 12, 9, 7, 5])
    const intents = classifyAll(samples)
    expect(intents).not.toContain('momentum')
  })
})

describe('wheelIntent — pure discrete notches', () => {
  it('classifies a slow drum of isolated same-size notches as discrete throughout', () => {
    const notches = [0, 150, 320, 500, 690].map(t => ({ dx: 100, t }))
    const intents = classifyAll(notches)
    expect(intents).toEqual(['discrete', 'discrete', 'discrete', 'discrete', 'discrete'])
  })

  it('classifies notches spaced further apart than the burst-reset gap identically', () => {
    const notches = [0, 400, 900, 1500].map(t => ({ dx: -120, t }))
    const intents = classifyAll(notches)
    expect(intents).toEqual(['discrete', 'discrete', 'discrete', 'discrete'])
  })

  it('reclassifies as finger the moment a lone notch turns out to be the start of a real touch', () => {
    // First sample looks exactly like a lone notch (nothing else to go on yet) — then a rapid,
    // tight-cadence, GROWING continuation arrives, proving it was actually a touch starting.
    const samples = [{ dx: 3, t: 0 }, { dx: 6, t: 16 }, { dx: 10, t: 32 }]
    const intents = classifyAll(samples)
    expect(intents[0]).toBe('discrete')
    expect(intents[1]).toBe('finger')
    expect(intents[2]).toBe('finger')
  })
})

describe('wheelIntent — finger with direction reversal', () => {
  it('reads a reversal as finger immediately, regardless of magnitude, and never as momentum', () => {
    const samples = tight([5, 10, 15, -8, -12, -6])
    const intents = classifyAll(samples)
    // The reversal itself (index 3) and everything through it is finger — a direction change
    // can only be a human hand, never a physics tail.
    expect(intents[3]).toBe('finger')
    expect(intents).not.toContain('momentum')
  })

  it('resets any decay streak on a reversal, so momentum needs to build up fresh afterward', () => {
    const samples = tight([20, 16, 12, -5, -9, -14, -10, -7, -5])
    const intents = classifyAll(samples)
    // 20,16,12 = two decaying steps (not yet 3) — reversal at index 3 interrupts them.
    expect(intents[3]).toBe('finger')
    // -5,-9,-14 growing in magnitude (still finger); -10,-7,-5 decaying again — needs its OWN
    // fresh 3-in-a-row before momentum can be confirmed post-reversal.
    expect(intents.slice(4)).toEqual(['finger', 'finger', 'finger', 'finger', 'momentum'])
  })
})

describe('wheelIntent — slow deliberate drag-scroll', () => {
  it('reads a small, gently oscillating, still-active drag as finger throughout — never momentum', () => {
    // Small deltas that wobble up and down (natural hand tremor) without ever really releasing.
    const samples = tight([2, 3, 2, 3, 2, 4, 2, 3, 2, 3], 0, 30)
    const intents = classifyAll(samples)
    expect(intents).not.toContain('momentum')
  })

  it('still recognises a genuine slow release at the end of a deliberate drag', () => {
    const drag = tight([2, 3, 2, 3, 2], 0, 30)
    // Strictly, smoothly decreasing (no repeated-equal plateau, which would read as "flat" and
    // reset the decay streak) — a genuine, if gentle, release tail.
    const release = tight([1.6, 1.1, 0.75, 0.5, 0.35], 5 * 30, 30)
    const intents = classifyAll([...drag, ...release])
    // The release tail, given three consecutive genuine decays, still confirms momentum even
    // though every magnitude involved is small.
    expect(intents[intents.length - 1]).toBe('momentum')
  })
})

describe('wheelIntent — burst boundaries and tracker state', () => {
  it('treats a fresh sample after a long silence as the start of a brand new burst', () => {
    const tracker = createWheelIntentTracker()
    expect(tracker.push({ dx: 10, t: 0 })).toBe('discrete')
    expect(tracker.push({ dx: 12, t: 16 })).toBe('finger')
    // A long pause — a totally separate gesture, whatever state existed before is gone.
    expect(tracker.push({ dx: 10, t: 1000 })).toBe('discrete')
  })

  it('reset() clears history exactly like a burst-boundary gap would', () => {
    const tracker = createWheelIntentTracker()
    tracker.push({ dx: 20, t: 0 })
    tracker.push({ dx: 16, t: 16 })
    tracker.push({ dx: 12, t: 32 })
    tracker.reset()
    // Immediately after reset, the very next sample is treated as a lone, fresh sample again —
    // even though barely any time passed.
    expect(tracker.push({ dx: 9, t: 33 })).toBe('discrete')
  })

  it('a single sample is always discrete — nothing to compare it against yet', () => {
    const tracker = createWheelIntentTracker()
    expect(tracker.push({ dx: 42, t: 0 })).toBe('discrete')
  })
})

describe('normalizeWheelDelta', () => {
  it('passes DOM_DELTA_PIXEL through unchanged', () => {
    expect(normalizeWheelDelta(37, DOM_DELTA_PIXEL, 800)).toBe(37)
    expect(normalizeWheelDelta(-12.5, DOM_DELTA_PIXEL, 800)).toBe(-12.5)
  })

  it('scales DOM_DELTA_LINE by the px-per-line constant, sign preserved', () => {
    expect(normalizeWheelDelta(3, DOM_DELTA_LINE, 800)).toBe(3 * LINE_HEIGHT_PX)
    expect(normalizeWheelDelta(-2, DOM_DELTA_LINE, 800)).toBe(-2 * LINE_HEIGHT_PX)
  })

  it('scales DOM_DELTA_PAGE by the caller-supplied page size', () => {
    expect(normalizeWheelDelta(1, DOM_DELTA_PAGE, 640)).toBe(640)
    expect(normalizeWheelDelta(-0.5, DOM_DELTA_PAGE, 640)).toBe(-320)
  })

  it('treats an unrecognised mode as pixel (defensive default)', () => {
    expect(normalizeWheelDelta(9, 99, 800)).toBe(9)
  })
})

/** Firefox commonly reports DOM_DELTA_LINE (small integers, "N lines") where Chromium reports
 *  DOM_DELTA_PIXEL for the same gesture — the classifier itself never sees the difference once
 *  normalizeWheelDelta runs first, because every threshold it uses is either a TIME (mode-
 *  independent) or a RATIO between consecutive samples (scale-invariant: a scale-invariant
 *  comparison gives the identical answer whether the underlying unit is raw pixels or
 *  pixels-per-line-scaled line counts). These re-run the same four required scenarios through
 *  normalization first, on genuinely coarse integer line deltas, to prove that pipeline stage
 *  doesn't quietly break the classification it's feeding. */
describe('wheelIntent — DOM_DELTA_LINE (Firefox-style) sequences', () => {
  function normalizedTight(lineDeltas: number[], startT = 0, stepMs = 16) {
    return lineDeltas.map((raw, i) => ({
      dx: normalizeWheelDelta(raw, DOM_DELTA_LINE, 800),
      t: startT + i * stepMs,
    }))
  }

  it('finger burst → momentum tail, in coarse integer line units', () => {
    const growing = normalizedTight([1, 2, 4])
    const decaying = normalizedTight([3, 2, 1], 3 * 16)
    const intents = classifyAll([...growing, ...decaying])
    expect(intents.slice(0, 3)).toEqual(['discrete', 'finger', 'finger'])
    // 3 -> 2 -> 1 is three consecutive decays after a confirmed (growing) finger phase.
    expect(intents.slice(3)).toEqual(['finger', 'finger', 'momentum'])
  })

  it('pure discrete notches, in line units (the classic physical-mouse-wheel case)', () => {
    const notches = [0, 180, 360, 540].map(t => ({ dx: normalizeWheelDelta(-3, DOM_DELTA_LINE, 800), t }))
    const intents = classifyAll(notches)
    expect(intents).toEqual(['discrete', 'discrete', 'discrete', 'discrete'])
  })

  it('a direction reversal in line units is still read as finger immediately', () => {
    const samples = normalizedTight([1, 2, 3, -2, -3])
    const intents = classifyAll(samples)
    expect(intents[3]).toBe('finger')
    expect(intents).not.toContain('momentum')
  })

  it('a slow drag in line units (mostly ±1 line per sample) never misreads as momentum', () => {
    const samples = normalizedTight([1, 1, 2, 1, 1, 2, 1], 0, 30)
    const intents = classifyAll(samples)
    expect(intents).not.toContain('momentum')
  })

  it('produces the exact same classification sequence as the equivalent pixel-mode stream', () => {
    // 16 px/line means these line deltas normalize to EXACTLY the pixel sequence used in the
    // very first pixel-mode test above — the two pipelines must agree bit-for-bit downstream.
    const pixelStyle = tight([16, 32, 80, 224, 320, 288, 224, 160, 112, 80, 48, 32])
    const lineStyle = normalizedTight([1, 2, 5, 14, 20, 18, 14, 10, 7, 5, 3, 2])
    expect(classifyAll(lineStyle)).toEqual(classifyAll(pixelStyle))
  })
})
