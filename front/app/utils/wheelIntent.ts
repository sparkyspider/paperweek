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
 *     (several consecutive NON-GROWING samples containing at least two strict decays — not just
 *     one dip, since a real touch's natural up-and-down jitter can easily produce one isolated
 *     dip that isn't actually a release) can only be the browser's own physics tail, and only
 *     counts once a finger phase has actually been seen this burst (a momentum tail must FOLLOW
 *     a touch, never open one). Flat samples EXTEND the streak rather than breaking it: a slow
 *     tail reported in integer px decays as 11,10,10,9,8,8,7,7 — repeats between every step —
 *     and demanding strictly-consecutive decays never confirmed it at all (the slow-flick half
 *     of the 2026-09-03 bug: the whole tail applied by hand, then a second glide after the
 *     silence timeout). A dead-flat run (a drum of identical notches at tight cadence) still
 *     never confirms — it has no strict decays.
 *  3. Latching: once a momentum tail HAS been confirmed, it stays momentum for the rest of the
 *     burst. Real trackpads report integer deltas, so the low end of a physics tail arrives as
 *     repeats (7,7,6,6,...,2,2,1,1) — a "flat" sample there is still the tail, not a finger.
 *     Reading it as finger un-confirmed the tail mid-glide, cancelled the running manoeuvre,
 *     applied the crumbs by hand and planned a SECOND landing (the "scrolls, stops, then
 *     re-adjusts" bug, 2026-09-03). A genuine re-touch during a tail is recognised ONLY by an
 *     unmistakable signal: a direction reversal, or a RATE RISE well above the decaying
 *     envelope (> RETOUCH_GROWTH_FACTOR × the larger of the previous TWO samples' rates AND at
 *     least RETOUCH_MIN_PX — the floor keeps 1→2 px integer jitter at the very end of a tail
 *     from counting; the two-sample envelope keeps one late-dispatched sample, whose rate dips
 *     for a beat, from making its ordinary successor look like a 2× rise). A flat or decaying
 *     sample never un-confirms momentum; only the burst-gap silence (or `reset()`) ends the
 *     tail.
 *
 * WHAT IS COMPARED — RATE, NOT RAW DELTA (2026-09-03, the "5-second creep"). Chrome hands the
 * handler a macOS trackpad's events at a steady ~27ms, but each event's `timeStamp` (the OS
 * clock) alternates 16 / 33ms and each delta is proportional to ITS OS interval — so one smooth
 * OS tail reads as a raw-magnitude sawtooth (-34,-14,-26,-22,-10,-18,-8...). Compared raw, the
 * up-teeth (14→26, 10→18) exceed GROWTH_FACTOR and even RETOUCH_GROWTH_FACTOR: momentum confirmed
 * late, un-latched on the next tooth, the tail applied by hand, and the release velocity read
 * ~1.5 px/tick instead of ~30 (live/CREEP-FINDINGS.md). Every magnitude comparison below is
 * therefore made on the sample's RATE — px per tick, `dx / (Δts / TICK_MS)` with Δts from
 * `WheelSample.ts` (the event's own timeStamp) — which is flat where the raw deltas saw-tooth.
 * `Δts` is guarded (≤ 0, under MIN_RATE_DT_MS, or over BURST_GAP_MS → the previous Δts, else one
 * tick), because two OS timestamps 1-3ms apart do occur and would read as an absurd spike. The
 * cadence / burst-gap checks stay on `t` (the dispatch clock) — they measure the handler's
 * experience of the stream, not the OS's. `lastRate()` exposes the same reading so the caller's
 * velocity EMA is fed by the ONE speedometer rather than a second, differently-guarded one.
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
  /** Dispatch timestamp, ms — when the handler SAW the event (`performance.now()` in the
   *  browser, plain numbers in tests). Drives the cadence and burst-gap checks. */
  t: number
  /** The event's own timestamp, ms (`WheelEvent.timeStamp` — the OS clock the delta was
   *  measured against). Drives the RATE the magnitudes are compared on; see the file doc
   *  comment. Optional: defaults to `t`, which is exact whenever the two clocks agree (synthetic
   *  events, tests) and the best available reading otherwise. */
  ts?: number
}

/** One rAF tick, ms — the unit every rate here is expressed in (px/tick), matching dockPhysics. */
export const TICK_MS = 1000 / 60

/** An event-timestamp gap under this is not a physical inter-sample interval on any trackpad
 *  (they report at ~60-90Hz) — it is two OS events coalesced or jittered onto near-identical
 *  clocks (gesture-10: 1.7ms and 3.1ms gaps carrying ordinary deltas) — and would turn an
 *  ordinary delta into a 5-10× rate spike. Fall back to the previous gap instead. */
export const MIN_RATE_DT_MS = 4

/** `WheelEvent.deltaMode` values (the DOM spec's own constants — not exposed as a global by
 *  every engine, so named locally rather than relying on `WheelEvent.DOM_DELTA_LINE` existing). */
export const DOM_DELTA_PIXEL = 0
export const DOM_DELTA_LINE = 1
export const DOM_DELTA_PAGE = 2

/** px-per-line used to normalize DOM_DELTA_LINE deltas — Firefox's own convention (line mode
 *  deltas are small integers, "N lines"), matching a typical CSS line-height. Chromium/Safari
 *  report DOM_DELTA_PIXEL for the same trackpad gestures and never hit this path at all; this
 *  constant only matters for engines (Firefox, and classic notch-style mouse wheels on any
 *  engine) that report line-mode. A single named constant rather than a magic number scattered
 *  through the normalizer, so retuning it later is a one-line change. */
export const LINE_HEIGHT_PX = 16

/** Converts a raw wheel-event delta (one axis) to px, given its event's `deltaMode` — the FIRST
 *  thing that must happen to a raw delta before it reaches anything else (the classifier above,
 *  or a caller applying it to `scrollLeft`): every threshold downstream (cadence in ms is
 *  mode-independent already, but the growth/decay RATIOS still need every sample in one
 *  consistent unit to compare meaningfully) assumes px. `pageSizePx` is whatever "one page"
 *  means for the caller's own scroll container (its own clientWidth for a horizontal strip) —
 *  DOM_DELTA_PAGE is rare for a wheel/trackpad gesture but cheap to handle correctly. Pixel mode
 *  (by far the common case — every gesture Chromium/Safari ever report, and probably most of
 *  Firefox's own trackpad-originated events too) passes through unchanged. */
export function normalizeWheelDelta(raw: number, deltaMode: number, pageSizePx: number): number {
  if (deltaMode === DOM_DELTA_LINE) return raw * LINE_HEIGHT_PX
  if (deltaMode === DOM_DELTA_PAGE) return raw * pageSizePx
  return raw
}

/** How long a gap since the previous sample before the stream is treated as a brand new burst —
 *  whatever came before (including any momentum tail) is fully forgotten, `sawFingerThisBurst`
 *  included. Comfortably above a trackpad's own event cadence (rarely exceeds ~30-40ms between
 *  samples even during slow, deliberate motion) and comfortably below the pause a person leaves
 *  between two genuinely separate gestures. */
export const BURST_GAP_MS = 200

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

/** How many CONSECUTIVE non-growing samples (flat or decaying, see DECAY_FACTOR/GROWTH_FACTOR),
 *  at tight cadence, after a confirmed finger phase, before the streak is trusted as an actual
 *  momentum tail rather than one ordinary dip in an otherwise-still-active human touch. A real
 *  momentum curve never rises, sample after sample, because it's not human-generated any more; a
 *  live touch's natural tremor can easily produce one or two isolated dips that mean nothing.
 *  The cost is a few samples (tens of ms) of latency recognising the true release point — a
 *  worthwhile trade against mistaking an ongoing slow drag for "released." */
const MOMENTUM_CONFIRM_COUNT = 3

/** ...and at least this many of those must be STRICT decays (DECAY_FACTOR), so a dead-flat run
 *  of identical deltas (a fast drum of same-size notches, or a hand holding a perfectly steady
 *  drag) can never confirm as a tail no matter how long it lasts. Two, not three: an
 *  integer-reported slow tail (11,10,10,9,...) only ever manages two strict steps per three
 *  samples. */
const MOMENTUM_MIN_DECAYS = 2

/** Once momentum is confirmed (latched), a same-direction sample only reads as a NEW finger
 *  touching down if it exceeds the previous sample by more than this factor — far above
 *  GROWTH_FACTOR's jitter slack, because a physics tail never rises at all, and the only rises
 *  ever seen inside one are integer-rounding crumbs (1 → 2) at its very end. */
const RETOUCH_GROWTH_FACTOR = 1.5

/** ...and is at least this many px in magnitude — the absolute floor that keeps those 1 → 2 px
 *  end-of-tail crumbs (a 2× "rise" by ratio alone) from ever counting as a re-touch. A real
 *  finger landing mid-tail produces deltas well above this from its first sample. */
const RETOUCH_MIN_PX = 4

export interface WheelIntentTracker {
  /** Feed one wheel sample, get back its classification. Pure with respect to the tracker's own
   *  internal state — the same sequence of calls always produces the same sequence of results. */
  push(sample: WheelSample): WheelIntent
  /** The RATE (px/tick, signed) the most recently pushed sample was measured at — the same
   *  guarded `dx / (Δts / TICK_MS)` reading the classification used. The caller's velocity EMA
   *  should be fed from here, not from its own dispatch-clock arithmetic (file doc comment). */
  lastRate(): number
  /** Forget everything, as if no gesture had ever happened — same effect a burst-boundary gap
   *  has automatically, exposed for a caller that already knows a gesture is definitely over
   *  (e.g. after driving a dock manoeuvre to completion). */
  reset(): void
}

export function createWheelIntentTracker(): WheelIntentTracker {
  let prev: WheelSample | null = null
  /** Rate (px/tick) of `prev`, and the Δts it was measured over (the fallback for a guarded gap). */
  let prevRate = 0
  /** Rate of the sample before `prev` — with `prevRate`, the two-sample envelope the re-touch
   *  test is made against (file doc comment, discriminator 3). */
  let prevPrevRate = 0
  let prevDt: number | null = null
  let rate = 0

  /** The guarded rate for `sample` given the previous sample's event timestamp. */
  function measure(sample: WheelSample): number {
    const ts = sample.ts ?? sample.t
    const prevTs = prev ? (prev.ts ?? prev.t) : null
    let dt = prevTs === null ? null : ts - prevTs
    if (dt === null || !(dt >= MIN_RATE_DT_MS) || dt > BURST_GAP_MS) dt = prevDt ?? TICK_MS
    prevDt = dt
    return sample.dx / (dt / TICK_MS)
  }
  /** True only once UNAMBIGUOUS finger evidence has been seen this burst (real growth or a
   *  direction reversal) — deliberately NOT "was the previous sample merely labelled finger,"
   *  which would let a run of purely-ambiguous, never-actually-growing samples bootstrap its
   *  own momentum confirmation (each early sample defaults to 'finger' for want of 3 confirmed
   *  decays yet, and if that alone counted as "a finger phase happened," a decay-only sequence
   *  that never once grew could eventually talk itself into 'momentum' anyway — a tail needs to
   *  actually follow a touch, not just outlast the classifier's own uncertainty window). */
  let sawGenuineFinger = false
  /** Consecutive non-growing (flat or decaying) tight-cadence samples, and how many of those
   *  were strict decays — together the "sustained decay" test, discriminator 2 above. */
  let nonGrowingStreak = 0
  let decaysInStreak = 0
  /** Latched the first time MOMENTUM_CONFIRM_COUNT decays confirm a tail this burst; stays set
   *  (every later sample is 'momentum') until a clear re-touch signal, a burst-gap silence, or
   *  `reset()` — see discriminator 3 in the file doc comment. */
  let momentumConfirmed = false

  function reset(): void {
    prev = null
    prevRate = 0
    prevPrevRate = 0
    prevDt = null
    sawGenuineFinger = false
    nonGrowingStreak = 0
    decaysInStreak = 0
    momentumConfirmed = false
  }

  function push(sample: WheelSample): WheelIntent {
    if (prev && sample.t - prev.t > BURST_GAP_MS) reset()

    if (!prev) {
      // No Δts to measure over yet: read the lone sample as one tick's worth (its raw delta).
      rate = measure(sample)
      prevRate = rate
      prev = sample
      // A lone sample, no burst confirmed yet — the honest best guess for something that MIGHT
      // be a single isolated notch. If a rapid continuation follows, the very next call
      // reclassifies from here on as finger; nothing about THIS answer was "wrong" in
      // hindsight, a real-time classifier only ever acts on what it's seen so far.
      return 'discrete'
    }

    const gap = sample.t - prev.t
    rate = measure(sample)
    // Every magnitude comparison is on RATE (px/tick), never the raw delta — file doc comment.
    const magPrev = Math.abs(prevRate)
    const magNow = Math.abs(rate)
    const signFlip = Math.sign(prev.dx) !== Math.sign(sample.dx) && prev.dx !== 0 && sample.dx !== 0
    const grew = magNow > magPrev * GROWTH_FACTOR
    const decaying = magNow <= magPrev * DECAY_FACTOR

    let intent: WheelIntent

    if (momentumConfirmed) {
      // Latched tail: stays momentum whatever the cadence or the sample-to-sample shape (flat,
      // decaying, a small rounding rise) until the burst-gap silence at the top of push() ends
      // the burst. Only an unmistakable re-touch — a reversal, or a clear rise above the decaying
      // envelope — hands control back to a finger and starts the burst's bookkeeping afresh.
      const envelope = Math.max(magPrev, Math.abs(prevPrevRate))
      const retouch = signFlip || (magNow > envelope * RETOUCH_GROWTH_FACTOR && magNow >= RETOUCH_MIN_PX)
      if (retouch) {
        momentumConfirmed = false
        sawGenuineFinger = true
        nonGrowingStreak = 0
        decaysInStreak = 0
        intent = 'finger'
      } else {
        intent = 'momentum'
      }
    } else if (gap >= TIGHT_CADENCE_MS) {
      // Loose cadence: not a continuous touch. A growing/reversing jump after a pause still
      // reads as a fresh finger touch starting (a re-grip can easily land more forceful than
      // the gesture before it); anything else — same-ish or decaying — reads as just another
      // isolated notch, never a momentum tail (momentum only ever follows tight-cadence finger
      // samples, never a bare pause).
      intent = signFlip || grew ? 'finger' : 'discrete'
      nonGrowingStreak = 0
      decaysInStreak = 0
    } else if (signFlip || grew) {
      intent = 'finger'
      sawGenuineFinger = true
      nonGrowingStreak = 0
      decaysInStreak = 0
    } else {
      // Non-growing: a strict decay, or flat within tolerance. Both extend the streak (an
      // integer-reported tail repeats values between steps — see discriminator 2); only strict
      // decays count toward MOMENTUM_MIN_DECAYS, so a dead-flat run never confirms on its own.
      nonGrowingStreak += 1
      if (decaying) decaysInStreak += 1
      momentumConfirmed = sawGenuineFinger
        && nonGrowingStreak >= MOMENTUM_CONFIRM_COUNT
        && decaysInStreak >= MOMENTUM_MIN_DECAYS
      intent = momentumConfirmed ? 'momentum' : 'finger'
    }

    prev = sample
    prevPrevRate = prevRate
    prevRate = rate
    return intent
  }

  return { push, lastRate: () => rate, reset }
}
