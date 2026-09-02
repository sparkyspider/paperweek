import { describe, expect, it } from 'vitest'
import { createWheelIntentTracker, type WheelIntent } from './wheelIntent'

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
