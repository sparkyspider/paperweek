<script setup lang="ts">
/**
 * One task line — in a theme's backlog or scheduled onto a day card's ruled line. The
 * governing principle is "it IS paper": no checkbox, no chip/box/background/border around the
 * text — the handwriting sits directly on the line. Clicking the words themselves toggles
 * done (the ink-strike stroke draws through them); double-click to edit in place. A tiny
 * watercolor dot before the text is the only nod to its theme colour — everything else here
 * would read as UI chrome. `dotInMargin` (day-card only — NOT the same thing as `dense`, which
 * the sidebar backlog also sets, just for its own truncate/sizing) skips that inline dot: the
 * day card draws its own theme dot out in the ruled margin instead (see DaySection.vue's
 * `.row-margin-dot`), so text starts cleanly at the line rhythm's left edge, undisplaced.
 *
 * Click/dblclick collision: a real double-click fires TWO native `click` events before the
 * `dblclick` event, so listening to both independently means a completed dblclick would ALSO
 * toggle-then-toggle-back (two separate PATCHes) before edit ever opens. Instead this owns its
 * own single `@click` handler and does the dblclick detection itself: first click arms the
 * strike visually AND IMMEDIATELY (no visual debounce) via `toggleDoneDeferred`, whose actual
 * PATCH is deferred; a second click inside that same window cancels the pending PATCH, reverts
 * the visual, and opens edit instead — net effect of a completed double-click: doneAt
 * unchanged, zero PATCHes sent.
 *
 * Also the drag SOURCE (grab the line's text, draggable, stashes its id on dataTransfer); the
 * containing list owns drop handling so it can compute where in the (position-ordered) list
 * the drop landed.
 *
 * `dense` is used inside a day-strip section, where a task sits ON a single ruled line rather
 * than wrapping in the sidebar's roomier backlog list.
 */
import { ref, nextTick, onBeforeUnmount } from 'vue'
import type { Task } from '~/stores/tasks'
import { useTasksStore } from '~/stores/tasks'
import { useToast } from '~/composables/useToast'
import { forceHomeEnd } from '~/utils/textInputKeys'

const props = withDefaults(
  defineProps<{ task: Task; color: string; dense?: boolean; dotInMargin?: boolean; themeName?: string }>(),
  { dense: false, dotInMargin: false, themeName: undefined },
)

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

/** ~300ms: both the "is this becoming a double-click" window AND the done-PATCH defer delay —
 *  deliberately the same interval (see the file doc comment above). */
const CLICK_WINDOW_MS = 300
let awaitingSecondClick = false
let clickTimer: ReturnType<typeof setTimeout> | null = null
let cancelPendingToggle: (() => void) | null = null

function clearPendingClick(): void {
  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null }
  awaitingSecondClick = false
  cancelPendingToggle = null
}

function onLineClick(e?: MouseEvent | KeyboardEvent): void {
  if (awaitingSecondClick) {
    // Nets out as a double-click: undo the first click's strike/PATCH entirely, edit instead.
    if (clickTimer) clearTimeout(clickTimer)
    cancelPendingToggle?.()
    clearPendingClick()
    startEdit()
    return
  }
  awaitingSecondClick = true
  cancelPendingToggle = tasks.toggleDoneDeferred(props.task.id, !props.task.doneAt, CLICK_WINDOW_MS)
  clickTimer = setTimeout(clearPendingClick, CLICK_WINDOW_MS)
  // Belt-and-braces alongside the `:has(input:focus)` CSS fix (task 26): a strike-toggle click
  // on this `tabindex="0"` span gives it native DOM focus as a side effect, which — with the
  // OLD `:focus-within` rule — kept the row's accent-rule lit with no caret in sight. The CSS
  // fix alone already stops that; this also drops the browser's own default focus ring so a
  // mouse-driven strike leaves a genuinely calm row (a keyboard Space-driven strike keeps focus,
  // as it should for a11y — only a pointer click blurs here).
  if (e instanceof MouseEvent) (e.currentTarget as HTMLElement | null)?.blur()
}

onBeforeUnmount(() => {
  if (clickTimer) clearTimeout(clickTimer)
  // Deliberately NOT canceling a still-pending toggle on unmount — it's mid-flight becoming a
  // real committed change (the row is going away, e.g. re-rendered elsewhere), not a click
  // collision; letting the store's own timer complete it is correct.
})

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
    class="task-row-lift group flex w-full cursor-grab items-end gap-1.5 transition-opacity active:cursor-grabbing"
    :class="[dense ? '' : 'py-0.5', { 'opacity-55': task.doneAt }]"
    draggable="true"
    @dragstart="onDragStart"
  >
    <span
      v-if="!dotInMargin"
      class="mb-[3px] inline-block h-1.5 w-1.5 shrink-0 rounded-full self-end"
      :style="{ background: color }"
      :title="themeName"
      aria-hidden="true"
    />

    <input
      v-if="editing"
      ref="titleInput"
      v-model="draft"
      type="text"
      class="font-write min-w-0 flex-1 border-0 border-b border-dashed border-[var(--accent-ink)] bg-transparent text-[16px] leading-[20px] text-[var(--ink)] outline-none"
      @keydown="forceHomeEnd"
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
      :class="[dense ? 'truncate' : 'break-words']"
      @click="onLineClick"
      @keydown.enter.prevent="startEdit"
      @keydown.space.prevent="onLineClick"
      @keydown.f2.prevent="startEdit"
    ><span :class="task.doneAt ? 'ink-strike' : ''">{{ task.title }}</span></span>

    <button
      type="button"
      class="font-hand shrink-0 self-end px-1 text-lg leading-none text-[var(--ink-faint)] opacity-0 transition-opacity hover:text-[var(--accent-ink)] group-hover:opacity-100"
      aria-label="Edit task"
      title="Edit"
      @click="startEdit"
    >✎</button>
    <button
      type="button"
      class="font-hand shrink-0 self-end px-1 text-lg leading-none text-[var(--ink-faint)] opacity-0 transition-opacity hover:text-[var(--danger)] group-hover:opacity-100"
      aria-label="Delete task"
      @click="remove"
    >×</button>
  </div>
</template>
