<script setup lang="ts">
/** One life-theme in the sidebar: watercolor swatch, inline-editable name, an archive action
 *  (soft, with undo), and its backlog of unscheduled tasks — the drag SOURCE for scheduling,
 *  and a drop TARGET for unscheduling (drag a task back here from any day cell). */
import { ref, computed, nextTick, onMounted } from 'vue'
import type { Theme } from '~/stores/themes'
import { THEME_PALETTE, useThemesStore } from '~/stores/themes'
import { useTasksStore } from '~/stores/tasks'
import { useToast } from '~/composables/useToast'
import { positionBetween, taskIdFromDrag } from '~/utils/dnd'

const props = defineProps<{ theme: Theme }>()

const themes = useThemesStore()
const tasks = useTasksStore()
const { show } = useToast()

const editing = ref(false)
const draft = ref(props.theme.name)
const nameInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)

onMounted(() => {
  if (!tasks.backlogLoaded.has(props.theme.id)) tasks.fetchBacklog(props.theme.id)
})

const backlog = computed(() => tasks.backlogFor(props.theme.id))

async function startEdit() {
  draft.value = props.theme.name
  editing.value = true
  await nextTick()
  nameInput.value?.focus()
  nameInput.value?.select()
}

function commitEdit() {
  editing.value = false
  const next = draft.value.trim()
  if (next && next !== props.theme.name) themes.renameTheme(props.theme.id, next)
}

function archive() {
  const undo = themes.archiveThemeQueued(props.theme.id)
  show(`“${props.theme.name}” archived`, { actionLabel: 'Undo', onAction: () => undo?.() })
}

function onCreate(themeId: string, title: string) {
  tasks.createBacklogTask(themeId, title)
}

function onDropEnd(e: DragEvent) {
  dragOver.value = false
  const id = taskIdFromDrag(e)
  if (!id) return
  const last = backlog.value[backlog.value.length - 1]
  tasks.patchTask(id, { themeId: props.theme.id, scheduledOn: null, daypart: null, position: positionBetween(last?.position, undefined) })
}

function onDropBefore(e: DragEvent, index: number) {
  dragOver.value = false
  const id = taskIdFromDrag(e)
  if (!id) return
  const before = backlog.value[index - 1]
  const after = backlog.value[index]
  tasks.patchTask(id, { themeId: props.theme.id, scheduledOn: null, daypart: null, position: positionBetween(before?.position, after?.position) })
}
</script>

<template>
  <div
    class="paper-card p-3 transition-colors"
    :class="dragOver ? 'bg-[var(--accent-ink-soft)]' : ''"
    @dragover.prevent
    @dragenter="dragOver = true"
    @dragleave="(e: DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) dragOver = false }"
    @drop.prevent="onDropEnd"
  >
    <div class="group flex items-center gap-2">
      <WatercolorBlob :color="theme.color" :size="24" />

      <input
        v-if="editing"
        ref="nameInput"
        v-model="draft"
        type="text"
        class="min-w-0 flex-1 border-b border-dashed border-[var(--accent-ink)] bg-transparent text-[17px] font-semibold text-[var(--ink)] outline-none"
        @keyup.enter="commitEdit"
        @keyup.esc="editing = false"
        @blur="commitEdit"
      >
      <h3
        v-else
        class="min-w-0 flex-1 cursor-text truncate text-[17px] font-semibold text-[var(--ink)]"
        @dblclick="startEdit"
      >
        {{ theme.name }}
      </h3>

      <button
        v-if="!editing"
        type="button"
        class="shrink-0 rounded p-1 text-[var(--ink-faint)] opacity-0 transition-opacity hover:text-[var(--accent-ink)] group-hover:opacity-100"
        aria-label="Rename theme"
        @click="startEdit"
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M11 2l3 3-8 8-3.5 1L3 10.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        class="shrink-0 rounded p-1 text-[var(--ink-faint)] opacity-0 transition-opacity hover:text-[var(--danger)] group-hover:opacity-100"
        aria-label="Archive theme"
        @click="archive"
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M2 4.5h12M5 4.5V3.2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.3M6.5 7.5v4M9.5 7.5v4M3.5 4.5l.6 8a1 1 0 0 0 1 .9h5.8a1 1 0 0 0 1-.9l.6-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>

    <div v-if="editing" class="mt-2 flex flex-wrap items-center gap-1.5 pl-8">
      <button
        v-for="c in THEME_PALETTE"
        :key="c"
        type="button"
        class="h-4 w-4 rounded-full border-2 transition-transform hover:scale-110"
        :style="{ background: c, borderColor: theme.color === c ? 'var(--ink)' : 'transparent' }"
        :aria-label="`Set color ${c}`"
        @click="themes.recolorTheme(theme.id, c)"
      />
    </div>

    <div class="mt-2.5 flex flex-col gap-0.5 pl-1">
      <div
        v-for="(t, i) in backlog"
        :key="t.id"
        @dragover.prevent
        @drop.prevent.stop="onDropBefore($event, i)"
      >
        <TaskChip :task="t" :color="theme.color" />
      </div>
      <p v-if="!backlog.length" class="px-1.5 py-1 text-xs italic text-[var(--ink-faint)]">
        Nothing waiting — drop a task here to unschedule it.
      </p>
    </div>

    <AddTaskInline :theme-id="theme.id" placeholder="New backlog task…" @create="onCreate" />
  </div>
</template>
