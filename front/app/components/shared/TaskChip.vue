<script setup lang="ts">
/**
 * One task line — in a theme's backlog or scheduled onto a day card's ruled line. The
 * governing principle is "it IS paper": no checkbox, no chip/box/background/border around the
 * text — the handwriting sits directly on the line. Clicking the words themselves toggles
 * done (the ink-strike stroke draws through them); double-click to edit in place. A tiny
 * watercolor dot before the text is the only nod to its theme colour — everything else here
 * would read as UI chrome.
 *
 * Also the drag SOURCE (grab the line's text, draggable, stashes its id on dataTransfer); the
 * containing list owns drop handling so it can compute where in the (position-ordered) list
 * the drop landed.
 *
 * `dense` is used inside a day-strip section, where a task sits ON a single ruled line rather
 * than wrapping in the sidebar's roomier backlog list.
 */
import { ref, nextTick } from 'vue'
import type { Task } from '~/stores/tasks'
import { useTasksStore } from '~/stores/tasks'
import { useToast } from '~/composables/useToast'

const props = withDefaults(defineProps<{ task: Task; color: string; dense?: boolean }>(), { dense: false })

const tasks = useTasksStore()
const { show } = useToast()

const editing = ref(false)
const draft = ref(props.task.title)
const titleInput = ref<HTMLInputElement | null>(null)

async function startEdit() {
  draft.value = props.task.title
  editing.value = true
  await nextTick()
  titleInput.value?.focus()
  titleInput.value?.select()
}

function commitEdit() {
  editing.value = false
  const next = draft.value.trim()
  if (next && next !== props.task.title) tasks.updateTitle(props.task.id, next)
}

function cancelEdit() {
  editing.value = false
  draft.value = props.task.title
}

function toggle() {
  tasks.toggleDone(props.task.id, !props.task.doneAt)
}

function remove() {
  const undo = tasks.deleteTaskQueued(props.task.id)
  show('Task deleted', { actionLabel: 'Undo', onAction: () => undo?.() })
}

function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData('text/plain', props.task.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
</script>

<template>
  <div
    class="group flex w-full cursor-grab items-end gap-1.5 transition-opacity active:cursor-grabbing"
    :class="[dense ? '' : 'py-0.5', { 'opacity-55': task.doneAt }]"
    draggable="true"
    @dragstart="onDragStart"
  >
    <span
      class="mb-[3px] inline-block h-1.5 w-1.5 shrink-0 rounded-full self-end"
      :style="{ background: color }"
      aria-hidden="true"
    />

    <input
      v-if="editing"
      ref="titleInput"
      v-model="draft"
      type="text"
      class="font-write min-w-0 flex-1 border-0 border-b border-dashed border-[var(--accent-ink)] bg-transparent text-[16px] leading-[20px] text-[var(--ink)] outline-none"
      @keyup.enter="commitEdit"
      @keyup.esc="cancelEdit"
      @blur="commitEdit"
    >
    <span
      v-else
      role="button"
      tabindex="0"
      :aria-pressed="!!task.doneAt"
      :aria-label="task.doneAt ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`"
      class="font-write min-w-0 flex-1 cursor-pointer text-[16px] leading-[20px] text-[var(--ink)]"
      :class="[dense ? 'truncate' : 'break-words', task.doneAt ? 'ink-strike' : '']"
      @click="toggle"
      @dblclick="startEdit"
      @keydown.enter.prevent="toggle"
      @keydown.space.prevent="toggle"
    >{{ task.title }}</span>

    <button
      type="button"
      class="font-hand shrink-0 self-end px-1 text-lg leading-none text-[var(--ink-faint)] opacity-0 transition-opacity hover:text-[var(--danger)] group-hover:opacity-100"
      aria-label="Delete task"
      @click="remove"
    >×</button>
  </div>
</template>
