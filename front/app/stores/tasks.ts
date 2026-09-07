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
import { useThemeVisibility } from '~/composables/useThemeVisibility'

export type Daypart = 'morning' | 'afternoon' | 'evening' | 'notes'

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
  /** Cmd+B whole-line bold (Mark's ask, 2026-09-07) — a plain flag on the task, same as `doneAt`
   *  is for strikethrough. No per-word/rich-text formatting; the whole line or nothing. */
  bold: boolean
}

export const useTasksStore = defineStore('tasks', () => {
  const { api, messageOf, isUnreachable, session } = useApi()

  const byId = ref<Record<string, Task>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)
  const unreachable = ref(false)
  const backlogLoaded = ref<Set<string>>(new Set())
  const rangeLoaded = ref<{ from: string; to: string } | null>(null)

  /** Every queued-behind-a-timer write (deleteTaskQueued, toggleDoneDeferred) registers a
   *  synchronous keepalive-fetch trigger here, keyed by its own id, for as long as it's
   *  pending. If the tab is closing, `flushPendingCommits` below fires every one of them RIGHT
   *  NOW with `fetch(..., { keepalive: true })` instead of waiting for its setTimeout — a
   *  `keepalive` request is explicitly designed to survive the page going away, unlike the
   *  normal `api()` path (ofetch, token-refresh-aware, async — none of which is safe to lean on
   *  during unload). Best-effort, not a delivery guarantee: what the user last SAW (the
   *  optimistic local state) is what gets sent, using whatever access token is in memory right
   *  now. */
  const pendingCommits = new Map<string, () => void>()

  function flushPendingCommits(): void {
    for (const commit of pendingCommits.values()) commit()
    pendingCommits.clear()
  }

  if (import.meta.client) {
    const flush = () => flushPendingCommits()
    window.addEventListener('pagehide', flush)
    // Belt-and-braces for platforms (notably iOS Safari) where `pagehide` can be unreliable —
    // firing again on a tab backgrounding is harmless since the map is drained after each call.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    })
  }

  function authHeaders(): Record<string, string> {
    return session.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}
  }

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

  async function createBacklogTask(themeId: string, title: string, bold = false): Promise<Task | null> {
    const trimmed = title.trim()
    if (!trimmed) return null
    const tempId = `tmp_${Math.random().toString(36).slice(2)}`
    const now = new Date().toISOString()
    const optimistic: Task = {
      id: tempId, themeId, title: trimmed, notes: null, scheduledOn: null, daypart: null,
      position: backlogFor(themeId).length, doneAt: null, deletedAt: null, createdAt: now, updatedAt: now,
      bold,
    }
    byId.value[tempId] = optimistic
    try {
      const created = await api<Task>('/api/tasks', { method: 'POST', body: { themeId, title: trimmed, bold } })
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
  async function patchTask(id: string, patch: Partial<Pick<Task, 'title' | 'notes' | 'themeId' | 'scheduledOn' | 'daypart' | 'position' | 'bold'>>): Promise<void> {
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

  /** Scheduling a muted theme's task onto the week must not leave it invisible right where it
   *  was just dropped (reads as the drop deleting it) — auto-unmute the theme. Deliberately NOT
   *  in `patchTask`/`createBacklogTask`: writing into (or editing) a muted theme's OWN backlog
   *  must never change its visibility — this is capture-side only, scheduling-specific. */
  function schedule(id: string, scheduledOn: string, daypart: Daypart, position: number): Promise<void> {
    const t = byId.value[id]
    if (t) useThemeVisibility().show(t.themeId)
    return patchTask(id, { scheduledOn, daypart, position })
  }

  function unschedule(id: string, position: number): Promise<void> {
    return patchTask(id, { scheduledOn: null, daypart: null, position })
  }

  function updateTitle(id: string, title: string): Promise<void> {
    return patchTask(id, { title: title.trim() })
  }

  /** Cmd+B — same thin wrapper-over-`patchTask` shape as `updateTitle` (optimistic, revert on
   *  failure, via `patchTask`'s own snapshot/restore). Whole-line bold, no per-word formatting. */
  function toggleBold(id: string): Promise<void> {
    const t = byId.value[id]
    if (!t) return Promise.resolve()
    return patchTask(id, { bold: !t.bold })
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

  /** Same optimistic-instant visual as `toggleDone`, but the actual PATCH is deferred `delayMs`
   *  and cancelable — same delayed-commit shape as `deleteTaskQueued` below. Exists for
   *  TaskChip's click/dblclick collision handling: the strike fires immediately on a single
   *  click, but if it turns out to be the first half of a double-click, the caller invokes the
   *  returned canceller to revert `doneAt` and skip the PATCH entirely — a completed dblclick
   *  must leave `doneAt` unchanged and send zero PATCHes for the done state. */
  function toggleDoneDeferred(id: string, done: boolean, delayMs = 300): (() => void) | null {
    const t = byId.value[id]
    if (!t) return null
    const prevDoneAt = t.doneAt
    t.doneAt = done ? new Date().toISOString() : null
    const commitKey = `done:${id}`

    async function commitNow(): Promise<void> {
      pendingCommits.delete(commitKey)
      try {
        const updated = await api<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: { done } })
        byId.value[id] = updated
      } catch (e) {
        const cur = byId.value[id]
        if (cur) cur.doneAt = prevDoneAt
        error.value = messageOf(e, 'Could not update that task.')
      }
    }

    const timer = setTimeout(() => { void commitNow() }, delayMs)
    pendingCommits.set(commitKey, () => {
      clearTimeout(timer)
      pendingCommits.delete(commitKey)
      fetch(`${session.base()}/api/tasks/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ done }),
      }).catch(() => {})
    })

    return () => {
      clearTimeout(timer)
      pendingCommits.delete(commitKey)
      const cur = byId.value[id]
      if (cur) cur.doneAt = prevDoneAt
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
    const commitKey = `delete:${id}`

    async function commitNow(): Promise<void> {
      pendingDelete.delete(id)
      pendingCommits.delete(commitKey)
      try {
        await api(`/api/tasks/${id}`, { method: 'DELETE' })
      } catch (e) {
        const cur = byId.value[id]
        if (cur) cur.deletedAt = prevDeletedAt
        error.value = messageOf(e, 'Could not delete that task.')
      }
    }

    const timer = setTimeout(() => { void commitNow() }, delayMs)
    pendingDelete.set(id, { timer })
    pendingCommits.set(commitKey, () => {
      clearTimeout(timer)
      pendingDelete.delete(id)
      pendingCommits.delete(commitKey)
      fetch(`${session.base()}/api/tasks/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        keepalive: true,
        headers: authHeaders(),
      }).catch(() => {})
    })

    return () => {
      const p = pendingDelete.get(id)
      if (!p) return
      clearTimeout(p.timer)
      pendingDelete.delete(id)
      pendingCommits.delete(commitKey)
      const cur = byId.value[id]
      if (cur) cur.deletedAt = prevDeletedAt
    }
  }

  return {
    byId, all, loading, error, unreachable, backlogLoaded, rangeLoaded,
    forCell, backlogFor, fetchRange, fetchBacklog, createBacklogTask,
    patchTask, schedule, unschedule, updateTitle, toggleBold, toggleDone, toggleDoneDeferred, deleteTaskQueued,
  }
})
