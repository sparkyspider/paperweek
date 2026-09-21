<script setup lang="ts">
/**
 * One task line — in a theme's backlog or scheduled onto a day card's ruled line. The
 * governing principle is "it IS paper": no checkbox, no chip/box/background/border around the
 * text — the handwriting sits directly on the line. Clicking the words themselves toggles
 * done (the ink-strike stroke draws through them); double-click to edit in place. A tiny
 * watercolor dot before the text is the only nod to its theme colour — everything else here
 * would read as UI chrome. `dotInMargin` (day-card only — NOT the same thing as `dense`, which
 * the sidebar backlog also sets, just for its own truncate/sizing) skips that inline dot: the
 * day card draws its own theme dot out in the ruled margin instead (see DaySection.vue's
 * `.row-margin-dot`), so text starts cleanly at the line rhythm's left edge, undisplaced.
 *
 * A BOLD task is a HEADING (2026-09-10) and has NO dot at all — not the inline one here, not the
 * day card's (DaySection skips its own for a bold task). Its theme colour is a watercolor
 * highlighter wash behind the words instead (`.wash-highlight`), and the theme gesture the dot
 * used to carry comes back only while the heading is being EDITED: one dot, in the ordinary
 * place, opening the ordinary swatch+name picker (`ThemePickerPopover`). Deliberately NO
 * hierarchy: a heading does not own, group or indent the lines beneath it — it is one line that
 * reads like a heading, nothing more.
 *
 * Click/dblclick collision: a real double-click fires TWO native `click` events before the
 * `dblclick` event, so listening to both independently means a completed dblclick would ALSO
 * toggle-then-toggle-back (two separate PATCHes) before edit ever opens. Instead this owns its
 * own single `@click` handler and does the dblclick detection itself: first click arms the
 * strike visually AND IMMEDIATELY (no visual debounce) via `toggleDoneDeferred`, whose actual
 * PATCH is deferred; a second click inside that same window cancels the pending PATCH, reverts
 * the visual, and opens edit instead — net effect of a completed double-click: doneAt
 * unchanged, zero PATCHes sent.
 *
 * Also the drag SOURCE (grab the line's text, draggable, stashes its id on dataTransfer); the
 * containing list owns drop handling so it can compute where in the (position-ordered) list
 * the drop landed.
 *
 * `dense` is used inside a day-strip section, where a task sits ON a single ruled line rather
 * than wrapping in the sidebar's roomier backlog list.
 */
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import type { Task } from '~/stores/tasks'
import { useTasksStore } from '~/stores/tasks'
import { useThemesStore } from '~/stores/themes'
import { useThemeVisibility } from '~/composables/useThemeVisibility'
import { useToast } from '~/composables/useToast'
import { useUndo } from '~/composables/useUndo'
import { blurActiveEditable, forceHomeEnd, isBoldShortcut } from '~/utils/textInputKeys'
import ThemePickerPopover from '~/components/shared/ThemePickerPopover.vue'

const props = withDefaults(
  defineProps<{ task: Task; color: string; dense?: boolean; dotInMargin?: boolean; themeName?: string }>(),
  { dense: false, dotInMargin: false, themeName: undefined },
)

/** Enter while editing this task's title (Mark's ask, 2026-09-08) — the parent list owns "what's
 *  the next line" (it's the one with the ordered slots), so this just reports whether the title
 *  being committed was blank; the parent decides whether that means "chain to the next task" or
 *  "last line, nothing to chain to." See DaySection.vue / AddTaskInline.vue's `onEnterNext`. */
const emit = defineEmits<{ enterNext: [payload: { empty: boolean }] }>()

const tasks = useTasksStore()
const themes = useThemesStore()
const visibility = useThemeVisibility()
const { show } = useToast()

/** A bold task IS a heading (Mark's ask, 2026-09-10) — same flag, read by intent everywhere it
 *  drives more than a font weight. A heading drops its theme DOT entirely and wears the theme
 *  colour as a watercolor wash behind the words instead (`.wash-highlight` in main.css). No
 *  hierarchy is implied or built: it does not own, group, or indent the lines beneath it. */
const isHeading = computed(() => props.task.bold)

