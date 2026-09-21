<script setup lang="ts">
/** One daypart REGION of the day card — Morning / Afternoon / Evening / Notes. Its ruled rows
 *  (`.section-lines`, painted with its OWN fresh `.ruled-paper` pattern starting at ITS top) are
 *  the whole section — no separate un-ruled label band any more (collapsed; the ghost label now
 *  lives inside row 0's own space, see `.section-watermark` in main.css). How many rows render
 *  is driven by `minLines`, a prop DayCard.vue computes from the card's actual rendered height
 *  (its line-budget policy) rather than a fixed constant — see useAutosaveLines' `minLines`
 *  getter option.
 *
 *  Write anywhere: every empty line is individually clickable and writable (useAutosaveLines
 *  — no Add button; typing autosaves; the task lands ON the line you clicked, not appended to
 *  the end). Writing onto — or dropping onto — an occupied line pushes it and its followers
 *  down one line each. */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Daypart, Task } from '~/stores/tasks'
import { useTasksStore } from '~/stores/tasks'
import { useThemesStore } from '~/stores/themes'
import { useAutosaveLines, type DraftLine } from '~/composables/useAutosaveLines'
import { useThemeVisibility } from '~/composables/useThemeVisibility'
import { useLastUsedTheme } from '~/composables/useLastUsedTheme'
import { useDragTaught } from '~/composables/useDragTaught'
import { useDragOverTracking } from '~/composables/useDragOverTracking'
import { taskIdFromDrag } from '~/utils/dnd'
import { forceHomeEnd, isBoldShortcut } from '~/utils/textInputKeys'
// Type-only — TaskChip itself is still resolved by Nuxt's auto-import in the template; this just
// gives `taskChipRefs` a real exposed-API type (mirrors DayStrip.vue's `scrollToToday` shape).
import type TaskChip from '~/components/shared/TaskChip.vue'
import ThemePickerPopover from '~/components/shared/ThemePickerPopover.vue'

const props = defineProps<{
  dateISO: string
  daypart: Daypart
  label: string
  minLines: number
  /** Only the today card's Morning section passes this — see the teaching-note markup below. */
  showFirstDragTip?: boolean
}>()

const tasks = useTasksStore()
const themes = useThemesStore()
const visibility = useThemeVisibility()
const lastUsedTheme = useLastUsedTheme()
const dragTaught = useDragTaught()
const { current: dragOverIndex, markOver: onRowDragOver, clear: clearDragOverIndex } = useDragOverTracking<number>()

/** Only VISIBLE themes' swatches on the typing picker — but never a dead end: if every theme
 *  is hidden, fall back to offering them all. */
const pickerThemes = computed(() => {
  const visible = themes.active.filter(t => visibility.isVisible(t.id))
  return visible.length ? visible : themes.active
})

/** The one-time first-drag teaching note (task 22) — `showFirstDragTip` already carries every
 *  OTHER precondition (today, nothing scheduled yet, some theme has backlog tasks to pull
 *  from); this just adds the one thing only this composable knows: whether it's already been
 *  taught. Reactive so the note vanishes the instant a drag lands anywhere (not just a reload). */
const showTeachingNote = computed(() => !!props.showFirstDragTip && !dragTaught.hasDragged.value)

/** "On paper you just write; categorising is a second gesture" (task 16 redesign) — a new
 *  line's theme is never chosen up front. It defaults quietly to whichever theme the LAST new
 *  day-card task used (session-remembered — see useLastUsedTheme), falling back to the first
 *  active theme the very first time. Nothing about this shows until the task actually exists;
 *  see the margin-dot gesture below for changing it. */
/** Deliberately NOT filtered by theme visibility (task 25) — a muted theme's already-scheduled
 *  task must still OCCUPY its line (so nothing else can silently overwrite it, and dropping
 *  something else there still pushes it down like any occupied line) even though it renders as
 *  a ghost (see the template: no text, a faded margin dot, click-to-unmute). Filtering it out
 *  of `savedList` entirely was the actual bug — the task didn't just look hidden, its LINE
 *  became available again, which is how "muting a theme" turned into "silently deleting its
 *  scheduled tasks' visible trace." */
