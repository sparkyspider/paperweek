# Scroll diagnosis — 2026-09-03

**Mark's report (verbatim):** "It seems to scroll for a while. Then stop. Then try and
re-adjust backwards or forwards. Both in Chromium and Firefox. Same."

**Marlow's prediction, written before diagnosis:** the trackpad keeps emitting OS inertia
wheel events after the fingers lift. The code detects "release" too early or more than
once, plans a landing, then further inertia arrives and a second plan runs from a
different position. The visible stop-then-correct is the second plan.

Alternatives to rule out: (b) dock target measured differently from where the animation
ends, so a last nudge always fires; (c) CSS scroll-snap fighting the JS; (d) settle and
tail-dock are separate mechanisms that both fire.

**Falsified if:** the frame-by-frame scrollLeft trace under a realistic finger+inertia
stream shows a single continuous motion phase with no pause-then-move.

---

## Outcome — 2026-09-03, same day

**Prediction (a) confirmed in mechanism**, with the precise defect being "momentum confirmation
was not sticky" (a flat pair in a real integer tail un-confirmed it). Two further defects found
and fixed in sequence, each on Mark's real trackpad traces (`live/`):

1. Planner gave up when no day fit its deceleration clamp → glide to nowhere, pause, snap
   ("slowed down then jumped"). Fixed: always lands on a day.
2. OS wheel timestamps alternate 16/33 ms → delta sawtooth → re-touch rule tripped → speedometer
   read ~1.5 px/tick instead of ~30 → five-second creep. Fixed: classify and measure on rate
   (px/tick from the event's own timestamp); glide time bounded to [12, 48] ticks by choosing
   which day; constant-deceleration model unchanged; cubic-Hermite fallback only when no day is
   reachable within the cap. Last half-pixel snaps.

Also today, on Mark's call: friction doubled (`FRICTION = 2`); STILL / DRAGGING / DECELERATING
state machine, fading PING and 2-second-reset plan counter on the HUD; live recorder logs the
state sequence and flags any gesture that plans twice.

**Mark's verdict, verbatim (after 42 real flicks, all landing exactly, glides 0.4–0.85 s):**
> "Commit this, checkpoint this. This is the best we've had so far."

**Known, not yet ruled on:** at everyday release speeds (3–16 px/tick) with days 400 px apart,
most glides run on the bounded fallback curve, not on pure constant deceleration. Raising the cap
would put more flicks on pure physics at the cost of longer glides. Mark's feel decides.
Recorder plan-count parser needs updating to the new `[plan]` line format (instrument only).

## The 3-second rule — 2026-09-03, later the same afternoon

Mark, verbatim: *"If it looks like it'll get there in less than 3 seconds, let it get there by
itself. If not, do what you do."* Applied: `MAX_TICKS = 180` is the pure-physics ceiling;
`FALLBACK_TICKS = 48` is the Hermite's own duration, used only past the ceiling. Rig `after4/`:
10/10 exact landings, no Hermite anywhere, fast flicks 9 days in 2.8 s, slow 0.77 s.

Mark flicked the live window on this build and closed it. Verdict, verbatim:
> "Everything is perfect." — "That's why I closed it. Isn't that a lovely thing to close."

No per-gesture traces were saved for those flicks (the window closed before the recorder
flushed); the verdict stands on Mark's hand, the rig stands on `after4/`.
