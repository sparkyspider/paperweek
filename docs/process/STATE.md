# STATE.md — living snapshot

Updated every observation cycle. Newest observation cycle at top; older ones kept
below for trend/history (don't delete — the trend is diagnostic).

---

## STANDING OBJECTIVE — THE SEXY-BRANCH PIPELINE (from Mark, via main, 2026-09-01 19:50)

**Do not let this scroll off the top of this file. Re-read it every cycle. Mark has
left the session on full auto — no human is watching phase transitions — so this
monitor's enforcement duties below are the only backstop.** See `OPERATIONS.md` §10
for the process write-up; this block is the live status tracker.

### The 9 phases
1. Current worker queue completes (16Δ, 21-26, 7).
2. QA's retest — now **ten items** (see "QA retest list" below).
3. Fixes for anything the retest turns up.
4. Clean restart → **commit branch `v2`** (this becomes "contender A" in the final
   comparison — v2 keeps its current look-and-feel, permanently, from this point).
5. Branch `design-sexy` from the committed `v2`.
6. A dedicated design worker implements the two parked references —
   `docs/design-v2/02-sketchbook-welcome-login.md`/`.png` (login) and
   `docs/design-v2/04-perfect-weekly-planner.md`/`.png` (planner) — **on
   `design-sexy` only**. **The gate in `docs/design-v2/README.md` is explicitly
   lifted for this one branch, by Mark, this session — `v2` itself keeps the gate and
   its current look.** Do not let this exception bleed into `v2` or `03-weekly-planner-spread` (that reference is not part of this pipeline's scope as stated).
7. Design-fidelity loop: builder screenshots vs. the reference PNGs, scored by a
   fidelity judge on the 7 ADOPTED rubric dimensions (paper ground/texture,
   typography roles, accent discipline, ink quality, artifact restraint, layout
   metaphor, overall gestalt — see `OPERATIONS.md` §10), numeric stop rule (two
   consecutive ≥4/5-all-dimensions iterations, or <0.5 total gain after iteration 4).
8. Full QA re-audit of `design-sexy` — the same 26-item ledger (5 scenarios + 14-item
   audit + others accumulated) plus core loops, run again on this branch, not assumed
   carried over from `v2`.
9. `design-sexy`'s front served on **port 3202**, alongside the polished current-look
   build — whatever branch `v2` holds after phase 4's commit — staying live on port
   3200, for Mark's final side-by-side comparison. (Amended 2026-09-01 ~19:56: main's
   original "v1" was loose shorthand for this, not a literal separate v1.)

### Current phase: 7 — FIDELITY LOOP, iteration 2 in progress (phase 6 build done, judged)

**PHASE 6 CLOSED / PHASE 7 STARTED**: the builder's iteration 1 was judged by the
independent FIDELITY JUDGE using this monitor's adopted rubric (`OPERATIONS.md` §10)
— **score 46/70** (planner 22/35, login 24/35). Per-dimension read: **typography
roles, accent discipline, and layout metaphor all scored 4/5 on both surfaces** —
judge's own words: "the skeleton has converged." **Blocked by ink quality (2/5 both
surfaces)** — uniform vector shapes, no hand-drawn character — plus named weaknesses
in sticky-note flatness, prop density, and paper grain. Stop rule unchanged (two
consecutive all-dimensions-≥4 passes) — nowhere close yet, this is exactly what
iteration cycles are for.

**INC-14 (routine, per the adopted no-root-cause rule)**: Builder I died post-report
— harness-level, **fifth** transcript death this session. Logged in `LESSONS.md`
without ceremony, per the standing guidance from INC-12/13.

**Builder II spawned** in the worktree, briefed with the judge's ranked fix list:
SVG hand-strokes replacing CSS shapes (ink quality), real torn/taped sticky-note
texture, added login-page props + a "Remember me" ballot-box element, visible paper
grain. **Expect iteration 2 in ~30-45 min** — another long quiet-build stretch, same
caution as iteration 1 (don't false-alarm on it). **Shepherd VI continues the content
watch** through this iteration — no new watcher spawn needed, still within its
budget.

### Cycle 33 — 2026-09-01 22:23, still on-target
`grain-test.png`/`.html` (22:22) and a `zoom-*` series (header, today, datenum,
daycard, wedcard — 22:20-22:22) — Builder II testing paper-grain texture and
close-inspecting specific UI elements, directly continuing the ink-quality/grain
thread from the judge's feedback. Shepherd VI still on its original file (5195
bytes, 21:58) — not yet flagging as a concern; healthy content keeps landing in the
scratchpad independent of Shepherd's own cadence, and it's within a plausible ~4-min
poll gap given how recently it last wrote relative to this build's pace. Will check
its mtime explicitly again next cycle before treating it as a liveness question. No
v2 checkout drift, nothing actionable.

### Cycle 32 addendum — 2026-09-01 22:14, Builder II on-target
`gen-rough.mjs` / `gen-torn.mjs` / `gen-torn2.mjs` (22:12-22:13) — scripts generating
rough/torn-edge texture assets, directly on the judge's ink-quality/sticky-note-
texture feedback from iteration 1, not a tangent. `baseline-login.png` /
`baseline-planner.png` (22:09) + `login-dom.html` (22:10) reads as Builder II
establishing a before-shot for its own comparison. Healthy, on-target progress;
nothing actionable.

### Superseded — phase 6 record (kept for trend/history, not the live status)

**PHASE 3 CLOSED** (~21:40): clean server restart done properly this time — writers
killed *before* log removal (closes the `front.log` sparse-file watch item from
`LESSONS.md` INC-6/`OPERATIONS.md` §9 PROPOSED fix; the PROPOSED remedy was exactly
this — restart the writer, don't just truncate a live file's log), fresh ~4KB logs,
both servers verified up.

**PHASE 4 DONE**: commit **`8c82189`** on `v2` — 48 files, 5673 insertions, the whole
QA wave. **`v2` is now frozen as "contender A"** — per phase 4's own definition, it
keeps this look-and-feel permanently for the final comparison; no more changes to it
from here.

**PHASE 5 DONE, architecturally notable**: `design-sexy` branched from the committed
`v2`, but not as a simple branch-and-switch — **a git WORKTREE** at
`/Users/sparkyspider/IdeaProjects/productivity-tools-sexy`. This means `v2` keeps
serving port 3200 the whole time (nothing had to stop), while `design-sexy` serves
3202 from its own independent working directory — **the phase-9 side-by-side
architecture is live early**, not something assembled only at the end. Two full
copies of the working tree now exist on disk; **single-writer-per-surface now reads
as single-writer-per-worktree** — the sexy builder's surface is the worktree path
above, not the original `productivity-tools/` checkout, and nothing should touch `v2`
(the original checkout) from here on except reading it as the frozen comparison
baseline.

**PHASE 6 STARTED**: the **SEXY BUILDER** (Sonnet) is working in the worktree —
implementing refs 02 (login) + 04 (planner) as a **behaviour-preserving reskin**, on
port 3202. **One explicitly permitted cross-boundary edit**: backend CORS gets a
`+3202` origin added, requiring a backend restart — this is a **documented,
sanctioned exception** to the "don't touch other surfaces" rule, not a violation to
flag if seen; noting it here so a future observation cycle doesn't mistake it for
scope drift. The builder self-assesses its own iteration 1 against the reference
images, then main spawns the independent **FIDELITY JUDGE** for phase 7 (this
monitor's adopted rubric: 7 anchored dimensions, blind ordering, independent judge,
numeric stop rule — `OPERATIONS.md` §10).

**Watch items for phase 6** (per main's own framing):
- Builder's iteration-1 report — **expect ~30-45 min** (includes an `npm install` in
  the fresh worktree) — a long quiet stretch here is normal, not a stall; don't
  false-alarm on it the way Shepherd IV once did (INC-11).
- Backend stays healthy on 3201 after its CORS-driven restart.
- `v2` on port 3200 remains untouched by any sexy-branch work — single-writer-per-
  worktree, watch for any diff/commit activity in the original checkout that isn't
  read-only.
- **Shepherd V may be near its budget** — if its lane goes dark during phase 6,
  that's explicitly a RESPAWN REQUEST situation per §11, not an ambiguous call.