/** Only VISIBLE themes are offered — but never a dead end: if every theme is muted, offer them
 *  all. Same rule (and the same reason) as DaySection's own `pickerThemes`; the heading's dot and
 *  the plain line's margin dot open the same picker over the same set, so a heading is never
 *  offered a different world of themes than the line under it. */
const pickerThemes = computed(() => {
  const visible = themes.active.filter(t => visibility.isVisible(t.id))
  return visible.length ? visible : themes.active
})

/** Read from the store rather than the optional `themeName` prop: only the sidebar backlog passes
 *  that prop, and the day card needs the name for the dot's label too. */
const currentThemeName = computed(() => themes.items.find(t => t.id === props.task.themeId)?.name ?? 'Theme')

const editing = ref(false)
const draft = ref(props.task.title)
const titleInput = ref<HTMLInputElement | null>(null)

/** A heading's theme gesture (Mark's ruling, 2026-09-10). At rest a heading shows no dot at all —
 *  the wash IS its theme colour. Put it in edit mode and the dot comes back, in the ordinary
 *  place (inline in the backlog; on the day card it lands at the same x its margin dot would,
 *  because DaySection skips its own for a bold task and this is the row's first flex child), and
 *  clicking it opens the SAME swatch+NAME popover the margin dot opens. Names, not bare swatches:
 *  seven-plus pastel circles are indistinguishable from one another. */
const pickerOpen = ref(false)
const pickerDotEl = ref<HTMLElement | null>(null)

/** WHICH task this open edit session belongs to — and the guard that goes with it.
 *
 *  A TaskChip is mounted per LINE SLOT, not per task: both parents key the ruled line by
 *  `slot.index` and hand this component whatever task currently occupies it. So `props.task` can
 *  become a DIFFERENT record underneath an editor that is already open, while `draft` still holds
 *  the text typed for the previous one — and a commit that trusted `props.task.id` would write one
 *  task's words onto another task's record.
 *
 *  That is not hypothetical: it happened during this feature's own verification run, silently
 *  renaming a real, unrelated backlog task. Two things stop it now — this watcher closes the
 *  editor the moment the row changes identity (the stale draft is dropped rather than saved
 *  somewhere wrong), and `commitEdit`/`pickTheme` re-check the owner before writing anything. */
const editingTaskId = ref<string | null>(null)
watch(() => props.task.id, () => {
  editing.value = false
  editingTaskId.value = null
})

/** `caretAtEnd` (default false, the original dblclick/F2/Enter-on-row gesture) select-alls, the
 *  normal rename affordance. The Enter-chain landing (`onEnterNext` in the parent) instead wants
 *  the caret parked at the END of the title it just opened, not a selection — matches "press
 *  Enter, keep typing where the last line left off" rather than "press Enter, retype the whole
 *  line." */
async function startEdit(caretAtEnd = false) {
  draft.value = props.task.title
  editingTaskId.value = props.task.id
  editing.value = true
  await nextTick()
  const el = titleInput.value
  el?.focus()
  if (caretAtEnd && el) {
    const end = el.value.length
    el.setSelectionRange(end, end)
    return
  }
  el?.select()
  // select() leaves the input's own scroll window parked wherever the browser feels like
  // after selecting-all (often the END of a long title) — disorienting: you open edit and the
  // text you see doesn't even start with the word it starts with. Anchor the visible window
  // back at the START; the selection itself is untouched, so typing/Home/End/Cmd+Right still
  // behave exactly as normal from there.
  if (el) el.scrollLeft = 0
}

// The parent list (DaySection.vue / AddTaskInline.vue) drives the Enter-chain landing by calling
// this directly on the next chip's instance — same shape as DayStrip.vue's `scrollToToday` expose.
defineExpose({ startEdit })

function commitEdit() {
  const owner = editingTaskId.value
  editing.value = false
  editingTaskId.value = null
  // The row changed identity while this editor was open — the typed text belongs to a task this
  // component no longer renders, so it is dropped rather than written onto the wrong record.
  if (owner !== props.task.id) return
  const next = draft.value.trim()
  if (next && next !== props.task.title) tasks.updateTitle(props.task.id, next)
}

function cancelEdit() {
  editing.value = false
  editingTaskId.value = null
  draft.value = props.task.title
}

