# The 5-second creep — findings (gestures 09/10, current code)

Evidence: `gesture-09-*`, `gesture-10-*` in this folder (Chrome 151, macOS, DPR 2, docks every
400px, A0 = 0.22 px/tick²). Reconstruction script: scratchpad `creep.py` — a Python port of
`wheelIntent.ts` + DayStrip's velocity EMA (matches the recorder's `hud_intent` column on every
row and `hud_velocity` to within rounding) plus `planDock`. Predicted stop times below agree with
the observed glide durations within 4%, so the reconstruction of (v, target, a) is trustworthy.

## Q1 — release velocity at `handleFingerRelease`

| gesture / release t | finger peak EMA | latch un-done | **v at release** | x0 | target | a | a/A0 | stopTime | predicted | observed |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 / 1231 | 51.6 | 1× | **-2.06** | 18872 | 18800 | 0.0295 | 0.13 | 70 ticks | 1.17s | 1.09s |
| 10 / 4092 | 65.7 | 2× | **-1.33** | 17826 | 17600 | 0.0039 | 0.018 | 340 ticks | 5.66s | 5.49s |
| 10 / 11364 | 31.7 | 2× | **+1.49** | 18180.5 | 18400 | 0.0051 | 0.023 | 292 ticks | 4.87s | 4.71s |
| 09 / 22280 | 33.5 | 0 (never latched) | -1.59 | 22290 | 22000 | 0.0044 | 0.020 | 365 | 6.08s | 5.89s |
| 09 / 33496 | 19.9 | 1× | -1.68 | 21238 | 21200 | 0.0371 | 0.17 | 45 | 0.75s | 0.69s |
| 09 / 35680 | 36.0 | 3× | -1.36 | 20560 | 20400 | 0.0058 | 0.026 | 235 | 3.92s | 3.77s |
| 09 / 40646 | 14.4 | 2× | -1.70 | 19990.5 | 19600 | 0.0037 | 0.017 | 459 | 7.66s | 7.47s |

(v in px/tick; a in px/tick²; "finger peak EMA" = max |wheelVelocity| during the touch.)

**Every manoeuvre launched at 1.3–2.1 px/tick, 15–50× below the finger's speed.** Why:

1. **The momentum latch is broken by a delta sawtooth.** Chrome hands the handler wheel events at a
   steady ~27ms (`t_ms`), but their `event.timeStamp` (the OS clock) alternates 16 / 33ms, and each
   delta is proportional to *its* OS interval — so the raw deltas of one smooth OS tail read as
   e.g. `-34,-14,-26,-22,-10,-18,-8,-14,-12,-6,-8,-8,-2,-4,-4,-2,-4`. `wheelIntent.ts` compares raw
   magnitudes, so (a) the first confirmation is late (three consecutive non-growing samples rarely
   happen — GROWTH_FACTOR 1.08, line 197), and (b) once latched, the next up-tooth (14→26, 12→20,
   10→18, 2→4, 4→8) exceeds RETOUCH_GROWTH_FACTOR 1.5 and RETOUCH_MIN_PX 4 (line 207) and
   un-latches. Per tail in gesture-10: 5–8 raw rises over 1.08 and 5–7 over the retouch bar, versus
   0–2 when the same samples are compared as rates (dx / OS-dt). Gesture-09's rightward flicks
   (OS dt 33–50ms, less alternation) show 0 retouch-level rises and did latch.
2. **Consequence chain (gesture-10, second flick):** momentum confirmed at 3652.7 with v = -18 →
   `handleFingerRelease` starts a manoeuvre → 28ms later `-20` after `-12` = "retouch" →
   `cancelTakeover()`, `wheelReleasedThisGesture=false`, sample applied by hand → re-latched at
   3904 with v = -5.2 → un-latched again by `-4` after `-2` → the whole remaining tail is applied
   by hand (110px of the strip walking at the OS's pace) while the EMA (line 479, 50/50 blend of
   per-event rate) decays with it → silence → `WHEEL_RELEASE_GAP_MS` (80ms) timer fires the
   release with v = -1.33. The writes log shows 2–3 aborted `step` writes inside each finger phase.
   Units/deltaMode are not the issue (all mode 0, px); nor is the 60Hz tick normalisation — the
   EMA faithfully tracks the crumbs it was fed.

## Q2 — which dock, which `a`

All seven used **step 4 of `planDock`, the closest-in-log-ratio fallback** (dockPhysics.ts
177–194): at v ≈ 1.4 the natural landing at A0 is ~4px away, the primary is the nearest dock
ahead (40–390px), the solved a is 0.004–0.006 (a/A0 ≈ 0.02, far below CLAMP_LOW 0.4), the "step
nearer" index is -1 (nothing nearer), so the fallback returns the primary with that exact tiny a.
stopTime = v/a = 235–460 ticks = 3.9–7.7s. Landing exact (dockError 0), by construction.

