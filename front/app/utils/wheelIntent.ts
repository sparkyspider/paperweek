/**
 * Classifies an incoming stream of wheel-event deltas into what's actually PRODUCING them, so
 * DayStrip.vue's full scroll-ownership wheel handler (see its own doc comment) knows when to
 * drive `scrollLeft` by hand versus when to ignore the browser's own synthetic tail and run its
 * own closed-form deceleration (dockPhysics.ts) from the true release point instead.
 *
 * Three intents:
 *  - FINGER: an actual touch on the trackpad, still moving. Human-generated deltas are erratic —
 *    they rise, dip, hold roughly flat, sometimes reverse direction outright. Nothing about them
 *    is a clean curve.
 *  - MOMENTUM: the browser's own synthetic tail after the finger lifts. A clean, CONSISTENT
 *    decay, sample after sample, at the same tight cadence the finger phase was arriving at —
 *    because it's not human-generated any more, it's the OS replaying a physics curve.
 *  - DISCRETE: a physical mouse wheel notch (or a rapid drum of them). Deltas arrive sparse
 *    (a real gap between notches, well above a trackpad's own inter-sample cadence) rather than
 *    continuous, and don't decay into anything — each one is its own complete, isolated bump.
 *
 * THE KEY DISCRIMINATORS:
 *  1. Cadence (gap since the previous sample): tight (< TIGHT_CADENCE_MS) means "still touching
 *     something continuous" (finger or momentum); loose means "an isolated notch."
 *  2. Trend, within a tight-cadence run: growing or direction-reversed magnitude can ONLY be a
 *     human still actively moving — momentum never accelerates or reverses. A SUSTAINED decay
 *     (several consecutive samples in a row, not just one dip — a real touch's natural
 *     up-and-down jitter can easily produce one isolated dip that isn't actually a release)
 *     can only be the browser's own physics tail, and only counts once a finger phase has
 *     actually been seen this burst (a momentum tail must FOLLOW a touch, never open one).
 *
 * Deliberately real-time / streaming, not a batch classifier: `push()` returns its best
 * classification of the CURRENT sample given everything seen so far in this burst — the only
 * thing an actual live wheel handler can ever act on. Earlier calls are never revised in
 * hindsight (nothing to revise — each call already returned its answer to the caller), but later
 * calls naturally correct course as more evidence arrives (a lone sample optimistically read as
 * DISCRETE becomes FINGER the moment a second, closely-following sample confirms a continuous
 * touch was actually starting).
 */

export type WheelIntent = 'finger' | 'momentum' | 'discrete'

export interface WheelSample {
  /** Horizontal-mapped delta for this event, px. Sign = direction. */
  dx: number
  /** Event timestamp, ms — any monotonic clock (`performance.now()` in the browser, plain
   *  numbers in tests). */
  t: number
}

/** How long a gap since the previous sample before the stream is treated as a brand new burst —
 *  whatever came before (including any momentum tail) is fully forgotten, `sawFingerThisBurst`
 *  included. Comfortably above a trackpad's own event cadence (rarely exceeds ~30-40ms between
 *  samples even during slow, deliberate motion) and comfortably below the pause a person leaves
 *  between two genuinely separate gestures. */
const BURST_GAP_MS = 200

/** How close together two samples must be to count as "the same continuous touch" (finger or
 *  its momentum tail) rather than two separate isolated notches — the SPARSITY half of "large,
 *  sparse, fixed-step deltas" that identifies a physical mouse wheel: even spun quickly,
 *  individual notches are still tens of ms apart at minimum; an actively-touched trackpad
 *  delivers samples much tighter than this regardless of how fast or slow the motion is. */
const TIGHT_CADENCE_MS = 60

/** A same-direction sample counts as still-growing (definitely still finger, never momentum)
 *  once its magnitude exceeds the previous one by more than this factor — a little slack over
 *  1.0 so ordinary per-sample jitter in an otherwise-flat human touch doesn't misread as growth. */
const GROWTH_FACTOR = 1.08

/** A sample counts toward a decay streak once its magnitude is at or under the previous one by
 *  at least this much slack — avoids a dead-flat sequence (identical repeated deltas, e.g. a
 *  drum of same-size notches) registering as "decaying" through pure floating-point noise. */
const DECAY_FACTOR = 0.98

