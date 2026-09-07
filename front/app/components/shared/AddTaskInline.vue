<script setup lang="ts">
/** A theme's backlog: its saved (unscheduled) tasks laid out on ruled lines, write-anywhere
 *  (useAutosaveLines — click any empty line, including one above existing tasks, and it
 *  autosaves there; writing onto an occupied line pushes it and its followers down one line).
 *  Uses `dynamicTrailing` mode: always exactly N task lines + ONE trailing blank line, never
 *  more (an empty theme wastes no space) and never fewer (never a dead end with no line left
 *  to write the next task on). Every line (task or empty) is a drop target — dropping a task
 *  from a day cell or another theme lands it there, pushing down whatever was on it.
 *
 *  Each line's own `@drop` stops propagation (task 23): this list is nested inside ThemeCard's
 *  root, which is ALSO a drop target (its own append-to-end handler, for drops that miss any
 *  specific line). Without stopping it, a drop that DOES land on a line would bubble up and
 *  fire the card's handler too — two competing PATCHes for the same task landing a beat apart
 *  (one from here setting the precise line position, one from the card appending to the end)
 *  is exactly the double-write QA caught. */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useTasksStore } from '~/stores/tasks'
import { useAutosaveLines, type DraftLine } from '~/composables/useAutosaveLines'
import { taskIdFromDrag } from '~/utils/dnd'
import { forceHomeEnd, isBoldShortcut } from '~/utils/textInputKeys'
import { useDragTaught } from '~/composables/useDragTaught'
import { useDragOverTracking } from '~/composables/useDragOverTracking'
import { useLastUsedTheme } from '~/composables/useLastUsedTheme'

const props = defineProps<{ themeId: string; color: string; themeName?: string; placeholder?: string }>()

const tasks = useTasksStore()
const dragTaught = useDragTaught()
const lastUsedTheme = useLastUsedTheme()
const root = ref<HTMLElement | null>(null)
const { current: dragOverIndex, markOver: onRowDragOver, clear: clearDragOverIndex } = useDragOverTracking<number>()

const { slots, activateLine, onInput, onEnter, onBlur, revert, dropTaskAt, toggleBold } = useAutosaveLines({
  savedList: () => tasks.backlogFor(props.themeId),
  defaultThemeId: () => props.themeId,
  dynamicTrailing: true,
})

/** Cmd+B while typing/editing a draft line — see useAutosaveLines' `toggleBold` doc comment for
 *  why this goes through the composable rather than a direct store call (the per-draft save
 *  queue, INC-16). */
function onDraftKeydown(e: KeyboardEvent, draft: DraftLine): void {
  forceHomeEnd(e)
  if (isBoldShortcut(e)) {
    e.preventDefault()
    toggleBold(draft)
  }
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

/** Enter must CHAIN to the next line (the trailing blank, in dynamicTrailing mode), not just
 *  try to refocus something that may not exist yet: once a draft saves, its slot becomes a
 *  plain 'task' (a TaskChip, no input) and the NEXT slot is still an inert 'empty' one —
 *  nothing with a `[data-line-index]` to find, so a bare focusDraft() silently found nothing
 *  and focus fell to <body>, discarding further typing. Route through the same
 *  activate-then-focus path a click uses instead. */
async function handleEnter(draft: DraftLine) {
  const nextIndex = draft.lineIndex + 1
  await onEnter(draft)
  await nextTick()
  await onClickEmpty(nextIndex)
}

/** A drop here always re-themes the dropped task to `props.themeId` (see `dropTaskAt` /
 *  `defaultThemeId` above) — a native HTML5 drag never fires `pointerdown`/`focusin` on the
 *  DESTINATION card (only the source gets those, on grab), so ThemeCard's root listener can't
 *  see this. Set the destination as last-used explicitly: "the theme a task just landed in
 *  becomes current" applies here same as a re-theme via the picker. */
function onDropAt(e: DragEvent, index: number) {
  clearDragOverIndex()
  const id = taskIdFromDrag(e)
  if (!id) return
  dragTaught.markDragged()
  dropTaskAt(id, index)
  lastUsedTheme.set(props.themeId)
}

/** Instant clear on `dragend` — a fast path on top of useDragOverTracking's own ~150ms
 *  self-healing decay (see that composable's doc comment for the fuller "why not enter/leave
 *  counting" story), for zero visible lag on the common paths (drop, Escape-cancel). */
onMounted(() => document.addEventListener('dragend', clearDragOverIndex))
onBeforeUnmount(() => document.removeEventListener('dragend', clearDragOverIndex))
</script>

<template>
  <div ref="root" class="ruled-paper backlog-lines mt-1">
    <div
      v-for="slot in slots"
      :key="slot.index"
      class="ruled-line"
      :class="[dragOverIndex === slot.index ? 'ruled-line--drop-target' : '', slot.kind === 'empty' ? 'cursor-text' : '']"
      @dragover.prevent="onRowDragOver(slot.index)"
      @drop.prevent.stop="onDropAt($event, slot.index)"
      @click="slot.kind === 'empty' ? onClickEmpty(slot.index) : undefined"
    >
      <TaskChip v-if="slot.kind === 'task'" :task="slot.task" :color="color" :theme-name="themeName" dense />

      <input
        v-else-if="slot.kind === 'draft'"
        :data-line-index="slot.index"
        type="text"
        :value="slot.draft.text"
        :placeholder="placeholder ?? 'Write a task…'"
        class="diary-input font-write min-w-0 w-full text-[18px] leading-[22px] text-[var(--ink)] placeholder:font-write placeholder:text-[var(--ink-faint)]"
        :class="{ 'font-write--bold': slot.draft.bold }"
        @click.stop
        @input="slot.draft.text = ($event.target as HTMLInputElement).value; onInput(slot.draft)"
        @keydown="onDraftKeydown($event, slot.draft)"
        @keydown.enter.prevent="handleEnter(slot.draft)"
        @keydown.esc="revert(slot.draft); ($event.target as HTMLInputElement).blur()"
        @blur="onBlur(slot.draft)"
      >
    </div>
  </div>
</template>