const { slots, activateLine, onInput, onEnter, onBlur, revert, dropTaskAt, toggleBold } = useAutosaveLines({
  savedList: () => tasks.forCell(props.dateISO, props.daypart),
  defaultThemeId: () => lastUsedTheme.get() ?? pickerThemes.value[0]?.id ?? themes.items[0]?.id ?? null,
  scheduledOn: () => props.dateISO,
  daypart: () => props.daypart,
  minLines: () => props.minLines,
})

/** Cmd+B while typing/editing a draft line — routed through useAutosaveLines' own `toggleBold`
 *  (the per-draft save queue, INC-16), same as the sidebar backlog's AddTaskInline.vue. */
function onDraftKeydown(e: KeyboardEvent, draft: DraftLine): void {
  forceHomeEnd(e)
  if (isBoldShortcut(e)) {
    e.preventDefault()
    toggleBold(draft)
  }
}

const activeKey = ref<string | null>(null)
const root = ref<HTMLElement | null>(null)

function colorFor(themeId: string | null): string {
  return themes.items.find(t => t.id === themeId)?.color ?? 'var(--ink-faint)'
}

function focusDraft(index: number): void {
  const el = root.value?.querySelector<HTMLInputElement>(`[data-line-index="${index}"]`)
  el?.focus()
}

/** Click an empty line: arm it AND focus it in the same gesture — activateLine() alone only
 *  creates the reactive draft, it doesn't pull DOM focus onto the input that then renders. */
async function onClickEmpty(index: number) {
  activateLine(index)
  await nextTick()
  focusDraft(index)
}

/** Enter must CHAIN to the next line, not just try to refocus something that may not exist yet:
 *  once a draft saves, its slot becomes a plain 'task' (a TaskChip, no input) and the NEXT
 *  slot is still an inert 'empty' one — nothing with a `[data-line-index]` to find, so a bare
 *  focusDraft() silently found nothing and focus fell to <body>, discarding further typing.
 *  Route through the same activate-then-focus path a click uses instead. (If the next slot is
 *  already occupied by an existing task, activateLine() no-ops and this can't yet reach past
 *  it — a narrower gap than the reported bug, left as-is here.) */
/** Whatever theme a task actually saved under (whether the quiet default or an explicit pick
 *  via the margin-dot popover) becomes the new "last used" — so the NEXT new task keeps
 *  defaulting sensibly even if this one's theme was never touched. */
function noteThemeUsed(draft: DraftLine): void {
  if (draft.taskId && draft.themeId) lastUsedTheme.set(draft.themeId)
}

async function handleEnter(draft: DraftLine) {
  const nextIndex = draft.lineIndex + 1
  await onEnter(draft)
  noteThemeUsed(draft)
  await nextTick()
  await onClickEmpty(nextIndex)
}

async function handleBlur(draft: DraftLine) {
  await onBlur(draft)
  noteThemeUsed(draft)
}

/** Enter while editing an EXISTING task's title (TaskChip's own rename mode, not this file's
 *  write-anywhere draft lines above) — Mark's ask: chain down to the line directly below within
 *  this same day-cell/daypart. Keyed by line-slot index so it works for either kind of "next"
 *  line without the two mechanisms (TaskChip's local edit state vs. this composable's draft
 *  slots) needing to know about each other beyond this handoff. */
const taskChipRefs = new Map<number, InstanceType<typeof TaskChip>>()
function setTaskChipRef(index: number, el: unknown): void {
  if (el) taskChipRefs.set(index, el as InstanceType<typeof TaskChip>)
  else taskChipRefs.delete(index)
}

