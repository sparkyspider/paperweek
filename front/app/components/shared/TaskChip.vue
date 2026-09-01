<script setup lang="ts">
/**
 * One task — in a theme's backlog or scheduled into a day cell. Presentational + the drag
 * SOURCE (draggable, stashes its id on dataTransfer); the containing list owns drop handling
 * so it can compute where in the (position-ordered) list the drop landed.
 */
import { ref, nextTick } from 'vue'
import type { Task } from '~/stores/tasks'
import { useTasksStore } from '~/stores/tasks'
import { useToast } from '~/composables/useToast'

const props = defineProps<{ task: Task; color: string }>()

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
    class="group flex items-start gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-[var(--paper-sunken)]"
    :class="{ 'opacity-60': task.doneAt }"
    draggable="true"
    @dragstart="onDragStart"
  >
    <button
      type="button"
      class="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-colors"
      :style="{ borderColor: task.doneAt ? color : 'var(--ink-faint)', background: task.doneAt ? color : 'transparent' }"
      :aria-pressed="!!task.doneAt"
      aria-label="Toggle complete"
      @click="toggle"
    >
      <svg v-if="task.doneAt" width="10" height="10" viewBox="0 0 16 16" fill="none">
        <path d="M3 8.5L6.2 11.5L13 4.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    <div class="min-w-0 flex-1">
      <input
        v-if="editing"
        ref="titleInput"
        v-model="draft"
        type="text"
        class="w-full border-b border-dashed border-[var(--accent-ink)] bg-transparent text-sm leading-snug text-[var(--ink)] outline-none"
        @keyup.enter="commitEdit"
        @keyup.esc="cancelEdit"
        @blur="commitEdit"
      >
      <span
        v-else
        class="block cursor-text break-words text-sm leading-snug text-[var(--ink)]"
        :class="{ 'ink-strike': task.doneAt }"
        @click="startEdit"
      >{{ task.title }}</span>
    </div>

    <button
      type="button"
      class="mt-[2px] shrink-0 rounded p-0.5 text-[var(--ink-faint)] opacity-0 transition-opacity hover:text-[var(--danger)] group-hover:opacity-100"
      aria-label="Delete task"
      @click="remove"
    >
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
    </button>
  </div>
</template>