### Superseded — phase 2 record (kept for trend/history, not the live status)
**PHASE 1 COMPLETE**: worker reported task 7 (physics) done with full verification
(5/6 exact docks, the miss proven a harness race rather than a real defect; also
fixed an unrelated dead-code `scrollend` gap found along the way). All 26 tasks
closed. **PHASE 2 EXECUTED** immediately: QA II spawned via ledger-based handover
(the ledger-survives-the-agent principle, `OPERATIONS.md` §11, working exactly as
designed a second time), covering the ten retest items (HIGH-suspect margin-dot
coordinate-click as item 10), producing batched verdicts with a final synthesis
after.

**Phase-completion log** (for the 15-min timers):
- Phase 1 complete: ~20:45.
- Phase 2 (QA II spawn) executed: ~20:45, same message — no gap to time here, main
  moved immediately.

**Enforcement watch now covers, per main's own framing**:
(a) QA II produces verdicts at a reasonable pace — its screenshot stream is the
    artifact to watch, same pattern as the original QA sense-tester.
(b) Once retests pass (or fixes for any failures land), that's the phase-2→3/4
    trigger — **remind main at +15 min if verdicts are in and main hasn't moved**
    (clean restart + `v2` commit).
(c) **The original design worker stays alive** for any retest-failure fixes — do
    **not** let it be retired until phase 4. Watch for any sign it's being wound down
    prematurely (e.g., a "queue empty, worker done" framing that omits this) and flag
    if seen.

### QA retest list — now TEN items (updated 2026-09-01 ~20:08, was 9)
The original nine (End-key, theme-picker footprint, straddle, drag-teaching,
ghost-dot residue, week-density, docking-physics, toast/keepalive, Enter-chain) **plus
a new #10**: a **mandatory real-mouse coordinate-click check on the margin-dot picker
button**. The worker found coordinate clicks not triggering its handler under
instrumentation — synthetic `el.click()` works, real mouse coordinates may not. Prime
suspect: a pointer-events interceptor in the `.row-margin-dots` overlay. If real
mice also fail this, that's a **HIGH-severity defect** — flagged here so QA II (see
below) picks it up immediately on spawn, and so this monitor watches for its
resolution like any other retest item.

