<script setup lang="ts">
/** One labelled section (Morning / Afternoon / Evening) inside a day column. Renders that
 *  cell's tasks and is a full drag-and-drop target: dropping a task (from a backlog or another
 *  cell) here schedules it into this exact date + daypart, at the position implied by where it
 *  landed among the existing tasks. */
import { computed, ref } from 'vue'
import type { Daypart } from '~/stores/tasks'
import { useTasksStore } from '~/stores/tasks'
import { useThemesStore } from '~/stores/themes'
import { positionBetween, taskIdFromDrag } from '~/utils/dnd'

const props = defineProps<{ dateISO: string; daypart: Daypart; label: string }>()

const tasks = useTasksStore()
const themes = useThemesStore()

const list = computed(() => tasks.forCell(props.dateISO, props.daypart))
const dragOver = ref(false)

function colorFor(themeId: string): string {
  return themes.items.find(t => t.id === themeId)?.color ?? 'var(--ink-faint)'
}

function onDragEnter() { dragOver.value = true }
function onDragLeave(e: DragEvent) {
  // Only clear when actually leaving the section, not moving between its children.
  const related = e.relatedTarget as Node | null
  if (!(e.currentTarget as HTMLElement).contains(related)) dragOver.value = false
}

/** Dropped on the section's empty space — append to the end of this cell's list. */
function onDropEnd(e: DragEvent) {
  dragOver.value = false
  const id = taskIdFromDrag(e)
  if (!id) return
  const last = list.value[list.value.length - 1]
  tasks.schedule(id, props.dateISO, props.daypart, positionBetween(last?.position, undefined))
}

/** Dropped directly on a task — insert BEFORE it. */
function onDropBefore(e: DragEvent, index: number) {
  dragOver.value = false
  const id = taskIdFromDrag(e)
  if (!id) return
  const before = list.value[index - 1]
  const after = list.value[index]
  tasks.schedule(id, props.dateISO, props.daypart, positionBetween(before?.position, after?.position))
}

function onCreate(themeId: string, title: string) {
  const last = list.value[list.value.length - 1]
  createScheduled(themeId, title, positionBetween(last?.position, undefined))
}

async function createScheduled(themeId: string, title: string, position: number) {
  const created = await tasks.createBacklogTask(themeId, title)
  if (created) await tasks.schedule(created.id, props.dateISO, props.daypart, position)
}
</script>

<template>
  <div
    class="rounded-lg p-1 transition-colors"
    :class="dragOver ? 'bg-[var(--accent-ink-soft)]' : ''"
    @dragover.prevent
    @dragenter="onDragEnter"
    @dragleave="onDragLeave"
    @drop.prevent="onDropEnd"
  >
    <p class="gouache-underline font-hand mb-1 pl-1 text-[15px] font-semibold leading-none text-[var(--ink-soft)]">
      {{ label }}
    </p>

    <div class="flex flex-col">
      <div
        v-for="(t, i) in list"
        :key="t.id"
        @dragover.prevent
        @drop.prevent.stop="onDropBefore($event, i)"
      >
        <TaskChip :task="t" :color="colorFor(t.themeId)" />
      </div>
    </div>

    <AddTaskInline :themes="themes.active" @create="onCreate" />
  </div>
</template>
