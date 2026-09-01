<script setup lang="ts">
/** One daypart REGION of the day card — Morning / Afternoon / Evening / Notes. Two parts, each
 *  exactly `--line-h` rhythm units tall:
 *   1. `.section-band` — ONE full ruling-unit of deliberately UN-RULED space leading the
 *      section, holding its ghost label (right-aligned, vertically centred, faint) — this is
 *      simultaneously the boundary gap from the previous section AND this section's label, so
 *      no writable line ever has ghost text under it. All four sections (Morning included) lead
 *      with one, so they behave identically.
 *   2. `.section-lines` — the actual ruled rows, painted with its OWN fresh `.ruled-paper`
 *      pattern (starting at ITS top, not the card's), so the band above it never throws the
 *      rule/text phase off. How many rows it renders is driven by `minLines`, a prop DayCard.vue
 *      computes from the card's actual rendered height (its line-budget policy) rather than a
 *      fixed constant — see useAutosaveLines' `minLines` getter option.
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
import { taskIdFromDrag } from '~/utils/dnd'
import { forceHomeEnd } from '~/utils/textInputKeys'

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
const dragOverIndex = ref<number | null>(null)

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
const { slots, activateLine, onInput, onEnter, onBlur, revert, dropTaskAt } = useAutosaveLines({
  savedList: () => tasks.forCell(props.dateISO, props.daypart),
  defaultThemeId: () => lastUsedTheme.get() ?? pickerThemes.value[0]?.id ?? themes.items[0]?.id ?? null,
  scheduledOn: () => props.dateISO,
  daypart: () => props.daypart,
  minLines: () => props.minLines,
})

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

function onDropAt(e: DragEvent, index: number) {
  dragOverIndex.value = null
  const id = taskIdFromDrag(e)
  if (!id) return
  dragTaught.markDragged()
  dropTaskAt(id, index)
}

/** The theme gesture (task 16 redesign): the margin DOT itself IS the picker trigger — click
 *  either a draft row's dot (previewing its quiet default) or a saved task's dot to open a
 *  small floating list of swatch+NAME options (color alone can't identify 7+ themes at a
 *  glance). Teleported to <body> and positioned from the trigger's own
 *  `getBoundingClientRect()` (not just `position: absolute` in place) because `.ruled-line`
 *  clips overflow on both axes to hold the one-grid-unit row height — an in-place popover would
 *  be silently clipped exactly like the margin dot was before that got pulled out too. Only one
 *  open at a time, keyed by a `draft:<key>` / `task:<id>` string so the same mechanism serves
 *  both row kinds. */
function themeNameFor(id: string | null): string {
  return themes.items.find(t => t.id === id)?.name ?? 'Theme'
}

type PickerTarget = { kind: 'draft'; draft: DraftLine } | { kind: 'task'; task: Task }

const pickerOpenFor = ref<string | null>(null)
const pickerPos = ref<{ top: number; left: number }>({ top: 0, left: 0 })
const pickerEl = ref<HTMLElement | null>(null)
/** The dot BUTTON that opened/last-toggled the popover — set in `togglePicker`, read by
 *  `onDocClick` below. Root-caused bug (task 27): `onDocClick` is a real, non-Vue
 *  `document.addEventListener('click', …)` (needed so it also catches clicks OUTSIDE this
 *  component's own tree, e.g. on another day-section's dot or empty page background — a Vue
 *  `@click` binding only ever sees clicks inside its own template). Because a native click
 *  bubbles all the way to `document` in the SAME synchronous dispatch as the click that just
 *  opened the popover (target-phase `togglePicker` runs first, then bubbling continues up
 *  through this exact button to `document`), `onDocClick` used to see that SAME click, find
 *  `pickerOpenFor.value` already truthy (togglePicker had just set it) and the click's target
 *  sitting outside `pickerEl` (the popover, being freshly opened, may not even be rendered yet
 *  this same tick) — and call `closePicker()` immediately, undoing the open before a single
 *  frame painted. Real mouse clicks (mousedown → mouseup → click, all trusted, all bubbling)
 *  hit this every time; `el.click()` in a test happened to dodge it by whatever else differed
 *  in that call's dispatch, which is what made this look automation-only. The fix: `onDocClick`
 *  must recognise "the click that just opened/toggled this popover" and not treat it as an
 *  outside click — comparing against the actual trigger BUTTON (not just `pickerEl`, the
 *  popover panel itself, which is a separate, later-mounted element). */
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
  const trigger = e.currentTarget as HTMLElement
  const rect = trigger.getBoundingClientRect()
  pickerPos.value = { top: rect.bottom + 4, left: rect.left }
  pickerOpenFor.value = key
  pickerTriggerEl.value = trigger
}
function closePicker(): void {
  pickerOpenFor.value = null
  pickerTriggerEl.value = null
}
function selectTheme(themeId: string): void {
  const target = activePickerTarget.value
  if (!target) return
  if (target.kind === 'draft') {
    target.draft.themeId = themeId
  } else {
    tasks.patchTask(target.task.id, { themeId })
  }
  lastUsedTheme.set(themeId)
  closePicker()
}
/** Cheap keyboard nav within the open list — Tab already reaches every option and Enter/Space
 *  already activates one (they're plain buttons), so this only adds the extra affordance of
 *  Arrow keys moving focus between them without leaving the list. */
