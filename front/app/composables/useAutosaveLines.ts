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
 *  ruled paper rather than a couple of lonely rows. Used by the day-strip sections, which want
 *  a fixed floor regardless of task count. The sidebar backlog instead uses `dynamicTrailing`
 *  (below) — it wants exactly one trailing blank line, not a fixed floor. */
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
  /** Cmd+B, mirrors `Task.bold` — live on the draft before the line has ever saved, so toggling
   *  bold while typing a brand-new line (no `taskId` yet) has somewhere to live; `persistNow`
   *  carries it into the create call, same as the typed title. */
  bold: boolean
  /** What the backend last actually confirmed for `bold` — same role as `lastSaved` plays for
   *  `text`, so `persistNow` only issues a PATCH when the flag has genuinely changed since the
   *  last save, not on every debounce/settle pass. */
  lastSavedBold: boolean
}

export type LineSlot =
  | { kind: 'task'; index: number; task: Task }
  | { kind: 'draft'; index: number; draft: DraftLine }
  | { kind: 'empty'; index: number }

/** The number of ruled line-slots a task list needs to show every task — the highest occupied
 *  slot index + 1 (accounting for gaps left by tasks NOT at consecutive positions), or, for
 *  legacy dense-rank data (see the module doc above), simply the count laid out 0..n-1. Pure
 *  and side-effect-free so callers outside a section's own composable instance (DayCard.vue's
 *  line-budget calculation) can ask "how many rows will this list occupy" without standing up a
 *  whole second `useAutosaveLines` — it mirrors exactly the `normalized` logic below. */
export function occupiedLineCount(list: Task[]): number {
  if (!list.length) return 0
  const sorted = [...list].sort((a, b) => a.position - b.position)
  const positions = sorted.map(t => t.position)
  const isSlotModel =
    positions.every(p => Number.isInteger(p) && p >= 0) &&
    new Set(positions).size === positions.length
  return isSlotModel ? Math.max(...positions) + 1 : sorted.length
}

let uid = 0

