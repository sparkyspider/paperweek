/**
 * Per-theme "show its tasks or not" — purely a client-side display filter (no API call), so
 * it's just a Set of HIDDEN theme ids persisted to localStorage (try/catch — private
 * browsing/disabled storage must never crash the planner, just fall back to "everything
 * visible"). Distinct from the themes store's own `active` (= not archived): this is a
 * lighter, reversible "mute" a user flips constantly, archiving is a soft-delete.
 */
import { ref } from 'vue'

const STORAGE_KEY = 'paperweek.hidden-themes'

const hidden = ref<Set<string>>(loadHidden())

function loadHidden(): Set<string> {
  if (!import.meta.client) return new Set()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

function persist(): void {
  if (!import.meta.client) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...hidden.value]))
  } catch { /* ignore */ }
}

export function useThemeVisibility() {
  function isVisible(themeId: string): boolean {
    return !hidden.value.has(themeId)
  }

  function toggle(themeId: string): void {
    const next = new Set(hidden.value)
    if (next.has(themeId)) next.delete(themeId)
    else next.add(themeId)
    hidden.value = next
    persist()
  }

  /** Un-mute a theme if it's currently hidden — idempotent, a no-op (no state churn, no
   *  persist) if it's already visible. Used when SCHEDULING a muted theme's task onto the week
   *  (drag to a day line, or writing straight onto one): typing into a muted theme's own
   *  backlog must NOT change its visibility (that's the placement-vs-capture line — this is
   *  capture-side, unaffected), but the moment a task actually lands on the visible week strip,
   *  leaving its theme muted would make the task invisible right where it was just dropped —
   *  reading as the drop having silently deleted it. */
  function show(themeId: string): void {
    if (!hidden.value.has(themeId)) return
    const next = new Set(hidden.value)
    next.delete(themeId)
    hidden.value = next
    persist()
  }

  return { hidden, isVisible, toggle, show }
}
