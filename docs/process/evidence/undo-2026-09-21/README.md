# Cmd+Z undo — verification evidence (2026-09-21)

Playwright script: `undo-verify.mjs` (logged in as mark@flyh2.com, drove the real UI — no store
stubbing; drags used synthetic `DragEvent`s dispatched on the app's own draggable/drop-target
elements, per the task brief's fallback for hard-to-drive HTML5 DnD). Raw pass/fail booleans and
the captured `/api/tasks*` network log are in `results.json`. Three throwaway tasks
(`undo-test-delete`, `undo-test-delete-late`, `undo-test-move`) were created under the (real,
otherwise-empty) "Personal" theme and soft-deleted again at the end of the run — final screenshot
(`11-after-cleanup.png`) and a follow-up load confirm the app is back to its pre-run state.

| Check | Result | Screenshot(s) |
|---|---|---|
| a — create, hover, click (x), Cmd+Z within 5s: restored + "Task restored" toast | **PASS** | `2a-after-delete-toast.png`, `2b-after-cmdz-restored.png` |
| f (part 1) — reload after (a): still present | **PASS** | `3-reload-after-a.png` |
| b — delete, wait 7s (past the 5s deferred commit), Cmd+Z: restored via `POST /api/tasks/:id/restore` (201), confirmed via network log + a reload's `GET /api/tasks*` | **PASS** | `5a-t2-after-delete.png`, `5b-t2-after-cmdz-late.png`, `5c-t2-reload.png` |
| c — drag backlog → Monday Morning, Cmd+Z: back in the Personal backlog + "Moved back" toast | **PASS** | `7a-t3-dropped-monday-morning.png`, `7b-t3-cmdz-back-in-backlog.png` |
| f (part 2) — reload after (c): still back in the backlog | **PASS** | `8-reload-after-c.png` |
| d — drag Monday Morning → Wednesday Morning, Cmd+Z: back on Monday Morning (not Wednesday) | **PASS** | `9a-t3-dropped-wednesday.png`, `9b-t3-cmdz-back-monday.png` |
| e — focus a task's editor, type a character, Cmd+Z: character undone by the browser; no "Moved back"/"Task restored" toast, no PATCH fired, task placement unaffected | **PASS** | `10a-typing-char.png`, `10b-after-native-undo.png` |
| Cleanup — all three throwaway tasks gone from view | **PASS** | `11-after-cleanup.png` |

Console/page errors observed during the whole run: 1 — `Failed to load resource: 401
(Unauthorized)`. Pre-existing and unrelated: it reproduces on a bare `/login` page load with none
of this session's changes involved (a pre-auth check against a protected endpoint before sign-in).

## One real finding along the way (not a bug in the feature)

The first run of this script showed checks a/b/c failing while d passed. Root cause: creating a
task via the existing "Enter chains to the next line" feature leaves a fresh empty draft
`<input>` focused, and this Chromium build (macOS defaults) does not shift focus to a plain
`<button>` on click — so that leftover focus survived right through a later hover+click on an
unrelated task's delete button. Cmd+Z correctly stayed out of the way per spec (`isEditableTarget`
saw focus in an editable target and skipped). Once the script blurred focus before each Cmd+Z
check (matching the realistic case where nothing is left mid-edit), all checks passed. No source
change was needed — this was a test-script artifact, but it's worth knowing: right after typing a
new task, Cmd+Z will legitimately do nothing until focus moves off that fresh blank line.
