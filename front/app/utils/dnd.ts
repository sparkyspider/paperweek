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
