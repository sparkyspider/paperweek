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

  /** Cmd+Z. Pops the most recent entry and runs it. Empty stack: silently does nothing (no
   *  toast — there is nothing to report). Success: a toast names what came back. Failure: an
   *  error toast, and the entry is NOT put back — a failed undo isn't retried by pressing
   *  Cmd+Z again, since the underlying action's own error path already reported this. */
  async function undoLast(): Promise<void> {
    const entry = stack.value.pop()
    if (!entry) return
    try {
      await entry.undo()
      useToast().show(entry.label)
    } catch {
      useToast().show('Could not undo that.')
    }
  }

  return { stack, canUndo, push, remove, undoLast }
}