## Q3 — the 0.5px-every-80ms tail

Yes. `positionAt` (dockPhysics.ts 96–101) emits sub-pixel positions (writes log: 17601.27,
17600.98, 17600.74, 17600.53, 17600.36, 17600.21 …); Chromium quantises `scrollLeft` to 0.5px at
DPR 2, so the frames CSV shows 0.5px steps at 50→150ms spacing over the last ~1s. The distance
covered in the last k ticks is ½·a·k², so at a = 0.004 the final 0.5px alone takes
√(1/a) ≈ 16 frames. `runTakeover` (DayStrip.vue 226–272) only finishes when `tTicks >= st`
(line 259); it never snaps on |remaining| < 1px or a velocity floor. With a sane `a` (≥ 0.03)
that tail is ≤ 6 frames and invisible; the stutter is a symptom of the tiny a, not a separate
bug — but a `< 0.5px → write target and finish` guard costs one line.

## Q4 — why the synthetic rig looks fine

`rig/trackpad-rig.mjs`: 60Hz uniform cadence, finger ramp 4→40 monotonic, tail geometric ×0.9 (never
a rise, never ≥1.5×). The classifier confirms 3 samples after the peak (EMA ≈ 30 px/tick), stays
latched, and the manoeuvre starts ~50ms after "lift" — after2 chromium-fast-int: 800px, one
phase, done at 1657ms. Mark's stream: 27ms handler cadence, OS timestamps alternating 16/33ms,
integer deltas proportional to OS dt (sawtooth), one coalesced spike sample (-138/-170 with a
66ms OS gap) at the peak, finger phase ~300ms. **The difference is the sawtooth, not speed or
deltaMode.**

The control: gesture-09's two flicks that *did* latch promptly (v = 43 and 31 px/tick) glided
**4080px in 3.1s and 2358px in 2.5s** (6–10 days) at a ≈ A0. So the current design fails both
ways: right velocity → far too far and > 2s; wrong velocity → creep. Duration is never bounded.

## Fix — ranked, tight

**1 (do this; it alone kills the creep and the over-glide): bound the manoeuvre by TIME, not by
an a-clamp — candidate (b)+(c)+(d) folded into one profile.** In `planDock` replace CLAMP_LOW/HIGH
(dockPhysics.ts 114–115, 162–194) with `MIN_TICKS = 12`, `MAX_TICKS = 48` (0.2–0.8s; 36 for a
0.6s ceiling). For a dock at distance d the constant-decel duration is T = 2d/v. Pick the dock
nearest `clamp(naturalLanding, x + v·MIN/2, x + v·MAX/2)` (A0 now only chooses *how far*, never
*how long*); if that dock's T < MIN step one dock farther (existing "too close" logic); then run
`T = clamp(2d/v, MIN, MAX)` and drive with the cubic Hermite
`x(s) = x0 + d·(3s²−2s³) + v·T·(s³−2s²+s)`, s = t/T. This starts at exactly slope v (no seam),
lands exactly on the dock, and when T = 2d/v it *is* the current constant deceleration
(algebraically identical), so nothing changes for well-fitting flicks. When T is clamped down
(the creep case: v = 1.33, d = 226 → 0.8s instead of 5.5s) the curve is provably monotonic; clamping
up only overshoots if T > 3d/v, which the step-farther rule avoids. `runTakeover` swaps
`positionAt(tTicks, x0, v0, a)` (line 268) for `positionAt(tTicks, x0, v0, d, T)` and finishes at
`tTicks >= T` or `|target − x| < 0.5` (Q3). Result on the table above: creeps become 0.8s; the
43 px/tick flick lands 800px away in 0.7s instead of 4080px in 3.1s.

**2 (do next; makes the glide start at lift-off instead of 400ms later): fix the measurement —
candidate (a).** Feed the tracker and the EMA the *rate*: in `onWheel` (DayStrip.vue 457, 476–479)
use `dt = e.timeStamp − prevTimeStamp` and `push({ dx: dx/dt·TICK, t: now })`; keep `performance.now`
for cadence/burst gaps (the 66ms OS gap on the spike sample would otherwise read as discrete —
or raise TIGHT_CADENCE_MS to 80). Replayed on gestures 09/10 this confirms momentum 3–5 samples
after the peak at v = 24–50 px/tick with no un-latch in gesture-10 (one 30ms blip in 09). Without
fix 1 this alone would make every flick a 2–4s, 6–10-day glide at A0 = 0.22 — do it *with* 1.

**3 (already inside 1): snap the final < 0.5px** rather than waiting for stopTime.
