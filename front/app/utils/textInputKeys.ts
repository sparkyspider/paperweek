/**
 * Windows/Linux-style End/Home caret behaviour, added on top of the macOS platform default —
 * QA (task 20) found that in this app's ruled-line context, End/Home on a focused `<input>`
 * don't move the caret at all (ArrowRight/ArrowLeft work fine): a dblclick-to-edit task title,
 * selected in full by `.select()`, doesn't respond to End — the user hits End meaning "append",
 * types, and silently REPLACES the whole title instead. Root cause (confirmed by reproducing it
 * even on a bare foreign `<input>` with zero listeners of its own — nothing in the app was
 * swallowing anything): on macOS, End/Home are natively bound to scrolling the document, not
 * moving a text caret (the actual Mac idiom for "start/end of line" is Cmd+ArrowLeft/Right) —
 * there was never a handler for either key to begin with. This adds the more broadly-expected
 * behaviour explicitly, and reinforces Cmd+Arrow (already native/free on macOS, but guarded
 * here too so the same trap can't recur if that ever changes). Only calls `preventDefault` for
 * the keys it actually handles — everything else passes through untouched.
 */
export function forceHomeEnd(e: KeyboardEvent): void {
  const el = e.target as HTMLInputElement | null
  if (!el || typeof el.setSelectionRange !== 'function') return

  const toStart = e.key === 'Home' || (e.metaKey && e.key === 'ArrowLeft')
  const toEnd = e.key === 'End' || (e.metaKey && e.key === 'ArrowRight')
  if (!toStart && !toEnd) return

  e.preventDefault()
  const pos = toStart ? 0 : el.value.length
  el.setSelectionRange(pos, pos)
}