/** Enter while editing (Mark's ask): commit exactly as before, then hand off to the parent to
 *  open the next line down. Read `draft` for "was this blank" BEFORE `commitEdit` runs (it
 *  doesn't clear `draft`, but read it first anyway so the emitted payload can never depend on
 *  commit's own side effects). */
function onEditEnter() {
  const empty = !draft.value.trim()
  commitEdit()
  emit('enterNext', { empty })
}

/** Cmd+B (Mark's ask) — whole-line bold, keyboard only, no button. This edits an already-saved
 *  task (unlike the draft-line composable's own `toggleBold`), so the same direct
 *  optimistic-update-with-revert `tasks.toggleBold` used elsewhere for a single-field flip
 *  (mirrors `toggleDone`) applies unchanged — no debounce/queue involved here, so no INC-16-style
 *  race with the title save to guard against. Returns whether it handled the key, so callers can
 *  short-circuit their own key handling. */
function handleBoldShortcut(e: KeyboardEvent): boolean {
  if (!isBoldShortcut(e)) return false
  e.preventDefault()
  tasks.toggleBold(props.task.id)
  return true
}

/** What choosing a theme from that popover does. Three things it must get right:
 *
 *  1. **Don't lose the typed text.** The line may be mid-rename with a dirty draft. Its text is
 *     committed as part of the SAME patch, not a separate one — see `tasks.setTheme`'s doc for
 *     why two concurrent PATCHes on one task race each other.
 *  2. **Don't duplicate the re-theme logic.** `tasks.setTheme` is the one place it lives; the
 *     day card's margin-dot picker (`DaySection.selectTheme`) calls exactly the same action.
 *  3. **End edit mode cleanly.** In the sidebar backlog a re-themed task moves to the OTHER
 *     theme's card the moment the store updates, unmounting this component — so `editing` is
 *     closed here first, before the patch, rather than left for a `@blur` that may never arrive.
 *
 *  (The popover options' own `@mousedown.prevent` is what stops the input's blur-commit from
 *  firing and tearing the row down before the click ever lands.) */
function pickTheme(themeId: string): void {
  // Same owner check as commitEdit: only carry the typed title if this editor is still open on
  // the very task it was opened on.
  const owned = editing.value && editingTaskId.value === props.task.id
  const dirty = owned ? draft.value.trim() : ''
  const pendingTitle = dirty && dirty !== props.task.title ? dirty : undefined
  editing.value = false
  editingTaskId.value = null
  if (themeId === props.task.themeId) {
    // Same theme — nothing to re-theme, but a dirty title still has to be saved, exactly as
    // closing edit mode any other way would have saved it.
    if (pendingTitle) tasks.updateTitle(props.task.id, pendingTitle)
    return
  }
  tasks.setTheme(props.task.id, themeId, pendingTitle)
}

function togglePicker(): void {
  pickerOpen.value = !pickerOpen.value
}
function onPickTheme(themeId: string): void {
  pickerOpen.value = false
  pickTheme(themeId)
}
/** Leaving edit mode by ANY route (Enter, Esc, blur, the identity watcher above) takes the dot
 *  away with it, so a popover still hanging off it would be anchored to nothing. */
watch(editing, (on) => { if (!on) pickerOpen.value = false })

function onEditKeydown(e: KeyboardEvent): void {
  forceHomeEnd(e)
  handleBoldShortcut(e)
}

/** Not-in-edit-mode row: a single real handler rather than stacking another bare `@keydown`
 *  alongside the existing `.enter`/`.space`/`.f2` modifier bindings, so behaviour doesn't depend
 *  on how Vue merges same-event listeners on one element. */
function onRowKeydown(e: KeyboardEvent): void {
  if (handleBoldShortcut(e)) return
  if (e.key === 'Enter') { e.preventDefault(); startEdit(); return }
  if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); onLineClick(e); return }
  if (e.key === 'F2') { e.preventDefault(); startEdit() }
}

/** ~300ms: both the "is this becoming a double-click" window AND the done-PATCH defer delay —
 *  deliberately the same interval (see the file doc comment above). */
const CLICK_WINDOW_MS = 300
let awaitingSecondClick = false
let clickTimer: ReturnType<typeof setTimeout> | null = null
let cancelPendingToggle: (() => void) | null = null

