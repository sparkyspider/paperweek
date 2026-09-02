# STATE — session close 2026-09-02 evening

*(Supersedes the process monitor's running log below-the-fold history; this is the resurrection
point for the next session. Read OPERATIONS.md for how the operation runs, LESSONS.md for the
incident-derived rules.)*

## Where everything stands

- **The app Mark uses**: branch `v2`, front on **:3200**, back on **:3201**, both left running.
  Postgres local, Zitadel shared at :8080 (org "Productivity"). Login mark@flyh2.com; local
  password is Mark's own (set 2026-09-02; file in `auth/.machinekey/` matches).
- **Design**: Mark chose the parchment v1 look over the ink-on-paper alternative. The full
  ink build is PRESERVED: branch `design-sexy` @ `2536eae`, worktree `../productivity-tools-sexy`
  (server stopped). Decision recorded in `docs/design-v2/README.md`.
- **Latest v2 commits**: `968b6cd` (Firefox wheel fix + `?wheeldebug=1` HUD) ← `1cc5d71`
  (softened theme cards) ← `6f230d4` (full scroll ownership from true release velocity) ←
  `9c12fa5` (flattening wave: one sheet, kinematic docking) ← `81e067d` ← `8c82189`.
- **Working tree**: clean (verify on resume).

## THE OPEN THREAD — first thing next session

**⚠️ MARK'S CLOSING VERDICT (his words): "the scrolling is a disaster and we fix it tomorrow."**
Not a calibration nicety — the scroll-ownership physics FAILS his real-Firefox trackpad feel
test despite passing all synthetic verification (42 tests, both engines, flush landings).
Treat as: synthetic-verified ≠ feels-right; the whole feel needs diagnosis with Mark present,
using the `?wheeldebug=1` HUD as the shared instrument. `WHEEL_OWNERSHIP = false` in
DayStrip.vue is the one-line fallback to native scrolling + tail-dock if he wants relief
before the fix. The pipeline is built and Firefox-verified mechanically; Next session: have him hard-refresh :3200, flick,
and/or open `:3200/?wheeldebug=1` (dev-only HUD: intent classification, velocity, ownership
state, planned target + solved a*). Map his feel-words to constants: `TAKEOVER_A0` (canvas
friction — fast flicks currently expected to feel FLOATY, known gap), classifier sensitivity,
`WHEEL_OWNERSHIP` flag in `DayStrip.vue` is the full-restore fallback if needed.

## Parked items (Mark's calls, no rush)

- Notes-section semantics: currently task-shaped; free-writing alternative undecided.
- Past-task aging: missed vs not-yet-due render identically; sepia-fade proposal open.
- `v2` → `main` merge: main is behind; merge when Mark says.
- Google login: waits on the co-sy-v2 side adding a Google IdP to the FlyH2 org (suggestion
  text already given to Mark to relay). Then: BFF IdP-intent flow + login button here.
- Tarryn's account: `auth/add-user.sh <email> <name>` when her email arrives.
- Sexy-branch future: kept as finished alternative; refs 02/04 remain in docs/design-v2/.

## Operating rules in force (see memory + OPERATIONS.md)

Commit protocol: standing authority; announce when Mark present, act when away. Single writer
per surface. Evidence before claims; retract-and-reprove. QT- test data only, never real
themes/tasks. Playwright verifies in BOTH engines (Mark browses Firefox). Mark's feedback style:
screenshots + terse observations; "Wait" = hold; late distillations override micro-instructions.
