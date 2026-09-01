<script setup lang="ts">
/** One life-theme in the sidebar: watercolor swatch (also the visibility toggle — click to
 *  mute its tasks off the day strip), inline-editable name, an archive action (soft, with
 *  undo), and its backlog of unscheduled tasks — the drag SOURCE for scheduling, and a drop
 *  TARGET for unscheduling (drag a task back here from any day cell, or re-theme it by
 *  dropping on a different theme's card). */
import { ref, nextTick, onMounted } from 'vue'
import type { Theme } from '~/stores/themes'
import { THEME_PALETTE, useThemesStore } from '~/stores/themes'
import { useTasksStore } from '~/stores/tasks'
import { useToast } from '~/composables/useToast'
import { useThemeVisibility } from '~/composables/useThemeVisibility'
import { useDragTaught } from '~/composables/useDragTaught'
import { taskIdFromDrag } from '~/utils/dnd'

const props = defineProps<{ theme: Theme }>()

const themes = useThemesStore()
const tasks = useTasksStore()
const visibility = useThemeVisibility()
const dragTaught = useDragTaught()
const { show } = useToast()

const editing = ref(false)
const draft = ref(props.theme.name)
const nameInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)

onMounted(() => {
  if (!tasks.backlogLoaded.has(props.theme.id)) tasks.fetchBacklog(props.theme.id)
})

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

/** Drop anywhere on the card (not on a specific task line) — append after the last occupied
 *  line-slot. Per-line drop targets (which push a line down instead of appending) live inside
 *  AddTaskInline now, since it owns the backlog's task rendering; AddTaskInline's own `@drop`
 *  stops propagation so a drop that lands on one of ITS lines never ALSO reaches this handler
 *  (task 23 — that double-fire was writing two competing PATCHes for the same task, a beat
 *  apart). Works regardless of this theme's active/inactive filter state — dropping onto a
 *  muted theme is allowed. */
function onDropEnd(e: DragEvent) {
  dragOver.value = false
  const id = taskIdFromDrag(e)
  if (!id) return
  dragTaught.markDragged()
  const list = tasks.backlogFor(props.theme.id)
  const nextIndex = list.length ? Math.max(...list.map(t => t.position)) + 1 : 0
  tasks.patchTask(id, { themeId: props.theme.id, scheduledOn: null, daypart: null, position: nextIndex })
}
</script>

<template>
  <div
    class="paper-card p-3 transition-all"
    :class="[dragOver ? 'card-drop-target' : '', visibility.isVisible(theme.id) ? '' : 'opacity-45']"
    @dragover.prevent
    @dragenter="dragOver = true"
    @dragleave="(e: DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) dragOver = false }"
    @drop.prevent="onDropEnd"
  >
    <div class="group flex items-center gap-2">
      <button
        type="button"
        class="shrink-0 rounded-full transition-transform hover:scale-110"
        :class="visibility.isVisible(theme.id) ? '' : 'grayscale'"
        :title="visibility.isVisible(theme.id) ? `Hide ${theme.name} tasks` : `Show ${theme.name} tasks`"
        :aria-label="visibility.isVisible(theme.id) ? `Hide ${theme.name} tasks` : `Show ${theme.name} tasks`"
        :aria-pressed="!visibility.isVisible(theme.id)"
        @click="visibility.toggle(theme.id)"
      >
        <WatercolorBlob :color="theme.color" :size="24" />
      </button>

      <input
        v-if="editing"
        ref="nameInput"
        v-model="draft"
        type="text"
        class="min-w-0 flex-1 border-0 border-b border-dashed border-[var(--accent-ink)] bg-transparent text-[17px] font-semibold text-[var(--ink)] outline-none"
        @keyup.enter="commitEdit"
        @keyup.esc="editing = false"
        @blur="commitEdit"
      >
      <h3
        v-else
        class="min-w-0 flex-1 cursor-pointer truncate text-[17px] font-semibold text-[var(--ink)]"
        @dblclick="startEdit"
      >
        {{ theme.name }}
      </h3>

      <button
        v-if="!editing"
        type="button"
        class="shrink-0 rounded-none p-1 text-[var(--ink-faint)] opacity-0 transition-opacity hover:text-[var(--accent-ink)] group-hover:opacity-100"
        aria-label="Rename theme"
        @click="startEdit"
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M11 2l3 3-8 8-3.5 1L3 10.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        class="shrink-0 rounded-none p-1 text-[var(--ink-faint)] opacity-0 transition-opacity hover:text-[var(--danger)] group-hover:opacity-100"
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

    <div class="mt-2.5 pl-1">
      <AddTaskInline :theme-id="theme.id" :color="theme.color" :theme-name="theme.name" placeholder="Write a task…" />
    </div>
  </div>
</template>
