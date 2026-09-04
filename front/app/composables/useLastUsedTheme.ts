/**
 * Session-remembered "which theme did Mark last touch" — so a fresh day-card task defaults to
 * whatever theme he was just working with, rather than always landing on the same fixed theme.
 * Same module-level-ref + localStorage(try/catch) shape as `useThemeVisibility`.
 *
 * "Touch" is deliberately broad, and set from more than one place: a day-card task's create
 * (`DaySection.vue`) or its theme picker; and, in the sidebar, any interaction inside a theme's
 * `ThemeCard` (click its header, write or edit a backlog task, start dragging one of its tasks —
 * a capturing `pointerdown`/`focusin` on the card root, since the drag itself never fires a Vue
 * event).
 *
 * A task's theme actually CHANGING also counts, and always names the theme it changed TO — not
 * just the day-card picker (`DaySection.vue`'s `selectTheme`), but dropping a task onto a
 * different theme's sidebar card too. A drop lands on the DESTINATION card, which never gets a
 * `pointerdown`/`focusin` for it (only the drag's SOURCE does, on grab), so that path is set
 * explicitly at the point of the re-theming PATCH: `ThemeCard.vue`'s `onDropEnd` (drop anywhere
 * on the card) and `AddTaskInline.vue`'s `onDropAt` (drop on a specific backlog line).
 *
 * Whichever of these happened most recently, anywhere, is the default for the next new day-card
 * task.
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