async function onEnterNextFromTask(index: number, payload: { empty: boolean }): Promise<void> {
  const nextSlot = slots.value[index + 1]
  if (nextSlot?.kind === 'task') {
    taskChipRefs.get(index + 1)?.startEdit(true)
    return
  }
  // No task on the very next line: that's "editing the last line" in the ordinary (gapless)
  // case. A title that was cleared to empty must not spawn another blank line underneath it
  // (runaway empty tasks) — just leave editing closed, which onEditEnter's commitEdit already did.
  if (payload.empty) return
  await onClickEmpty(index + 1)
}

function onDropAt(e: DragEvent, index: number) {
  clearDragOverIndex()
  const id = taskIdFromDrag(e)
  if (!id) return
  dragTaught.markDragged()
  dropTaskAt(id, index)
}

/** The theme gesture (task 16 redesign): the margin DOT itself IS the picker trigger — click
 *  either a draft row's dot (previewing its quiet default) or a saved task's dot to open a
 *  small floating list of swatch+NAME options (color alone can't identify 7+ themes at a
 *  glance). Only one open at a time, keyed by a `draft:<key>` / `task:<id>` string so the same
 *  mechanism serves both row kinds.
 *
 *  The popover itself now lives in `shared/ThemePickerPopover.vue` (2026-09-10) — a bold HEADING
 *  has no margin dot at rest, so its own edit-mode dot in TaskChip must open the SAME picker, and
 *  one implementation is the only way that stays true. Positioning, the outside-click rule and
 *  the arrow-key nav all moved there with it; this file keeps only "which row is picking". */
function themeNameFor(id: string | null): string {
  return themes.items.find(t => t.id === id)?.name ?? 'Theme'
}

type PickerTarget = { kind: 'draft'; draft: DraftLine } | { kind: 'task'; task: Task }

const pickerOpenFor = ref<string | null>(null)
/** The dot BUTTON that opened/last-toggled the popover — handed to ThemePickerPopover so its
 *  outside-click check can recognise "the click that just opened this" and not close what it
 *  just opened. The full story lives in that component's `onDocClick`. */
const pickerTriggerEl = ref<HTMLElement | null>(null)

/** The draft or task the open popover is actually choosing a theme for — factored out of the
 *  template so its markup doesn't have to re-derive a narrowed union from `slots` inline
 *  (awkward to type-check as a template expression). */
const activePickerTarget = computed<PickerTarget | null>(() => {
  const key = pickerOpenFor.value
  if (!key) return null
  for (const s of slots.value) {
    if (s.kind === 'draft' && `draft:${s.draft.key}` === key) return { kind: 'draft', draft: s.draft }
    if (s.kind === 'task' && `task:${s.task.id}` === key) return { kind: 'task', task: s.task }
  }
  return null
})
const activePickerThemeId = computed<string | null>(() => {
  const t = activePickerTarget.value
  if (!t) return null
  return t.kind === 'draft' ? t.draft.themeId : t.task.themeId
})

function togglePicker(key: string, e: MouseEvent): void {
  if (pickerOpenFor.value === key) { pickerOpenFor.value = null; pickerTriggerEl.value = null; return }
  pickerOpenFor.value = key
  pickerTriggerEl.value = e.currentTarget as HTMLElement
}
function closePicker(): void {
  pickerOpenFor.value = null
  pickerTriggerEl.value = null
}
function selectTheme(themeId: string): void {
  const target = activePickerTarget.value
  if (!target) return
  if (target.kind === 'draft') {
    // Not saved yet — nothing to PATCH, the draft just carries the choice into its own save.
    target.draft.themeId = themeId
    lastUsedTheme.set(themeId)
  } else {
    // `tasks.setTheme` is the ONE re-theme action (it marks last-used itself) — a bold heading's
    // swatch row in TaskChip calls the very same one, so the two gestures cannot drift apart.
    tasks.setTheme(target.task.id, themeId)
  }
  closePicker()
}
/** Instant clear on `dragend` (fires regardless of where/whether the drop landed, or whether the
 *  dragged row itself just unmounted) — a fast path on top of useDragOverTracking's own ~150ms
 *  self-healing decay, not a replacement for it: this is for zero visible lag on the common
 *  paths (drop, Escape-cancel), the decay is the guarantee for everything else. */
