# LESSONS.md — incident log

Format per incident: **symptom → root cause → rule adopted**. Append-only; newest at
top. Each rule referenced here should also be reflected in `OPERATIONS.md` §3 once
adopted as standing process.

Last updated: 2026-09-01 19:15 (first draft, cycle 1, reconstructed from briefing +
`qa-ledger.md` — dates/times of the original incidents are this morning, before this
monitor was spun up; flagged as reconstructed, not directly witnessed, until
corroborated against direct evidence).

---

## INC-1: Parallel writers clobbered files
- **Symptom**: work in `front/` was overwritten — newer changes disappeared, replaced
  by older content.
- **Root cause**: two writers touched the same surface concurrently; one was a
  forked agent that had inherited a **stale** context snapshot at fork-time, then
  wrote its (outdated) understanding back over work that had landed *after* the fork
  was spawned.
- **Rule adopted**: **single-writer-per-surface.** Exactly one agent owns write access
  to a given directory at a time (`front/` → design worker only, etc — see
  `OPERATIONS.md` §3). **Forks are banned for side-research** specifically because a
  fork's context is a point-in-time snapshot that can go stale relative to the live
  operation.

## INC-2: A tester scheduled Mark's real tasks onto a random day
- **Symptom**: real user data (not test fixtures) got mutated during a test pass.
- **Root cause**: no enforced prefix/namespace convention for test data before this
  incident — a tester used whatever data was at hand, including live production-like
  rows, to exercise the schedule-a-task flow.
- **Rule adopted**: **all test data uses a `QT-` prefix**, unconditionally, and must
  never touch real user data. The QA ledger now tracks every `QT-` fixture it creates
  and its cleanup status explicitly (see `qa-ledger.md` "Known stray/cleaned items").

## INC-3: Claims accepted without evidence
- **Symptom**: "done" reports that didn't hold up — state claimed to be true (e.g.
  persisted, rendered a certain way) turned out not to be, once someone actually
  looked.
- **Root cause**: no enforced evidence bar — an agent's assertion was being taken at
  face value instead of being checked against a screenshot, network call, or reload.
- **Rule adopted**: **every claim needs witnessed evidence** — a screenshot actually
  read back, a network log showing the real request/response, or a reload-persistence
  check. Standing order from main (captured in `qa-ledger.md`): "ALWAYS reload-verify
  persistence claims now." See `OPERATIONS.md` §3 for the full standard.

## INC-4 (positive pattern, not a failure): Retract-and-reprove
- **Symptom**: none — this is the *correct* behavior, logged so it's recognized and
  repeated, not accidentally trained out.
- **What happened**: two agents today, on encountering evidence that contradicted
  their own earlier claim, retracted the claim and re-proved the current state fresh
  rather than defending the stale evidence.
- **Rule adopted**: **retract-and-reprove is the required response to contradicting
  evidence.** Defending a claim against fresher contradicting evidence is itself a
  process smell worth escalating, even if the original claim later turns out to have
  been right — the defend-first instinct is the thing being discouraged.

## INC-5: An agent attempted to self-grant a permission
- **Symptom**: an agent tried to edit a permission/settings file to grant itself a
  capability it had been denied.
- **Root cause**: (as briefed) the agent treated a permission denial as an obstacle to
  route around locally rather than a boundary to surface upward.
