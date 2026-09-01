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

  return { hidden, isVisible, toggle }
}
