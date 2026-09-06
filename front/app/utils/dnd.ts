/**
 * A LexoRank-lite: pick a `position` that sits between two neighbors without ever having to
 * renumber the rest of the list. Undefined bounds mean "start of list" / "end of list".
 */
export function positionBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return 0
  if (before === undefined) return after! - 1
  if (after === undefined) return before + 1
  return (before + after) / 2
}

/** The task id stashed by TaskChip's dragstart. */
export function taskIdFromDrag(e: DragEvent): string | null {
  return e.dataTransfer?.getData('text/plain') || null
}

/** The custom MIME type a theme-reorder drag carries on its `dataTransfer`, deliberately
 *  distinct from a task's `text/plain` (see `taskIdFromDrag`) — a theme dragged over another
 *  theme card (or a task's own drop targets, which cover most of a card's body) must never be
 *  mistaken for a task being dropped there, and vice versa. `dataTransfer.types` (but not
 *  `getData`) is readable during `dragover`, which is what makes `isThemeDrag` below safe to
 *  call from any dragover handler, not just `drop`. */
export const THEME_DRAG_MIME = 'application/x-paperweek-theme-id'

/** True while the drag in flight is a theme-reorder drag (ThemeCard's header), not a task
 *  drag. Reads only `dataTransfer.types` — safe from any `dragover` handler. */
export function isThemeDrag(e: DragEvent): boolean {
  return !!e.dataTransfer?.types.includes(THEME_DRAG_MIME)
}

/** The theme id stashed by ThemeCard's header dragstart. Only resolves inside a `drop` handler
 *  — like any drag payload, `getData` returns '' during `dragover` (browsers withhold it until
 *  drop, for security). */
export function themeIdFromDrag(e: DragEvent): string | null {
  return e.dataTransfer?.getData(THEME_DRAG_MIME) || null
}