function clearPendingClick(): void {
  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null }
  awaitingSecondClick = false
  cancelPendingToggle = null
}

function onLineClick(e?: MouseEvent | KeyboardEvent): void {
  if (awaitingSecondClick) {
    // Nets out as a double-click: undo the first click's strike/PATCH entirely, edit instead.
    if (clickTimer) clearTimeout(clickTimer)
    cancelPendingToggle?.()
    clearPendingClick()
    startEdit()
    return
  }
  awaitingSecondClick = true
  cancelPendingToggle = tasks.toggleDoneDeferred(props.task.id, !props.task.doneAt, CLICK_WINDOW_MS)
  clickTimer = setTimeout(clearPendingClick, CLICK_WINDOW_MS)
  // Belt-and-braces alongside the `:has(input:focus)` CSS fix (task 26): a strike-toggle click
  // on this `tabindex="0"` span gives it native DOM focus as a side effect, which — with the
  // OLD `:focus-within` rule — kept the row's accent-rule lit with no caret in sight. The CSS
  // fix alone already stops that; this also drops the browser's own default focus ring so a
  // mouse-driven strike leaves a genuinely calm row (a keyboard Space-driven strike keeps focus,
  // as it should for a11y — only a pointer click blurs here).
  if (e instanceof MouseEvent) (e.currentTarget as HTMLElement | null)?.blur()
}

onBeforeUnmount(() => {
  if (clickTimer) clearTimeout(clickTimer)
  // Deliberately NOT canceling a still-pending toggle on unmount — it's mid-flight becoming a
  // real committed change (the row is going away, e.g. re-rendered elsewhere), not a click
  // collision; letting the store's own timer complete it is correct.
})

/** Same Cmd+Z entry (D-front-038) backs both this toast's own Undo button and the keyboard
 *  shortcut, so the stack never holds two ways to undo the same delete: clicking Undo here
 *  removes the pushed entry before running it, exactly as `useUndo.undoLast` removes it by
 *  popping (which also dismisses THIS toast via `attachToast`, so Cmd+Z afterward never leaves
 *  it stacked next to "Task restored").
 *
 *  `blurActiveEditable()` first — Mark's reported scenario: he's just typed a task (leaving its
 *  blank next-line draft focused), mis-clicks the (x) on an unrelated line, then reaches for
 *  Cmd+Z. Without this, that stale focus is still sitting in the OTHER draft, and the app-level
 *  shortcut correctly steps aside for native undo there instead of undoing this delete. */
function remove() {
  blurActiveEditable()
  const entry = tasks.deleteTaskQueued(props.task.id)
  if (!entry) return
  const toastId = show('Task deleted', {
    actionLabel: 'Undo',
    onAction: () => {
      useUndo().remove(entry.undoId)
      entry.undo().catch(() => show('Could not restore that task.'))
    },
  })
  useUndo().attachToast(entry.undoId, toastId)
}

/** `draggable` on the row is dropped to `false` while `editing` (see the template) — Chrome
 *  treats ANY draggable ancestor as owning mousedown-drag on its subtree, which blocks native
 *  text selection (double-click-to-select-word, click-drag-to-highlight) inside the `<input>`
 *  even though the input itself never asked to be draggable. Since the input only renders while
 *  `editing`, and dragging a row that's mid-rename was never a supported gesture anyway, gating
 *  `draggable` on `!editing` restores normal text-editing behaviour with no loss of the drag
 *  affordance outside edit mode. */