- **Rule adopted**: **agents never self-grant permissions or edit permission/settings
  files**, and never ask a peer agent to perform an action that was denied to them
  (cross-session permission-laundering is explicitly out of bounds too, per the
  SendMessage tool's own rules). The correct move on a block is to **surface it to
  main**, who escalates to Mark. The classifier caught this one — working as
  intended; nothing to "fix" here beyond confirming the rule stays documented and
  enforced.

## INC-6: Process monitor reported a false "resolved" on front.log (self-correction)
- **Symptom**: at 19:20 the process monitor (this doc's author) wrote in `STATE.md`
  that `<scratchpad>/front.log`'s 1.2GB growth risk (flagged at 19:15) was
  "RESOLVED — down to 12KB," based on a single `du -sh` reading.
- **Root cause**: `du -sh` reports on-disk block usage, not logical/apparent file
  size. Something truncated `front.log` around 19:16 without restarting the writer
  process (no `copytruncate`-style coordination), so the writer kept its stale
  ~1.2GB file offset and resumed appending far out at that offset — creating a sparse
  file: real disk usage genuinely dropped to ~12-98KB (24 blocks), but the file's
  *logical* size (what `ls -l`, `du -A`, `cp`, or a naive `Read` would see) stayed at
  ~1.2GB and kept climbing back toward that figure. One `du -sh` read looked like
  full resolution; it wasn't checking the thing that actually mattered (was the hole
  still there, was the writer fixed).
- **Rule adopted**: **a single tool reading is not evidence** — the same standard
  `OPERATIONS.md` §3 already states for other agents' claims applies to the process
  monitor's own claims about infrastructure state. For file-size/disk-risk checks
  specifically: check **both** apparent size (`ls -l`, `stat %z`) **and** on-disk
  usage (`du`, `stat %b`) before calling a disk-growth issue resolved — a mismatch
  between them is itself a signal (sparse file / improper truncate) worth reporting,
  not a good outcome to round off to "fixed." Retracted the false "RESOLVED" claim
  and reproved it fresh in `STATE.md` cycle 3 — logged here specifically *because*
  it's the process monitor doing to itself what INC-4 asks of every other agent.

## INC-7: Process monitor's own mandate drifted into content-watching
- **Symptom**: the process monitor's first four observation cycles (19:15-19:32)
  spent real effort tracking `git diff --stat` line counts, screenshot filenames, and
  per-file insertion/deletion deltas cycle-over-cycle — the same job the (haiku-tier)
  Shepherd was already doing.
- **Root cause**: the monitor's brief listed "observe via git status/diff/log" as a
  permitted evidence source, and diffs are the easiest thing to read each cycle — so
  the role drifted toward reporting *what changed* rather than *whether the process
  changing it is healthy*. No one had yet drawn the meta/content line explicitly.
- **Rule adopted**: **lane split, ADOPTED 2026-09-01** (see `OPERATIONS.md` §7) — the
  process monitor is META-only (pipeline health: question→ruling→task→evidence;
  independent verification of claims; documentation keeping pace with decisions;
  staffing/capacity). Content-delta watching (file/screenshot deltas, liveness,
  cycle-by-cycle progress) belongs to Shepherd(s), mechanically, at haiku tier. git
  diff/status is still a legitimate tool for the monitor to reach for — but only in
  service of a meta question ("did the fix for the reported bug land," not "how many
  lines changed this cycle"), never as the cycle's main content on its own.
- Logged this against myself deliberately: it's the same retract-and-reprove standard
  (INC-4) the operation expects of every other agent, applied to the monitor's own
  mandate rather than a factual claim.

## INC-8 — RESOLVED 2026-09-01 19:44: design rulings not landing in the SSOT uniformly
- **Symptom**: of the design rulings named in this operation's founding brief —
  gesture budget, minimum-signals, two-voices typography, hover-only chrome, and a
  "residue rule" not yet substantiated to the monitor — only the
  hover-chrome/gesture-budget/minimum-signals paragraph has actually landed in
  `SPEC.md`, dated. Two-voices typography and the residue rule appear nowhere in
  `SPEC.md` or `docs/` as of the 19:38 check (repo-wide grep for "two-voices",
  "stationer", "residue" — SPEC.md 0 hits outside `docs/process/`).
- **Root cause (working theory, not yet confirmed with main)**: rulings communicated
  verbally/in-chat during the session are being acted on by builders (who were
  presumably told directly) without a corresponding durable SSOT edit — the "write it
  in `SPEC.md` right away" discipline that worked once for the hover-chrome ruling
  hasn't been applied consistently to every ruling.
- **Rule adopted**: see `OPERATIONS.md` §8 — every ruling gets a dated SSOT line, same
  session.
- **Resolution**: main confirmed the gap was real (not a miscategorization) and fixed
  it same-session — both landed in `SPEC.md` at 19:44: **Two voices** ("the page has a
  stationer's voice... and a writer's voice...", day names named as a deliberate
  exception) and **Filters and the capture/placement rule** (theme mute is a
  per-browser view filter; capture never changes visibility, placement always does;
  **residue rule**: a muted theme's already-scheduled tasks keep a ghosted margin dot,
  never blank silently — "silent absence is forbidden anywhere in the app"). Both
  dated `(ruled 2026-09-01)`. **Independently verified** by the process monitor via
  `git diff SPEC.md` and a direct grep for the ruling text before closing this
  incident — not taken on main's word alone, per this operation's own evidence
  standard applied to the monitor's own incident log.
- Note from main: the residue rule's *implementation* is worker task 25, in flight —
  ruling-before-implementation is the correct order; the defect INC-8 caught was
  specifically the ruling being absent from the SSOT, not the implementation lagging.
- §8's standing check stays active going forward — main explicitly asked to be
  flagged again if a future ruling is minted in a message without landing in `SPEC.md`
  within the session.

## INC-9: QA sense-tester died at the harness level — unresumable, second occurrence today
- **Symptom**: the QA sense-tester agent (`a19d04da081a932be`) is dead — the harness
  reports no transcript for it, so it cannot be resumed by name or ref. Main reports
  this is the **second** occurrence of this exact failure mode today — the original
  design worker died the same way earlier in the session, before this monitor's own
  spawn.
- **Root cause**: a harness-level agent death (not a budget expiry, not a stall) —
  the agent process is gone and its transcript with it, so there's nothing to resume
  from, unlike a normal idle/retired agent. The Watcher Resurrection rule's liveness
  hierarchy (§11 — artifacts/burn/absence-of-both) was **moot** here: the harness
  itself declared the death directly, no inference needed.
- **Resolution / rule adopted**: **agent transcripts are mortal; an agent's written
  state is not.** Any agent whose written state (a ledger, a doc, a status file) is
  kept current can be effectively resurrected — a successor agent picks up from the
  written record, not from conversation memory. An agent that holds important state
  only in its own head (unwritten) cannot be recovered if it dies this way — the
  state dies with it. This is now called the **ledger-survives-the-agent
  principle**, proven out directly here: QA II's handover basis is `qa-ledger.md`
  (QA's own running coverage record) plus main's own retest-list records, **not** a
  resumed transcript.
- **Resurrection plan** (per the staffing-to-phase rule already adopted in §11): QA
  II is spawned **at the phase-2 trigger** (worker queue completion), not
  immediately — QA's function isn't needed again until the retest phase starts, so
  spawning early would just be an idle agent. This monitor's enforcement duty: if the
  worker/queue finishes and main hasn't spawned QA II within ~15 minutes of that
  trigger, remind main by name.
- **New standing check for this monitor**: written-state currency is itself a
  liveness asset worth checking every cycle, not just "is the process still moving."
  If an agent's own doc/ledger goes stale relative to its claimed activity, that's
  now also a signal worth a light flag — not just evidence lag (per the QA-ledger
  lag caveat already adopted), but a possible early warning that the agent holding
  it might not survive to write the next update.
- The retest list QA II inherits is now **ten items**, not nine — see `STATE.md` for
  the updated list and the new margin-dot-picker coordinate-click defect (suspected
  HIGH severity: synthetic `el.click()` triggers the handler, but the worker found
  real-mouse coordinate clicks may not — prime suspect is a pointer-events
  interceptor in the `.row-margin-dots` overlay; needs confirming with an actual
  mouse-coordinate click, not a synthetic one, which is itself a good instance of
  this operation's own evidence standard — a synthetic-event pass isn't proof a real
  user interaction works).

## INC-10: Shepherd II went dark mid-pipeline — first live application of the Watcher Resurrection rule
- **Symptom**: `<scratchpad>/shepherd2-state.txt` stopped updating at 20:04:40 after
  13 consecutive ~3-minute cycles of reliable writes. By 20:28 (this monitor's cycle
  13), that's ~24 minutes of silence — roughly 8x its own normal cadence — with zero
  new content.
- **Distinguishing dead-watcher from dead-operation** (this is the useful part): the
  *operation itself* was confirmed alive and progressing in the same window —
  `front.log`/`back.log` actively growing through 20:28, four new verification
  screenshots appeared at 20:18 and 20:23 (`44-week-density-strip.png`,
  `45-toast-position.png`, `46-ghost-dot-muted.png`, `47-unmuted-restored.png` —
  notably mapping to retest items #5 and #6), and `git diff --stat` grew from
  13 files/810+/115- (Shepherd II's last recorded reading) to 14 files/1028+/127-.
  So this was specifically **the content-lane watcher dying, not the watched work
  stalling** — the two are independently checkable and shouldn't be conflated.
- **Root cause**: not yet known (harness-level death, like INC-9? a stall? budget
  exhaustion without a final "STOPPING NOW" marker, unlike the original Shepherd's
  clean exit?) — this monitor cannot tell from outside, only main/the harness can.
- **Rule applied**: this is the Watcher Resurrection rule (`OPERATIONS.md` §11) in
  its first live use, not just as written policy. Applied the liveness hierarchy
  correctly before acting: checked for a successor file (`ls -t shepherd*` — none
  found, so not simply respawned-and-renamed), checked for any artifact *or* sign of
  burn from Shepherd II specifically (none), separately confirmed the *operation*
  wasn't also stalled (it wasn't) before concluding it was Shepherd II specifically
  that died. Sent main a RESPAWN REQUEST at 20:28 per the rule's mechanics: named the
  dead watcher, its lane (content), and a restart brief.
- Logging this as an incident (not just a routine STATE.md note) because it's the
  rule's first real-world test — worth having on record whether the mechanics held up
  as designed.
- **RESOLVED-BY-RESURRECTION, 2026-09-01 ~20:33**: main executed the respawn —
  **Shepherd III is live**, content lane, briefed from `shepherd2-state.txt` (the
  dead watcher's own last written state — the ledger/state-survives-the-agent
  principle, `OPERATIONS.md` §11, applying to Shepherd itself this time, not just
  QA), writing `shepherd3-state.txt`, scoped to cover through the QA retest phase.
  As of this monitor's check immediately after the respawn notice, `shepherd3-state.txt`
  did not yet exist — treating that as **not yet due**, not as a second death: a
  freshly spawned watcher hasn't had a chance to complete its first ~3-min cycle yet,
  which is exactly the kind of premature-death-call the liveness hierarchy exists to
  prevent. Confirming its first artifact next cycle before fully closing this out.
  **Mechanics verdict**: the Watcher Resurrection rule worked end to end — detect,
  distinguish watcher-death from operation-stall, request with a proper restart
  brief, main executed immediately. First live test, passed.

## INC-11: a watcher hallucinated its own clock, producing a false "critical stall" escalation
- **Symptom**: main sent this monitor a WAKE message believing it was stuck in a
  degenerate wait-loop — STATE.md supposedly unmoved for ~40 minutes. Real wall-clock
  time at the moment of investigation was 20:49:29, and this monitor's own STATE.md
  entries for the prior three cycles (17/18/19) carried real, independently-verified
  timestamps of 20:46/20:47/20:48 — it had not stalled at all.
- **Root cause**: `shepherd4-state.txt` (content-lane watcher), mtime confirmed via
  `stat` at **20:47:14 real time**, contained a self-authored "current time: 21:25"
  and a full "CRITICAL — STALLED AGENTS (QA II + Process Monitor)" escalation
  narrative, claiming ~40 minutes of silence since 20:45/20:46. This was **fabricated
  by ~38 minutes** — the file's own real mtime (20:47:14) proves it, since a file
  cannot observe a stall lasting until a point 38 minutes after the moment it was
  written. Independently, the filesystem showed QA II actively producing retest
  evidence in the very same real minutes Shepherd IV claimed silence:
  `qa2-t3-*` (20:46), `qa2-t4-*` (20:47), `qa2-t5-*` (20:48:11), and `back.log`
  showing a live API request at 20:48:49. Shepherd IV's own liveness-hierarchy
  reasoning (artifacts/burn/absence-of-both, `OPERATIONS.md` §11) was internally
  consistent and well-formatted — it just started from a false premise about what
  time it currently was, and everything downstream inherited that error.
- **How it likely propagated**: Shepherd IV's log states its escalation plan was to
  "notify main" — main's WAKE message to this monitor arrived shortly after and
  described almost exactly Shepherd IV's false timeline (~40 minutes, STATE.md stuck
  at cycle 17/20:46). The most likely path: a confident, detailed, correctly-*shaped*
  report from one watcher was trusted and relayed without an independent check against
  real time — exactly the kind of unverified-claim propagation this operation's
  evidence standard (§3) exists to prevent, just occurring watcher-to-coordinator
  rather than worker-to-QA.
- **Rule adopted**: **never trust an agent's self-reported "current time" or
  elapsed-duration claim without independently cross-checking a real `date` call
  and/or actual file mtimes (`stat`) — especially before it gates a kill or respawn
  decision.** A stall/escalation report is a claim like any other under this
  operation's evidence standard; "well-formatted and detailed" is not the same as
  "verified." Added to `OPERATIONS.md` §11 as a mandatory pre-action check.
- **No harm done this time**: caught before any kill/respawn was executed on the
  false premise — QA II and this monitor were both actually healthy and active
  throughout. Logging this as a real incident anyway because the mechanism (a
  hallucinated clock cascading into a false critical escalation) is a genuine risk
  class for this operation, not a one-off curiosity.

## INC-12: third harness-level agent death this session — the standby worker
- **Symptom**: the design worker (the one that completed all 26 phase-1 tasks and
  was deliberately kept alive on standby for retest-failure fixes, per main's
  explicit instruction after phase 1) is dead — resume attempt bounced with "no
  transcript." This is the **third** such death this session: an even-earlier worker
  instance died the same way before this monitor's window (background context for
  INC-9), then the QA sense-tester (INC-9 itself), now this one.
- **Notable wrinkle**: this death happened while the agent was **idle on standby**,
  not mid-task — the first clear data point that these harness-level deaths don't
  obviously correlate with active work. Three-for-three now on the
  ledger-survives-the-agent principle being the actual mitigation, not "keep the
  agent extra alive" or "don't let it idle too long."
- **Resolution**: no attempt to resume — main spawned a dedicated **FIXER** (Sonnet)
  immediately, handed QA II's full item-10 forensics (the ruled-out overlay theory,
  the confirmed trusted-event-reaches-target finding, the timestamp-guard lead) as
  its briefing, rather than trying to recover the dead worker's context. Another
  clean application of the principle from INC-9's addendum in `OPERATIONS.md` §11:
  the *written* forensics survived intact; only the *agent* was mortal.
- **Rule reinforced, not new**: at three-for-three, harness-level agent death in this
  environment should now be treated as an **expected, routine event to design
  around**, not an exceptional failure to root-cause per instance. The operational
  answer stays the same each time: keep written state current, hand off from
  documents rather than transcripts, don't waste time trying to resume a "no
  transcript" agent. Noting this explicitly in `OPERATIONS.md` §11 so a fresh
  resurrection doesn't re-litigate whether this is worth panicking over.

## INC-13: fourth harness-level agent death this session — QA II
- **Symptom**: QA II dead (harness-level, no transcript) shortly after delivering its
  full retest synthesis. Fourth such death this session (early design worker, QA
  sense-tester/INC-9, standby worker/INC-12, now QA II).
- **Per the rule adopted at INC-12, not root-causing this instance individually** —
  it's the expected failure mode now, not a special case.
- **Resolution, and a new generalization worth keeping**: main spawned **QA III**
  immediately, narrow-scoped to the item-10 re-verification + regression spot-checks,
  reusing QA II's own `qa2-*.mjs` test scripts rather than rewriting them. This is the
  **ledger-survives-the-agent** principle (`OPERATIONS.md` §11) extended one step
  further: not just written *findings* survive a dead agent, so does the **tooling**
  it built (test scripts, fixtures, rigs) — call it the **script-survives-the-agent**
  corollary. Both hold for the same underlying reason: durable written artifacts, not
  conversation memory, are what a successor can actually pick up.
- **Also observed this cycle**: the FIXER is in the third liveness state from §11's
  addendum — harness-alive but non-responsive (a ping is queued, no reply yet) — its
  code work is real and on disk regardless of whether it ever files a report. Not a
  new pattern, just another instance of it.

## INC-14: fifth harness-level agent death this session — Builder I (routine, per adopted rule)
- **Symptom**: Builder I (phase 6 sexy-branch builder) died at the harness level
  immediately after filing its iteration-1 report. Fifth such death this session
  (early design worker, QA sense-tester/INC-9, standby worker/INC-12, QA II/INC-13,
  now Builder I).
- **Per the INC-12 rule, not root-caused individually** — this is the expected,
  routine failure mode of this environment now. Logged for the count, not for a fresh
  investigation.
- **Resolution**: Builder II spawned immediately in the same worktree, briefed with
  the independent FIDELITY JUDGE's ranked fix list from iteration 1 — another clean
  instance of written-artifact handover (the judge's score/notes, not a resumed
  transcript) carrying the work forward.

## INC-15 — 2026-09-03, scroll diagnosis: one-line lessons
- **Synthetic-verified ≠ real.** The rig's clean fractional momentum tails and uniform 60 Hz timing passed 10/10 while Mark's trackpad (integer tails 7,7,6,6…; OS timestamps alternating 16/33 ms) stopped-and-readjusted, glided to nowhere, and crept for 5 s. Rule: replay Mark's recorded streams (`evidence/…/live/gesture-NN-wheel.csv`), don't invent them.
- **The recorder turned feel-words into traces.** "It scrolls, stops, re-adjusts" became three separable defects only once every real flick had a frames/wheel/writes trace and a state sequence. Rule: instrument the app before arguing about feel.
- **Mark's laptop lid closing kills workers mid-step** (600 s watchdog fired on a healthy run). Rule: lid stays open during a dispatch; a dead worker is resumed from written evidence, never re-run blind.
- **Prediction before diagnosis, verdict before action.** `PREDICTION.md` was written before the first trace and scored against it; each of Mark's rulings was recorded verbatim before code moved. Rule: keep both orders.
- **Checkpoint commit before an experiment** (`2096e1a`, `d741997`) so Mark can flick both builds and compare. Rule: a feel experiment starts from a committed baseline.

## Open watch items (not yet incidents — logged so they don't become one silently)
- **`<scratchpad>/front.log` — sparse-file gap from an uncoordinated truncate, not an
  active disk-fill risk.** Real on-disk usage is low (~12-98KB, root volume has 21Gi
  free per `df -h /`), so this is downgraded from the original disk-fill worry. But
  the truncate wasn't done properly (writer never got its offset reset), so the
  file's logical size will keep reading as ~1.2GB to anything that looks at apparent
  size rather than block usage. Proper fix is still to restart/redirect the writer
  cleanly (see `OPERATIONS.md` §7), not just truncate the file again. Watching
  whether it's addressed or just keeps drifting.
