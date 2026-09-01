/**
 * Session-remembered "which theme did the last new day-card task use" (task 16 redesign) —
 * so a fresh task defaults to whatever you were just filing things under, rather than always
 * landing on the same fixed theme. Same module-level-ref + localStorage(try/catch) shape as
 * `useThemeVisibility`. Day-card create only — the sidebar's own "new task" always has an
 * unambiguous theme already (the card it's typed into), so it never touches this.
 */
import { ref } from 'vue'

const STORAGE_KEY = 'paperweek.last-used-theme'

const lastUsedId = ref<string | null>(load())

function load(): string | null {
  if (!import.meta.client) return null
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function persist(id: string): void {
  if (!import.meta.client) return
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch { /* ignore */ }
}

export function useLastUsedTheme() {
  function get(): string | null {
    return lastUsedId.value
  }
  function set(id: string): void {
    if (lastUsedId.value === id) return
    lastUsedId.value = id
    persist(id)
  }
  return { lastUsedId, get, set }
}