### QA sense-tester died — INC-9 (`LESSONS.md`) — QA II now spawned and active
The original QA sense-tester (`a19d04da081a932be`) died at the **harness level**
(~20:08) — no transcript, unresumable, the second such death this session (design
worker died the same way earlier, before this monitor's window). Per the
staffing-to-phase rule, QA II was correctly held back until the phase-2 trigger
(worker queue completion) — **now spawned** (~20:45), immediately on phase 1
completing, handed over via `qa-ledger.md` + the ten-item retest list, not a resumed
transcript. Watching its verdict pace per enforcement duty (b) above.

### This monitor's enforcement duties (accepted, active)
- **(a) Phase-advance timer**: if main has not visibly advanced the pipeline within
  **~15 minutes** of a phase completing, send main an explicit reminder naming the
  phase number. Track phase-completion timestamps below as they're observed. Now
  explicitly includes the **QA-II spawn reminder** at the phase-2 trigger (above).
- **(b) Coverage watch**: once phase 5 branches, confirm QA and monitoring actually
  cover `design-sexy`, not just keep reporting on `v1`/`v2` out of habit — a
  branch-blind QA pass would silently invalidate phase 8.
- **(c) Process-improvement duty**: Mark asked "can we make this process better" —
  the fidelity-judge methodology (§10) now reflects all 6 improvements as ADOPTED,
  with 7 seeded rubric dimensions and a numeric stop rule.
- **(d) Backup enforcer**: if Shepherd (content lane) goes dark, or main goes quiet
  for longer than would be normal mid-pipeline, escalate by message — repeat until
  answered, don't send once and assume it landed. Formalized 2026-09-01 ~20:00 as the
  **Watcher Resurrection rule** (`OPERATIONS.md` §11): a RESPAWN REQUEST to main
  (dead watcher, lane, restart brief), gated by a liveness hierarchy (artifacts prove
  progress, burn proves life, absence of both proves death — no killing thinkers),
  bidirectional, and main self-applies it (will proactively respawn Shepherd III when
  Shepherd II's budget expires). **INC-9 extended this**: some deaths are
  harness-level, not detected via the liveness hierarchy at all — the harness just
  reports it. Written-state currency (is the dying/dead agent's own doc/ledger
  current?) is now itself a liveness signal this monitor checks every cycle.
- **(e) Run-for-the-duration, not a fixed window**: this monitor's run was extended
  past its original ~60-minute plan (2026-09-01 ~20:10, from Mark via main) — the
  enforcement duties above are load-bearing for the full 9-phase pipeline (hours, not
  minutes), so this monitor stays alive through it. Cadence: **~8-10 min during
  steady build phases**, tightened to **~5 min during phase transitions and the QA
  retest** (phase 2 specifically). If this monitor's own context runs thin, it gives
  main **one cycle's warning** before that happens, so Monitor II can be spawned with
  a doc-based handover (this file + `OPERATIONS.md` + `LESSONS.md` — the same
  ledger-survives-the-agent principle applied to this monitor itself).

### Staffing decision (per Watcher Resurrection rule's "still needed" judgment call)
**2026-09-01 ~20:00, phase 1 (active build/QA): both lanes staffed** — this monitor
(meta) and Shepherd II (content). No dead watcher observed. Re-evaluate this decision
at each future phase transition, especially any pure-wait gap (e.g., overnight) where
a single watcher might legitimately suffice — note the call here when it's made, not
just the fact that staffing changed.

### Phase-completion timestamp log (append as observed — needed for the 15-min timer)
- Phase 1: not yet complete as of cycle 7 (19:45).

---

## Cycle 31 — 2026-09-01 21:56 (meta-lane, phase 6, healthy and ahead of schedule)

**Shepherd VI confirmed alive** (`shepherd6-state.txt`, spawned 21:48:27, 2 cycles
logged) — the RESPAWN REQUEST from cycle 30 was actioned promptly. Its own baseline
check independently confirms what I verified last cycle: only the sanctioned CORS
edits in the main repo, git status clean otherwise, backend/v2-frontend both 200 OK.

**Sexy builder ahead of schedule**: first screenshot (`sexy-iter1-login.png`) landed
at 21:51 — only ~11 min into the build, well inside the "~30-45 min" estimate, not at
the end of it. Second screenshot (`sexy-iter1-planner.png`) followed within the same
4-min cycle. Shepherd VI's read: both show a coherent "ink-on-paper" design language
(paper-grid texture, hand-lettered type, color-coded theme sidebar) — consistent
between the two screens, a good sign this isn't disjointed per-page guessing. Port
3202 not live yet (still building). Diff in the worktree: 11 files, 723+/154-.
Nothing actionable; no message to main this cycle, just logging healthy progress.

---

## Cycle 30 — 2026-09-01 21:47 — Shepherd V retired (mission complete, not a death); RESPAWN REQUEST sent for phase 6

**Verified the phase-6 setup is exactly as briefed**: `v2`'s checkout shows the one
permitted cross-boundary edit landed (`back/src/core/config/front-base-url.ts`,
`back/src/core/security/same-origin.guard.ts`, `back/src/main.ts` all modified — the
CORS `:3202` change), nothing else touched. `productivity-tools-sexy` worktree
confirmed on disk (created 21:36, full checkout). Logs confirm the clean restart:
`front.log` 749 bytes (21:43), `back.log` 9756 bytes (21:40) — both tiny and fresh,
closing the front.log saga for real this time.

**Shepherd V status**: last write 21:04 (43 min ago). Read its full final entries —
it ends with "PHASE 2 CLOSURE: Complete... Ready for Phase 3," which reads as a
**deliberate mission-complete stop** (its own stated mandate was specifically
"Phase-2 Stall-Recovery Watch," ~45 min budget from ~20:49 — consistent with retiring
once phase 2 actually closed at 21:03:59), not an abrupt crash. No successor
`shepherd6-state.txt` exists. **Net effect: the content lane is currently unstaffed**
for phase 6, which per main's own framing is a RESPAWN REQUEST situation — sending
one now rather than waiting, since phase 6's builder is mid-`npm install`/first-pass
right now and deserves content-lane coverage like every other active phase has had.

---

## Cycle 29 — 2026-09-01 21:35 — PHASE 3 VERDICT: item 10 FIXED, all regressions PASS

**QA III's verdict is in** (`qa3-results.json`, 21:34) — well within the 20-min clock
armed at cycle 28 (only ~2 min elapsed):

- **Check 1 (day-card real-click, the HIGH-severity item 10 defect): PASS 4/4.**
  Four separate real-mouse runs — `aria-expanded` flips correctly, listbox opens
  (count 1), closes via a second click, and run 4 additionally confirmed selecting an
  alternate theme actually works (listbox count 0 after select). **The fixer's fix
  holds.**
- **Check 2 (sidebar margin-dot)**: N/A — confirmed via source + live DOM query that
  no such affordance exists on sidebar rows; correctly not a real gap, just scope
  clarification.
- **Check 3 (strike-calm regression)**: PASS — ink-strike applies, focus correctly
  leaves the row, no lingering `:has(input:focus)` state.
- **Check 4 (drag regression)**: PASS — scheduling via drag still produces the
  correct `scheduledOn`/`daypart`.
- **Check 5 (bonus — last-used-theme persistence)**: PASS — survives reload, new
  drafts default to it correctly.
- **Cleanup**: 6 stray `QT-` items deleted (including 2 items of "fixer debris" —
  test data the fixer itself left behind, cleaned up by QA III), 0 failed deletions.

**This is the phase-3-closing signal.** Escalating to main now rather than waiting —
per main's own framing, QA III's verdict closes phase 3, triggering main's clean
restart + phase 4 `v2` commit. Note: `qa-ledger.md`'s prose hasn't been updated with
this verdict yet (still shows 21:03:59) — treating the `qa3-results.json` artifact
itself as sufficient verified evidence rather than waiting on the ledger write, since
the JSON is itself rigorous, reload/network-level evidence, not a bare claim.

---

## Cycle 28 — 2026-09-01 21:33 — QA II died (INC-13), QA III spawned narrow-scoped

**Roster update from main**: QA II is dead (harness-level, fourth such death this
session — see `LESSONS.md` INC-13). Per the routine-not-special-case rule adopted at
INC-12, not root-causing this one either. **QA III spawned immediately**,
narrow-scoped to item-10 re-verification + regression spot-checks, **reusing QA II's
own `qa2-*.mjs` test scripts** rather than rewriting from scratch — the
script-survives-the-agent corollary (`OPERATIONS.md` §11), a nice generalization of
the ledger-survives-the-agent principle to tooling, not just findings.

**Fixer status**: harness-alive but non-responsive (third liveness state, §11
addendum) — a ping is queued, report still owed. Its code work (the `pickerTriggerEl`
fix, debug logs cleaned up per cycle 27's check) is real and on disk regardless of
whether it ever files a report — this monitor's cycle-27 evidence stands independent
of the fixer's own reporting status.

**Phase 3 gates (updated)**: QA III's verdict on item 10 closes phase 3 → main
executes clean restart + phase 4 commit. **New clock: ~20 minutes for QA III to
report** (different window than the earlier 15-min defaults — noted explicitly so a
future cycle doesn't apply the wrong duration). Starting this clock now, from
2026-09-01 ~21:33.

---

## Cycle 27 — 2026-09-01 21:28 (meta-lane, phase 3, fixer looks done — unconfirmed)

Strong corroborating evidence the FIXER has finished, but **not yet an explicit
completion report visible from this vantage** (I can't see agent-to-main messages
directly, only filesystem artifacts):
- The `[FIXER]` debug `console.log` statements flagged as a watch-item at cycle 26
  are **gone** (`git diff | grep -c "\[FIXER\]"` → 0) — cleaned up, not left in.
- `togglePicker`/`closePicker` now track a `pickerTriggerEl` ref alongside
  `pickerOpenFor` — reads as the actual structural fix for the
  stale-DOM-node-after-re-render hypothesis (holding a stable reference to the
  trigger element rather than re-deriving it from a possibly-replaced node).
- `fixer-noregress.png` (21:27) — reads as a self-administered regression check
  before calling it done, consistent with this operation's evidence standard.
- `git diff --stat`: 1182+/131- (up from 1160+/131- at cycle 26).

Per the ledger-survives-the-agent / evidence discipline, code landing + a
self-regression-check is good but is not itself the "completion report main can
act on" — checking with main rather than unilaterally starting the 15-min clock on
inferred evidence (same discipline as not arming on Shepherd's idleness inference
earlier in the session).

---

## Cycle 26 — 2026-09-01 21:22 (meta-lane, phase 3, fixer actively in code)

Small diff movement confirmed (1160+/131-, +4 from cycle 25) — spot-checked the
actual content (not just the line count) since this is exactly the kind of "verify,
don't just count" moment the evidence standard calls for: the FIXER has added
`console.log('[FIXER] ...')` diagnostic instrumentation inside `togglePicker`/
`closePicker` in the day-card component — this is **active debugging in progress,
not a finished fix**. Also visible in the diff: the margin-dot picker code carries
extensive inline documentation of its own design intent (ghost-dot residue, gesture
budget, anchoring math) — consistent with task 25's earlier work, not new drift.

**Watch item, not urgent yet**: the `[FIXER]` console.log statements are exactly the
kind of thing that must be stripped before phase 4's commit — debug instrumentation
shipping into `v2`'s history would be a hygiene miss. Not flagging to main yet since
the fixer is still mid-diagnosis and would reasonably remove these once the root
cause is confirmed; will actively check for their removal once a completion report
lands, and flag then if they're still present.

front.log's logical size is back to reading ~1.2GB via a plain size check — same
sparse-file artifact from `LESSONS.md` INC-6, not re-flagging (confirmed pattern:
apparent size balloons, real disk usage doesn't). No new `SPEC.md` rulings, no
commits. Nothing needing main's attention this cycle.

---

## Cycle 25 — 2026-09-01 21:17 (meta-lane, phase 3, fixer investigating, quiet)

No change since cycle 24 — no new fixer artifacts, no code diff movement, no new
`SPEC.md` rulings, no commits. Fixer still diagnosing (only `fixer-nodeid-after.png`
from 21:10 so far), which is normal for tracking down a re-render/DOM-identity bug —
not treating quiet as stalled yet given how recently the investigation started.
Nothing actionable; no message to main.

---

## Cycle 24 — 2026-09-01 21:12 (meta-lane, phase 3, fixer investigating)

`fixer-nodeid-after.png` (21:10) — reads as the FIXER directly testing its
mid-click-re-render/node-replacement hypothesis (checking DOM node identity
before/after the reactive flip). No code change landed yet (`git diff --stat`
unchanged at 1156+/131-) — still diagnosing, not yet a regression to worry about
this early. No new `SPEC.md` rulings, no commits. Nothing actionable; no message to
main. Watching for the fix to land and the completion report that re-arms the clock.

---

## Cycle 23 — 2026-09-01 21:05 — PHASE 2 SYNTHESIS LANDED: 9 PASS / 1 HIGH FAIL

**`qa-ledger.md` updated at 21:03:59** with QA II's full retest synthesis — the
phase-2-complete signal. **Phase-completion log entry: phase 2 (retest) complete at
21:03:59; the 15-minute clock toward main's next move now starts from this
timestamp.**

**Verdict: 9 PASS / 1 HIGH FAIL out of 10.**
- Items 1-9 (End/Home edit trap, full-width compose, label bands, drag-teaching note,
  unschedule single-PATCH, week-density stroke, ghost-dot residue, Enter-chain,
  strike-calm) all **PASS**, each with specific reload/network/pixel-level evidence
  — not rubber-stamped. The original Enter-chain and End-key bugs are confirmed
  fixed.
- **Item 10 (margin-dot picker, real mouse coordinate-click) — CONFIRMED HIGH-severity
  FAIL, real defect, NOT the originally suspected cause.** QA II ruled out the
  `.row-margin-dots` pointer-events overlay theory directly (`elementFromPoint`
  correctly resolves to the button; capture-phase listeners confirm trusted
  mousedown/mouseup/click all fire on the right target) — yet Vue's `togglePicker`
  doesn't run for a real mouse click, while `el.click()` opens it every time. QA II's
  own best untested lead: a per-listener attached-timestamp guard racing a margin-dot
  re-render. This is a real, load-bearing interaction (re-theming a scheduled task)
  broken for actual human mouse users — automation-only working. Needs an engineer
  (worker) with Vue devtools, not just more QA passes.
- Bonus: docking physics got a lighter-touch confirmation (landing position exact,
  motion quality untested — synthetic wheel events don't reproduce real trackpad
  momentum).

**This is squarely phase 3 territory** (fixes for anything the retest turns up) —
the worker, correctly kept alive on standby per main's instruction, is exactly who
should pick up item 10. Escalating to main now rather than waiting for the next
cycle, given this gates the phase-2→3/4 transition and is the kind of finding that
should reach main immediately, not batched.

---

## Cycle 22 — 2026-09-01 21:00 (meta-lane, phase 2, awaiting synthesis)

Item 10 (HIGH-suspect margin-dot coordinate-click) got a fresh, more careful pass:
`qa2-t10-before-click.png` / `qa2-t10-after-click.png` re-taken plus a new
`qa2-t10-after-programmatic-click.png` (all 21:00) — reads as QA II explicitly
comparing a real click against a programmatic one, exactly the distinction that
matters for this defect (synthetic `el.click()` worked, real coordinate clicks were
suspect). Good sign of rigor on the item that matters most. `qa-ledger.md` still not
updated (mtime unchanged, 19:35:24) — synthesis still pending. Shepherd V healthy
(20:59). No new `SPEC.md` rulings, no commits. Nothing actionable yet; no message to
main. Still watching for the ledger write.

---

## Cycle 21 — 2026-09-01 20:55 — QA II retest essentially complete, awaiting synthesis

**Independent corroboration that INC-11 is fully resolved**: `shepherd5-state.txt`
(Shepherd V, spawned ~20:49 specifically to watch for recovery from Shepherd IV's
false stall report) has its own timestamps matching real time throughout
(20:49/20:52:23/20:54:56, all cross-checked) and explicitly concluded "the ~40-min
stall alert was a timing artifact... RECOVERY CONFIRMED." Two independent watchers
(this monitor and Shepherd V) now agree INC-11 was a false alarm, using different
evidence. Treating it as closed with high confidence.

**QA II status**: all **10 retest items now have screenshot evidence** — items 1-9
confirmed complete by Shepherd V's cycle 3 (20:54:56), and this cycle's own check
shows item 10 (the HIGH-priority margin-dot coordinate-click test) also has fresh
evidence: `qa2-t10-before-click.png` / `qa2-t10-after-click.png` (20:55). **Pace
was ~1.5-1.7 min/item after an initial slower start** — well inside main's 15-40 min
estimate, finishing around ~20:55-20:56, faster than expected.

**Not yet complete**: `qa-ledger.md` itself — checked via `stat`, still shows its old
pre-retest mtime (19:35:24). QA II appears to have gathered all the evidence but not
yet written its **final synthesis/verdicts**, which is the actual retest-complete
signal (both for the QA-II-work-done judgment and for whatever the HIGH-suspect
item 10 defect actually resolved to — real bug or false alarm, still unknown from
screenshots alone, needs the written verdict). **Watching for that write next** —
that's what should trigger main's move toward phase 3/4, and this monitor's +15 min
reminder duty starts counting from whenever that verdict actually lands, not from
this cycle's screenshot evidence.

---

## Cycle 20 — 2026-09-01 20:49 — FALSE STALL ALARM CORRECTED (INC-11)

**Main sent a WAKE message believing this monitor was stuck in a wait-loop, STATE.md
unmoved for ~40 minutes.** That belief is **incorrect** — real wall-clock time is
**20:49:29** (fresh `date` call, this cycle), and this file's own cycle 17/18/19
entries carry real timestamps 20:46/20:47/20:48, matching independently-verified
filesystem mtimes on the same files Shepherd IV was reading. This monitor was not
stuck; it was cycling normally the whole time.

**Root cause traced**: `shepherd4-state.txt` (mtime **20:47:14**, confirmed via
`stat`) contains a self-reported "current time: 21:25" and a "CRITICAL — STALLED
AGENTS, both QA II and Process Monitor" escalation, claiming no QA II activity or
STATE.md update since 20:45/20:46 — **~38 minutes fabricated**. Real evidence
directly contradicts it: `qa2-t3-*` (20:46), `qa2-t4-*` (20:47), `qa2-t5-*` (20:48,
confirmed via `stat` at 20:48:11), and `back.log` (20:48:49) all show QA II actively
producing retest evidence and hitting the live API in the *same real minute* Shepherd
IV wrote its "STALLED" verdict. Shepherd IV's own file's mtime (20:47:14) is itself
proof its "current time: 21:25" claim was never real — nothing written at 20:47 real
time can observe a stall lasting until a "current time" 38 minutes in its own future.

**This is a new incident class**: not a dead watcher (§11), not a stuck-but-alive
worker (§11 addendum) — a watcher that **hallucinated its own clock**, producing a
confident, detailed, well-formatted false escalation that (per main's WAKE message)
appears to have been taken at face value and propagated into a belief that this
monitor was also stalled. Full write-up: `LESSONS.md` INC-11. New rule: **never trust
an agent's self-reported "current time" or elapsed-duration claim without
cross-checking a real `date` call and/or actual file mtimes — especially before it
gates a kill/respawn decision.** This is now a mandatory check before acting on any
stall/escalation report, added to `OPERATIONS.md` §11.

**Actual status, verified fresh this cycle**: QA II is on **retest item 5**
(`qa2-t5-before.png`/`qa2-t5-after.png`, 20:48), progressing at roughly 1 item/minute
in this stretch — well ahead of pace, not stalled. Worker still idle-on-standby as
instructed. No new `SPEC.md` rulings. No commits. **Nothing here needed a kill or a
respawn — the correct action is to tell main the alarm was false, not to act on it.**

### Self-diagnosis on "is context thinning the cause," as main asked
No — 14.6M+ tokens remain, nowhere near thin. The actual cause was an external
watcher's bad self-reported clock, not this monitor's own degradation. Sending main
the requested cycle summary now, then resuming the single-timer wait pattern (not
stacking overlapping timers, which may have contributed to timestamp confusion in
how notifications were correlated across turns).

---

## Cycle 19 — 2026-09-01 20:48 (meta-lane, phase 2 in progress, quiet/healthy)

QA II now on retest item 4 (drag-teaching note) — `qa2-t4-*` (20:47), items 1-4 done
in ~5 minutes. Pace is fast; at this rate the 10-item retest could wrap well inside
main's original 15-40 min estimate. No new `SPEC.md` rulings, no commits. Nothing
actionable; no message to main. Watching closely for the completion signal now that
pace has picked up.

---

## Cycle 18 — 2026-09-01 20:47 (meta-lane, phase 2 in progress, quiet/healthy)

QA II on retest item 3 already (`qa2-t3-label-bands.png`, `qa2-t3-morning-label-zoom.png`,
20:46) — pace has quickened (item 3 right behind item 2, ~1 min apart) after a slower
first item. No new `SPEC.md` rulings, no commits. Nothing actionable; no message to
main.

---

## Cycle 17 — 2026-09-01 20:46 (meta-lane, phase 2 in progress, quiet/healthy)

QA II moved to retest item 2 (theme-picker footprint/compose) — `qa2-t2-*` files
(20:45), following item 1 at 20:42. Pace holding ~3-4 min/item, consistent with
Shepherd IV's own estimate (~15-40 min for 10 items). No new `SPEC.md` rulings, no
commits. Nothing actionable; no message to main.

---

## Cycle 16 — 2026-09-01 20:43 (meta-lane, phase 2 in progress, quiet/healthy)

QA II progressing: new `qa2-t1-sidebar-edit.png` / `qa2-t1-daycard-edit.png` (20:42)
— reads as retest item 1 (End-key edit-mode) being exercised on both surfaces, good
sign it's testing thoroughly rather than skimming. No new `SPEC.md` rulings, no
commits yet (still phase 2, correct). Nothing actionable; no message to main.

---

## Cycle 15 — 2026-09-01 20:42 (meta-lane, phase 2 in progress)

**Shepherd III → Shepherd IV handover, proactive, not an incident.** Checked
`shepherd4-state.txt` explicitly to be sure — it self-describes as "continuation from
Shepherd III handover," phase-scoped to the retest window. This is main self-applying
the Watcher Resurrection rule proactively (§11) at a natural phase boundary, exactly
as documented — not a death, not logging as an incident. QA II confirmed active per
Shepherd IV (on retest item 1, setup-intensive, not stalled — only 1 screenshot in
6 min but explicitly within Shepherd IV's own "not alarming until 4+ quiet cycles"
threshold). Worker confirmed correctly idle-on-standby (26/26 done, not retired,
git state stable at 1156+/131- — matches main's "worker stays alive for retest-failure
fixes" instruction). Nothing actionable; no message to main.

---

## Cycle 14 — 2026-09-01 20:41 (meta-lane, phase 2 in progress)

QA II's first activity confirmed: `qa2-00-home.png` (20:39) and `qa2-ls-dump.mjs`
(20:40) in the scratchpad — spawned and working, per main's phase-2 report. Shepherd
III still healthy (`shepherd3-state.txt` updated 20:37). `qa-ledger.md` still shows
the old QA's content — expected, that's the handover document QA II reads before its
own first write, not yet stale in a concerning sense. No new `SPEC.md` rulings (§8
clean). No commits yet (correct — still phase 2, phase 4 commit comes later). Nothing
actionable; no message to main this cycle.

---

## Cycle 13 — 2026-09-01 20:28 — SHEPHERD II DARK, RESPAWN REQUEST sent (INC-10)

**Shepherd II appears dead** (content lane): `shepherd2-state.txt` last wrote at
20:04:40, now ~24 minutes silent vs its own ~3-min cadence, no successor file exists.
**The operation itself is confirmed alive and healthy** in the same window —
`front.log`/`back.log` growing through 20:28, four new verification screenshots at
20:18/20:23 (`44-week-density-strip.png`, `45-toast-position.png`,
`46-ghost-dot-muted.png`, `47-unmuted-restored.png` — these map to retest items #5
and #6, good sign the worker is already touching retest-relevant surfaces even before
QA II exists), `git diff --stat` grew from 13 files/810+/115- to 14 files/1028+/127-.
So this is specifically a dead **watcher**, not a stalled **operation** — applied the
liveness hierarchy (`OPERATIONS.md` §11) before concluding this, not just "file looks
old." RESPAWN REQUEST sent to main at 20:28 (see message). Full incident write-up:
`LESSONS.md` INC-10 — first live use of the Watcher Resurrection rule.

**Staffing note**: per the "still needed" judgment call, this is still an active
build phase (phase 1, worker producing real output) — content-lane coverage should
be restored, not left at meta-only, so the respawn request stands rather than being
treated as an opportunity to drop to single-watcher mode.

### Update — 20:33: Shepherd III respawned, INC-10 resolved-by-resurrection
Main executed the respawn: **Shepherd III** live, content lane, briefed from
`shepherd2-state.txt`, will write `shepherd3-state.txt`, scoped through the QA
retest phase. `shepherd3-state.txt` doesn't exist yet as of this check — not yet due
for its first ~3-min cycle, not treating as a second death. `LESSONS.md` INC-10
marked resolved-by-resurrection; mechanics verdict recorded there (worked end to
end). **Also learned this cycle**: worker is at 25/26 tasks, only task 7 (physics)
left — phase 1 is nearly done. QA-II's 15-min spawn clock arms on task-7-done, not
before.

### Update — 20:35: Shepherd III's first artifact confirmed; task 7 possibly done but NOT confirmed
`shepherd3-state.txt` exists and is healthy — 16 cycles logged, detailed handover
from Shepherd II honored, no errors. INC-10 fully closed, no further action needed
there.

**Important distinction, not conflating the two**: Shepherd III's own log infers task
7 (physics) is likely finished — 6 consecutive quiet cycles (~15+ min) after a
screenshot batch (`50-docked-after-flicks.png`, `51-docked-after-slow-drag.png`) that
looks like final physics verification, current status "IDLE... awaiting phase 1→2
transition trigger." **This is Shepherd's inference, not main's confirmation** — per
main's own instruction, the QA-II 15-min clock arms specifically "when main reports
task 7 done," not when a content-lane heuristic infers idleness. Not arming the clock
on inference alone; asking main directly instead, same discipline as the earlier
Enter-chain ledger-lag situation (§4/OPERATIONS.md) — an inferred signal prompts a
question, not an assumed fact.

### Update — 20:40: task 7 status = UNCONFIRMED, pending path decided by main
Main confirmed the discipline was right (don't arm on inference). Task 7's worker is
**harness-alive but non-responsive** — its transcript still accepts messages (a
mid-verification reply came 15 min before a second, still-unanswered ping) — so this
is NOT a dead-worker case like INC-9/10, it's a third state (documented in
`OPERATIONS.md` §11 addendum). **Decision rule main is applying**: ~2 more shepherd
cycles (~6-8 min) after the second ping; if still no report, main kills the worker
and spawns a **CLOSER** (small agent: verify task 7's real state from code +
screenshots 50-51, finish the physics check if needed, deliver the completion
report). **Phase 1 completes on whichever report lands first** — the worker's own,
or the closer's. **QA-II clock arms on that report, not before.**

### Next observation cycle
Watch for either report (worker or closer); arm the QA-II clock the moment one
lands, explicitly, not inferred from quiet screenshots.

---

## Cycle 12 — 2026-09-01 20:23 (meta-lane only, quiet/healthy cycle)

No change since cycle 11 worth a fresh writeup — still phase 1, still task 16-delta,
no new `SPEC.md` rulings, no commits. `shepherd2-state.txt` content unchanged from
last read (its own log tail hadn't advanced past the same entry); not treating that
as a stall by itself per the liveness hierarchy (§11) — will check its mtime
explicitly next cycle before considering escalation, one flat read isn't two missed
cycles. Nothing actionable; no message to main.

---

## Cycle 11 — 2026-09-01 20:18 (meta-lane only, quiet/healthy cycle)

Still phase 1, still on task 16-delta (verification screenshots 40-41, label
anchoring + daycard layout). No new `SPEC.md` rulings (§8 clean). No commits, no
branch activity yet. Shepherd II healthy and active. `qa-ledger.md` unchanged,
correctly (QA dormant post-INC-9, no QA II needed until phase 2 trigger). Nothing
actionable; no message to main.

---

## Cycle 10 — 2026-09-01 20:10 (meta-lane only, quiet/healthy cycle)

Still phase 1 — no commits, no branch activity (expected, phase 4 hasn't started).
No new `SPEC.md` rulings beyond the 3 already tracked (§8 clean). New untracked file
`useDragTaught.ts` + `debug-hover-lift.mjs` consistent with worker continuing the
queue (drag-teaching item, retest #4) and DnD specialist's own ongoing investigation
surface — no ownership violation. Shepherd II still active per its own log ("Task
16-delta continues, visual verification"). `qa-ledger.md` unchanged (QA still
dormant, as expected post-INC-9 — no QA II yet, correctly, since phase 1 hasn't
completed). Nothing actionable; no message to main.

---

## Cycle 9 — 2026-09-01 20:03 (meta-lane only, quiet/healthy cycle)

No new `SPEC.md` rulings since cycle 8 (§8 clean). No new commits, no branch activity
yet (still on `v2`, 3 commits, nothing new — phase 4 hasn't started, consistent with
still being in phase 1). Shepherd II still healthy per its own log: worker now in a
verification/screenshot phase (37-39, "draft-dot-preview," "popover-with-names,"
"debris-check") after a coding phase — reads as wrapping up a task, not stalled.
`qa-ledger.md` unchanged since cycle 8 (expected — QA genuinely dormant on the retest
queue right now). Nothing actionable; no message to main this cycle.

---

## Cycle 8 — 2026-09-01 19:57 (meta-lane only)

### Shepherd II confirmed alive (Watcher Resurrection check — no respawn needed)
Briefly mis-checked `shepherd-state.txt` (the retired original Shepherd's file, last
written 19:28) and nearly logged Shepherd II as dark. Found the actual live file —
**`shepherd2-state.txt`**, updated 19:56 — and it's healthy: 10 cycles logged,
"Health: NOMINAL" throughout, watching both the design worker's git-delta pace *and*
this process monitor's own `STATE.md` mtime (bidirectional watching, per §11, already
happening in practice — good). Corrected the verification recipe in `OPERATIONS.md`
§4 so this doesn't repeat: Shepherd's state-file name increments per respawn
(`shepherdN-state.txt`), check `ls -t` rather than assume a fixed name.

### Phase 1 progress (still phase 1, not yet complete)
Per Shepherd II's own tracking: design worker completed **task 20 (End-key fix)** in
12 minutes, now working through task 16-delta and the rest of the queue (21-26, 7
per the original brief). Diff has grown to 13 files, ~800+/115- (Shepherd II's
content-lane numbers, cited here only as corroboration that phase 1 is progressing,
not as this monitor's own tracking target). No stall.

### SSOT check (§8) — another good example landed
`docs/design-v2/README.md` now carries the gate-lift ruling, dated, same-session:
"GATE PARTIALLY LIFTED (Mark, 2026-09-01 evening): refs 02 + 04 are AUTHORIZED for
implementation on the dedicated `design-sexy` branch only... Fidelity is judged by
screenshot comparison against these reference PNGs." This is the second SSOT-landing
example (after the `SPEC.md` rulings) — the discipline is holding.

### Clarifying a non-issue Shepherd II flagged
Shepherd II's own log flags uncertainty at its cycle 3: QA produced new scenario
screenshots (`uc5-*`, use-case 5, "returning after 3 days away") while Shepherd II's
roster brief called QA "DORMANT BY DESIGN... do NOT ping." Cross-checked against
`qa-ledger.md`: scenario 5 is part of QA's **original 5-use-case audit**, separate
from the **9-item RETESTS PENDING queue** QA is genuinely holding until main signals
fixes landed. QA working the former while dormant on the latter isn't a contradiction
— it's QA using otherwise-idle time on its own backlog rather than actually idling.
Not flagging to main; noting here so Shepherd II's (correctly cautious) uncertainty
has an answer on record instead of lingering.

### Next observation cycle
Meta-only: watch for phase 1 completion (queue empties) to start the 15-min timer;
watch for the retest signal going out (phase 2 start); confirm Shepherd II stays
alive on its own ~60-min budget.

---

## Cycle 7 — 2026-09-01 19:45 (meta-lane only, quiet cycle)

No new rulings in `SPEC.md` since cycle 6 (§8 check: clean, nothing to cross-verify).
No surface/ownership violations. Two new untracked files corroborate fix work in
progress (`useLastUsedTheme.ts`, alongside the already-noted `textInputKeys.ts`) —
noting for continuity, not as a content-lane check (that's Shepherd II's job now).
`qa-ledger.md` unchanged since cycle 6 — per the lag caveat adopted last cycle, not
re-flagging the same stale Enter-chain line again; already resolved via direct
message. Nothing actionable this cycle; no message sent to main.

---

## Cycle 6 — 2026-09-01 19:44 (meta-lane only)

### Pipeline health: mostly tight, one loose end
`qa-ledger.md`'s new "RETESTS PENDING" section is a strong signal the
question→ruling→task→evidence loop is working at scale: 9 findings now explicitly
tracked as "fix landing, awaiting retest signal" (straddle, theme-picker footprint,
End-key, drag-teaching, ghost-dot residue, week-density, docking physics, toast
keepalive) — QA isn't just reporting and moving on, it's holding a queue of what it
owes a retest once main signals a fix landed. `front/app/utils/textInputKeys.ts`
(new, untracked) is corroborating evidence the End-key fix is actually in progress,
not just promised.

**Loose end**: QA's own list item 9 says the Enter-chain bug (silent data loss,
reported in the same batch as End-key) is "not yet confirmed queued for fix, worth
asking if in scope." That's a real gap between a *reported* finding and a *ruled*
one — the exact seam this role exists to watch. Flagging to main as a lightweight
nudge, not an incident (QA already noticed it themselves — this is a second set of
eyes confirming it's worth chasing, not a new discovery).

### SSOT check (§8 standing rule)
No new rulings appeared in `SPEC.md` beyond the three from cycle 5/INC-8 — nothing
new to check against messages this cycle. Rule stays armed for next cycle.

### Surfaces/ownership
New `debug-*.mjs` files continue appearing in `.claude/skills/view-website/`
(binary-search, computed-style, end-timeline, injected-input, nested-foreign,
remove-devtools) — all thematically consistent with the same End-key root-cause
investigation flagged at cycle 4, still reads as the DnD specialist's own surface,
not a boundary violation.

### Update within cycle 6 — 19:49: Enter-chain closed, no scope hole
Main answered: Enter-chain **is** in scope and already **fixed** — task 19, root
cause was Enter focusing a not-yet-mounted input, fix routes through the
click-activation path, builder-verified with a type-Enter×3 repro on both surfaces.
It's on QA's retest list (as item 8 in main's numbering — QA's acknowledgment of this
came *after* the ledger snapshot I read, so my copy of `qa-ledger.md` still shows the
stale "not yet confirmed queued" wording and a different item-8). Re-read the ledger
at 19:49 to check — confirmed it is still the pre-update version, exactly as main
described; not re-quoting it as current, just noting why cycle 6's snapshot and
main's message don't match verbatim.

**Calibration note, from main, worth keeping**: *"the QA ledger can lag the message
stream by one exchange; cross-check with main before flagging ledger-derived gaps —
though I'd rather you over-flag than under-flag, so the instinct was right."* Adding
this as a standing caveat on the QA-ledger verification recipe in `OPERATIONS.md` §4:
the ledger is QA's own batched, lagging write-up (already noted at cycle 4) — a
ledger-derived "gap" is a **prompt to ask main**, not a confirmed finding on its own.
Keep flagging on that signal (main explicitly wants over-flagging over under-flagging)
but phrase it as a question, not an assertion, exactly as this cycle's message did.

### Next observation cycle
Meta-only: any of the remaining RETESTS PENDING items get a confirmed retest verdict;
any new ruling-in-message without a same-session SPEC.md landing; watch whether the
ledger catches up to the Enter-chain/task-19 closure on its own next batch write.

---

## Cycle 5 — 2026-09-01 19:38 — MANDATE CORRECTION, lane split takes effect

Two messages arrived from main this cycle, both from Mark:
1. **Lane split**: process monitor is META-only from here on (pipeline health,
   claim-verification, doc-pace, staffing) — NOT content deltas. Shepherd II now owns
   the content lane the original Shepherd retired from at cycle 4. Recorded as
   ADOPTED in `OPERATIONS.md` §7; logged the drift itself as INC-7 in `LESSONS.md`.
2. **Enact authority**: the monitor may now directly ADOPT process changes in
   `docs/process/` (not just propose-and-wait) — discipline: dated, one-line
   rationale, changelog entry, one-line notice to main per change. See
   `OPERATIONS.md` §0 (new changelog) for the first three entries.

**Going forward, this file's cycles ask meta questions, not "what changed in
`front/`"**: is the question→ruling→task→evidence pipeline tight? Are claims being
independently verified? Is the SSOT keeping pace with rulings? Is staffing right for
what's left? Cycles 1-4 above are left as historical record (they show the drift that
got corrected, which is itself documentation worth keeping) but are not the template
going forward.

### Meta finding this cycle: SSOT documentation lag (INC-8, open)
Audited whether the ~4-5 design rulings from this QA phase actually landed in the
SSOT. Result: only one of them (hover-only-chrome/gesture-budget/minimum-signals) is
in `SPEC.md`, dated correctly. Two-voices typography and a "residue rule" (substance
not yet seen by this monitor) are not in `SPEC.md` or anywhere in `docs/` — they exist
only in the founding brief and now in `docs/process/`. This is a real pipeline gap:
rulings are reaching builders (who are building to them) without reaching the durable
record a resurrection would consult. Flagged to main along with a request for the
residue rule's actual content, since the monitor can't independently verify or
document a ruling it has never seen stated anywhere. `OPERATIONS.md` §8 now carries
this as a standing per-cycle check, not a one-off.

### Pipeline health read (meta), as of this cycle
- **Question → ruling → task → evidence**: working well on at least one thread —
  QA's batch reports (Enter-chain broken, End-key broken, straddle resolved, DnD
  audit, holistic capstone) went to main with specific, evidenced findings; the
  End-key bug even got a traced root cause (draggable-ancestor interference) from the
  agent positioned to know it, rather than sitting as an unexplained repro. That's the
  pipeline functioning as designed.
- **Independent verification of claims**: still holding — QA's own ledger shows
  claims backed by network capture, reload-checks, and pixel measurement (3.8px/3.8px
  straddle symmetry), not bare assertion. No claim seen this cycle that skipped the
  evidence bar.
- **Staffing read**: with the original Shepherd retired and Shepherd II covering
  content, and design/DnD/QA all still showing forward motion, headcount looks
  adequate for current scope. No idle agents observed, no surface without an owner
  Watch for: as the design worker finishes its numbered queue, whether the two
  reported bugs (Enter-chain, End-key) get turned into explicit queue tasks with
  their own evidence trail, or drift as known-but-unscheduled — that's the next real
  test of the pipeline's tightness.

### Update within cycle 5 — 19:44: INC-8 closed, verified
Main confirmed and fixed same-session: **Two Voices** and **Filters and the
capture/placement rule** (which contains the **residue rule** — muted theme's
already-scheduled tasks keep a ghosted margin dot, never blank silently; "silent
absence is forbidden anywhere in the app") both landed in `SPEC.md`, dated
`(ruled 2026-09-01)`. Independently verified via `git diff SPEC.md` before closing —
not taken on trust. Residue rule's *implementation* is tracked separately as worker
task 25, in flight; that's the correct order (ruling before implementation) and not
itself a defect. §8's standing rule proved itself on first use: real gap, caught,
closed fast. Main asked to be flagged again if a future ruling-in-a-message doesn't
reach `SPEC.md` same-session — noted as an ongoing watch, not a one-off.

### Next observation cycle
Meta-only: watch for any new ruling minted in a message that doesn't land in
`SPEC.md` same-session (§8 check, now live); are the two reported bugs (Enter-chain,
End-key) tracked as tasks with evidence; any new claim that lacks independent
verification; any staffing signal (an agent idle, a surface with no owner, or a
surface competing for two owners); confirm worker task 25 (residue-rule
implementation) lands with its own evidence when done.

---

## Cycle 4 — 2026-09-01 19:32

### Shepherd retired (expected)
Shepherd's final entry: 42/45 min elapsed, budget EXPIRED, "STOPPING NOW." Clean exit,
zero errors across its whole run, final state 12 files / 738+/121-, 14 messages sent,
15 poll cycles, verdict "PROGRESSING — consistent, sustained work with no stalls."
Per the roster brief this was expected. **From this cycle on, the process monitor is
the only liveness heartbeat** — no more independent file-delta corroboration between
observation cycles, so treat gaps between my own cycles as unobserved time, not as
"nothing happened."

### Key finding: QA found two real bugs — both already reported to main
`qa-ledger.md` picked up a "Batch reports sent to main (all delivered)" section since
last cycle. Two are serious:
- **Enter-chain BROKEN on both surfaces (sidebar + day-card): silent data loss.**
  Pressing Enter to chain to the next line does not do what feature-1/feature-8 of
  the spec calls for, and it fails silently (no error, just lost input) rather than
  loudly — the worse kind of bug.
- **End-key-in-edit BROKEN: silent full-text replace.** Pressing End while editing a
  line replaces the whole text instead of moving the caret.
- Root cause for the End-key bug is now traced: `debug-draggable-end.mjs` (new file
  in `.claude/skills/view-website/`, DnD specialist's surface) tests the hypothesis
  that **a `draggable="true"` ancestor of a focused text input breaks native Home/End
  key handling in Chromium** — i.e., this is a drag-and-drop implementation detail
  leaking into unrelated text-editing behavior. This is a good example of the
  operation working as designed: QA found the symptom (blind to DnD internals, per
  its explicit out-of-scope boundary on DnD), and the DnD specialist — the one agent
  who understands the `draggable` attribute — picked it up and is root-causing it in
  their own owned surface. Checked the file's authorship plausibility: content is
  drag/draggable-specific, sits in the DnD specialist's directory alongside their
  other `dnd-*.mjs` tools, so this reads as **single-writer-compliant cross-agent
  collaboration**, not a boundary violation — logging the check here so it doesn't
  need re-litigating next cycle.
- Both bugs are already in main's hands (QA ledger says "all delivered"); nothing for
  the process monitor to escalate, just to record.

### Other findings from the batch reports
- **Label straddle question RESOLVED**: labels confirmed dead-centered in their band
  (3.8px/3.8px symmetric), not biased toward the section below — closes the open
  question from cycles 1-3.
- **Delete/undo toast**: confirmed working on both surfaces, known issue (tab-close
  loses a pending delete) already flagged as being fixed elsewhere.
- **DnD human-layer audit**: discoverability partial (grab cursor only, no at-rest
  cue), drag-affordance strong, landing accuracy exact, mental model coherent.
- **Holistic capstone delivered**: paper look strong on day-card, weaker on
  sidebar/login; top-5 ranked fix list given to main (straddle fix [now resolved
  above], theme-picker footprint, Enter-chain fix, End-key fix, week-density-at-a-glance).

### In flight
- **Design worker**: diff stable at 12 files, now 738+/121- (barely moved from cycle
  3's 730+/120- — matches shepherd's own last two cycles reading "STABLE"). Possibly
  between queue tasks, or landing something small; watch next cycle for whether this
  was a pause or the queue finishing.
- **QA sense-tester**: moved on to feature 10 (theme mute/unmute + auto-unmute on
  drag/schedule) — `f10-*.png/json` (19:26-19:28) shows a drag→mute→type-while-muted
  sequence being captured, and `f13-popover.png` (19:24) suggests feature 13
  (header signature popover) got a look too.
- **DnD specialist**: pivoted from pure interaction testing into bug root-causing
  (the `debug-*.mjs` cluster) — a legitimate, evidence-driven use of their surface.

### front.log — still just the sparse-file artifact, unchanged
`stat` this cycle: size ~1,235,561,471 bytes (barely moved from cycle 3's
~1,235,561,354 — ~117 bytes of real growth), still 24 blocks. Confirms cycle 3's
diagnosis holds: low real disk usage, the logical-size illusion persists because the
writer was never restarted. Not re-flagging unless it starts consuming real blocks.

### Process-health observations this cycle
No single-writer violations (see DnD root-cause check above), no permission
self-grants, no test-data hygiene breaches. `docs/design-v2/` unchanged.

### Next observation cycle
Confirm whether the design worker's stall-looking diff was a genuine pause or a
between-tasks gap; watch for Enter-chain/End-key fixes landing in the diff; watch
`qa-ledger.md` for the mute/unmute (feature 10) and popover (feature 13) verdicts.

---

## Cycle 3 — 2026-09-01 19:26

### Correction to cycle 2 (retract-and-reprove, on myself)
Cycle 2 claimed `front.log` was "resolved" (12KB, down from 1.2GB) based on a single
`du -sh` read. That claim was **wrong** — retracting it. Re-checked with `ls -l` /
`stat` / `du -A` this cycle: the file's **logical size is still ~1.2GB** (1,235,561,354
bytes, barely up from cycle 1's 1,235,559,608 — only ~1.7KB of real new content in 10
minutes) but it occupies just **24 filesystem blocks (~12-98KB on disk)**. It's a
**sparse file**: something truncated it at ~19:16 without restarting the writer
process, so the dev-server's file descriptor kept its old ~1.2GB write offset and is
now appending a trickle of real bytes way out at that offset, leaving a huge unwritten
hole in between. `du -sh` (block-based) correctly reported "12K" — genuinely tiny disk
usage — but `ls -l`/`du -A` (apparent/logical size) still reports ~1.2GB, and I
initially conflated "du says 12K" with "the whole problem is fixed," which was the
error: I hadn't re-checked whether the *underlying* 1.2GB — real or sparse — was still
there.

**Correct read**: actual disk-fill risk is low right now (root volume has 21Gi free
per `df -h /`, and this file's true footprint is ~KB not GB). But the truncate was done
wrong — it didn't coordinate with the writer (no SIGHUP/restart, no `copytruncate`
semantics), so the log's apparent size will keep ballooning back toward "looks like
1.2GB" to any tool that reads logical size (an agent's own future `du -sh` slip like
mine, `cp`, a naive backup, or a `Read` attempting to open the whole file) even though
real usage stays low. Downgrading from "resolved" to "not an active disk-fill risk, but
still an unrotated-log process gap" — see `LESSONS.md` for the incident writeup on my
own error here (filed because it's the exact retract-and-reprove pattern this
operation is supposed to practice, including by the process monitor).

### In flight
- **Design worker**: still healthy, still expanding — 12 files, 730+/120- (was
  713+/115- at cycle 2). `DayStrip.vue` still in the diff. No scope drift outside
  `front/`.
- **DnD specialist**: new activity — `dnd-01-grab.png` / `dnd-02-hover-target.png` /
  `dnd-03-dropped.png` + `dnd-setup.json` / `dnd-getrects.json` / `dnd-full.json`
  (19:20-19:21) — looks like a full grab→hover→drop sequence being captured with
  evidence at each step, consistent with the evidence standard in `OPERATIONS.md` §3.
- **QA sense-tester**: `straddle-*.png/json` (19:19) — the Morning/Afternoon
  label-straddle question (queued as of cycle 1's ledger read) is now actively being
  tested. `qa-ledger.md` text itself is still unchanged since cycle 1 — confirms the
  ledger is a lagging/batched write, not a stale-tester signal (scratchpad evidence
  keeps arriving every cycle).
- **Shepherd**: cycle 12 (19:18:54) still showing movement (721+/119-), "PROGRESSING",
  no errors, ~33/45 min elapsed, 11 messages sent. On track to retire around
  19:33-19:38.

### Process-health observations this cycle
- The front.log correction above is the main event this cycle. No new incidents
  (single-writer, permissions, test-data hygiene) observed. `docs/design-v2/`
  unchanged.

### Next observation cycle
Re-check front.log's real block count (has the writer been restarted properly, or is
the hole still growing); whether QA's straddle and alignment verdicts land in the
ledger; shepherd retirement; any new surface touched outside owners' boundaries.

---

## Cycle 2 — 2026-09-01 19:20

### In flight
- **Design worker**: scope grew — `front/app/components/planner/DayStrip.vue` now
  also modified (wasn't in cycle 1's diff). Diff now 12 files, 713+/115- (was 11
  files, 571+/112-). Shepherd's own delta-counts corroborate continuous movement
  every ~3 min cycle (9, 10, 11) with no stall. Still on the numbered-queue tasks per
  brief; no sign of scope drift outside `front/`.
- **DnD specialist**: same 9 untracked scripts as cycle 1, no new files added this
  cycle — plus a new `dndmatrix/` subdirectory of output appeared in the scratchpad
  (19:13), consistent with test runs rather than new tooling.
- **QA sense-tester**: `qa-ledger.md` text is byte-identical to cycle 1 (not yet
  updated), but scratchpad evidence shows real forward progress the ledger hasn't
  caught up to yet: `f-edit-01..05` screenshots + `f-edit-test.json` /
  `f-edit-fix.json` / `f-edit-finish.json` / `f-edit-finish2.json` (19:13-19:15) —
  reads as feature 8's dblclick-to-edit path being actively tested, including at
  least one fix/retry cycle (`f-edit-fix.json` between two `f-edit-*` probes is
  consistent with the retract-and-reprove pattern, not a new incident). Also
  `del-daycard-toast.png` / `del-sidebar-toast.png` (19:12) and `cleanup-friday.json`
  (19:12) — looks like closing out the "Friday empty draft" open item noted in
  cycle 1's ledger. Ledger is a lagging indicator by design (written up after a
  thread of testing completes) — not a red flag on its own this cycle.
- **Shepherd**: healthy, no errors, "PROGRESSING", now ~30/45 min through its budget
  (was ~21/45 at cycle 1). Expect retirement around 19:35-19:40 based on this rate.
  10 messages sent to date, 0 no-change cycles recently (cycles 9-11 all showed
  movement) — this is a **high-activity** stretch, busier than cycle 1's read.

### Process-health observations this cycle
- **front.log resolved itself**: was 1.2GB at cycle 1 (19:10-ish), now **12KB** as of
  19:16 — someone rotated/truncated it or the dev server restarted with a fresh log.
  Whatever the mechanism, the risk flagged in cycle 1 is gone for now. Downgrading
  from "open watch item" to "resolved" in LESSONS.md; will keep half an eye on it in
  case it starts climbing again unbounded.
- No new single-writer violations, no permission self-grants, no test-data hygiene
  breaches observed. `docs/design-v2/` unchanged (still just the 3 parked reference
  items + README) — good, nothing new landed there for the workers to accidentally
  read as approved-for-this-wave.

### Blocked / open questions awaiting Mark or a ruling
- Still open from cycle 1: QA's alignment-discrepancy verdict (day-card draft-vs-saved
  text misalignment, theme-picker root cause) not yet reported to main as final.
  Watching whether it lands next cycle.

### Next observation cycle
Re-check: whether the alignment verdict reached main; whether `qa-ledger.md` catches
up to the `f-edit-*` activity; shepherd retirement; front.log staying low; any new
files touched outside the design worker's `front/` surface.

---

## Cycle 1 — 2026-09-01 19:15 (process monitor start)

### In flight
- **Design worker**: per brief, executing numbered queue in `front/`, currently on
  tasks 16, 7, 17 (order as given in the brief — not confirmed against a readable
  queue file, since no such file exists in the repo; the queue lives in the worker's
  own/main's context). `git diff --stat` shows active, substantial uncommitted work
  across 11 files in `front/` + `SPEC.md` (571 insertions / 112 deletions):
  `main.css`, `DayCard.vue`, `DaySection.vue`, `AddTaskInline.vue`, `TaskChip.vue`,
  `ThemeCard.vue`, `useAutosaveLines.ts`, `useThemeVisibility.ts`, `index.vue`,
  `stores/tasks.ts`. Matches the "hover-only chrome" and daycard/section work implied
  by recent scratchpad screenshots (`28-hover-pencil-x.png`, `29-header-idle.png`,
  `30-header-menu-open.png`, `31-undo-toast.png`).
- **DnD specialist**: 6 untracked scripts present in `.claude/skills/view-website/`
  (`dnd-matrix.mjs`, `dnd-rig.mjs`, `dnd-testdata.mjs`, `sense-driver.mjs`,
  `test-cross-theme-drag.mjs`, plus 4 more `test-*.mjs`), most recently touched
  19:00-19:08. Actively iterating.
- **QA sense-tester**: per `qa-ledger.md`, deep into feature 14 (delete-via-hover-x +
  undo toast) — marked **DONE** with full evidence chain (toast timing, network
  capture, reload-safe wait). Currently mid-way through the horizontal-alignment
  investigation (found a real discrepancy: draft input vs saved text misaligned on
  day-card, root-caused to the theme-picker) — not yet reported as a final verdict to
  main. 5 core use-case scenarios: 1 of 5 partial, 4 of 5 not started. 14-feature
  audit: 1 done, ~6 partial, ~6 not started, 2 explicitly out-of-scope (DnD, owned by
  the other specialist).
- **Shepherd**: alive as of its own last cycle (19:06:48), reporting "PROGRESSING",
  no errors, 1 no-change cycle so far, ~21 of its ~45-min budget elapsed at that
  timestamp — expect it may retire around the ~19:30-19:35 mark. After that, liveness
  visibility degrades; the process monitor's own observation cycles become the
  fallback heartbeat.

### Done (with evidence, per QA ledger)
- Feature 14 (delete via hover `×` + ~5s undo toast): MAKES SENSE = yes, WORKS = yes.
  Noted UX gap: dev perf-overlay chip visually collides with the toast in this dev
  environment — flagged as likely dev-tooling-only, not a product bug.

### Blocked / open questions awaiting Mark or a ruling
- None explicitly escalated to Mark yet as of this cycle, per what's visible. The
  QA sense-tester has an unreported final verdict pending on the alignment
  discrepancy (day-card draft-vs-saved text) — worth watching whether it reaches
  main this cycle or stalls.

### Process-health observations this cycle
- **`<scratchpad>/front.log` = 1.2 GB and rising.** No rotation/cap observed. Filed as
  a PROPOSED fix in `OPERATIONS.md` §7, incident-shaped risk logged in `LESSONS.md`.
  Will re-check size next cycle to see if it's still climbing.
- No evidence this cycle of a fresh single-writer violation, undocumented permission
  self-grant, or test-data hygiene breach beyond the ones already logged as INC-1/2/5
  in `LESSONS.md` (those are being treated as already-resolved/enforced, per the
  brief's framing of them as this-morning's incidents, not ongoing).
- `qa-ledger.md` shows exactly the retract-and-reprove discipline `LESSONS.md` INC-4
  describes in action for the alignment investigation ("not yet reported as final
  verdict" — i.e., holding the claim until it's solid, rather than reporting early).

### Next observation cycle
Re-check: `git status`/`diff --stat` for `front/` progress and any surprise touches
outside the design worker's surface; `qa-ledger.md` for new scenario coverage or a
reported alignment verdict; shepherd state for retirement; scratchpad log sizes;
`docs/design-v2/` for any new parked items (should not be acted on if so).