onMounted(() => document.addEventListener('dragend', clearDragOverIndex))
onBeforeUnmount(() => document.removeEventListener('dragend', clearDragOverIndex))
</script>

<template>
  <div ref="root" class="day-section">
    <div class="section-lines ruled-paper relative">
      <!-- The section's ghost label — no longer a dedicated un-ruled band above the rules
           (collapsed, per the label-geometry rework): the section's first rule now renders AT
           the section's own top (nothing un-ruled precedes it any more), and this label hangs
           just below that boundary, living inside the section's FIRST writable row rather than
           displacing it. Absolutely positioned (not a layout participant) so line 1 stays fully
           writable underneath/behind it — see .section-watermark in main.css for the exact
           offset and the z-order that lets written text read cleanly over it. -->
      <span class="section-watermark font-hand" aria-hidden="true">{{ label }}</span>

      <!-- One-time first-drag teaching note (task 22) — ghost-styled like the watermark, never
           interactive, gone for good the instant any drag lands anywhere in the app (see
           useDragTaught). All its OTHER preconditions (today, nothing scheduled yet, some
           theme actually has backlog to pull from) are decided in DayCard.vue and arrive as
           `showFirstDragTip`; this only adds "and it hasn't been taught yet". -->
      <div v-if="showTeachingNote" class="first-drag-note" aria-hidden="true">
        <svg class="first-drag-note-arrow" width="30" height="18" viewBox="0 0 30 18" fill="none">
          <path d="M28 3 C 17 1, 7 6, 3 15" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" />
          <path d="M3 15 L 7.5 12.5 M3 15 L 6.5 18.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" />
        </svg>
        <span class="font-hand first-drag-note-text">pull a task into your week…</span>
      </div>

      <div class="relative z-[1]">
        <div
          v-for="slot in slots"
          :key="slot.index"
          class="ruled-line"
          :class="[
            dragOverIndex === slot.index ? 'ruled-line--drop-target' : '',
            slot.kind === 'empty' ? 'cursor-text' : '',
          ]"
          @dragover.prevent="onRowDragOver(slot.index)"
          @drop.prevent="onDropAt($event, slot.index)"
          @click="slot.kind === 'empty' ? onClickEmpty(slot.index) : undefined"
        >
          <!-- The theme dot, INLINE now (redesign: no more margin line/gutter) — a bullet that
               reads as part of the writing, not a UI control bolted beside it (task 16 redesign,
               relocated per the margin-line removal). Still the WHOLE theme gesture: a real
               button, clickable on a draft row (previewing the quiet default before the task
               even exists) exactly the same as on a saved task row — opening the swatch+name
               popover. Its box is deliberately WIDER than the visible 6px circle
               (`.line-dot`'s own padding, see main.css) so it (a) reserves a fixed slot in the
               row's flex flow — present for every draft/task row whether or not a dot is
               actually painted yet, so text never jumps left when the dot appears — and (b)
               carries a generous click target without needing to poke outside `.ruled-line`
               (which still clips vertically to hold the row-height invariant; a plain flex child
               never needs to escape that the way the old absolutely-positioned margin dot did). -->
          <button
            v-if="slot.kind === 'task' && !visibility.isVisible(slot.task.themeId)"
            type="button"
            class="line-dot line-dot--ghost"
            :title="`${themeNameFor(slot.task.themeId)} task hidden — click to show`"
            :aria-label="`${themeNameFor(slot.task.themeId)} task hidden — click to show`"
            :style="{ backgroundColor: colorFor(slot.task.themeId) }"
            @mousedown.prevent
            @click="visibility.show(slot.task.themeId)"
          />
          <template v-else-if="slot.kind === 'task'">
            <!-- A HEADING (bold task) gets NO margin dot at all (2026-09-10) — its theme colour
                 is the wash behind its words instead (`.wash-highlight`), and the dot's other job
                 (opening the theme picker) moves onto the heading's own swatch row in TaskChip,
                 shown while it's being edited. The dot is skipped entirely rather than hidden, so
                 the heading's wash actually starts at the line's left edge like a pen stroke
                 would, instead of a blank 20px reserved for a dot that isn't there. The GHOST
                 branch above is deliberately NOT skipped for a bold task: a muted theme's task
                 renders no text, so its faded dot is the only trace it has left. -->
            <button
              v-if="!slot.task.bold"
              type="button"
              class="line-dot"
              :title="themeNameFor(slot.task.themeId)"
              :aria-label="`Task theme: ${themeNameFor(slot.task.themeId)}. Change theme`"
              aria-haspopup="listbox"
              :aria-expanded="pickerOpenFor === `task:${slot.task.id}`"
              :style="{ backgroundColor: colorFor(slot.task.themeId) }"
              @mousedown.prevent
              @click="togglePicker(`task:${slot.task.id}`, $event)"
            />
            <!-- A muted theme's scheduled task renders NO text here — the line stays occupied
                 (not writable) but shows nothing beyond its ghost dot above (task 25). -->
            <TaskChip
              :ref="(el) => setTaskChipRef(slot.index, el)"
              :task="slot.task"
              :color="colorFor(slot.task.themeId)"
              dense
              dot-in-margin
              @enter-next="(payload) => onEnterNextFromTask(slot.index, payload)"
            />
          </template>
          <template v-else-if="slot.kind === 'draft'">
            <!-- Reserves the identical slot even before there's anything to categorise — a
               `disabled`, transparent placeholder rather than conditionally omitting the button,
               so the input's own left edge never shifts when the first character makes the real
               dot appear (or on save, when this becomes a TaskChip's row above). -->
            <button
              type="button"
              class="line-dot"
              :class="{ 'line-dot--empty': !slot.draft.text.trim() }"
              :disabled="!slot.draft.text.trim()"
              :title="slot.draft.text.trim() ? themeNameFor(slot.draft.themeId) : undefined"
              :aria-label="slot.draft.text.trim() ? `Task theme: ${themeNameFor(slot.draft.themeId)}. Change theme` : undefined"
              :aria-hidden="!slot.draft.text.trim()"
              aria-haspopup="listbox"
              :aria-expanded="pickerOpenFor === `draft:${slot.draft.key}`"
              :style="slot.draft.text.trim() ? { backgroundColor: colorFor(slot.draft.themeId) } : undefined"
              @mousedown.prevent
              @click="togglePicker(`draft:${slot.draft.key}`, $event)"
            />
            <!-- No inline picker eating the line (that grew linearly worse with theme count and
                 jumped the text's left edge on save; see the dot button above instead). Draft
                 text sits at the exact same x/width a saved TaskChip's text will. -->
            <input
              :data-line-index="slot.index"
              type="text"
              :value="slot.draft.text"
              placeholder="Write here…"
              class="diary-input font-write min-w-0 flex-1 text-[18px] leading-[22px] text-[var(--ink)]"
              :class="{ 'font-write--bold': slot.draft.bold }"
              @click.stop
              @input="slot.draft.text = ($event.target as HTMLInputElement).value; onInput(slot.draft)"
              @focus="activeKey = slot.draft.key"
              @keydown="onDraftKeydown($event, slot.draft)"
              @keydown.enter.prevent="handleEnter(slot.draft)"
              @keydown.esc="revert(slot.draft); ($event.target as HTMLInputElement).blur()"
              @blur="activeKey = null; handleBlur(slot.draft)"
            >
          </template>
        </div>
      </div>
    </div>

    <ThemePickerPopover
      :open="!!pickerOpenFor"
      :trigger="pickerTriggerEl"
      :themes="pickerThemes"
      :selected-id="activePickerThemeId"
      @select="selectTheme"
      @close="closePicker"
    />
  </div>
</template>
