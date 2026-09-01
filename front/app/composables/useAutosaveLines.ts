/**
 * "Write anywhere on the page" — the diary-writing model shared by the day-strip's ruled
 * lines and the sidebar backlog. `position` is now a LINE-SLOT INDEX within the section (0,
 * 1, 2, …), not a dense sort rank: a task at position 3 lives on line 3, whether or not lines
 * 0–2 are occupied. Any empty line — not just a trailing one — is clickable and writable.
 *
 * No Add/Save button anywhere: click an empty line, type, and it autosaves after a short
 * pause (or immediately on Enter/blur); Escape reverts. Writing onto (or dropping onto) an
 * already-occupied line pushes that task and its followers down one line each — the paper
 * gesture of squeezing a new line in — rather than overwriting it.
 *
 * Legacy data: tasks created before this model used dense fractional ranks. If a section's
 * saved positions aren't all distinct non-negative integers, they're laid out onto
 * consecutive line slots 0, 1, 2, … in sort order for DISPLAY ONLY — nothing is written back
 * until the user actually creates or moves something in that section.
 */
import { computed, ref } from 'vue'
import type { Daypart, Task } from '~/stores/tasks'
import { useTasksStore } from '~/stores/tasks'
import { useToast } from '~/composables/useToast'

const DEBOUNCE_MS = 600
/** Default minimum rendered lines even when a section is empty/light, so it still reads as
 *  ruled paper rather than a couple of lonely rows. Callers may override (e.g. the sidebar's
 *  many small backlog cards use a smaller floor so the whole list stays scannable). */
const DEFAULT_MIN_LINES = 6

export interface DraftLine {
  key: string
  lineIndex: number
  text: string
  lastSaved: string
  taskId: string | null
  themeId: string | null
  saving: boolean
  failed: boolean
  toastShown: boolean
}

export type LineSlot =
  | { kind: 'task'; index: number; task: Task }
  | { kind: 'draft'; index: number; draft: DraftLine }
  | { kind: 'empty'; index: number }

let uid = 0