/** How many CONSECUTIVE decaying samples (see DECAY_FACTOR), at tight cadence, after a
 *  confirmed finger phase, before the streak is trusted as an actual momentum tail rather than
 *  one ordinary dip in an otherwise-still-active human touch. A real momentum curve decays
 *  cleanly and consistently sample after sample because it's not human-generated any more; a
 *  live touch's natural tremor can easily produce one or two isolated dips that mean nothing.
 *  The cost is a few samples (tens of ms) of latency recognising the true release point — a
 *  worthwhile trade against mistaking an ongoing slow drag for "released." */
const MOMENTUM_CONFIRM_COUNT = 3

export interface WheelIntentTracker {
  /** Feed one wheel sample, get back its classification. Pure with respect to the tracker's own
   *  internal state — the same sequence of calls always produces the same sequence of results. */
  push(sample: WheelSample): WheelIntent
  /** Forget everything, as if no gesture had ever happened — same effect a burst-boundary gap
   *  has automatically, exposed for a caller that already knows a gesture is definitely over
   *  (e.g. after driving a dock manoeuvre to completion). */
  reset(): void
}

export function createWheelIntentTracker(): WheelIntentTracker {
  let prev: WheelSample | null = null
  /** True only once UNAMBIGUOUS finger evidence has been seen this burst (real growth or a
   *  direction reversal) — deliberately NOT "was the previous sample merely labelled finger,"
   *  which would let a run of purely-ambiguous, never-actually-growing samples bootstrap its
   *  own momentum confirmation (each early sample defaults to 'finger' for want of 3 confirmed
   *  decays yet, and if that alone counted as "a finger phase happened," a decay-only sequence
   *  that never once grew could eventually talk itself into 'momentum' anyway — a tail needs to
   *  actually follow a touch, not just outlast the classifier's own uncertainty window). */
  let sawGenuineFinger = false
  let consecutiveDecays = 0

  function reset(): void {
    prev = null
    sawGenuineFinger = false
    consecutiveDecays = 0
  }

  function push(sample: WheelSample): WheelIntent {
    if (prev && sample.t - prev.t > BURST_GAP_MS) reset()

    if (!prev) {
      prev = sample
      // A lone sample, no burst confirmed yet — the honest best guess for something that MIGHT
      // be a single isolated notch. If a rapid continuation follows, the very next call
      // reclassifies from here on as finger; nothing about THIS answer was "wrong" in
      // hindsight, a real-time classifier only ever acts on what it's seen so far.
      return 'discrete'
    }

    const gap = sample.t - prev.t
    const magPrev = Math.abs(prev.dx)
    const magNow = Math.abs(sample.dx)
    const signFlip = Math.sign(prev.dx) !== Math.sign(sample.dx) && prev.dx !== 0 && sample.dx !== 0
    const grew = magNow > magPrev * GROWTH_FACTOR
    const decaying = magNow <= magPrev * DECAY_FACTOR

    let intent: WheelIntent

    if (gap >= TIGHT_CADENCE_MS) {
      // Loose cadence: not a continuous touch. A growing/reversing jump after a pause still
      // reads as a fresh finger touch starting (a re-grip can easily land more forceful than
      // the gesture before it); anything else — same-ish or decaying — reads as just another
      // isolated notch, never a momentum tail (momentum only ever follows tight-cadence finger
      // samples, never a bare pause).
      intent = signFlip || grew ? 'finger' : 'discrete'
      consecutiveDecays = 0
    } else if (signFlip || grew) {
      intent = 'finger'
      sawGenuineFinger = true
      consecutiveDecays = 0
    } else if (decaying) {
      consecutiveDecays += 1
      intent = sawGenuineFinger && consecutiveDecays >= MOMENTUM_CONFIRM_COUNT ? 'momentum' : 'finger'
    } else {
      // Flat (within tolerance of the previous sample) — neither a confirmed decay nor growth.
      // Reads as finger: a real momentum curve decays consistently downward every sample; a
      // streak interrupted by a flat reading isn't that, so the decay count resets rather than
      // just pausing (the NEXT decaying sample starts a fresh streak, not a continued one).
      intent = 'finger'
      consecutiveDecays = 0
    }

    prev = sample
    return intent
  }

  return { push, reset }
}
