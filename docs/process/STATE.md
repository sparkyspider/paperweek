# STATE — session close 2026-09-03 evening

*(Resurrection point for the next session. OPERATIONS.md says how the operation runs,
LESSONS.md holds the incident-derived rules. Marlow ran this session; the day's evidence and
verbatim rulings are in `docs/process/evidence/scroll-diagnosis-2026-09-03/`.)*

## Where everything stands

- **The app Mark uses**: branch `v2`, front on **:3200**, back on **:3201**, both left running.
  Postgres local, Zitadel shared at :8080 (org "Productivity"). Login mark@flyh2.com; local
  password file in `auth/.machinekey/`.
- **Design**: parchment v1. Ink alternative preserved on `design-sexy` @ `2536eae`.
- **Latest v2 commits** (all today): plan-violation-by-touch + this file ← `d741997` (the
  3-second rule) ← `ddf08bb` (evidence) ← `2096e1a` (latched momentum, always land on a day,
  rate-based speedometer) ← `40b229d` (yesterday's "disaster" verdict).
- **Working tree**: clean (verify on resume). Evidence videos are gitignored, local only.

## THE SCROLLING — RESOLVED, Mark's words: "Everything is perfect."

Yesterday's "the scrolling is a disaster" was three stacked defects, each found on Mark's own
trackpad traces and fixed in order (full story: `evidence/scroll-diagnosis-2026-09-03/PREDICTION.md`):

1. Real inertia tails repeat integers; a flat pair un-confirmed momentum and cancelled the
   glide → stop-then-readjust. Momentum is now latched per burst (`wheelIntent.ts`).
2. Planner gave up when no day fit its deceleration clamp → glide to nowhere, pause, snap.
   It now always lands on a day (`dockPhysics.ts`).
3. OS wheel timestamps alternate 16/33 ms → delta sawtooth → speedometer read 1.5 px/tick
   instead of 30 → five-second creep. Everything is now judged on RATE from the event's own
   timestamp; glide time bounded by choosing which day.

**The model, as Mark states it:** deceleration is solved from the distance to a day; time
follows. **Mark's 3-second rule (verbatim):** *"If it looks like it'll get there in less than 3
seconds, let it get there by itself. If not, do what you do."* → `MAX_TICKS = 180` pure
physics ceiling; `FALLBACK_TICKS = 48` cubic-Hermite only beyond it. `FRICTION = 2` (Mark:
"maybe double"). 83 unit tests; 10/10 rig runs; 54+ real flicks recorded, every one landing
exactly (glides 0.8–2.8 s).

**Instruments (dev only, `:3200/?wheeldebug=1`):** STILL / DRAGGING / DECELERATING state
machine, fading PING per plan, plans counter (resets on each new touch and after 2 s still;
red "PING xN" = a plan without a new touch = the invariant broken). **Live recorder** (headed
Chromium, records Mark's real flicks per gesture with state sequence and plan count):
`node docs/process/evidence/scroll-diagnosis-2026-09-03/live/rig/live-recorder.mjs`
(run from the scratchpad; log to `live/recorder.log`, timestamps UTC). Synthetic rig with
sawtooth replay of Mark's gesture-10: `.../after3/rig/trackpad-rig.mjs`.

**Known, not yet ruled on:** the one-to-two-frame hold at hand→glide handoff (classifier
confirmation latency) — nobody has complained. Real-Firefox trackpad timestamps unverified
(all real flicks today were in headed Chromium). Slow releases (≈3–5 px/tick) sometimes take
the 0.8 s fallback, sometimes a 2–3 s pure drift, depending on distance — Mark called the
whole feel perfect; revisit only if he raises it.

## Parked items (Mark's calls, no rush)

- Notes-section semantics: task-shaped now; free-writing alternative undecided.
- Past-task aging: missed vs not-yet-due render identically; sepia-fade proposal open.
- `v2` → `main` merge: main is behind; merge when Mark says.
- Google login: waits on co-sy-v2 adding a Google IdP to the FlyH2 org.
- Tarryn's account: `auth/add-user.sh <email> <name>` when her email arrives.
- Sexy-branch future: kept as finished alternative.

## Operating rules in force (see memory + OPERATIONS.md)

Marlow persona (portable skill) ran today: subagents do all reading/building/verifying;
Marlow eyeballs every plot before "done"; prediction written before diagnosis; rulings recorded
verbatim before acting. Commit protocol: standing authority; explicit paths, never `add -A`.
Evidence before claims; retract-and-reprove. Playwright verifies in BOTH engines. Mark's
laptop lid closing kills workers mid-step — keep it open during dispatches.