function onDragStart(e: DragEvent) {
  // Same stale-focus fix as `remove()` above — a drag started while some OTHER line's blank
  // draft is still focused must not leave Cmd+Z stuck stepping aside for that draft's native
  // undo once the drag (and its own undo entry) lands.
  blurActiveEditable()
  e.dataTransfer?.setData('text/plain', props.task.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

/** The "sticky tape" tooltip (task: truncated-title tooltip) — full title, only when the title
 *  is ACTUALLY ellipsis-clipped right now. Re-checked live on every hover/focus rather than
 *  cached: `dense` truncation depends on the row's rendered width, which can change (window
 *  resize, sidebar collapse) without this component re-rendering. */
const textEl = ref<HTMLElement | null>(null)
const tapeVisible = ref(false)
const tapePos = ref<{ top: number; left: number; flip: boolean }>({ top: 0, left: 0, flip: false })
const TAPE_DELAY_MS = 250
const TAPE_MAX_WIDTH = 280
let tapeTimer: ReturnType<typeof setTimeout> | null = null

function clearTapeTimer(): void {
  if (tapeTimer) { clearTimeout(tapeTimer); tapeTimer = null }
}

function positionTape(el: HTMLElement): void {
  const rect = el.getBoundingClientRect()
  const GAP = 8
  // No room measurement needed for the "above" case — `flip`'s own CSS transform
  // (translateY(-100%)) anchors the tape's BOTTOM at `top`, so it grows upward regardless of
  // its actual (text-dependent) height. The flip decision itself just needs a rough "is there
  // plainly not enough room above" read, not the tape's real height.
  const flip = rect.top < 60
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - TAPE_MAX_WIDTH - 8))
  tapePos.value = { left, top: flip ? rect.bottom + GAP : rect.top - GAP, flip }
}

function hideTape(): void {
  clearTapeTimer()
  if (tapeVisible.value) {
    tapeVisible.value = false
    window.removeEventListener('scroll', hideTape, true)
  }
}

function scheduleTape(): void {
  clearTapeTimer()
  tapeTimer = setTimeout(() => {
    const el = textEl.value
    // The live check this whole feature hinges on: only an ACTUALLY truncated title gets a
    // tape. Never cached — read fresh at show-time, not at mount or at hover-start.
    if (!el || el.scrollWidth <= el.clientWidth) return
    positionTape(el)
    tapeVisible.value = true
    window.addEventListener('scroll', hideTape, true)
  }, TAPE_DELAY_MS)
}

const tapeBg = computed(() => `color-mix(in srgb, ${props.color} 30%, var(--paper-raised))`)
const tapeTransform = computed(() => tapePos.value.flip ? 'rotate(-1.2deg)' : 'translateY(-100%) rotate(-1.2deg)')

onBeforeUnmount(() => {
  clearTapeTimer()
  window.removeEventListener('scroll', hideTape, true)
})
</script>