function onPickerKeydown(e: KeyboardEvent): void {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  e.preventDefault()
  const items = Array.from(pickerEl.value?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])
  if (!items.length) return
  const i = items.indexOf(document.activeElement as HTMLElement)
  const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length
  items[next]?.focus()
}
function onDocClick(e: MouseEvent): void {
  if (!pickerOpenFor.value) return
  const target = e.target as Node
  // The click that just opened (or re-toggled) this popover bubbles to `document` in the SAME
  // synchronous dispatch — it must not read as an "outside" click and immediately close what
  // it just opened (see the doc comment on `pickerTriggerEl` above).
  if (pickerTriggerEl.value && pickerTriggerEl.value.contains(target)) return
  if (pickerEl.value && !pickerEl.value.contains(target)) closePicker()
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div ref="root" class="day-section">
    <div class="section-band">
      <span class="section-watermark font-hand" aria-hidden="true">{{ label }}</span>
    </div>

    <div class="section-lines ruled-paper relative">
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

      <!-- Each occupied row's theme dot, out in the margin gutter — a separate
           absolutely-positioned overlay rather than a child of its `.ruled-line` (which clips: a
           row must clip overflow vertically to hold the one-grid-unit height invariant, and CSS
           computes a lone `overflow-x: visible` up to `auto` the moment the other axis isn't
           visible too — so a dot living inside the row and poking out to its left would silently
           get clipped anyway; see main.css's `.row-margin-dot` positioning). Now doubles as the
           WHOLE theme gesture (task 16 redesign): it's a real button, clickable on a draft row
           (previewing the quiet default before the task even exists) exactly the same as on a
           saved task row — opening the swatch+name popover to set or change it. A draft with no
           text yet shows no dot: nothing to categorise before there's anything written. One
           position per occupied slot, computed from the same line-slot index the row itself
           renders at, relative to THIS wrapper's own top (row 0), not the section's (which would
           be one band-height off). Anchored near the row's BOTTOM, not its middle — the task
           text itself is bottom-aligned (`.ruled-line`'s flex-end + 4px padding-bottom), so a
           mid-row dot rides visibly high above the words it marks. 9px above the rule ≈ the 4px
           text padding-bottom plus ~0.3× the 16px task-text font-size, landing the dot on the
           text's x-height. -->
      <div class="row-margin-dots">
        <template v-for="slot in slots" :key="'dot-' + slot.index">
          <!-- Ghost residue (task 25): a scheduled task whose theme is muted keeps its line
               occupied (see `savedList` above) but renders no text — the dot is its ONLY visible
               trace, faded, doubling as the un-mute control instead of the theme-picker trigger
               (clicking a normal dot opens the picker; clicking a ghost dot just shows the
               theme again — there's nothing to categorise, it already has one). -->
          <button
            v-if="slot.kind === 'task' && !visibility.isVisible(slot.task.themeId)"
            type="button"
            class="row-margin-dot row-margin-dot--ghost"
            :title="`${themeNameFor(slot.task.themeId)} task hidden — click to show`"
            :aria-label="`${themeNameFor(slot.task.themeId)} task hidden — click to show`"
            :style="{
              top: `calc(var(--line-h) * ${slot.index + 1} - 9px)`,
              background: colorFor(slot.task.themeId),
            }"
            @mousedown.prevent
            @click="visibility.show(slot.task.themeId)"
          />
          <button
            v-else-if="slot.kind === 'task' || (slot.kind === 'draft' && slot.draft.text.trim())"
            type="button"
            class="row-margin-dot"
            :title="themeNameFor(slot.kind === 'task' ? slot.task.themeId : slot.draft.themeId)"
            :aria-label="`Task theme: ${themeNameFor(slot.kind === 'task' ? slot.task.themeId : slot.draft.themeId)}. Change theme`"
            aria-haspopup="listbox"
            :aria-expanded="pickerOpenFor === (slot.kind === 'task' ? `task:${slot.task.id}` : `draft:${slot.draft.key}`)"
            :style="{
              top: `calc(var(--line-h) * ${slot.index + 1} - 9px)`,
              background: colorFor(slot.kind === 'task' ? slot.task.themeId : slot.draft.themeId),
            }"
            @mousedown.prevent
            @click="togglePicker(slot.kind === 'task' ? `task:${slot.task.id}` : `draft:${slot.draft.key}`, $event)"
          />
        </template>
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
          @dragover.prevent
          @dragenter="dragOverIndex = slot.index"
          @dragleave="(e: DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) dragOverIndex = null }"
          @drop.prevent="onDropAt($event, slot.index)"
          @click="slot.kind === 'empty' ? onClickEmpty(slot.index) : undefined"
        >
          <!-- A muted theme's scheduled task renders NO text here — the line stays occupied
               (not writable) but shows nothing beyond its ghost margin dot (task 25). -->
          <TaskChip
            v-if="slot.kind === 'task' && visibility.isVisible(slot.task.themeId)"
            :task="slot.task"
            :color="colorFor(slot.task.themeId)"
            dense
            dot-in-margin
          />

          <!-- Full-width, immediately — no inline picker eating the line (that grew linearly
               worse with theme count and jumped the text's left edge on save; see the margin
               dot above instead). Draft text sits at the exact same x/width a saved TaskChip's
               text will. -->
          <input
            v-else-if="slot.kind === 'draft'"
            :data-line-index="slot.index"
            type="text"
            :value="slot.draft.text"
            placeholder="Write here…"
            class="diary-input font-write min-w-0 w-full text-[16px] leading-[20px] text-[var(--ink)]"
            @click.stop
            @input="slot.draft.text = ($event.target as HTMLInputElement).value; onInput(slot.draft)"
            @focus="activeKey = slot.draft.key"
            @keydown="forceHomeEnd"
            @keydown.enter.prevent="handleEnter(slot.draft)"
            @keydown.esc="revert(slot.draft); ($event.target as HTMLInputElement).blur()"
            @blur="activeKey = null; handleBlur(slot.draft)"
          >
        </div>
      </div>
    </div>

    <!-- Teleported to <body>, fixed-positioned from the trigger's own getBoundingClientRect —
         see the script doc comment above for why (`.ruled-line` clips overflow on both axes,
         so an in-place popover would be silently invisible). -->
    <Teleport to="body">
      <div
        v-if="pickerOpenFor"
        ref="pickerEl"
        role="listbox"
        aria-label="Choose theme"
        class="paper-card fixed z-30 min-w-[10rem] p-1"
        :style="{ top: `${pickerPos.top}px`, left: `${pickerPos.left}px` }"
        @keydown="onPickerKeydown"
        @keydown.esc="closePicker"
      >
        <button
          v-for="th in pickerThemes"
          :key="th.id"
          type="button"
          role="option"
          :aria-selected="activePickerThemeId === th.id"
          class="font-ui flex w-full items-center gap-2 rounded-none px-2 py-1 text-left text-xs text-[var(--ink-soft)] transition-colors hover:text-[var(--accent-ink)]"
          @mousedown.prevent
          @click="selectTheme(th.id)"
        >
          <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ background: th.color }" aria-hidden="true" />
          {{ th.name }}
        </button>
      </div>
    </Teleport>
  </div>
</template>
