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
 *   POST   /api/tasks/:id/restore  (undo for the soft delete above — D-front-038)
 */
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useApi, backendBase } from '~/composables/useApi'
import { useThemeVisibility } from '~/composables/useThemeVisibility'
import { useLastUsedTheme } from '~/composables/useLastUsedTheme'
import { useUndo } from '~/composables/useUndo'

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
  const { api, messageOf, isUnreachable, authHeaders } = useApi()

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

  const PLACEMENT_KEYS = ['scheduledOn', 'daypart', 'position', 'themeId'] as const
  type PlacementPatch = Partial<Pick<Task, (typeof PLACEMENT_KEYS)[number]>>

  /** The undo target for a placement change — a raw patch with no undo bookkeeping of its own,
   *  so restoring a prior placement never pushes a fresh ("undo the undo") entry onto the
   *  stack. Shares `patchTask`'s optimistic-apply/revert-on-failure shape. */
  async function applyPlacementPatch(id: string, patch: PlacementPatch): Promise<void> {
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
      throw e
    }
  }

  /** Also used directly for scheduling / moving / unscheduling — they are all just a patch.
   *
   *  Every patch that touches WHERE a task lives (`scheduledOn`/`daypart`/`position`/`themeId` —
   *  schedule, unschedule, setTheme, and the backlog drop/reorder paths in useAutosaveLines and
   *  ThemeCard all funnel through here) pushes a Cmd+Z undo entry that restores the task's prior
   *  placement (D-front-038). A pure title/bold/notes patch is not a "move" and pushes nothing —
   *  Mark's ask was specifically to undo an accidental drag or delete, not ordinary typing. */
  async function patchTask(id: string, patch: Partial<Pick<Task, 'title' | 'notes' | 'themeId' | 'scheduledOn' | 'daypart' | 'position' | 'bold'>>): Promise<void> {
    const t = byId.value[id]
    if (!t) return
    const prev = { ...t }

    const isMove = PLACEMENT_KEYS.some(k => k in patch)
    let undoId: number | null = null
    if (isMove) {
      const restoreTo: PlacementPatch = {
        scheduledOn: prev.scheduledOn, daypart: prev.daypart, position: prev.position, themeId: prev.themeId,
      }
      const label = 'themeId' in patch ? 'Theme restored' : 'Moved back'
      undoId = useUndo().push({ label, undo: () => applyPlacementPatch(id, restoreTo) })
    }

    Object.assign(t, patch)
    try {
      const updated = await api<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: patch })
      byId.value[id] = updated
    } catch (e) {
      byId.value[id] = prev
      error.value = messageOf(e, 'Could not save that change.')
      if (undoId !== null) useUndo().remove(undoId)
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

  /** Re-theme a saved task — the ONE place the "change this task's theme" gesture lands, so the
   *  day card's margin-dot popover (DaySection.selectTheme) and a bold heading's own swatch row
   *  (TaskChip, which has no dot to click) cannot drift apart. Also marks that theme last-used,
   *  same as every other explicit theme pick does.
   *
   *  `title` is the heading-swatch case: clicking a swatch while the line is mid-rename must not
   *  throw the typed text away, and must not send it as a SECOND, concurrent PATCH either — two
   *  in-flight patches on one task race, and whichever response lands last overwrites the other's
   *  field (patchTask replaces the whole record with the server's copy). Folding the pending
   *  title into this one patch keeps it a single round trip with a single outcome. */
  function setTheme(id: string, themeId: string, title?: string): Promise<void> {
    const t = byId.value[id]
    if (!t) return Promise.resolve()
    useLastUsedTheme().set(themeId)
    const patch: Partial<Pick<Task, 'themeId' | 'title' | 'position'>> = { themeId }
    const trimmed = title?.trim()
    if (trimmed) patch.title = trimmed
    // A BACKLOG task keeps its `position`, and `position` is a LINE-SLOT INDEX inside one list
    // (useAutosaveLines) — so carrying it into a different theme lands it on a slot the
    // destination may already have occupied. Duplicate slots tip that whole list out of the slot
    // model into the legacy dense fallback, which silently RE-ORDERS every row in it. Append to
    // the end of the destination instead — the same thing dropping a task onto a theme card
    // already does (ThemeCard.onDropEnd). A SCHEDULED task keeps its position untouched: its slot
    // belongs to a day cell, which re-theming does not move it out of.
    if (!t.scheduledOn && t.themeId !== themeId) {
      const dest = backlogFor(themeId)
      patch.position = dest.length ? Math.max(...dest.map(x => x.position)) + 1 : 0
    }
    return patchTask(id, patch)
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
      fetch(`${backendBase()}/api/tasks/${id}`, {
        method: 'PATCH',
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

  /** POST /api/tasks/:id/restore — undo for a delete that has already committed server-side
   *  (D-front-038). Reaches a soft-deleted row the ordinary owner-scoped GET would hide. */
  async function restoreTask(id: string): Promise<void> {
    const restored = await api<Task>(`/api/tasks/${id}/restore`, { method: 'POST' })
    byId.value[id] = restored
  }

  /** Soft delete, held for `delayMs` behind an Undo — same debounced-commit pattern as
   *  `themes.archiveThemeQueued`. The Cmd+Z undo entry is pushed HERE (not by each caller) so
   *  every caller gets it for free, including `useAutosaveLines`'s "clearing a line's text
   *  deletes its task" path. Within the delay window, undo simply cancels the queued DELETE
   *  before it's ever sent; once it has actually gone out (`committed`), undo instead calls the
   *  restore route and puts the task back with `deletedAt` cleared (D-back-012) — so Undo keeps
   *  working even after the deferred commit has fired. */
  const pendingDelete = new Map<string, { timer: ReturnType<typeof setTimeout> }>()

  function deleteTaskQueued(id: string, delayMs = 5000): { undoId: number; undo: () => Promise<void> } | null {
    const t = byId.value[id]
    if (!t) return null
    const prevDeletedAt = t.deletedAt
    t.deletedAt = new Date().toISOString()
    const commitKey = `delete:${id}`
    let committed = false

    async function commitNow(): Promise<void> {
      committed = true
      pendingDelete.delete(id)
      pendingCommits.delete(commitKey)
      try {
        await api(`/api/tasks/${id}`, { method: 'DELETE' })
      } catch (e) {
        committed = false
        const cur = byId.value[id]
        if (cur) cur.deletedAt = prevDeletedAt
        error.value = messageOf(e, 'Could not delete that task.')
      }
    }

    const timer = setTimeout(() => { void commitNow() }, delayMs)
    pendingDelete.set(id, { timer })
    pendingCommits.set(commitKey, () => {
      committed = true
      clearTimeout(timer)
      pendingDelete.delete(id)
      pendingCommits.delete(commitKey)
      fetch(`${backendBase()}/api/tasks/${id}`, {
        method: 'DELETE',
        keepalive: true,
        headers: authHeaders(),
      }).catch(() => {})
    })

    async function undo(): Promise<void> {
      if (!committed) {
        const p = pendingDelete.get(id)
        if (p) {
          clearTimeout(p.timer)
          pendingDelete.delete(id)
          pendingCommits.delete(commitKey)
          const cur = byId.value[id]
          if (cur) cur.deletedAt = prevDeletedAt
          return
        }
      }
      try {
        await restoreTask(id)
      } catch (e) {
        error.value = messageOf(e, 'Could not restore that task.')
        throw e
      }
    }

    const undoId = useUndo().push({ label: 'Task restored', undo })
    return { undoId, undo }
  }

  return {
    byId, all, loading, error, unreachable, backlogLoaded, rangeLoaded,
    forCell, backlogFor, fetchRange, fetchBacklog, createBacklogTask,
    patchTask, schedule, unschedule, updateTitle, setTheme, toggleBold, toggleDone, toggleDoneDeferred, deleteTaskQueued,
  }
})
