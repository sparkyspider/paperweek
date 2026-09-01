/**
 * Persisted per-week "Sat/Sun expanded" toggle (localStorage, wrapped in try/catch — private
 * browsing / disabled storage must never crash the planner, just fall back to collapsed).
 */
import { ref } from 'vue'

export function useWeekendExpanded(weekKey: string) {
  const storageKey = `paperweek.weekend-expanded.${weekKey}`
  const expanded = ref(false)

  if (import.meta.client) {
    try {
      expanded.value = localStorage.getItem(storageKey) === '1'
    } catch { /* ignore */ }
  }

  function toggle(): void {
    expanded.value = !expanded.value
    if (import.meta.client) {
      try { localStorage.setItem(storageKey, expanded.value ? '1' : '0') } catch { /* ignore */ }
    }
  }

  return { expanded, toggle }
}
