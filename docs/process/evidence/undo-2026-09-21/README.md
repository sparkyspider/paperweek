# Cmd+Z undo — verification evidence (2026-09-21, updated with the follow-up fixes)

Playwright script: `undo-verify.mjs` (`node undo-verify.mjs <email> <password>` — credentials are
never hardcoded; logged in as mark@flyh2.com, drove the real UI — no store stubbing; drags used
synthetic `DragEvent`s dispatched on the app's own draggable/drop-target elements, per the task
brief's fallback for hard-to-drive HTML5 DnD). Raw pass/fail booleans and the captured
`/api/tasks*` network log are in `results.json`. Four throwaway tasks (`undo-test-delete`,
`undo-test-delete-late`, `undo-test-move`, `undo-test-focus-gap`) were created under the (real,
otherwise-empty) "Personal" theme and soft-deleted again at the end of the run — final screenshot
(`12-after-cleanup.png`) confirms the app is back to its pre-run state.

**None of checks a/b/c/g use any test-side workaround** — no manual blur before Cmd+Z anywhere.
The stale-focus bug found in the first pass (below) is fixed in source, so the checks run exactly
as a person would drive them.

| Check | Result | Screenshot(s) |
|---|---|---|
| a — create, hover, click (x), Cmd+Z within 5s: restored + "Task restored" toast (and the old "Task deleted · Undo" toast is gone, not stacked) | **PASS** | `2a-after-delete-toast.png`, `2b-after-cmdz-restored.png` |
| f (part 1) — reload after (a): still present | **PASS** | `3-reload-after-a.png` |
| b — delete, wait 7s (past the 5s deferred commit), Cmd+Z: restored via `POST /api/tasks/:id/restore` (201), confirmed via network log + a reload's `GET /api/tasks*` | **PASS** | `5a-t2-after-delete.png`, `5b-t2-after-cmdz-late.png`, `5c-t2-reload.png` |
| c — drag backlog → Monday Morning, Cmd+Z: back in the Personal backlog + "Moved back" toast | **PASS** | `7a-t3-dropped-monday-morning.png`, `7b-t3-cmdz-back-in-backlog.png` |
| f (part 2) — reload after (c): still back in the backlog | **PASS** | `8-reload-after-c.png` |
| d — drag Monday Morning → Wednesday Morning, Cmd+Z: back on Monday Morning (not Wednesday) | **PASS** | `9a-t3-dropped-wednesday.png`, `9b-t3-cmdz-back-monday.png` |
| e — focus a task's editor, type a character, Cmd+Z: character undone by the browser; no "Moved back"/"Task restored" toast, no PATCH fired, task placement unaffected | **PASS** | `10a-typing-char.png`, `10b-after-native-undo.png` |
| g — Mark's exact reported scenario: type a task (leaving its blank next-line draft focused), hover **another** task, click its (x), Cmd+Z **without ever blurring by hand**: restored, "Task restored" toast, old "Task deleted" toast gone | **PASS** | `11a-t4-created-draft-focused.png`, `11b-t4-after-delete.png`, `11c-t4-after-cmdz-no-manual-blur.png` |
| Cleanup — all four throwaway tasks gone from view | **PASS** | `12-after-cleanup.png` |

Console/page errors observed during the whole run: 1 — `Failed to load resource: 401
(Unauthorized)`. Pre-existing and unrelated: it reproduces on a bare `/login` page load with none
of this session's changes involved (a pre-auth check against a protected endpoint before sign-in).

## The stale-focus finding — fixed in source (2026-09-21 follow-up)

The first run of this script (before the follow-up fix) showed checks a/b/c failing while d
passed. Root cause: creating a task via the existing "Enter chains to the next line" feature
leaves a fresh empty draft `<input>` focused, and clicking a plain `<button>` (the delete glyph)
on this Chromium/macOS combination only *transiently* moves focus to the button — the browser
then synchronously restores focus back to that same stale input right after the click handler
returns (macOS convention: a plain button never keeps focus from a mouse click). Cmd+Z was
correctly stepping aside for that stale input's native undo (`isEditableTarget`), which is
right in general but wrong here since that field was never actually being used.

This is Mark's exact reported scenario (typing a task, then mis-clicking (x) on another line,
then reaching for Cmd+Z), so it's fixed in source rather than worked around in the test:

- `front/app/utils/textInputKeys.ts` — `blurActiveEditable()` now blurs the currently active
  editable element immediately AND schedules a second attempt one macrotask later
  (`setTimeout(fn, 0)`), because the browser's revert-to-stale-input happens synchronously
  right after the click handler returns — a deferred pass is what actually catches it.
- Called from `TaskChip.vue`'s `remove()` (before queuing the delete) and `onDragStart()`, and
  from `ThemeCard.vue`'s `onHeaderDragStart()` (theme-reorder drag) — any gesture that starts a
  new action elsewhere on the page now clears stale focus first.
- Blurring an empty, never-saved draft is a no-op beyond removing it from view (the existing
  blur handler in `useAutosaveLines.settle()` already discards an empty draft and saves a dirty
  one — unchanged; verified directly before wiring the fix in).
- Cmd+Z's own guard is untouched: while a field IS genuinely focused and the user presses Cmd+Z
  without clicking/dragging anything else first (check e), native undo still wins.

Also fixed: when Cmd+Z restores a deleted task, the older "Task deleted · Undo" toast is now
dismissed at the same time (`useUndo.attachToast` + `dismiss` in `undoLast`), so only "Task
restored" shows — see `2b-after-cmdz-restored.png` and `11c-t4-after-cmdz-no-manual-blur.png`.
