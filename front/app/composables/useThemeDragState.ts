/**
 * Which theme (if any) is currently mid-drag via its `ThemeCard` header handle — shared,
 * module-level state (same shape as `useLastUsedTheme`/`useThemeVisibility`, minus persistence:
 * this is purely transient, never worth remembering across a reload).
 *
 * Exists because native HTML5 drag-and-drop only exposes a drag's payload (`getData`) inside
 * `dragstart` and `drop` — browsers withhold it during `dragover` for security. `ThemeSidebar`
 * needs to know which card is being dragged continuously while the drag is over the list (to
 * dim the source card), not just at drop time, so `ThemeCard` stashes the id here directly at
 * dragstart and clears it at dragend, instead of `ThemeSidebar` trying to divine it mid-drag.
 */
import { ref } from 'vue'

const draggingId = ref<string | null>(null)

export function useThemeDragState() {
  function start(id: string): void {
    draggingId.value = id
  }
  function end(): void {
    draggingId.value = null
  }
  return { draggingId, start, end }
}
