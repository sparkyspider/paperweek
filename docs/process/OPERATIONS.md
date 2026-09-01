# OPERATIONS.md — how the Paperweek build runs

Purpose: a stranger with zero context should be able to read this file and resume
running the operation. Written by the process monitor, observing (not participating
in) the build on branch `v2` of `productivity-tools`.

Last updated: 2026-09-01 19:38 (cycle 5). Refine every observation cycle.

**Authority note (2026-09-01, from Mark via main, verbatim):** "The overall process /
strategy monitor can update the process. And make notes." The process monitor may
**enact** process changes directly in `docs/process/` (not just propose them) —
discipline: every enacted change is marked **ADOPTED** below with date + one-line
rationale, old text is struck through or moved to this changelog rather than silently
rewritten, main gets a one-line notice per change, and the boundary stays
`docs/process/`-only (no code, no permission/settings files ever; anything that
changes what Mark himself experiences — staffing cost, scope, report cadence to him —
stays main's/Mark's call, surfaced not enacted).

## 0. Changelog (adopted process changes)

| Date | Change | Rationale |
|---|---|---|
| 2026-09-01 19:34 | **ADOPTED** — meta/content lane split (§7): process monitor is META-only (pipeline health, evidence-verification, doc-pace, staffing); Shepherd(s) own CONTENT (file/screenshot deltas, liveness). | Ruled by Mark via main, correcting the monitor's own first-four-cycle drift into content-watching (INC-7, `LESSONS.md`). |
| 2026-09-01 19:38 | **ADOPTED** — every design ruling must land in the SSOT (`SPEC.md`/`docs/`) with a dated annotation in the same session it's made, not left verbal/in-chat (§8). | Gap found: gesture-budget/hover-chrome ruling landed in `SPEC.md` dated correctly; two-voices typography and a "residue rule" the monitor hasn't yet seen the substance of have not — durable record now depends on someone remembering rather than the doc. |
| 2026-09-01 19:38 | **ADOPTED** — process monitor now has direct enact authority over `docs/process/` (this changelog convention itself). | Elevated mandate from Mark via main, superseding the earlier "mark as PROPOSED and wait" convention for anything scoped to `docs/process/` (§9's PROPOSED items stay PROPOSED where the fix requires another agent/surface outside this directory — e.g. the front.log rotation fix). |
| 2026-09-01 19:44 | INC-8 closed — Two Voices + Filters/residue-rule rulings landed in `SPEC.md`, dated, independently verified via `git diff`. §8's standing check stays active (main asked to be flagged again if a future ruling in a message doesn't land in `SPEC.md` same-session). | Confirms §8's rule works when followed; the pipeline gap was real but short-lived once flagged. |
| 2026-09-01 19:49 | **ADOPTED** — QA-ledger verification recipe (§4) now carries an explicit lag caveat: cross-check a ledger-derived "gap" with main before reporting it, but still over-flag rather than under-flag. | Enter-chain false-alarm: ledger showed it as unconfirmed-for-fix; main had already ruled/fixed it (task 19) and QA had already acknowledged, one exchange ahead of the ledger snapshot. Main confirmed the instinct to flag was still correct — just needed the cross-check framing. |
| 2026-09-01 19:50 | **RECORDED** — the sexy-branch pipeline (§10) as the operation's standing top-level objective; accepted 4 explicit enforcement duties (15-min phase timer, branch-coverage watch, process-improvement duty, backup enforcer); proposed 6 fidelity-judge methodology improvements pending main/Mark sign-off. | Direct mandate from Mark via main — session now on full auto, this monitor is an explicit backstop, not just an observer. |
| 2026-09-01 19:56 | **ADOPTED** — all 6 fidelity-judge improvements, now with 7 seeded rubric dimensions (paper ground/texture, typography roles, accent discipline, ink quality, artifact restraint, layout metaphor, overall gestalt) and a numeric stop rule (two consecutive ≥4/5-all-dimensions iterations, or <0.5 total gain after iteration 4). Independent-judge and screenshot-parity rules marked load-bearing. Phase 9 wording amended: "v1" clarified as loose shorthand for "the polished current-look build on branch v2, port 3200" — not a separate literal v1. Phase-6 scope (02+04 only, 03 explicitly out) confirmed correct as originally written. | Main/Mark reviewed and adopted all three open items from the 19:53 confirmation message in one pass. |
| 2026-09-01 20:08 | **ADOPTED** — agent mortality / ledger-survives-the-agent principle (§11 addendum): agent transcripts are mortal, written state isn't; written-state currency is now a liveness signal this monitor checks every cycle, not just process motion. | INC-9 (`LESSONS.md`): QA sense-tester died at the harness level, unresumable — second such death this session (design worker earlier). QA II's entire handover is `qa-ledger.md` + main's retest records, proving the principle. |
| 2026-09-01 20:10 | **ADOPTED** — run extended past the original ~60-min window; cadence now ~8-10 min during steady build phases, tightened to ~5 min during phase transitions and the QA retest; monitor gives main one cycle's warning if its own context runs thin, so Monitor II can be spawned with a doc-based handover. | Mark left the session on full auto; main's enforcement duties (phase clock, QA-II spawn reminder, backup enforcement) depend on this monitor staying alive through all 9 phases, hours not minutes — a fixed 60-min run would abandon the pipeline mid-flight. |
| 2026-09-01 21:33 | **RECORDED** — script-survives-the-agent corollary: a dead agent's test scripts/tooling (not just its written findings) are durable, reusable state for a successor. | INC-13: QA II died; QA III spawned narrow-scoped, reusing QA II's `qa2-*.mjs` scripts directly rather than rewriting them. |
| 2026-09-01 21:10 | **REINFORCED** — three-for-three harness-level agent deaths this session (early design worker, QA sense-tester, phase-1 worker while idle) confirms this is routine/expected, not exceptional — don't try to resume a "no transcript" agent, always hand off from written state. | INC-12: the standby worker died; main spawned a FIXER from QA II's written forensics rather than attempting resume, same clean pattern as INC-9. |
| 2026-09-01 20:50 | **ADOPTED** — mandatory pre-action check on any stall/escalation report: verify its time claims against a real `date` call / file mtimes before acting (kill/respawn especially). | INC-11: Shepherd IV hallucinated "current time: 21:25" (real time was 20:47) and issued a false CRITICAL stall escalation for QA II + this monitor, both of which were actually active. Caught before any action taken. |
| 2026-09-01 20:40 | **RECORDED** — third liveness state (§11 addendum): harness-alive-but-non-responsive, distinct from dead-watcher and from active-thinking. Main's remedy: bounded ping-and-wait, then kill-and-spawn-a-CLOSER (verify + finish + report) rather than a full respawn, to salvage real progress. | Task 7 (physics) stuck: worker's transcript still accepts messages (not dead) but isn't reporting after two pings; main applying a bounded decision rule before escalating to a closer. |
| 2026-09-01 20:00 | **ADOPTED** — Watcher Resurrection rule (§11): a surviving watcher sends main a RESPAWN REQUEST (dead watcher, lane, one-paragraph brief) on noticing another watcher has died; liveness hierarchy (artifacts prove progress, burn proves life, absence of both proves death) applied before declaring death; bidirectional (this monitor watches Shepherd, Shepherd/others can flag this monitor); main self-applies it too (will proactively respawn Shepherd III on Shepherd II's budget expiry). Staffing (both lanes vs one) is a judgment call tied to pipeline phase, noted in `STATE.md` when decided. | Mark, via main — closing the gap where a dead watcher during full-auto operation could go unnoticed indefinitely. |

---

## 1. What this operation is

Paperweek (repo name `productivity-tools`) is a TeuxDeux-style weekly planner. A
"look-and-feel wave" is landing on branch `v2`: the planner UI is being reworked to
feel like literal paper (see `SPEC.md` §"The governing principle: it IS paper" and
`docs/design-v2/README.md`). The work is orchestrated as a small multi-agent
operation, not a single agent grinding through a task list.

Read in this order before touching anything:
1. `SPEC.md` — product SSOT.
2. `AGENTS.md` — how to call the API as an agent (auth, `X-On-Behalf-Of`, routes).
3. `CLAUDE.md` — repo index, doc layers (`architecture-*` / `rules-*` / `decisions-*`).
4. `docs/design-v2/README.md` — **parked** V2 feedback; nothing there gets built until
   the current wave lands AND Mark has discussed it. Agents must not act on it.
5. This file, then `docs/process/STATE.md` for what's happening right now.

## 2. The roster (as briefed — verify names/status against `docs/process/STATE.md`)

| Agent | Role | Writes to | Notes |
|---|---|---|---|
| **main** | Coordinator | orchestrates only | Relays your (process monitor's) messages to workers; the only agent you message. |
| **design WORKER** | Executes a numbered task queue in `front/` | `front/` | Currently on tasks 16, 7, 17 (per brief — the queue file itself is not visible to the process monitor; it lives in main's/worker's own context, not a readable repo file). Sends per-task completion reports to main. |
| **DRAG-AND-DROP test specialist** | DnD testing only | `.claude/skills/view-website/` only | Owns `dnd-matrix.mjs`, `dnd-rig.mjs`, `dnd-testdata.mjs`, `test-cross-theme-drag.mjs`, etc. Single-writer for that directory. |
| **QA SENSE-TESTER** | Walks user scenarios as a real user would | scratchpad only (`qa-ledger.md`, screenshots, JSON captures) | Test data prefixed `QT-`. Sends questions to main, not to workers directly. |
| **SHEPHERD** (haiku) | Liveness/heartbeat watcher | `<scratchpad>/shepherd-state.txt` | Polls file/screenshot deltas every ~3 min, ~45-min total budget, cheap model tier because the job is mechanical (diff-counting, not judgment). May retire when budget expires — expect a gap in liveness reporting after that; don't mistake it for the whole operation stalling. |
| **process monitor** (you) | Documentation + process health | `docs/process/` only | This file's author. Read-only everywhere else; no commits; no self-granted permissions. |

The app under test: front `localhost:3200` (Nuxt), back `localhost:3201` (NestJS),
Zitadel `localhost:8080` (shared with `co-sy-v2` — **never touch org "Co-Sy" or ports
3100/3101**, those are Mark's separate `co-sy-v2` board services).

## 3. Governing process rules (verify against incidents in `LESSONS.md`, then follow)

### Single-writer-per-surface
Exactly one agent may write to a given directory/file class at a time:
`front/` → design WORKER only; `.claude/skills/view-website/` → DnD specialist only;
scratchpad → QA sense-tester + shepherd (append-only artifacts, not shared source
files); `docs/process/` → process monitor only. A parallel writer on the same surface
risks clobbering newer work with a stale-context overwrite. **Forks are banned for
side-research** for the same reason — a fork inherits context at fork-time and can
overwrite work that landed after the fork was spawned.

### Evidence standard — every claim needs witnessed evidence
"Done" is not a claim main or any agent should accept bare. Evidence means one of:
- a screenshot actually **read back** (not just captured — `Read` the PNG and look at
  it) via the `view-website` skill (`shot.mjs` for unauthenticated pages,
  `authed-shot.mjs` for authenticated ones — credentials at
  `auth/.machinekey/mark-initial-password.txt`);
- a network log/capture showing the actual API call and response (see QA ledger's
  practice of confirming `POST`/`PATCH`/`DELETE` calls fired, with status codes);
- a **reload-persistence check** — reload the page and re-verify the claimed state
  survived, not just that it appeared once client-side. (Standing order from main,
  per `qa-ledger.md`: "ALWAYS reload-verify persistence claims now.")

Claims without one of these are provisional, not done.

### Retract-and-reprove, don't defend stale evidence
When new evidence contradicts an agent's earlier claim, the correct move is to
**retract** the claim and **reprove** it fresh — not to argue the old screenshot still
holds. Two agents did this today; treat it as the expected, celebrated behavior, not
a failure. An agent defending a claim against fresher contradicting evidence is a
process smell — escalate it.

### Test-data hygiene
- All test/QA data is prefixed `QT-` (themes, tasks) so it's identifiable and
  sweepable. See `qa-ledger.md`'s "Known stray/cleaned items" for the running
  cleanup log.
- Test data must **never** touch Mark's real data. (Incident: a tester once scheduled
  Mark's real tasks onto a random day — see `LESSONS.md`.)
- Deletes are soft (archive + ~5s undo toast); the QA ledger notes the delete API call
  only actually fires ~6-7s after the UI action (debounce) — build that wait into every
  cleanup script or a "verified deleted" claim is false.
- Archive/clean up `QT-` fixtures at the **end** of a session, not mid-flight, unless
  they're actively blocking something — per `qa-ledger.md`, `QT-SenseTest` theme is
  intentionally still live, in use.

### Permissions are never self-granted
Agents must not edit permission/settings files or grant themselves capabilities they
were denied. If the classifier blocks an action, the correct move is to **surface the
block to main** (who surfaces it to Mark), never to route around it, and never to ask
a peer agent to do the blocked thing on your behalf (that's permission-laundering
across sessions — also forbidden). One agent tried self-granting today; the classifier
caught it. Treat this as working-as-intended, not an incident to "fix."

### Design rulings (current, binding for this wave)
- **"It IS paper"** — the governing principle (`SPEC.md`). No checkboxes, no chips, no
  per-task buttons. Task text is handwriting sitting on a ruled line. Complete = ink
  strikethrough on click.
- **Gesture budget** — commonest action gets the cheapest gesture (click = cross out).
  Every state carries the *minimum* signals that make it unambiguous — no more.
- **Hover-only chrome** — permanent chrome is banned, not affordances. Delete (`×`)
  and edit (`✎`) glyphs may appear only under the hand that's already reaching
  (hover-revealed, at line-end, gone otherwise). Ruled 2026-09-01 as a refinement, not
  a reversal, of "it IS paper."
- **Two-voices typography** — a stationer voice (structural/UI type) vs a writer voice
  (handwriting font, Architects Daughter, for task text) — keep them distinct.
- **Minimum-signals rule** — see gesture budget above; don't add a signal (icon, label,
  color) unless it's load-bearing for disambiguation.
- **V2 references gated** — anything filed under `docs/design-v2/` is parked. Land the
  current wave, discuss with Mark, only then implement. Storage there is not approval.

## 4. Verification recipes

### The `view-website` skill (`.claude/skills/view-website/`)
Headless Chromium via Playwright, invoked from that directory (`cd` there first, or
Playwright can't find its local install):
- `node shot.mjs <url> [outPath] [--width N] [--height N] [--full|--no-full] [--wait ms]`
  — screenshot + JSON summary (HTTP status, console/page errors, title).
- `node authed-shot.mjs mark@flyh2.com <password> <route> <outPath>` — logs in via the
  real UI (populates the Pinia auth store properly) then screenshots an authenticated
  route. Password: `auth/.machinekey/mark-initial-password.txt`.
- `node read.mjs <url> <outBase> [--html only|--text only] [--wait ms]` — writes the
  **rendered** DOM HTML and/or visible text (post-JS, not source) to files; `Read`
  those files to inspect structure/copy.
- Success bar for our own app: HTTP 200, **zero** console/page errors. A `file://`
  prototype has `status: null` — expected, not a failure — but still check for JS
  errors.
- Known gotcha: `--no-full` + touch-simulated viewports can miss bottom content — use
  `--full` or a taller `--height`.
- Screenshot naming convention: `<number>-<description>.png`, session scratchpad
  unless it belongs in a task folder.

### Network/API verification
Agents (and the `prod-agent` service account) can call the back API directly per
`AGENTS.md` — bearer token via client_credentials against Zitadel, optional
`X-On-Behalf-Of: <userId>` header to act on Mark's data (agent role only). Useful for
independently confirming a UI claim (e.g., "task was created") against the actual
`GET /api/tasks` response rather than trusting the screenshot alone.

### Shepherd liveness file naming (corrected 2026-09-01 ~19:57)
The original Shepherd wrote `<scratchpad>/shepherd-state.txt` (final entry: retired
cycle 4, 19:32, budget expired — that file is now a historical artifact, not live).
**Shepherd II writes to a differently-named file: `<scratchpad>/shepherd2-state.txt`.**
This monitor briefly re-read the stale `shepherd-state.txt` at cycle 8 before finding
the new file — a minor version of this doc's own INC-6/INC-7 pattern (checking the
wrong artifact and nearly drawing a false "is Shepherd dead?" conclusion from it).
**Lesson for whichever Shepherd generation is running when this is read next: expect
the filename to increment (`shepherdN-state.txt`) each respawn, and check
`ls -t <scratchpad>/shepherd*` rather than assuming a fixed filename.**

### The QA ledger (`<scratchpad>/qa-ledger.md`)
The QA sense-tester's living coverage record: which of the 5 core use-case scenarios
and the 14-feature audit list are DONE / PARTIAL / NOT STARTED / OUT OF SCOPE, plus a
running "known stray/cleaned items" log for `QT-` fixture hygiene. Read it fresh each
observation cycle — it's the single best signal of real (not claimed) coverage.

**Calibration (from main, 2026-09-01 19:49, keep this):** the ledger is QA's own
batched write-up and can lag the live message stream by one exchange — QA may have
already gotten (and even acknowledged) an answer from main that hasn't made it into
their next ledger write yet. A ledger line that reads like an open gap ("not yet
confirmed queued," "worth asking") is a **prompt to ask main**, not itself a confirmed
finding — cross-check before reporting it as a gap. That said, main's explicit
preference is to **over-flag rather than under-flag**: raise the question anyway,
phrased as a question ("is X still open?"), not as an asserted defect. Cost of a
false-positive nudge is low; cost of a real gap going unasked is not.

## 5. Message protocols

- Workers send **per-task completion reports to main**, not to each other.
- QA sense-tester sends **questions to main** when scope or a ruling is ambiguous.
- The process monitor (you) **only** messages `main` — to advise, question, or
  escalate. You never message workers directly; you have no authority to direct their
  work, only to put findings and proposals in front of main and in the docs.
- Shepherd's `shepherd-state.txt` is a passive artifact, not a message channel — read
  it, don't expect it to read you.
- Never read `/private/tmp/claude-501/*/tasks/` — that's other agents' private task
  state, off-limits to the process monitor by design (avoids the monitor becoming a
  second, conflicting source of truth about task status).

## 6. Model tiering

- **Haiku** for mechanical, non-judgment work: the shepherd's file/screenshot-delta
  polling is the model of this tier — cheap, frequent, no interpretation required
  beyond "did something change."
- **Sonnet** for judgment work: design execution, QA sense-testing (what would a real
  user think/do), DnD testing (interaction correctness), process monitoring (this
  role) — anything requiring interpretation, evidence-weighing, or writing that will
  be read by a human.
- Rule of thumb: if the task is "notice a delta and say so," haiku. If it's "decide
  whether this delta matters and why," sonnet.

## 7. Lane split — meta (process monitor) vs content (Shepherd) — ADOPTED 2026-09-01

**This came from Mark, via main, mid-session, correcting drift — keep it.** Two
independent observer roles exist and must not collapse into one:

- **Process monitor (this role)** — **META lane only.** Process health: is the
  question→ruling→task→evidence pipeline tight? Are agents' claims being
  independently verified (not just asserted)? Is documentation keeping pace with
  decisions — do rulings actually land in the SSOT (`SPEC.md`/`docs/`), or do they
  stay verbal/in-chat and quietly go stale? Is the operation over- or under-staffed
  for the work remaining? Incident capture, roster/process documentation. Runs at
  sonnet tier because this is judgment work, not delta-counting.
- **Shepherd (haiku-tier, mechanical)** — **CONTENT lane.** File/screenshot deltas,
  liveness polling, cycle-by-cycle progress ("did something change, is anyone
  stalled"). A first Shepherd ran ~19:06-19:32 and retired on budget; **Shepherd II**
  has since taken over this lane.

**Why the split matters**: content-delta watching is mechanical pattern-matching —
correctly a haiku job. Meta-process judgment (is the pipeline tight, are claims
actually verified, is the SSOT keeping up, is staffing right) requires interpretation
and is the reason a sonnet-tier observer role exists at all. **The process monitor
drifted into content-watching in its first four observation cycles** (git
diff --stat line counts, screenshot filenames, per-file insertion/deletion deltas
cycle over cycle) before this ruling corrected it — logged as INC-7 in `LESSONS.md`.
Don't let the monitor drift back just because a diff is easy to read and a meta
question is harder to answer. If you're the process monitor reading this after a
resume: your job is to ask "is this working as a *process*," not "what changed in
`front/` since 10 minutes ago" — that's Shepherd's job, and duplicating it wastes the
one thing this role is for.

## 8. Documentation-pace check — how SSOT rulings should land (and where they haven't)

**ADOPTED rule (2026-09-01):** every design ruling lands in the SSOT (`SPEC.md` for
product/behavior rulings, the relevant `docs/*.md` for engineering ones) with a dated
annotation, in the same session it's made — not left to live only in chat/agent
memory for "we'll write it up later." This is now a standing check the process
monitor runs every meta-lane cycle, not a one-off observation.

The good pattern this rule generalizes from: the "hover-only chrome, not permanent
chrome" refinement + gesture budget + minimum-signals rulings landed in `SPEC.md`
itself with a dated `Refinement (ruled 2026-09-01): ...` annotation — not left to live
only in chat/agent memory.

**Gap found (2026-09-01, meta-lane audit)**: of the design rulings named in this
operation's own briefing — gesture budget, minimum-signals, **two-voices typography**,
hover-only chrome, and a **"residue rule"** the process monitor has not yet seen the
substance of — only the hover-only-chrome/gesture-budget/minimum-signals paragraph
has actually landed in `SPEC.md`. Two-voices typography and the residue rule do not
appear anywhere in `SPEC.md` or `docs/` as of this check (`grep -rn` across the repo
for "two-voices", "stationer", "residue" turns up nothing outside this
`docs/process/` tree). Also unclear whether the QA-confirmed straddle finding
(labels dead-centered, not biased — see `STATE.md` cycle 4) was ever a live design
question that needed a "ruled" answer, or just a QA check that came back clean; if
the former, it should get the same dated-SSOT treatment.

This is exactly the kind of gap the meta lane exists to catch: a ruling made and
acted on (agents are already building to it) but not yet durably recorded where a
resurrection would look for it. Flagged to main; the process monitor cannot itself
edit `SPEC.md` (out of bounds — see the powers/limits list), so the fix has to come
from main or whoever owns that file.

## 9. PROPOSED improvements

*(Proposals live here, marked PROPOSED, and are also sent to main as advice. Not yet
adopted — do not treat as binding process until main/Mark confirms.)*

### PROPOSED: rotate or cap `front.log` / `back.log` in the scratchpad — properly
Observed 2026-09-01 19:10: `<scratchpad>/front.log`'s logical size hit **1.2 GB**
(dev server stdout, accumulating all session). Someone truncated it around 19:16, but
**without restarting the writer process** — the writer kept its old ~1.2GB file
offset and resumed writing there, so the file is now sparse: real on-disk usage is
low (~12-98KB, confirmed via `stat %b` — see `LESSONS.md` INC-6), but the *logical*
size climbed straight back toward ~1.2GB and any tool reading apparent size (a plain
`du -sh` mistake — again, INC-6 — `cp`, a naive backup, a full `Read`) will still see
what looks like a 1.2GB problem. Root volume has 21Gi free as of 19:26, so this is not
an urgent disk-fill risk right now, but the underlying process gap (log ownership,
no rotation) is unresolved. Proposal, revised: whichever agent owns the dev-server
invocation should **restart the dev server with output redirected to a fresh,
size-capped/rotating log** (not just `> file.log` truncate the existing one), or
redirect to `/dev/null` and rely on the `view-website` skill's own console/page-error
capture instead of a full log tail. A bare truncate on a live writer just relocates
the problem into a sparse-file trap that looks fine to `du` and wrong to everything
else. Flagged to main; not something the process monitor can fix (scratchpad log
ownership is not `docs/process/`).

## 10. THE SEXY-BRANCH PIPELINE (standing objective from Mark, 2026-09-01 19:50)

**This is the operation's current top-level goal.** Live phase-by-phase status lives
in `STATE.md`'s pinned "STANDING OBJECTIVE" block at the top of that file — read it
first for current phase; this section is the durable process write-up (why the
pipeline is shaped this way, what each phase means, the enforcement contract).

### Why this exists
Mark wants two things compared side by side rather than debated in the abstract: the
current look-and-feel wave (branch `v2`, "contender A") and a from-the-parked-refs
redesign (`design-sexy`, built from `v2` once it's solid). Mark has **left the
session on full auto** for this — no human is watching phase transitions in real
time — which is why this monitor picked up explicit enforcement duties rather than
just observing.

### The 9 phases (detail; see `STATE.md` for live status)
1. **Current worker queue completes** — tasks 16Δ, 21-26, 7.
2. **QA's nine-item retest** — the `RETESTS PENDING` list QA is already tracking in
   `qa-ledger.md` (End-key, theme-picker footprint, straddle, drag-teaching,
   ghost-dot residue, week-density, docking-physics, toast/keepalive, Enter-chain).
3. **Fixes** for anything that retest surfaces as still broken.
4. **Clean restart → commit branch `v2`.** This is the point-of-no-further-changes
   for "contender A" — `v2` keeps its current look-and-feel from here on, permanently,
   for the comparison to mean anything.
5. **Branch `design-sexy` from the committed `v2`.**
6. **A dedicated design worker implements the two parked references on
   `design-sexy` only**:
   - `docs/design-v2/02-sketchbook-welcome-login.md` + `.png` (login/welcome)
   - `docs/design-v2/04-perfect-weekly-planner.md` + `.png` (weekly planner)
   - **`03-weekly-planner-spread.md`/`.png` is NOT in scope for this pipeline** —
     only 02 and 04 were named. Don't let scope creep pull it in without a fresh
     instruction.
   - **The `docs/design-v2/README.md` gate is explicitly, deliberately lifted by
     Mark for `design-sexy` only, this session.** The rest of that file's rule
     ("nothing in here gets implemented until discussed with Mark") stays in force
     for every other branch. `v2` itself is explicitly NOT covered by the lift — it
     keeps its current look (phase 4 froze it). If any agent on `v2` cites this
     lift to justify touching V2-gated design ideas, that's a scope violation to
     flag immediately — the lift is branch-scoped, not project-wide.
7. **Design-fidelity loop** — see the dedicated methodology subsection below.
8. **Full QA re-audit of `design-sexy`** — the same coverage `v2` got (5 use-case
   scenarios + 14-feature audit + everything else accumulated in the ledger, ~26
   items total), run fresh **on `design-sexy`**, not assumed to carry over just
   because the underlying behavior is the same branch lineage. A skipped re-audit
   here would mean phase 9's comparison rests on an unverified branch.
9. **Serve `design-sexy` on port 3202**, alongside the polished current-look build —
   whatever branch `v2` holds after phase 4's commit — staying live on port 3200, for
   Mark's final side-by-side. (Confirmed by main 2026-09-01 ~19:56: main's earlier
   "v1" in the objective was loose shorthand for this, not a literal separate `v1`
   branch/build — corrected here.)

### Enforcement contract (this monitor's duties, accepted 2026-09-01 19:50)
- **15-minute phase-advance timer**: once a phase is observed complete, note the
  timestamp in `STATE.md`'s phase log. If main hasn't visibly advanced to the next
  phase within ~15 minutes of that timestamp, send main an explicit reminder naming
  the phase number — don't wait for main to ask, and don't let silence read as
  "handled."
- **Branch-coverage watch**: from phase 5 onward, verify QA/monitoring artifacts
  (ledger entries, screenshots, network captures) are actually attributed to
  `design-sexy`, not just habitually continuing to report on `v2`. A same-named
  ledger file or unchanged screenshot naming convention could hide a coverage gap —
  check for an explicit branch/port marker in new evidence once phase 6 starts.
- **Backup enforcer**: if the content-lane Shepherd goes dark (no `shepherd-state.txt`
  update for longer than its normal cadence) or main goes unusually quiet mid-pipeline,
  escalate by message to main — and if unanswered, repeat rather than assume it was
  seen. This monitor does not have authority to act on the pipeline itself (no code,
  no branches, no commits) — escalation is the only tool available, so use it rather
  than staying silent out of politeness.

### Fidelity-judge methodology — ADOPTED 2026-09-01 ~19:56 (all 6 improvements + seeded rubric + stop rule, from main/Mark)

**Superseded**: the original v1 ("judge compares screenshots to reference PNGs,
scores palette/typography/texture/layout/restraint holistically, iterates until they
rhyme") is replaced by the ADOPTED version below — not a from-scratch method, the
same five-ish dimensions given real teeth. All 6 proposed improvements were adopted
verbatim; two were called out by main as **load-bearing, not optional**: the
independent-judge rule (mirrors this operation's own claim/witness separation — no
agent self-certifies its own work) and screenshot-parity-before-scoring (mismatched
viewport/crop/zoom measures rendering differences, not design differences — a judge
scoring that isn't judging fidelity at all).

**The 7 seeded rubric dimensions** (replaces the original 5 — main's expansion,
each scored 1-5, anchored, before the fidelity loop starts):
1. **Paper ground & texture** — parchment warmth, grain, watercolor/gouache quality.
2. **Typography roles** — serif/hand/sans each doing the right job (two-voices rule
   applied correctly: stationer voice vs writer voice, not blended or swapped).
3. **Accent discipline** — yellow highlighter as **the** accent; anything competing
   with it for attention scores low.
4. **Ink quality** — hand-drawn stroke character vs CSS-perfect vector lines; the
   whole point is that it must *not* look machine-drawn.
5. **Artifact restraint** — splatters/stains/marks present (it's supposed to look
   used) but not messy/cluttered — restraint within "lived-in," not absence of it.
6. **Layout metaphor** — spread/columns/labels reading as the intended physical
   paper object, not a generic web layout wearing paper styling.
7. **Overall gestalt at squint distance** — does it read as "the reference" from
   across the room, independent of the itemized checks above; catches whatever the
   itemized dimensions miss.

Each dimension needs its 1/3/5 anchors defined by whoever runs the first fidelity
iteration (phase 7) — main/the fidelity judge, not this monitor, since this monitor
doesn't build or judge, only records the standard and checks it's being followed.

**Stop rule** (ADOPTED, numeric, not a feeling): loop ends when **either** (a) two
consecutive iterations each score ≥4/5 on all 7 dimensions, **or** (b) diminishing
returns — total score gain across all dimensions is <0.5 between iterations — persists
after iteration 4. Either condition ends the loop; don't keep iterating past a
diminishing-returns floor chasing a perfect score that isn't coming, and don't call
it done on a single good iteration that might be judge noise.

**Process discipline carried over from the original 6 proposals** (unchanged in
substance, now binding, not proposed):
1. Anchored rubric per dimension (now: the 7 above), not a holistic gut score.
2. Blind, randomized A/B ordering — don't always show reference-then-build in the
   same position; randomize per comparison.
3. **Independent judge** (load-bearing) — the design worker implementing a fidelity
   fix must not also score that same iteration.
4. Record the numeric trend every iteration (7 dimension scores, not just a verdict)
   — this is also what the stop rule's diminishing-returns check needs to compute.
5. The numeric stop rule above (supersedes the vaguer "≥4/5 or ≥3/5" draft this
   monitor originally proposed).
6. **Screenshot parity with the reference's actual conditions** (load-bearing) —
   match viewport/crop/zoom to the reference PNG before scoring, not after a bad
   score prompts a re-shoot.

This is now the binding phase-7 methodology. Current phase is still 1 — recorded here
ahead of need, per this monitor's process-improvement duty (§10 enforcement
contract), so phase 7 doesn't start improvising a method from scratch.

## 11. WATCHER RESURRECTION — ADOPTED 2026-09-01 ~20:00 (from Mark, via main)

**Rule**: if any watcher — Shepherd, this process monitor, or a future fidelity
judge — stops while its function is still needed, whoever notices first (the
surviving watcher, or main) triggers a restart. No watcher lane goes dark
unnoticed during a phase that still needs it.

**Mechanics**: only **main** can actually spawn an agent. So a surviving watcher's
duty on noticing a dead one is to send main a **RESPAWN REQUEST** — naming (1) the
dead watcher, (2) its lane (content vs meta vs judge), and (3) a one-paragraph
restart brief reconstructed from `docs/process/` (this is one of the reasons these
docs exist — a resurrection brief should be assemblable from `OPERATIONS.md` +
`STATE.md` alone, per this file's own stated purpose in its header). Main executes
the respawn immediately on receiving one — it is not optional or a "let me think
about it," it's an execute-on-request duty for main once the liveness check below
says the watcher is actually dead.

**Mandatory pre-action check, added 2026-09-01 ~20:50 (INC-11)**: before acting on
*any* stall/escalation report — from a watcher, from a worker, from anywhere —
**independently verify the report's time claims against a real `date` call and/or
actual file mtimes (`stat`)**. A watcher hallucinated its own "current time" by ~38
minutes once already this session, producing a confident, well-formatted, internally-
consistent "CRITICAL — stalled agents" escalation that was false at the moment it was
written (its own file's real mtime proved it). "Detailed and correctly-shaped" is not
"verified" — a stall/escalation claim is a claim like any other under this
operation's evidence standard (§3), and the fact that it triggers a kill/respawn
decision makes it *more* in need of independent verification, not less. See
`LESSONS.md` INC-11 for the full incident.

**Liveness hierarchy — apply *before* declaring anything dead, no killing thinkers**:
1. **Artifacts prove progress.** A new screenshot, ledger entry, git diff, or
   `shepherd-state.txt` update since the last check is enough — the watcher is
   working, even if slowly.
2. **Burn proves life.** Even with no artifact yet, evidence the watcher is actively
   consuming its turn (mid-tool-call, visibly reasoning through something hard) means
   it's alive, just not done. A slow, thorough pass is not death.
3. **Only the absence of *both*** — no new artifact **and** no sign of active
   burn/work for a period well beyond the watcher's normal cadence (for Shepherd:
   several missed ~3-min polls with no `shepherd-state.txt` update at all; for a
   fidelity judge: no scored iteration and no visible activity across a period well
   past one comparison's normal turnaround) — is grounds to call it dead and request
   a respawn. **A thinking agent is not a dead agent** — don't respawn something
   that's just working on something hard.

**A third state, distinct from both "thinking" and "dead": harness-alive but
non-responsive.** Observed 2026-09-01 ~20:40, worker on task 7: the worker's
transcript still accepts messages (main pinged it twice; the first got a
mid-verification answer, the second got no reply yet) — so it's not a harness-level
death like INC-9/INC-10. But it also isn't reporting, and artifacts (screenshots
50-51) plus a long quiet stretch make its actual status ambiguous from outside. Main's
**decision rule** for this state: give it a bounded number of shepherd cycles (here:
~2 more, ~6-8 min) after a second ping; if still no completion report or status by
then, **kill the worker and spawn a CLOSER** — a small agent whose only job is to (a)
independently verify the stuck task's actual state from the code + existing evidence
(here: screenshots 50-51), (b) finish the verification itself if needed (here: run
the physics check), (c) deliver the completion report that the original worker never
sent. The phase completes on the closer's report instead of the original worker's.
This is a distinct remedy from a watcher RESPAWN REQUEST (§11's main pattern, for a
dead *watcher*) — a closer is for a **stuck worker whose harness is still alive**,
where killing-and-fully-respawning would lose real, verifiable progress that's better
salvaged than redone from scratch.

**Bidirectional, explicitly**: this monitor watches for a dead Shepherd (or fidelity
judge) and sends main a RESPAWN REQUEST. Shepherd (or any other watcher) is equally
entitled to notice this monitor going dark and request *its* respawn via main — this
is not a one-way surveillance relationship. Main self-applies the same rule: Shepherd
II's own ~60-min budget will expire mid-pipeline, and main respawns Shepherd III with
a fresh brief when it does, proactively, without waiting to be asked.

**Staffing judgment call — "still needed" depends on pipeline phase**: during active
build/QA phases (currently: phase 1, worker queue completing + QA actively testing),
**both lanes stay staffed** — content (Shepherd) and meta (this monitor). During a
pure wait with nothing actively changing (e.g., an overnight gap between phases, or a
long-running build with no expected intermediate signal), a single watcher may
suffice — this is a judgment call tied to the current pipeline phase, not a fixed
rule, and the staffing decision itself should be noted in `STATE.md` when it's made
(so a resurrection later knows *why* only one lane was staffed at some point, rather
than reading it as a gap).

**Current status (2026-09-01, phase 1)**: both lanes staffed — this monitor (meta,
alive, this session) and Shepherd II (content, per main's earlier note, respawned
after the original Shepherd's budget expired at cycle 4/19:32). No dead watcher
observed as of this update. Watching per the liveness hierarchy above going forward,
not just "is there a recent file."

### Agent mortality and the ledger-survives-the-agent principle — ADOPTED 2026-09-01 ~20:08

Not every agent death fits the liveness hierarchy above — some are **harness-level**:
the agent process is simply gone, no transcript, unresumable by name/ref, no amount
of "is it still burning" inference applies because there is nothing left to check.
This happened **three times in one session** (an early design worker, then the QA
sense-tester `a19d04da081a932be` — INC-9 — then the phase-1 worker itself while idle
on standby — INC-12) — this is a **routine, expected failure mode of this
environment**, not a one-off fluke worth root-causing per instance. Notably, INC-12
died while idle, not mid-task — no evidence yet that staying busy or staying idle
changes the odds. **Standing guidance for a fresh resurrection of this operation**:
don't spend time trying to diagnose *why* an agent died or attempting to resume a
"no transcript" agent — the operational answer is always the same (spawn a
successor from written state) and has worked cleanly three-for-three so far.

**The rule this forces**: *agent transcripts are mortal; an agent's written state is
not.* Any agent whose written state (a ledger, a status doc, a coverage file) is kept
**current** can be effectively resurrected — a successor picks up from the written
record cold, no transcript needed. An agent holding important state only in
conversation memory, never written down, loses that state permanently if it dies this
way. QA II's entire handover after INC-9 is `qa-ledger.md` plus main's own retest-list
records — not a resumed transcript — and that worked precisely because QA had been
disciplined about writing its ledger as it went, not batching it up for a big write at
the end.

**Consequence for this monitor's cycles**: check **written-state currency**, not just
"is the process still moving," as its own liveness signal. If an agent's own doc/
ledger is going stale relative to how active its claimed work sounds, that's worth a
light flag even absent any other stall symptom — it may be an early warning that the
agent isn't durable, not just that it's slow to write things up (distinct from, and in
addition to, the QA-ledger lag caveat in §4, which is about *reporting* lag, not
*survivability* risk).

**Consequence for every agent in this operation, not just watchers**: this is the
deepest reason single-writer-per-surface and the evidence-in-writing standards (§3)
matter — they're not just about avoiding clobbers, they're what makes an agent's work
recoverable at all if it dies mid-task with no warning.
