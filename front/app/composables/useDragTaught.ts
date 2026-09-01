/**
 * "Has this person ever completed a drag?" — a one-time flag (localStorage, try/catch) gating
 * the first-drag teaching note (task 22): once any drag-and-drop actually lands anywhere in the
 * app, the note is retired for good. Same module-level-ref + localStorage shape as
 * useThemeVisibility/useLastUsedTheme.
 */
import { ref } from 'vue'

const STORAGE_KEY = 'paperweek.has-dragged'

const hasDragged = ref<boolean>(load())

function load(): boolean {
  if (!import.meta.client) return false
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function useDragTaught() {
  function markDragged(): void {
    if (hasDragged.value) return
    hasDragged.value = true
    if (!import.meta.client) return
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch { /* ignore */ }
  }
  return { hasDragged, markDragged }
}
