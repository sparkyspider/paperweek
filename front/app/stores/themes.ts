/**
 * Life-themes: the sidebar's swatches, each with its own unscheduled-task backlog.
 * Matches the API contract exactly:
 *   GET    /api/themes?includeArchived=false -> Theme[]
 *   POST   /api/themes {name, color?}
 *   PUT    /api/themes/order {ids}  -> reorder (sidebar drag-and-drop; ids = the full active set)
 *   PATCH  /api/themes/:id {name?, color?, position?, archived?}
 *   DELETE /api/themes/:id  (soft archive)
 */
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useApi } from '~/composables/useApi'

export interface Theme {
  id: string
  name: string
  color: string
  position: number
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

/** The curated watercolor palette a new theme is picked from. */
export const THEME_PALETTE = [
  '#8fc1e3', // sky
  '#6fb3a8', // teal
  '#b9a8d9', // lavender
  '#d9a94f', // ochre
  '#c9a3a0', // warm grey-rose
  '#93ab7c', // moss
  '#cf8a6a', // clay
  '#97a3d6', // periwinkle
] as const

export const useThemesStore = defineStore('themes', () => {
  const { api, messageOf, isUnreachable } = useApi()

  const items = ref<Theme[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref<string | null>(null)
  const unreachable = ref(false)

  const active = computed<Theme[]>(() =>
    [...items.value].filter(t => !t.archivedAt).sort((a, b) => a.position - b.position),
  )

  async function fetchThemes(): Promise<void> {
    loading.value = true; error.value = null; unreachable.value = false
    try {
      items.value = await api<Theme[]>('/api/themes', { query: { includeArchived: false } })
    } catch (e) {
      error.value = messageOf(e, 'Could not load your themes.')
      unreachable.value = isUnreachable(e)
    } finally {
      loading.value = false
      loaded.value = true
    }
  }

  async function addTheme(name: string, color: string): Promise<Theme | null> {
    const trimmed = name.trim()
    if (!trimmed) return null
    const tempId = `tmp_${Math.random().toString(36).slice(2)}`
    const now = new Date().toISOString()
    const optimistic: Theme = {
      id: tempId, name: trimmed, color, position: items.value.length,
      archivedAt: null, createdAt: now, updatedAt: now,
    }
    items.value.push(optimistic)
    try {
      const created = await api<Theme>('/api/themes', { method: 'POST', body: { name: trimmed, color } })
      const i = items.value.findIndex(t => t.id === tempId)
      if (i !== -1) items.value[i] = created
      return created
    } catch (e) {
      items.value = items.value.filter(t => t.id !== tempId)
      error.value = messageOf(e, 'Could not add that theme.')
      return null
    }
  }

  async function renameTheme(id: string, name: string): Promise<void> {
    const trimmed = name.trim()
    const t = items.value.find(x => x.id === id)
    if (!t || !trimmed || trimmed === t.name) return
    const prev = t.name
    t.name = trimmed
    try {
      await api(`/api/themes/${id}`, { method: 'PATCH', body: { name: trimmed } })
    } catch (e) {
      t.name = prev
      error.value = messageOf(e, 'Could not rename that theme.')
    }
  }

  /** Drag-to-reorder in the sidebar: `orderedIds` is the caller's complete, ordered set of
   *  active theme ids (front to back). Optimistic — positions update locally immediately, so
   *  the drop feels instant — then `PUT /api/themes/order` commits it; a failure (a fellow
   *  archive/create racing the drag, a network blip) reverts every touched position back to
   *  what it was and surfaces the message the same way every other theme action does
   *  (`error.value`). Server response is authoritative once it lands (reconciled below), not
   *  just trusted blind, since `archived`/`position` could theoretically have moved under us. */
  async function reorderThemes(orderedIds: string[]): Promise<void> {
    const prevPositions = new Map(items.value.map(t => [t.id, t.position]))
    orderedIds.forEach((id, index) => {
      const t = items.value.find(x => x.id === id)
      if (t) t.position = index
    })
    try {
      const updated = await api<Theme[]>('/api/themes/order', { method: 'PUT', body: { ids: orderedIds } })
      for (const u of updated) {
        const t = items.value.find(x => x.id === u.id)
        if (t) t.position = u.position
      }
    } catch (e) {
      for (const [id, position] of prevPositions) {
        const t = items.value.find(x => x.id === id)
        if (t) t.position = position
      }
      error.value = messageOf(e, 'Could not reorder your themes.')
    }
  }

  async function recolorTheme(id: string, color: string): Promise<void> {
    const t = items.value.find(x => x.id === id)
    if (!t) return
    const prev = t.color
    t.color = color
    try {
      await api(`/api/themes/${id}`, { method: 'PATCH', body: { color } })
    } catch (e) {
      t.color = prev
      error.value = messageOf(e, 'Could not change that theme’s color.')
    }
  }

  /** Archive, softly: the theme disappears from the sidebar immediately, but the DELETE call
   *  itself is held for `delayMs` so an "Undo" press can cancel it outright — no separate
   *  restore endpoint is needed because, from the API's point of view, nothing happened yet. */
  const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; theme: Theme }>()

  function archiveThemeQueued(id: string, delayMs = 5000): (() => void) | null {
    const t = items.value.find(x => x.id === id)
    if (!t) return null
    items.value = items.value.filter(x => x.id !== id)
    const timer = setTimeout(async () => {
      pending.delete(id)
      try {
        await api(`/api/themes/${id}`, { method: 'DELETE' })
      } catch (e) {
        // The archive failed server-side after all — restore it rather than lose it silently.
        items.value.push(t)
        error.value = messageOf(e, 'Could not archive that theme.')
      }
    }, delayMs)
    pending.set(id, { timer, theme: t })

    return () => {
      const p = pending.get(id)
      if (!p) return
      clearTimeout(p.timer)
      pending.delete(id)
      items.value.push(p.theme)
      items.value.sort((a, b) => a.position - b.position)
    }
  }

  return {
    items, active, loading, loaded, error, unreachable,
    fetchThemes, addTheme, renameTheme, recolorTheme, reorderThemes, archiveThemeQueued,
  }
})
