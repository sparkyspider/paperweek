import { describe, expect, it } from 'vitest'
import {
  BURST_GAP_MS,
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

/** The exact stream the 2026-09-03 scroll diagnosis fired at the strip (finger ramp 4→40 at
 *  60Hz, then a 0.9-ratio inertia tail, every delta ROUNDED to an integer the way Chromium
 *  reports a macOS trackpad). The tail's low end arrives as repeats — 7,7 · 5,5 · 4,4,4 · 3,3,3 ·
 *  2,2,2,2,2 · 1,1,1,1 — which the clean fractional decays above never exercised. */
const DIAG_FINGER = [4, 6, 8, 10, 12, 15, 17, 19, 21, 23, 25, 27, 29, 32, 34, 36, 38, 40]
const DIAG_TAIL = [36, 32, 29, 26, 24, 21, 19, 17, 15, 14, 13, 11, 10, 9, 8, 7, 7, 6, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 2, 2, 2, 1, 1, 1, 1]

describe('wheelIntent — realistic integer tail (latched momentum)', () => {
  it('keeps every tail sample momentum once confirmed, through the flat integer repeats', () => {
    const samples = tight([...DIAG_FINGER, ...DIAG_TAIL])
    const intents = classifyAll(samples)
    const first = intents.indexOf('momentum')
    // Confirmed on the 2nd tail sample: 38→40 is within GROWTH_FACTOR (flat, the streak's first
    // non-growing sample), then 36 and 32 are the two strict decays that complete it.
    expect(first).toBe(DIAG_FINGER.length + 1)
    // ...and NEVER drops back to finger for the rest of the burst — 7,7 / 2,2,2 / 1,1,1,1 are
    // the tail, not a hand (this is the "scrolls, stops, then re-adjusts" bug).
    expect(new Set(intents.slice(first))).toEqual(new Set(['momentum']))
  })

  it('does not read an end-of-tail 1 → 2 px rounding crumb as a re-touch', () => {
    const samples = tight([...DIAG_FINGER, ...DIAG_TAIL, 2, 1, 2, 1])
    const intents = classifyAll(samples)
    const first = intents.indexOf('momentum')
    expect(new Set(intents.slice(first))).toEqual(new Set(['momentum']))
  })

  it('DOES hand back to finger on a genuine re-touch — a clear rise well above the tail', () => {
    const tailSoFar = DIAG_TAIL.slice(0, 18) // ends ...8, 7, 7, 6
    const samples = tight([...DIAG_FINGER, ...tailSoFar, 20, 28, 35, 33])
    const intents = classifyAll(samples)
    const retouchAt = DIAG_FINGER.length + tailSoFar.length
    expect(intents[retouchAt - 1]).toBe('momentum') // the 6 px sample just before the hand lands
    expect(intents[retouchAt]).toBe('finger') // 20 > 6 × 1.5 and ≥ the absolute floor
    expect(intents[retouchAt + 1]).toBe('finger')
    expect(intents[retouchAt + 2]).toBe('finger')
    // One dip after the new touch is not a new tail yet — needs its own 3-in-a-row again.
    expect(intents[retouchAt + 3]).toBe('finger')
  })

  it('does not un-latch when ONE sample arrives late (its rate dips) and the next is ordinary', () => {
    // Firefox headless, after3 rig (2026-09-03): a 67ms dispatch hiccup mid-tail read 21px as a
    // rate of 5.2, so the ordinary 19px sample 29ms later (rate 10.9) looked like a 2.1x re-touch.
    // The envelope is the larger of the previous TWO rates, so one dipped sample cannot do that.
    const tail = [36, 32, 29, 26, 24, 21, 19, 17, 15]
    const samples = tight([...DIAG_FINGER, ...tail])
    const late = DIAG_FINGER.length + 5 // the 21px sample
    for (let i = late; i < samples.length; i++) samples[i]!.t += 38 // it, and everything after, 38ms late
    const intents = classifyAll(samples)
    const first = intents.indexOf('momentum')
    expect(first).toBeLessThan(late)
    expect(new Set(intents.slice(first))).toEqual(new Set(['momentum']))
  })

  it('DOES hand back to finger on a direction reversal inside a confirmed tail', () => {
    const tailSoFar = DIAG_TAIL.slice(0, 18)
    const samples = tight([...DIAG_FINGER, ...tailSoFar, -9, -14, -18])
    const intents = classifyAll(samples)
    const at = DIAG_FINGER.length + tailSoFar.length
    expect(intents[at - 1]).toBe('momentum')
    expect(intents.slice(at)).toEqual(['finger', 'finger', 'finger'])
  })

  it('confirms the SLOW integer tail (repeats between every step) on its third non-growing sample', () => {
    // The diagnosis rig's slow stream: finger 2→12, then a 0.93-ratio tail, integer-rounded —
    // 11,10,10,9,8,8,7,7,... never has three strict decays in a row, only two per three samples.
    const slowFinger = [2, 3, 3, 4, 4, 5, 6, 6, 7, 7, 8, 8, 9, 10, 10, 11, 11, 12]
    const slowTail = [11, 10, 10, 9, 8, 8, 7, 7, 6, 6, 5, 5, 5, 4, 4, 4, 4, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1]
    const intents = classifyAll(tight([...slowFinger, ...slowTail]))
    const first = intents.indexOf('momentum')
    expect(first).toBe(slowFinger.length + 2) // 11 (decay), 10 (decay), 10 (flat) → confirmed
    expect(new Set(intents.slice(first))).toEqual(new Set(['momentum']))
  })

  it('never confirms a dead-flat tight-cadence run (a fast drum of identical notches)', () => {
    const intents = classifyAll(tight([80, 100, 100, 100, 100, 100, 100, 100]))
    expect(intents).not.toContain('momentum')
  })

  it('never confirms a steady slow drag that dipped once and then held (3,3,2,2,2,2)', () => {
    const intents = classifyAll(tight([2, 3, 3, 2, 2, 2, 2, 2], 0, 30))
    expect(intents).not.toContain('momentum')
  })

  it('a burst-gap silence ends the latched tail: the next sample opens a fresh burst', () => {
    const samples = tight([...DIAG_FINGER, ...DIAG_TAIL])
    const tracker = createWheelIntentTracker()
    samples.forEach(s => tracker.push(s))
    const lastT = samples[samples.length - 1]!.t
    expect(tracker.push({ dx: 3, t: lastT + 500 })).toBe('discrete')
    expect(tracker.push({ dx: 5, t: lastT + 516 })).toBe('finger')
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

/** Mark's REAL trackpad stream — gesture-10 of the 2026-09-03 live recording
 *  (docs/process/evidence/scroll-diagnosis-2026-09-03/live/gesture-10-wheel.csv), copied verbatim
 *  as [t_ms (handler dispatch clock), event.timeStamp (OS clock), deltaX]. Three flicks (two
 *  leftward, one rightward) separated by seconds of silence. The handler cadence is a steady
 *  ~27ms while the OS timestamps alternate 16/33ms with each delta proportional to ITS OS gap —
 *  the raw-magnitude sawtooth that un-latched momentum and sank the release velocity to ~1.5
 *  px/tick before the rate-based speedometer (file doc comment, live/CREEP-FINDINGS.md). */
const GESTURE_10: [number, number, number][] = [
  [400, 1326901.2, -2],
  [451.7, 1326951.9, -56],
  [485.1, 1326969.9, -26],
  [513.3, 1326984.6, -24],
  [540.6, 1326987.7, -32],
  [567.1, 1327054.5, -138],
  [594.5, 1327087.8, -68],
  [622, 1327104.5, -34],
  [649.5, 1327137.3, -60],
  [682.7, 1327170.6, -50],
  [709.1, 1327204.6, -42],
  [736.1, 1327220.3, -18],
  [762.8, 1327254.5, -34],
  [789.5, 1327270.9, -14],
  [816.1, 1327304.4, -26],
  [842.6, 1327337.7, -22],
  [869.1, 1327354.5, -10],
  [896.7, 1327387.8, -18],
  [924.1, 1327404.5, -8],
  [951.1, 1327437.9, -14],
  [977.7, 1327471.1, -12],
  [1004.3, 1327487.8, -6],
  [1031.5, 1327520.5, -8],
  [1060.1, 1327554.1, -8],
  [1089, 1327571.2, -2],
  [1116.9, 1327604.5, -4],
  [1145.6, 1327636.8, -4],
  [1174.4, 1327670.8, -2],
  [1203.7, 1327703.8, -4],
  [3149.3, 1329635.7, -2],
  [3199, 1329685.7, -48],
  [3232.8, 1329719.2, -52],
  [3261.5, 1329751.2, -56],
  [3289, 1329767.5, -28],
  [3316.5, 1329769.2, -38],
  [3342.5, 1329836.2, -170],
  [3370, 1329852.8, -40],
  [3398.1, 1329886.2, -90],
  [3425.4, 1329919.9, -78],
  [3455.4, 1329936, -34],
  [3483.2, 1329969, -60],
  [3511.1, 1330002.5, -50],
  [3539.4, 1330020, -22],
  [3566.4, 1330053.2, -38],
  [3599.4, 1330086.5, -32],
  [3625.8, 1330119.8, -26],
  [3652.7, 1330136.5, -12],
  [3681.2, 1330169.8, -20],
  [3708.3, 1330185.7, -10],
  [3735.1, 1330219.8, -16],
  [3762, 1330253.2, -14],
  [3789, 1330269.3, -6],
  [3818.4, 1330303.2, -12],
  [3847.3, 1330336.6, -8],
  [3875.2, 1330369.1, -8],
  [3904, 1330386.1, -2],
  [3931.9, 1330419.3, -4],
  [3958.9, 1330453.2, -4],
  [3986, 1330469, -2],
  [4012.8, 1330503.1, -2],
  [4039.3, 1330519.8, -2],
  [4066.9, 1330553.1, -2],
  [10549.6, 1337033.9, 2],
  [10581.7, 1337068.4, 26],
  [10609.5, 1337101.8, 44],
  [10638.5, 1337118, 18],
  [10669.2, 1337135.2, 20],
  [10698.4, 1337152, 24],
  [10732.8, 1337218.6, 104],
  [10760.6, 1337251.6, 52],
  [10788.8, 1337268.4, 26],
  [10817.2, 1337302.5, 48],
  [10846, 1337334.6, 38],
  [10874.1, 1337350.7, 18],
  [10902.4, 1337385.3, 30],
  [10932.2, 1337418.5, 26],
  [10961.6, 1337451.9, 22],
  [10992.5, 1337466.7, 10],
  [11022.3, 1337502.1, 18],
  [11051, 1337535.3, 16],
  [11082.8, 1337567.8, 12],
  [11109.9, 1337601.8, 12],
  [11137.7, 1337616.7, 4],
  [11167, 1337651.9, 8],
  [11194.8, 1337684.9, 6],
  [11222.8, 1337700.7, 2],
  [11252.2, 1337736, 4],
  [11280.9, 1337768.3, 4],
  [11308.6, 1337801.5, 2],
  [11336.9, 1337817.2, 2],
]

/** DayStrip.vue's velocity EMA, reproduced: 50/50 blend of the tracker's rate on FINGER samples,
 *  a DISCRETE sample resets it to the bare rate, MOMENTUM samples never touch it. */
function replayWithEma(stream: [number, number, number][]) {
  const tracker = createWheelIntentTracker()
  let ema = 0
  return stream.map(([t, ts, dx]) => {
    const intent = tracker.push({ dx, t, ts })
    const rate = tracker.lastRate()
    if (intent === 'discrete') ema = rate
    else if (intent === 'finger') ema = ema * 0.5 + rate * 0.5
    return { t, dx, intent, rate, ema }
  })
}

/** Splits the replay into its bursts (a gap over BURST_GAP_MS on the dispatch clock). */
function bursts<T extends { t: number }>(rows: T[]): T[][] {
  const out: T[][] = []
  for (const r of rows) {
    const cur = out[out.length - 1]
    if (cur && r.t - cur[cur.length - 1]!.t <= BURST_GAP_MS) cur.push(r)
    else out.push([r])
  }
  return out
}

describe('wheelIntent — replay of gesture-10 (Mark\'s real sawtooth stream)', () => {
  const flicks = bursts(replayWithEma(GESTURE_10))

  it('is three flicks, as recorded', () => {
    expect(flicks.length).toBe(3)
  })

  it('confirms momentum within 5 samples after each flick\'s raw peak', () => {
    for (const flick of flicks) {
      const peak = flick.reduce((b, r, i) => (Math.abs(r.dx) > Math.abs(flick[b]!.dx) ? i : b), 0)
      const first = flick.findIndex(r => r.intent === 'momentum')
      expect(first, `flick at t=${flick[0]!.t}: momentum never confirmed`).toBeGreaterThan(peak)
      expect(first - peak, `flick at t=${flick[0]!.t}: confirmed ${first - peak} samples after the peak`).toBeLessThanOrEqual(5)
    }
  })

  it('NEVER un-latches: once momentum, every later sample of that flick is momentum', () => {
    for (const flick of flicks) {
      const first = flick.findIndex(r => r.intent === 'momentum')
      const after = flick.slice(first).map(r => r.intent)
      expect(new Set(after), `flick at t=${flick[0]!.t}`).toEqual(new Set(['momentum']))
    }
  })

  it('reconstructs a release velocity of at least 10 px/tick for every flick (was 1.3-2.1)', () => {
    for (const flick of flicks) {
      const first = flick.findIndex(r => r.intent === 'momentum')
      // The EMA as it stands at the release: the last FINGER sample's blend.
      const release = flick[first - 1]!.ema
      expect(Math.abs(release), `flick at t=${flick[0]!.t}: v=${release.toFixed(2)}`).toBeGreaterThanOrEqual(10)
    }
  })

  it('measures the sawtooth as a flat rate: no rate rise over 1.5x inside a confirmed tail', () => {
    for (const flick of flicks) {
      const first = flick.findIndex(r => r.intent === 'momentum')
      for (let i = first + 1; i < flick.length; i++) {
        const prev = Math.abs(flick[i - 1]!.rate)
        const now = Math.abs(flick[i]!.rate)
        // Below the retouch floor a 1→2 px crumb may double; above it the tail must not rise 1.5x.
        if (now >= 4) expect(now, `flick at t=${flick[0]!.t}, sample ${i}`).toBeLessThanOrEqual(prev * 1.5)
      }
    }
  })
})