<template>
  <div
    class="group flex min-w-0 flex-1 items-end gap-1.5 transition-opacity"
    :class="[
      dense ? '' : 'py-0.5',
      { 'opacity-55': task.doneAt },
      editing ? '' : 'cursor-grab active:cursor-grabbing',
    ]"
    :draggable="!editing"
    @dragstart="onDragStart"
  >
    <!-- No dot on a HEADING at rest: its theme colour arrives as the wash behind the words, and
         a dot beside it would be the same fact said twice. `dotInMargin` (the day card, which
         draws its own dot out on the line) already suppressed this one there; the day card skips
         ITS dot for a bold task too, so a resting heading is dotless in both places. -->
    <span
      v-if="!dotInMargin && !isHeading"
      class="mb-[3px] inline-block h-1.5 w-1.5 shrink-0 rounded-full self-end"
      :style="{ background: color }"
      :title="themeName"
      aria-hidden="true"
    />

    <!-- …but a heading being EDITED gets exactly one dot back, and it is the picker trigger — the
         theme gesture a heading would otherwise have lost along with its dot. Same `.line-dot`
         control the day card uses, so it lands at the same x there and carries the same generous
         hit area (a 6px circle in a 20px box).

         Two modifiers are load-bearing, not tidiness:
         · `@mousedown.prevent` — without it the mousedown blurs the input first, `commitEdit`
           closes edit mode, this row re-renders (in the backlog it may unmount outright) and the
           click never reaches a button that no longer exists.
         · `@click.stop` — the row this sits in (`.ruled-line`, in both AddTaskInline and
           DaySection) has its own `@click` that writes a NEW draft line onto any slot that is
           currently empty. A microtask checkpoint runs between one listener returning and the
           event continuing to bubble, so Vue can re-bind that handler mid-dispatch. Measured, not
           theorised: without `.stop` an earlier version of this gesture left the source card
           holding a focused, empty `.diary-input`. -->
    <button
      v-if="editing && isHeading"
      ref="pickerDotEl"
      type="button"
      class="line-dot"
      :style="{ backgroundColor: color }"
      :title="currentThemeName"
      :aria-label="`Task theme: ${currentThemeName}. Change theme`"
      aria-haspopup="listbox"
      :aria-expanded="pickerOpen"
      @mousedown.prevent
      @click.stop="togglePicker"
    />

    <input
      v-if="editing"
      ref="titleInput"
      v-model="draft"
      type="text"
      class="font-write min-w-0 flex-1 border-0 bg-transparent text-[18px] leading-[22px] text-[var(--ink)] outline-none"
      :class="{ 'font-write--bold': task.bold, 'wash-highlight--input': isHeading }"
      :style="isHeading ? { '--wash': color } : undefined"
      @keydown="onEditKeydown"
      @keyup.enter="onEditEnter"
      @keyup.esc="cancelEdit"
      @blur="commitEdit"
    >
    <span
      v-else
      ref="textEl"
      role="button"
      tabindex="0"
      :aria-pressed="!!task.doneAt"
      :aria-label="task.doneAt ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`"
      class="font-write min-w-0 flex-1 cursor-pointer text-[18px] leading-[22px] text-[var(--ink)]"
      :class="[dense ? 'truncate' : 'break-words']"
      @click="onLineClick"
      @keydown="onRowKeydown"
      @mouseenter="scheduleTape"
      @mouseleave="hideTape"
      @focus="scheduleTape"
      @blur="hideTape"
    ><span
      :class="[task.doneAt ? 'ink-strike' : '', task.bold ? 'font-write--bold' : '', isHeading ? 'wash-highlight' : '']"
      :style="isHeading ? { '--wash': color } : undefined"
    >{{ task.title }}</span></span>

    <!-- Both glyph buttons as one snug pair, not two independent flex items spaced by the row's
         own gap-1.5 (that read as two stray marks scattered across the line-end, not a cluster).
         Zero gap BETWEEN them here: each button's own p-1 padding (part of its ≥20px hit area,
         see main.css-adjacent sizing below) already puts ~4px of breathing room on either side
         of its 13px glyph, so touching hit-boxes still leave a clean ~8px of visible space
         between the ✎ and × marks themselves — snug without the hit areas overlapping (each
         stays independently clickable). The wrapper alone takes the outer row's normal
         gap-1.5 from the task text before it. -->
    <div v-if="!editing" class="flex shrink-0 items-center self-end">
      <!-- Same optical size as the delete glyph below (13x13 in a 16x16 viewBox, 1.3 stroke) —
           hand-font glyphs for ✎/× rendered at wildly different sizes depending on the cursive
           face's own (undesigned-for) metrics for those characters; plain SVG paths sidestep
           font metrics entirely, the only way to GUARANTEE the two match. -->
      <button
        type="button"
        class="inline-flex shrink-0 items-center justify-center p-1 text-[var(--ink-faint)] opacity-0 transition-opacity hover:text-[var(--ink)] group-hover:opacity-100"
        aria-label="Edit task"
        title="Edit"
        @click="() => startEdit()"
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M11 2l3 3-8 8-3.5 1L3 10.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        class="inline-flex shrink-0 items-center justify-center p-1 text-[var(--ink-faint)] opacity-0 transition-opacity hover:text-[var(--danger)] group-hover:opacity-100"
        aria-label="Delete task"
        @click="remove"
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <ThemePickerPopover
      :open="pickerOpen"
      :trigger="pickerDotEl"
      :themes="pickerThemes"
      :selected-id="task.themeId"
      @select="onPickTheme"
      @close="pickerOpen = false"
    />

    <!-- The "sticky tape" tooltip — full title, ONLY when this title is actually ellipsis-
         truncated right now (see scheduleTape). Teleported + fixed-positioned for the same
         reason the theme picker popover is (main.css / DaySection.vue's doc comment): a `dense`
         row's own ancestors clip overflow, so an in-place tooltip would be invisible.
         pointer-events:none throughout — it must never intercept the drag/click/strike it's
         floating over. -->
    <Teleport to="body">
      <div
        v-if="tapeVisible"
        role="tooltip"
        class="task-tape font-write"
        :style="{ top: `${tapePos.top}px`, left: `${tapePos.left}px`, background: tapeBg, transform: tapeTransform }"
      >{{ task.title }}</div>
    </Teleport>
  </div>
</template>
