/**
 * Tasks: scheduled (on a day + daypart) or backlogged (unscheduled, under a theme). One flat
 * `byId` map is the single source of truth for both — a task moving from backlog to a day cell
 * or back again is just a PATCH of the same record, which is exactly how drag-and-drop wants
 * to treat it. Matches the API contract exactly:
 *   GET    /api/tasks?from=&to=              -> scheduled tasks in range
 *   GET    /api/tasks?themeId=&backlog=true   -> one theme's backlog
 *   POST   /api/tasks {themeId, title, notes?}            -> a new backlog task
 *   PATCH  /api/tasks/:id {title?, notes?, themeId?, scheduledOn?|null, daypart?|null,
 *                          position?, done?}
 *   DELETE /api/tasks/:id  (soft delete)
 */
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useApi } from '~/composables/useApi'

export type Daypart = 'morning' | 'afternoon' | 'evening'

export interface Task {
  id: string
  themeId: string
  title: string
  notes: string | null
  scheduledOn: string | null
  daypart: Daypart | null
  position: number
  doneAt: string | null
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export const useTasksStore = defineStore('tasks', () => {
  const { api, messageOf, isUnreachable } = useApi()

  const byId = ref<Record<string, Task>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)
  const unreachable = ref(false)
  const backlogLoaded = ref<Set<string>>(new Set())
  const rangeLoaded = ref<{ from: string; to: string } | null>(null)

  const all = computed<Task[]>(() => Object.values(byId.value).filter(t => !t.deletedAt))

  function upsertMany(list: Task[]): void {
    for (const t of list) byId.value[t.id] = t
  }

  function forCell(dateISO: string, daypart: Daypart): Task[] {
    return all.value
      .filter(t => t.scheduledOn === dateISO && t.daypart === daypart)
      .sort((a, b) => a.position - b.position)
  }

  function backlogFor(themeId: string): Task[] {
    return all.value
      .filter(t => t.themeId === themeId && !t.scheduledOn)
      .sort((a, b) => a.position - b.position)
  }

  async function fetchRange(from: string, to: string): Promise<void> {
    loading.value = true; error.value = null; unreachable.value = false
    try {
      const list = await api<Task[]>('/api/tasks', { query: { from, to } })
      upsertMany(list)
      rangeLoaded.value = { from, to }
    } catch (e) {
      error.value = messageOf(e, 'Could not load your tasks.')
      unreachable.value = isUnreachable(e)
    } finally {
      loading.value = false
    }
  }

  async function fetchBacklog(themeId: string): Promise<void> {
    try {
      const list = await api<Task[]>('/api/tasks', { query: { themeId, backlog: true } })
      upsertMany(list)
      backlogLoaded.value.add(themeId)
    } catch (e) {
      error.value = messageOf(e, 'Could not load that backlog.')
      unreachable.value = isUnreachable(e)
    }
  }

  async function createBacklogTask(themeId: string, title: string): Promise<Task | null> {
    const trimmed = title.trim()
    if (!trimmed) return null
    const tempId = `tmp_${Math.random().toString(36).slice(2)}`
    const now = new Date().toISOString()
    const optimistic: Task = {
      id: tempId, themeId, title: trimmed, notes: null, scheduledOn: null, daypart: null,
      position: backlogFor(themeId).length, doneAt: null, deletedAt: null, createdAt: now, updatedAt: now,
    }
    byId.value[tempId] = optimistic
    try {
      const created = await api<Task>('/api/tasks', { method: 'POST', body: { themeId, title: trimmed } })
      delete byId.value[tempId]
      byId.value[created.id] = created
      return created
    } catch (e) {
      delete byId.value[tempId]
      error.value = messageOf(e, 'Could not add that task.')
      return null
    }
  }

  /** Also used directly for scheduling / moving / unscheduling — they are all just a patch. */
  async function patchTask(id: string, patch: Partial<Pick<Task, 'title' | 'notes' | 'themeId' | 'scheduledOn' | 'daypart' | 'position'>>): Promise<void> {
    const t = byId.value[id]
    if (!t) return
    const prev = { ...t }
    Object.assign(t, patch)
    try {
      const updated = await api<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: patch })
      byId.value[id] = updated
    } catch (e) {
      byId.value[id] = prev
      error.value = messageOf(e, 'Could not save that change.')
    }
  }

  function schedule(id: string, scheduledOn: string, daypart: Daypart, position: number): Promise<void> {
    return patchTask(id, { scheduledOn, daypart, position })
  }

  function unschedule(id: string, position: number): Promise<void> {
    return patchTask(id, { scheduledOn: null, daypart: null, position })
  }

  function updateTitle(id: string, title: string): Promise<void> {
    return patchTask(id, { title: title.trim() })
  }

  /** Completion toggles `done`, but the server derives `doneAt` — set it optimistically so the
   *  ink-strike animation fires the instant the checkbox is clicked, not after the round-trip. */
  async function toggleDone(id: string, done: boolean): Promise<void> {
    const t = byId.value[id]
    if (!t) return
    const prev = { ...t }
    t.doneAt = done ? new Date().toISOString() : null
    try {
      const updated = await api<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: { done } })
      byId.value[id] = updated
    } catch (e) {
      byId.value[id] = prev
      error.value = messageOf(e, 'Could not update that task.')
    }
  }

  /** Soft delete, held for `delayMs` behind an Undo — same debounced-commit pattern as
   *  `themes.archiveThemeQueued`, and for the same reason: the API has no separate "restore"
   *  route, so an in-time Undo simply cancels the DELETE before it is ever sent. */
  const pendingDelete = new Map<string, { timer: ReturnType<typeof setTimeout> }>()

  function deleteTaskQueued(id: string, delayMs = 5000): (() => void) | null {
    const t = byId.value[id]
    if (!t) return null
    const prevDeletedAt = t.deletedAt
    t.deletedAt = new Date().toISOString()
    const timer = setTimeout(async () => {
      pendingDelete.delete(id)
      try {
        await api(`/api/tasks/${id}`, { method: 'DELETE' })
      } catch (e) {
        const cur = byId.value[id]
        if (cur) cur.deletedAt = prevDeletedAt
        error.value = messageOf(e, 'Could not delete that task.')
      }
    }, delayMs)
    pendingDelete.set(id, { timer })

    return () => {
      const p = pendingDelete.get(id)
      if (!p) return
      clearTimeout(p.timer)
      pendingDelete.delete(id)
      const cur = byId.value[id]
      if (cur) cur.deletedAt = prevDeletedAt
    }
  }

  return {
    byId, all, loading, error, unreachable, backlogLoaded, rangeLoaded,
    forCell, backlogFor, fetchRange, fetchBacklog, createBacklogTask,
    patchTask, schedule, unschedule, updateTitle, toggleDone, deleteTaskQueued,
  }
})
