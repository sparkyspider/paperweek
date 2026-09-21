# STATE — session close 2026-09-16

*(Resurrection point for the next session. OPERATIONS.md says how the operation runs,
LESSONS.md holds the incident-derived rules. This session (2026-09-15/16) was **ops-only** —
stack start/verify, then stack stop/verify on request — no code changes, no build/fix work.
The build/fix content below is carried forward unchanged from the 2026-09-07 close.)*

## Where everything stands

- **The app Mark uses**: branch `v2`, front normally on **:3200**, back on **:3201** — both
  **stopped** at this session's close (see Ops below); start with the commands in root
  `CLAUDE.md` §7 on resume. Postgres local, Zitadel shared at :8080 (org "Productivity"),
  left running throughout. Login mark@flyh2.com; local password file in `auth/.machinekey/`.
- **Working tree**: not clean — `git status` shows modified `CLAUDE.md`, `front/app/assets/css/
  main.css`, `front/app/components/planner/DaySection.vue`, `front/app/components/shared/
  TaskChip.vue`, `front/app/stores/tasks.ts`, plus untracked `front/app/components/shared/
  ThemePickerPopover.vue` and `docs/process/evidence/headings-2026-09-10/`. None of this was
  touched or created by this session — likely leftover from a prior session's in-progress work
  (the new `ThemePickerPopover.vue` looks like a start on the parked theme-colour-affordance
  item below). Verify/triage on resume before assuming it's addressed.
- **Latest v2 commits**: `247916c` (task-bold real heavier weight) ← `a9439ae` (Enter-while-
  editing moves to next line) ← `3807635` (surface 503 sign-in-unreachable) ← `bd29167`
  (rename productivity-tools → paperweek) ← `0ac5045` (2026-09-07 session close).

## This session (ops-only)

1. Started the local dev stack: confirmed Zitadel already running (docker container
   `zitadel-co-sy-v2-auth`, shared with co-sy-v2, untouched by us) and confirmed Postgres
   already running (untouched); started backend (`npm run start:dev`, :3201) and frontend
   (`npm run dev`, :3200) via `nohup`, verified both with 200 responses.
2. Later in the same session, shut both back down on request: killed the PID on :3200 (nuxt dev
   process) and the PID on :3201 (nest `dist/src/main` process), verified both ports now refuse
   connections (curl exit code 7 / 000).
3. Left untouched throughout: Zitadel, Postgres, and the unrelated co-sy board on :3100/:3101
   (PIDs 50904/50897) — none of those were started or touched by this session.

**Open product question for Mark** (not yet actioned, carried forward): theme colour is
currently only reachable via rename mode (dblclick name / pencil icon). Candidate fix: a colour
affordance surfaced in the existing hover controls, since the colour blob itself already toggles
visibility there.

## Ops notes (carried forward, still true)

- Docker Desktop must be running before Zitadel: `open -a Docker` then
  `docker compose -f ~/IdeaProjects/co-sy-v2/auth/docker-compose.yml up -d`.
- Back watcher can crash if `back/dist` grows a stray `prisma/` subdirectory (entry point
  becomes `dist/src/main.js`, throws `Cannot find module './app.module'`). Fix: kill the
  watcher, `rm -rf back/dist`, restart.
- Dev servers run via `nohup`, logs in the **session scratchpad** — not persistent across
  sessions; a fresh session needs its own restart, don't go looking for old logs.
- Ports **3100/3101 belong to co-sy-v2's launchd services** — never touch. This app is
  **3200/3201**.
- **Known pre-existing gap**: `npm run lint` in `back/` fails with "no configuration file
  found" — still open, not this session's regression.
- Servers were **stopped** (not left up) at this session's close — see §1/§2 above.

## Parked items (Mark's calls, no rush)

- Theme-colour affordance outside rename mode (see open product question above).
- Bold contrast in Caveat — darker ink / larger size, only if Mark asks for more punch.
- Notes-section semantics: task-shaped now; free-writing alternative undecided.
- Past-task aging: missed vs not-yet-due render identically; sepia-fade proposal open.
- `v2` → `main` merge: main is behind; merge when Mark says.
- Google login: waits on co-sy-v2 adding a Google IdP to the FlyH2 org.
- Tarryn's account: `auth/add-user.sh <email> <name>` when her email arrives.
- Sexy-branch future: kept as finished alternative (from the 2026-09-01 pipeline).

## Operating rules in force (see memory + OPERATIONS.md)

Commit protocol: standing authority to commit freely on this project; explicit paths, never
`add -A`; verify no secrets staged. Evidence before claims: every fix from the 2026-09-07 close
was verified live (Playwright interaction + read-back, and/or a back-log network capture showing
the real API call/response), not just screenshotted or asserted — see LESSONS INC-16/17/18 for
the specific repros. Retract-and-reprove over defending stale evidence. Those bugs were all
interaction-shaped (drag/focus/blur/race), not visible in a static screenshot or a
zero-console-errors pass — keep driving real pointer/keyboard sequences, not just checking for
absence of errors. (This session, 2026-09-16, was ops-only — no fixes to verify.)
