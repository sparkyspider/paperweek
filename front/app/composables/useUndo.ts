/**
 * A tiny global session undo stack — Cmd+Z / Ctrl+Z (D-front-038). Module-level state, same
 * pattern as `useToast`, so every caller (the tasks store, the keyboard listener, a toast's own
 * Undo button) shares the same stack. Session-only: no persistence, cleared on reload.
 *
 * A pushed entry's `undo` does the actual work (cancel a pending delete, call the restore
 * route, patch a task's placement back) — this composable only sequences it: pop, run, and
 * report the outcome as a toast. Capped at 30 so a long session can't grow this without bound.
 */
import { ref, computed } from 'vue'
import { useToast } from '~/composables/useToast'

export interface UndoEntry {
  id: number
  label: string
  undo: () => Promise<void>
  /** Set via `attachToast` when a caller shows its own toast whose Undo button duplicates this
   *  entry (e.g. "Task deleted · Undo") — `undoLast` dismisses it too, so Cmd+Z never leaves
   *  that toast stacked alongside the fresh one it shows. */
  toastId?: number
}

const MAX_STACK = 30

const stack = ref<UndoEntry[]>([])
let counter = 0

export function useUndo() {
  const canUndo = computed(() => stack.value.length > 0)

  /** Registers an undo step. Returns its id so the caller can `remove` it later — e.g. when the
   *  optimistic change it belongs to fails and reverts itself before anyone undoes anything, or
   *  when a toast's own Undo button already ran the same `undo` and the stack entry is now
   *  stale. */
  function push(entry: { label: string; undo: () => Promise<void> }): number {
    const id = ++counter
    stack.value.push({ id, ...entry })
    if (stack.value.length > MAX_STACK) stack.value.shift()
    return id
  }

  function remove(id: number): void {
    const i = stack.value.findIndex(e => e.id === id)
    if (i !== -1) stack.value.splice(i, 1)
  }

  /** Links an already-pushed entry to a toast the caller showed for the same action (its id,
   *  from `useToast().show`) — see `UndoEntry.toastId`. */
  function attachToast(id: number, toastId: number): void {
    const entry = stack.value.find(e => e.id === id)
    if (entry) entry.toastId = toastId
  }

  /** Cmd+Z. Pops the most recent entry and runs it. Empty stack: silently does nothing (no
   *  toast — there is nothing to report). Success: dismisses that entry's own toast if it had
   *  one (so an old "Task deleted · Undo" never sits stacked next to the new toast), then shows
   *  a toast naming what came back. Failure: an error toast, and the entry is NOT put back — a
   *  failed undo isn't retried by pressing Cmd+Z again, since the underlying action's own error
   *  path already reported this. */
  async function undoLast(): Promise<void> {
    const entry = stack.value.pop()
    if (!entry) return
    try {
      await entry.undo()
      if (entry.toastId !== undefined) useToast().dismiss(entry.toastId)
      useToast().show(entry.label)
    } catch {
      useToast().show('Could not undo that.')
    }
  }

  return { stack, canUndo, push, remove, attachToast, undoLast }
}
