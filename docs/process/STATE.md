# STATE — session close 2026-09-21

*(Resurrection point for the next session. OPERATIONS.md says how the operation runs,
LESSONS.md holds the incident-derived rules.)*

Satellite conversion (M2, not started): see satellite-conversion-plan.md

## Where everything stands

- **The app Mark uses**: branch `v2`, front on **:3200**, back on **:3201** — both were already
  running (hot reload) throughout this session; left running at close. Postgres local, Zitadel
  shared at :8080 (org "Productivity"). Login mark@flyh2.com; local password file in
  `auth/.machinekey/`.
- **Working tree**: clean after this session's commit (see below).
- **Latest v2 commits**: undo-feature commit (this session, see below) ← `4b9fcc1` (WIP: re-theme
  a task via swatch popover — the prior session's leftover work, now committed as-is,
  unverified) ← `247916c` (task-bold real heavier weight) ← `a9439ae` (Enter-while-editing moves
  to next line) ← `3807635` (surface 503 sign-in-unreachable) ← `bd29167` (rename
  productivity-tools → paperweek) ← `0ac5045` (2026-09-07 session close).

## This session — Cmd+Z undo (delete + placement changes)

Mark's ask: he sometimes clicks the hover-revealed (x) instead of the strikethrough, and
sometimes drags a task to the wrong place; wants Cmd+Z / Ctrl+Z to undelete and un-move.

1. **Committed the 2026-09-10 leftover work first** (re-theme-via-swatch-popover), unrelated to
   this task — see `4b9fcc1`. Typecheck was clean; committed as-is per instruction, unverified
   otherwise.
2. **Backend**: `POST /api/tasks/:id/restore` (`back/src/tasks/tasks.controller.ts` /
   `tasks.service.ts`) — owner-scoped, clears `deletedAt`, reaches an already-soft-deleted row.
   Unit tests in `back/src/tasks/tasks.service.spec.ts` (own vs. someone-else's vs. missing).
   `D-back-012`.
3. **Frontend**: new `front/app/composables/useUndo.ts` (module-level session stack, capped 30,
   same pattern as `useToast`). Delete's undo lives in `tasks.ts`'s `deleteTaskQueued` (cancels
   the pending DELETE if still queued, else calls the restore route); placement undo
   (schedule/unschedule/setTheme/backlog drag-drop) is centralized in `patchTask` itself — any
   patch touching `scheduledOn`/`daypart`/`position`/`themeId` pushes an undo entry, a pure
   title/bold/notes patch pushes nothing. App-level `keydown` listener in `app.vue`
   (`isUndoShortcut`/`isEditableTarget` in `textInputKeys.ts`) — steps aside inside any
   input/textarea/contenteditable so native text-undo keeps working. `D-front-038`.
4. **Verified live** with Playwright (not stubbed) — evidence + screenshots + a short README at
   `docs/process/evidence/undo-2026-09-21/`.
5. **Follow-up fix (same day)**: the stale-focus interaction from step 4 turned out to be
   Mark's exact reported scenario (type a task, mis-click (x) on another line, Cmd+Z does
   nothing) — fixed in source, not worked around. `blurActiveEditable()`
   (`textInputKeys.ts`) blurs the stale focused field immediately and again one macrotask later
   (`setTimeout(fn, 0)`) — needed because clicking a plain `<button>` on this Chromium/macOS
   combination transiently focuses it, then the browser synchronously restores focus back to
   the stale field right after the click handler returns, so only a deferred pass actually
   catches it. Wired into `TaskChip.vue`'s `remove()`/`onDragStart()` and `ThemeCard.vue`'s
   `onHeaderDragStart()`. Also fixed: Cmd+Z restoring a delete now dismisses the older "Task
   deleted · Undo" toast (`useUndo.attachToast`) instead of stacking both. Re-verified with a
   new Playwright check (g) driving Mark's exact scenario with **no** test-side blur workaround
   — all checks a–g plus cleanup pass; evidence updated in the same folder.

**Open product question for Mark** (not yet actioned, carried forward from a prior session):
theme colour is currently only reachable via rename mode (dblclick name / pencil icon).
Candidate fix: a colour affordance surfaced in the existing hover controls, since the colour
blob itself already toggles visibility there.

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
  found" — still open, not this session's regression. `front/` has no `lint` script at all
  (checked again this session — still the case).
- Servers were **left running** (front :3200, back :3201) at this session's close — they were
  already up when the session started.

## Parked items (Mark's calls, no rush)

- Theme-colour affordance outside rename mode (see open product question above).
- Bold contrast in Caveat — darker ink / larger size, only if Mark asks for more punch.
- Notes-section semantics: task-shaped now; free-writing alternative undecided.
- Past-task aging: missed vs not-yet-due render identically; sepia-fade proposal open.
- `v2` → `main` merge: main is behind; merge when Mark says.
- Google login: waits on co-sy-v2 adding a Google IdP to the FlyH2 org.
- Tarryn's account: add her through Co-Sy when her email arrives (old add-user.sh removed 19 Oct).
- Sexy-branch future: kept as finished alternative (from the 2026-09-01 pipeline).

## Operating rules in force (see memory + OPERATIONS.md)

Commit protocol: standing authority to commit freely on this project; explicit paths, never
`add -A`; verify no secrets staged. Evidence before claims: every fix from the 2026-09-07 close
was verified live (Playwright interaction + read-back, and/or a back-log network capture showing
the real API call/response), not just screenshotted or asserted — see LESSONS INC-16/17/18 for
the specific repros. Retract-and-reprove over defending stale evidence. Those bugs were all
interaction-shaped (drag/focus/blur/race), not visible in a static screenshot or a
zero-console-errors pass — keep driving real pointer/keyboard sequences, not just checking for
absence of errors. This session's undo feature followed the same discipline — see the
Playwright evidence at `docs/process/evidence/undo-2026-09-21/` and the focus-residue finding
recorded there, caught only by driving a real keyboard/mouse sequence rather than asserting on
a snapshot.
