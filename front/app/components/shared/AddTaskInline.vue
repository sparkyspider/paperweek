<script setup lang="ts">
/** A theme's backlog: its saved (unscheduled) tasks laid out on ruled lines, write-anywhere
 *  (useAutosaveLines — click any empty line, including one above existing tasks, and it
 *  autosaves there; writing onto an occupied line pushes it and its followers down one line).
 *  Always shows at least `minLines` lines, even when empty, so every theme card ends in a
 *  blank line ready to write on. Every line (task or empty) is a drop target — dropping a
 *  task from a day cell or another theme lands it there, pushing down whatever was on it. */
import { nextTick, ref } from 'vue'
import { useTasksStore } from '~/stores/tasks'
import { useAutosaveLines, type DraftLine } from '~/composables/useAutosaveLines'
import { taskIdFromDrag } from '~/utils/dnd'

const props = defineProps<{ themeId: string; color: string; placeholder?: string }>()

const tasks = useTasksStore()
const root = ref<HTMLElement | null>(null)
const dragOverIndex = ref<number | null>(null)

const { slots, activateLine, onInput, onEnter, onBlur, revert, dropTaskAt } = useAutosaveLines({
  savedList: () => tasks.backlogFor(props.themeId),
  defaultThemeId: () => props.themeId,
  minLines: 2,
})

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

async function handleEnter(draft: DraftLine) {
  await onEnter(draft)
  await nextTick()
  focusDraft(draft.lineIndex + 1)
}

function onDropAt(e: DragEvent, index: number) {
  dragOverIndex.value = null
  const id = taskIdFromDrag(e)
  if (!id) return
  dropTaskAt(id, index)
}
</script>

<template>
  <div ref="root" class="ruled-paper backlog-lines mt-1">
    <div
      v-for="slot in slots"
      :key="slot.index"
      class="ruled-line"
      :class="[dragOverIndex === slot.index ? 'day-section--over' : '', slot.kind === 'empty' ? 'cursor-text' : '']"
      @dragover.prevent
      @dragenter="dragOverIndex = slot.index"
      @dragleave="(e: DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) dragOverIndex = null }"
      @drop.prevent="onDropAt($event, slot.index)"
      @click="slot.kind === 'empty' ? onClickEmpty(slot.index) : undefined"
    >
      <TaskChip v-if="slot.kind === 'task'" :task="slot.task" :color="color" dense />

      <input
        v-else-if="slot.kind === 'draft'"
        :data-line-index="slot.index"
        type="text"
        :value="slot.draft.text"
        :placeholder="placeholder ?? 'Write a task…'"
        class="diary-input font-write min-w-0 w-full text-[16px] leading-[20px] text-[var(--ink)] placeholder:font-write placeholder:text-[var(--ink-faint)]"
        @click.stop
        @input="slot.draft.text = ($event.target as HTMLInputElement).value; onInput(slot.draft)"
        @keydown.enter.prevent="handleEnter(slot.draft)"
        @keydown.esc="revert(slot.draft); ($event.target as HTMLInputElement).blur()"
        @blur="onBlur(slot.draft)"
      >
    </div>
  </div>
</template>
