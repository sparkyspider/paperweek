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
import { ref, computed, nextTick, onBeforeUnmount } from 'vue'
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
  const el = titleInput.value
  el?.focus()
  el?.select()
  // select() leaves the input's own scroll window parked wherever the browser feels like
  // after selecting-all (often the END of a long title) — disorienting: you open edit and the
  // text you see doesn't even start with the word it starts with. Anchor the visible window
  // back at the START; the selection itself is untouched, so typing/Home/End/Cmd+Right still
  // behave exactly as normal from there.
  if (el) el.scrollLeft = 0
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

/** The "sticky tape" tooltip (task: truncated-title tooltip) — full title, only when the title
 *  is ACTUALLY ellipsis-clipped right now. Re-checked live on every hover/focus rather than
 *  cached: `dense` truncation depends on the row's rendered width, which can change (window
 *  resize, sidebar collapse) without this component re-rendering. */
const textEl = ref<HTMLElement | null>(null)
const tapeVisible = ref(false)
const tapePos = ref<{ top: number; left: number; flip: boolean }>({ top: 0, left: 0, flip: false })
const TAPE_DELAY_MS = 250
const TAPE_MAX_WIDTH = 280
let tapeTimer: ReturnType<typeof setTimeout> | null = null

function clearTapeTimer(): void {
  if (tapeTimer) { clearTimeout(tapeTimer); tapeTimer = null }
}

function positionTape(el: HTMLElement): void {
  const rect = el.getBoundingClientRect()
  const GAP = 8
  // No room measurement needed for the "above" case — `flip`'s own CSS transform
  // (translateY(-100%)) anchors the tape's BOTTOM at `top`, so it grows upward regardless of
  // its actual (text-dependent) height. The flip decision itself just needs a rough "is there
  // plainly not enough room above" read, not the tape's real height.
  const flip = rect.top < 60
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - TAPE_MAX_WIDTH - 8))
  tapePos.value = { left, top: flip ? rect.bottom + GAP : rect.top - GAP, flip }
}

function hideTape(): void {
  clearTapeTimer()
  if (tapeVisible.value) {
    tapeVisible.value = false
    window.removeEventListener('scroll', hideTape, true)
  }
}

function scheduleTape(): void {
  clearTapeTimer()
  tapeTimer = setTimeout(() => {
    const el = textEl.value
    // The live check this whole feature hinges on: only an ACTUALLY truncated title gets a
    // tape. Never cached — read fresh at show-time, not at mount or at hover-start.
    if (!el || el.scrollWidth <= el.clientWidth) return
    positionTape(el)
    tapeVisible.value = true
    window.addEventListener('scroll', hideTape, true)
  }, TAPE_DELAY_MS)
}

const tapeBg = computed(() => `color-mix(in srgb, ${props.color} 30%, var(--paper-raised))`)
const tapeTransform = computed(() => tapePos.value.flip ? 'rotate(-1.2deg)' : 'translateY(-100%) rotate(-1.2deg)')

onBeforeUnmount(() => {
  clearTapeTimer()
  window.removeEventListener('scroll', hideTape, true)
})
</script>

<template>
  <div
    class="group flex min-w-0 flex-1 cursor-grab items-end gap-1.5 transition-opacity active:cursor-grabbing"
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
      class="font-write min-w-0 flex-1 border-0 bg-transparent text-[18px] leading-[22px] text-[var(--ink)] outline-none"
      @keydown="forceHomeEnd"
      @keyup.enter="commitEdit"
      @keyup.esc="cancelEdit"
      @blur="commitEdit"
    >
    <span
      v-else
      ref="textEl"
      role="button"
      tabindex="0"
      :aria-pressed="!!task.doneAt"
      :aria-label="task.doneAt ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`"
      class="font-write min-w-0 flex-1 cursor-pointer text-[18px] leading-[22px] text-[var(--ink)]"
      :class="[dense ? 'truncate' : 'break-words']"
      @click="onLineClick"
      @keydown.enter.prevent="startEdit"
      @keydown.space.prevent="onLineClick"
      @keydown.f2.prevent="startEdit"
      @mouseenter="scheduleTape"
      @mouseleave="hideTape"
      @focus="scheduleTape"
      @blur="hideTape"
    ><span :class="task.doneAt ? 'ink-strike' : ''">{{ task.title }}</span></span>

    <!-- Both glyph buttons as one snug pair, not two independent flex items spaced by the row's
         own gap-1.5 (that read as two stray marks scattered across the line-end, not a cluster).
         Zero gap BETWEEN them here: each button's own p-1 padding (part of its ≥20px hit area,
         see main.css-adjacent sizing below) already puts ~4px of breathing room on either side
         of its 13px glyph, so touching hit-boxes still leave a clean ~8px of visible space
         between the ✎ and × marks themselves — snug without the hit areas overlapping (each
         stays independently clickable). The wrapper alone takes the outer row's normal
         gap-1.5 from the task text before it. -->
    <div v-if="!editing" class="flex shrink-0 items-center self-end">
      <!-- Same optical size as the delete glyph below (13x13 in a 16x16 viewBox, 1.3 stroke) —
           hand-font glyphs for ✎/× rendered at wildly different sizes depending on the cursive
           face's own (undesigned-for) metrics for those characters; plain SVG paths sidestep
           font metrics entirely, the only way to GUARANTEE the two match. -->
      <button
        type="button"
        class="inline-flex shrink-0 items-center justify-center p-1 text-[var(--ink-faint)] opacity-0 transition-opacity hover:text-[var(--ink)] group-hover:opacity-100"
        aria-label="Edit task"
        title="Edit"
        @click="startEdit"
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M11 2l3 3-8 8-3.5 1L3 10.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        class="inline-flex shrink-0 items-center justify-center p-1 text-[var(--ink-faint)] opacity-0 transition-opacity hover:text-[var(--danger)] group-hover:opacity-100"
        aria-label="Delete task"
        @click="remove"
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <!-- The "sticky tape" tooltip — full title, ONLY when this title is actually ellipsis-
         truncated right now (see scheduleTape). Teleported + fixed-positioned for the same
         reason the theme picker popover is (main.css / DaySection.vue's doc comment): a `dense`
         row's own ancestors clip overflow, so an in-place tooltip would be invisible.
         pointer-events:none throughout — it must never intercept the drag/click/strike it's
         floating over. -->
    <Teleport to="body">
      <div
        v-if="tapeVisible"
        role="tooltip"
        class="task-tape font-write"
        :style="{ top: `${tapePos.top}px`, left: `${tapePos.left}px`, background: tapeBg, transform: tapeTransform }"
      >{{ task.title }}</div>
    </Teleport>
  </div>
</template>