export function useAutosaveLines(opts: {
  savedList: () => Task[]
  defaultThemeId: () => string | null
  /** Present for a day-strip section (tasks are scheduled here); omitted for a plain backlog. */
  scheduledOn?: () => string
  daypart?: () => Daypart
  minLines?: number
}) {
  const tasks = useTasksStore()
  const { show } = useToast()
  const minLines = opts.minLines ?? DEFAULT_MIN_LINES

  const activeDrafts = ref<Map<number, DraftLine>>(new Map())
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const inFlight = new Map<string, Promise<string | null>>()

  /** Saved tasks mapped onto line-slot indices — literal `position` when the section's
   *  positions are already distinct non-negative integers, otherwise laid out in sort order
   *  (display-only normalization for legacy dense-rank data). */
  const normalized = computed<Map<number, Task>>(() => {
    const sorted = [...opts.savedList()].sort((a, b) => a.position - b.position)
    const positions = sorted.map(t => t.position)
    const isSlotModel =
      positions.every(p => Number.isInteger(p) && p >= 0) &&
      new Set(positions).size === positions.length

    const map = new Map<number, Task>()
    if (isSlotModel) {
      for (const t of sorted) map.set(t.position, t)
    } else {
      sorted.forEach((t, i) => map.set(i, t))
    }
    return map
  })

  const maxIndex = computed(() => {
    let max = minLines - 1
    for (const i of normalized.value.keys()) if (i > max) max = i
    for (const i of activeDrafts.value.keys()) if (i > max) max = i
    return max
  })

  const slots = computed<LineSlot[]>(() => {
    const out: LineSlot[] = []
    for (let i = 0; i <= maxIndex.value; i++) {
      const task = normalized.value.get(i)
      const draft = activeDrafts.value.get(i)
      if (task) out.push({ kind: 'task', index: i, task })
      else if (draft) out.push({ kind: 'draft', index: i, draft })
      else out.push({ kind: 'empty', index: i })
    }
    return out
  })

  function clearTimer(key: string): void {
    const t = timers.get(key)
    if (t) { clearTimeout(t); timers.delete(key) }
  }

  /** Click an empty line — arms a live, writable draft right there. No-op if that line is
   *  already occupied (by a task or another active draft). */
  function activateLine(index: number): void {
    if (normalized.value.has(index)) return
    if (activeDrafts.value.has(index)) return
    uid += 1
    const draft: DraftLine = {
      key: `draft_${uid}`, lineIndex: index, text: '', lastSaved: '', taskId: null,
      themeId: opts.defaultThemeId(), saving: false, failed: false, toastShown: false,
    }
    activeDrafts.value.set(index, draft)
  }

  /** Shift every saved task at `index` and beyond down one line — highest index first so no
   *  two tasks ever transiently collide on the same position mid-shift. */
  async function pushDownFrom(index: number): Promise<void> {
    const toShift = [...normalized.value.entries()]
      .filter(([i]) => i >= index)
      .sort((a, b) => b[0] - a[0])
    for (const [i, task] of toShift) {
      await tasks.patchTask(task.id, { position: i + 1 })
    }
  }

  async function ensureCreated(draft: DraftLine, title: string): Promise<string | null> {
    if (draft.taskId) return draft.taskId
    const running = inFlight.get(draft.key)
    if (running) return running

    const themeId = draft.themeId ?? opts.defaultThemeId()
    if (!themeId) return null

    const promise = (async () => {
      if (normalized.value.has(draft.lineIndex)) await pushDownFrom(draft.lineIndex)
      const created = await tasks.createBacklogTask(themeId, title)
      if (!created) return null
      if (opts.scheduledOn && opts.daypart) {
        await tasks.schedule(created.id, opts.scheduledOn(), opts.daypart(), draft.lineIndex)
      } else {
        await tasks.patchTask(created.id, { position: draft.lineIndex })
      }
      return created.id
    })()
    inFlight.set(draft.key, promise)
    const id = await promise
    inFlight.delete(draft.key)
    return id
  }

  async function persist(draft: DraftLine): Promise<void> {
    clearTimer(draft.key)
    const trimmed = draft.text.trim()

    if (!trimmed) {
      if (draft.taskId) {
        const id = draft.taskId
        draft.taskId = null
        tasks.deleteTaskQueued(id, 0)
      }
      draft.lastSaved = ''
      draft.failed = false
      return
    }

    try {
      draft.saving = true
      const id = draft.taskId ?? await ensureCreated(draft, trimmed)
      if (!id) { draft.failed = true; return }
      if (draft.taskId && draft.lastSaved !== trimmed) await tasks.updateTitle(id, trimmed)
      draft.taskId = id
      draft.lastSaved = trimmed
      draft.failed = false
      draft.toastShown = false
    } catch {
      draft.failed = true
      if (!draft.toastShown) {
        draft.toastShown = true
        show('Could not save that line — it’ll retry as you keep writing.')
      }
    } finally {
      draft.saving = false
    }
  }

  function onInput(draft: DraftLine): void {
    clearTimer(draft.key)
    timers.set(draft.key, setTimeout(() => { void persist(draft) }, DEBOUNCE_MS))
  }

  /** Cancel uncommitted local edits, back to whatever was last actually saved — an untouched
   *  (never-saved) draft just goes back to being an empty, inactive line. */
  function revert(draft: DraftLine): void {
    clearTimer(draft.key)
    draft.text = draft.lastSaved
    draft.failed = false
    if (!draft.taskId && !draft.text) activeDrafts.value.delete(draft.lineIndex)
  }

  /** Commit now, and — once the line is genuinely a saved task — retire the draft object so
   *  the slot renders it as a normal task (checkbox-free line, drag source, strikethrough). */
  async function settle(draft: DraftLine): Promise<void> {
    clearTimer(draft.key)
    await persist(draft)
    if (draft.taskId && draft.text.trim()) {
      activeDrafts.value.delete(draft.lineIndex)
    } else if (!draft.taskId && !draft.text.trim()) {
      activeDrafts.value.delete(draft.lineIndex)
    }
  }

  /** External drop (from the backlog or another cell/day) landing on a specific line index —
   *  pushes down whatever's already there, same as writing a new line onto it. */
  async function dropTaskAt(taskId: string, index: number): Promise<void> {
    if (normalized.value.has(index) && normalized.value.get(index)!.id !== taskId) {
      await pushDownFrom(index)
    }
    if (opts.scheduledOn && opts.daypart) {
      await tasks.schedule(taskId, opts.scheduledOn(), opts.daypart(), index)
    } else {
      await tasks.patchTask(taskId, { themeId: opts.defaultThemeId() ?? undefined, scheduledOn: null, daypart: null, position: index })
    }
  }

  return { slots, activateLine, onInput, onEnter: settle, onBlur: settle, revert, dropTaskAt, maxIndex }
}