export function useAutosaveLines(opts: {
  savedList: () => Task[]
  defaultThemeId: () => string | null
  /** Present for a day-strip section (tasks are scheduled here); omitted for a plain backlog. */
  scheduledOn?: () => string
  daypart?: () => Daypart
  /** A getter (not a plain number) so a caller can drive it from a reactive layout computation
   *  — DayCard.vue's per-section line budget — and have it actually update. */
  minLines?: () => number
  /** Sidebar-backlog mode: instead of a fixed `minLines` floor, always render exactly one
   *  trailing blank line after the last occupied one — an empty theme shows 1 blank line, N
   *  tasks show N lines + 1 blank, never more, never a dead end. A line counts as "occupied"
   *  the moment it has non-empty text (even mid-debounce, before the save round-trips), so the
   *  next blank appears the instant you start typing on the current last line. */
  dynamicTrailing?: boolean
}) {
  const tasks = useTasksStore()
  const { show } = useToast()
  const minLines = () => opts.minLines?.() ?? DEFAULT_MIN_LINES
  const dynamicTrailing = opts.dynamicTrailing ?? false

  const activeDrafts = ref<Map<number, DraftLine>>(new Map())
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const inFlight = new Map<string, Promise<string | null>>()
  /** Per-draft save queue (task 28 — truncated-title bug) — see `persist` below for the failure
   *  this closes. */
  const saveQueue = new Map<string, Promise<void>>()

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
    if (dynamicTrailing) {
      let lastOccupied = -1
      for (const i of normalized.value.keys()) if (i > lastOccupied) lastOccupied = i
      for (const [i, d] of activeDrafts.value.entries()) {
        if (d.text.trim() !== '' && i > lastOccupied) lastOccupied = i
      }
      let max = lastOccupied + 1
      for (const i of activeDrafts.value.keys()) if (i > max) max = i
      return max
    }
    let max = minLines() - 1
    for (const i of normalized.value.keys()) if (i > max) max = i
    for (const i of activeDrafts.value.keys()) if (i > max) max = i
    return max
  })

  const slots = computed<LineSlot[]>(() => {
    const out: LineSlot[] = []
    for (let i = 0; i <= maxIndex.value; i++) {
      const task = normalized.value.get(i)
      const draft = activeDrafts.value.get(i)
      // A live draft ALWAYS wins its slot over a same-index task, for as long as it's active.
      // activateLine() refuses to arm a draft over a line a saved task already occupies, so the
      // only task that can ever appear at a drafted index is the one the draft itself is in the
      // middle of creating — including the optimistic `tmp_…`-id row `createBacklogTask` puts
      // in the store BEFORE its network round trip even starts, well before `persist()` gets a
      // real id back to assign to `draft.taskId`. Falling through to the 'task' branch during
      // that window (or the ID-matching version of this check tried first, which still failed
      // during it) used to unmount the focused <input> mid-keystroke the instant the debounced
      // autosave fired, discarding everything typed after — the reported "debounce eats my
      // typing" bug. The draft is only ever retired (and the row swapped to a TaskChip) by
      // `settle()`, on Enter/blur/Escape+blur — never merely because a backing task exists.
      if (draft) out.push({ kind: 'draft', index: i, draft })
      else if (task) out.push({ kind: 'task', index: i, task })
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
      bold: false, lastSavedBold: false,
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
      const created = await tasks.createBacklogTask(themeId, title, draft.bold)
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

  /** Real typing pauses mid-title (a breath before the next word) reliably exceed `DEBOUNCE_MS`
   *  — the debounce fires and starts saving whatever's typed SO FAR ("Review"), then Enter/blur
   *  (or the next pause) fires a SECOND save with the fuller text ("Review Trevor Feedback")
   *  before the first one's round trip has even returned. Both calls used to run concurrently:
   *  whichever's network response landed LAST won, and it wrote whatever `trimmed` text IT
   *  personally captured back when IT was invoked — which, for the earlier/shorter-text call,
   *  could be stale by the time it actually lands. That's the reported bug: a title silently
   *  regressing to its first word (or fewer) after Enter, because the short-text call's PATCH
   *  arrived after the full-text one's and clobbered it. Root cause file:line at the time this
   *  was diagnosed: `persist` being invoked directly, letting two overlapping calls both reach
   *  the `draft.taskId && draft.lastSaved !== trimmed` guard with their own frozen `trimmed`.
   *  Fix: serialize every persist for a given draft through one queue — a call's body doesn't
   *  actually START (and doesn't read `draft.text` for its `trimmed` snapshot) until every
   *  earlier call for that same draft has fully finished, so the text it captures and saves is
   *  never older than what the previous save already committed. `ensureCreated`'s own `inFlight`
   *  map still exists as a second line of defense but should no longer see concurrent callers for
   *  the same draft now that this queues them. */
  function persist(draft: DraftLine): Promise<void> {
    clearTimer(draft.key)
    const prior = saveQueue.get(draft.key) ?? Promise.resolve()
    const run = prior.then(() => persistNow(draft))
    // Swallow so a failed save doesn't permanently wedge the queue for this draft — persistNow
    // already records failure on the draft itself (draft.failed / the toast).
    saveQueue.set(draft.key, run.catch(() => {}))
    return run
  }

  async function persistNow(draft: DraftLine): Promise<void> {
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
      // Both checks gate on `draft.taskId` (the value BEFORE `ensureCreated` may have just set
      // it below) for the same reason: a task created by `ensureCreated` this pass already
      // carries the current text/bold from the create call itself (title + `draft.bold`, see
      // `ensureCreated`) — only an ALREADY-existing task needs a follow-up PATCH here.
      if (draft.taskId && draft.lastSaved !== trimmed) await tasks.updateTitle(id, trimmed)
      if (draft.taskId && draft.lastSavedBold !== draft.bold) await tasks.patchTask(id, { bold: draft.bold })
      draft.taskId = id
      draft.lastSaved = trimmed
      draft.lastSavedBold = draft.bold
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

  /** Cmd+B on a not-yet-saved (or still being typed) line. Flips the flag right away (so the
   *  line reads bold instantly) and routes the save through the same per-draft `persist` queue
   *  as the title (INC-16) — not a separate immediate PATCH — so a bold toggle mid-typing can't
   *  race the debounced title save; if the line hasn't become a task yet, the flag simply rides
   *  along on the eventual create call (see `ensureCreated`/`persistNow` above). */
  function toggleBold(draft: DraftLine): Promise<void> {
    draft.bold = !draft.bold
    return persist(draft)
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

  return { slots, activateLine, onInput, onEnter: settle, onBlur: settle, revert, dropTaskAt, maxIndex, toggleBold }
}
