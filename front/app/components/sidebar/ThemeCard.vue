<script setup lang="ts">
/** One life-theme in the sidebar: watercolor swatch (also the visibility toggle — click to
 *  mute its tasks off the day strip), inline-editable name, an archive action (soft, with
 *  undo), and its backlog of unscheduled tasks — the drag SOURCE for scheduling, and a drop
 *  TARGET for unscheduling (drag a task back here from any day cell, or re-theme it by
 *  dropping on a different theme's card). */
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import type { Theme } from '~/stores/themes'
import { THEME_PALETTE, useThemesStore } from '~/stores/themes'
import { useTasksStore } from '~/stores/tasks'
import { useToast } from '~/composables/useToast'
import { useThemeVisibility } from '~/composables/useThemeVisibility'
import { useDragTaught } from '~/composables/useDragTaught'
import { useDragOverTracking } from '~/composables/useDragOverTracking'
import { useLastUsedTheme } from '~/composables/useLastUsedTheme'
import { useThemeDragState } from '~/composables/useThemeDragState'
import { taskIdFromDrag, THEME_DRAG_MIME } from '~/utils/dnd'

const props = defineProps<{ theme: Theme }>()

const themes = useThemesStore()
const tasks = useTasksStore()
const visibility = useThemeVisibility()
const dragTaught = useDragTaught()
const lastUsedTheme = useLastUsedTheme()
const themeDrag = useThemeDragState()
const { show } = useToast()

/** "Last theme touched" (task 16 redesign, extended): any interaction inside this card marks it
 *  current — click the header, write/edit a backlog line, start dragging one of its tasks out.
 *  A single capturing listener on the card root covers all of that cheaply (set() already no-ops
 *  when unchanged) without per-row handlers; capture phase so it fires even if a descendant
 *  (e.g. a `@click.stop` input) stops bubbling. Native HTML5 drag start still fires `pointerdown`
 *  on the SOURCE first, so grabbing a task to drag it out counts as touching this card too — but
 *  a drop lands on the DESTINATION card, which never gets a pointerdown/focusin for it; that path
 *  is handled explicitly in `onDropEnd` below and in AddTaskInline's own drop handler. */
function touch(): void {
  lastUsedTheme.set(props.theme.id)
}

const editing = ref(false)
const draft = ref(props.theme.name)
const nameInput = ref<HTMLInputElement | null>(null)
/** Timestamp-decay tracking (useDragOverTracking), not enter/leave counting — see that
 *  composable's doc comment for the fuller story. This card in particular is exactly the shape
 *  that broke the counter twice over: it has plenty of descendants (swatch/rename/archive
 *  buttons, and the WHOLE nested AddTaskInline line list) any of which bubbling a stray
 *  dragenter/dragleave could desync a count from reality, AND it's a drag SOURCE itself — drag
 *  one of its OWN backlog rows out to reschedule it, and that row unmounts mid-drag the instant
 *  the task lands elsewhere, with no matching dragleave ever able to fire for whatever count it
 *  contributed. A stuck wash ("the theme goes red and I can't un-red it") followed both times.
 *  The decay-based tracker has no such state to leak: `dragOver` is just "did a dragover land on
 *  this card (or bubble from a descendant) in roughly the last 150ms," self-correcting the
 *  instant those events stop, for ANY reason, unmount included. */
const { current: dragOverSignal, markOver: markCardOver, clear: clearDragOver } = useDragOverTracking<true>()
const dragOver = computed(() => dragOverSignal.value === true)

onMounted(() => {
  if (!tasks.backlogLoaded.has(props.theme.id)) tasks.fetchBacklog(props.theme.id)
})

/** Instant clear on `dragend` — a fast path on top of the decay above, for zero visible lag on
 *  the common paths (drop, Escape-cancel); `dragend` fires on the drag SOURCE regardless of
 *  where the drop landed or whether some `drop` event's propagation was stopped along the way. */
onMounted(() => document.addEventListener('dragend', clearDragOver))
onBeforeUnmount(() => document.removeEventListener('dragend', clearDragOver))

async function startEdit() {
  draft.value = props.theme.name
  editing.value = true
  await nextTick()
  const el = nameInput.value
  el?.focus()
  el?.select()
  // Same fix as TaskChip's edit entry: select() alone can leave the view scrolled to the END
  // of a long name — anchor it back at the start (see TaskChip.vue's startEdit for the fuller
  // explanation).
  if (el) el.scrollLeft = 0
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
  clearDragOver()
  const id = taskIdFromDrag(e)
  if (!id) return
  dragTaught.markDragged()
  const list = tasks.backlogFor(props.theme.id)
  const nextIndex = list.length ? Math.max(...list.map(t => t.position)) + 1 : 0
  tasks.patchTask(id, { themeId: props.theme.id, scheduledOn: null, daypart: null, position: nextIndex })
  lastUsedTheme.set(props.theme.id)
}

/** The card-wide "drop a task here" wash (`markCardOver`/`onDropEnd` above) is unrelated to a
 *  theme-reorder drag going on over this same card — `ThemeSidebar` owns that entirely (its
 *  capture-phase listeners stop this handler from even seeing a theme drag; this guard is
 *  belt-and-braces for the same reason the rest of this file layers cheap self-correcting
 *  checks rather than trusting a single control path). */
function onCardDragOver(e: DragEvent) {
  if (e.dataTransfer?.types.includes(THEME_DRAG_MIME)) return
  markCardOver(true)
}

/** Drag SOURCE for reordering: only the header (name row) starts a theme drag — the swatch
 *  (visibility toggle), rename/archive buttons and the rename input all opt out with an
 *  explicit `draggable="false"` on themselves, which native drag respects even though they sit
 *  inside this draggable row (see template). Blocked entirely while renaming. */
function onHeaderDragStart(e: DragEvent) {
  if (editing.value) { e.preventDefault(); return }
  e.dataTransfer?.setData(THEME_DRAG_MIME, props.theme.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  dragTaught.markDragged()
  themeDrag.start(props.theme.id)
}

function onHeaderDragEnd() {
  themeDrag.end()
}
</script>

<template>
  <div
    class="paper-card paper-card--soft p-3 transition-all"
    :class="[dragOver ? 'card-drop-target' : '', visibility.isVisible(theme.id) ? '' : 'opacity-45', themeDrag.draggingId.value === theme.id ? 'opacity-40' : '']"
    @pointerdown.capture="touch"
    @focusin.capture="touch"
    @dragover.prevent="onCardDragOver"
    @drop.prevent="onDropEnd"
  >
    <div
      class="group flex cursor-grab items-center gap-2 active:cursor-grabbing"
      :draggable="!editing"
      title="Drag to reorder"
      @dragstart="onHeaderDragStart"
      @dragend="onHeaderDragEnd"
    >
      <button
        type="button"
        draggable="false"
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
        draggable="false"
        class="min-w-0 flex-1 cursor-text border-0 border-b border-dashed border-[var(--accent-ink)] bg-transparent text-[17px] font-semibold text-[var(--ink)] outline-none"
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
        draggable="false"
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
        draggable="false"
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
        @mousedown.prevent
        @click="themes.recolorTheme(theme.id, c)"
      />
    </div>

    <div class="mt-2.5 pl-1">
      <AddTaskInline :theme-id="theme.id" :color="theme.color" :theme-name="theme.name" placeholder="Write a task…" />
    </div>
  </div>
</template>
