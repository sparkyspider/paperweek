<script setup lang="ts">
/** The left sidebar: every life-theme, each with its watercolor swatch and backlog, plus the
 *  "add a theme" affordance at the bottom.
 *
 *  Also owns drag-to-reorder for the theme list: `ThemeCard`'s header is the drag SOURCE (see
 *  its own doc comment), and this component is the drop TARGET — capture-phase listeners on
 *  the WHOLE `<aside>`, deliberately wider than just the card list, so a real drop always lands
 *  somewhere.  a theme drag never falls through to a `ThemeCard`/`AddTaskInline`'s own
 *  drop handling (built for TASK drags, and covering most of a card's body via its backlog
 *  lines), while a genuine task drag is left completely alone to bubble through untouched
 *  (`isThemeDrag` gates every handler below). Listening on the card-list `<div>` alone isn't
 *  enough: that box is exactly as tall as its rendered children, and a real drag reordering
 *  toward the top or bottom of the list very plausibly ends with the pointer a few pixels
 *  outside it (over the "Life themes" label, or the paper below the last card) — capture-phase
 *  listeners only see events whose target is a DESCENDANT, so a drop that lands there would
 *  never have reached a listener scoped to the tight list box. The indicator's own geometry
 *  (`updateDropTarget`) still keys off `listEl`'s card rects regardless of where the listeners
 *  sit. The drop indicator is ONE absolutely-positioned line, repositioned to whichever gap the
 *  cursor is nearer to — absolute so it never nudges the gap-3 rhythm between cards (no
 *  inserted-and-removed flex sibling to fight the layout over). Reuses `useDragOverTracking`'s
 *  decaying "am I still being dragged over" tracker (same self-healing rationale as
 *  `ThemeCard`'s own card-wide wash: a stuck indicator is a worse failure than a briefly-late-
 *  clearing one). */
import { onBeforeUnmount, onMounted, ref, nextTick } from 'vue'
import { THEME_PALETTE, useThemesStore } from '~/stores/themes'
import { useDragOverTracking } from '~/composables/useDragOverTracking'
import { isThemeDrag, themeIdFromDrag } from '~/utils/dnd'

const themes = useThemesStore()

const adding = ref(false)
const draftName = ref('')
const draftColor = ref<string>(THEME_PALETTE[0])
const nameInput = ref<HTMLInputElement | null>(null)

async function reveal() {
  adding.value = true
  draftName.value = ''
  draftColor.value = THEME_PALETTE[Math.floor(Math.random() * THEME_PALETTE.length)]!
  await nextTick()
  nameInput.value?.focus()
}

async function submit() {
  const name = draftName.value.trim()
  if (!name) { cancel(); return }
  await themes.addTheme(name, draftColor.value)
  cancel()
}

function cancel() {
  adding.value = false
  draftName.value = ''
}

// --- Drag-to-reorder -------------------------------------------------------------------

const listEl = ref<HTMLElement | null>(null)
const { current: dropIndex, markOver: markDropIndex, clear: clearDropIndex } = useDragOverTracking<number>()
/** Pixel offset of the indicator line, relative to `listEl`'s own top — recomputed on every
 *  dragover alongside `dropIndex`; stale-but-invisible between drags is fine (the line's
 *  opacity, not its position, is what `dropIndex` gates). */
const indicatorTop = ref<number | null>(null)

/** Reads `[data-theme-row]` — the fallthrough `data-` attribute lands on each `ThemeCard`'s own
 *  root element (Vue's default attr inheritance), so no extra wrapper div is needed per card. */
function cardRects(): DOMRect[] {
  return Array.from(listEl.value?.querySelectorAll<HTMLElement>('[data-theme-row]') ?? []).map(el =>
    el.getBoundingClientRect(),
  )
}

/** Where, among the N cards, the cursor currently sits — "insert before card i" for 0..N-1, or
 *  N to mean "at the end" — purely geometric (each card's own vertical midpoint), plus the
 *  indicator's own on-screen offset for that same gap (the midpoint BETWEEN two cards, or 6px
 *  outside the first/last one). */
function updateDropTarget(clientY: number): void {
  const container = listEl.value
  const rects = cardRects()
  if (!container || rects.length === 0) { indicatorTop.value = null; return }
  const containerTop = container.getBoundingClientRect().top
  let idx = rects.length
  for (let i = 0; i < rects.length; i++) {
    if (clientY < rects[i]!.top + rects[i]!.height / 2) { idx = i; break }
  }
  const GAP_HALF = 6 // half of the list's own gap-3 (12px) — centers the line in the real gap
  indicatorTop.value =
    idx === 0 ? rects[0]!.top - containerTop - GAP_HALF
    : idx >= rects.length ? rects[rects.length - 1]!.bottom - containerTop + GAP_HALF
    : (rects[idx - 1]!.bottom + rects[idx]!.top) / 2 - containerTop
  markDropIndex(idx)
}

function onListDragOver(e: DragEvent): void {
  if (!isThemeDrag(e)) return
  e.preventDefault()
  e.stopPropagation()
  updateDropTarget(e.clientY)
}

/** Standard reorder-list arithmetic: drop the dragged id out of the current order, then
 *  reinsert it at `idx` — adjusted down by one when the dragged card sat BEFORE `idx`, since
 *  removing it shifts everything after it left by one slot. */
function reorderedIds(draggedId: string, idx: number): string[] {
  const ids = themes.active.map(t => t.id)
  const from = ids.indexOf(draggedId)
  if (from === -1) return ids
  const without = ids.filter(id => id !== draggedId)
  const insertAt = Math.max(0, Math.min(from < idx ? idx - 1 : idx, without.length))
  without.splice(insertAt, 0, draggedId)
  return without
}

function onListDrop(e: DragEvent): void {
  if (!isThemeDrag(e)) return
  e.preventDefault()
  e.stopPropagation()
  const id = themeIdFromDrag(e)
  const idx = dropIndex.value
  clearDropIndex()
  if (!id || idx === null) return
  const next = reorderedIds(id, idx)
  void themes.reorderThemes(next)
}

function onListDragLeave(e: DragEvent): void {
  if (!isThemeDrag(e)) return
  // Only clear when the pointer has actually left the whole sidebar (not just moved from one
  // child to another, which also fires dragleave on the child) — checked via relatedTarget
  // against `currentTarget` (the `<aside>` these listeners are bound to, valid during capture),
  // with the decaying tracker as the fallback for browsers/cases where relatedTarget is null.
  const next = e.relatedTarget as Node | null
  const aside = e.currentTarget as HTMLElement | null
  if (!next || !aside?.contains(next)) clearDropIndex()
}

/** Instant clear on `dragend` — same belt-and-braces fast path `ThemeCard`/`AddTaskInline` use
 *  on top of `useDragOverTracking`'s own decay: fires on the drag SOURCE regardless of where
 *  (or whether) a drop landed, so the indicator never lingers through a cancelled (Escape) or
 *  off-target drag. */
onMounted(() => document.addEventListener('dragend', clearDropIndex))
onBeforeUnmount(() => document.removeEventListener('dragend', clearDropIndex))
</script>

<template>
  <aside
    class="no-scrollbar flex h-full w-[280px] shrink-0 flex-col gap-3 overflow-y-auto bg-[var(--paper)] p-4"
    @dragover.capture="onListDragOver"
    @drop.capture="onListDrop"
    @dragleave.capture="onListDragLeave"
  >
    <h1 class="font-hand px-1 text-[30px] font-bold leading-none text-[var(--ink)]">
      Paperweek
    </h1>
    <p class="gouache-underline font-hand mb-1 inline-block w-fit px-1 text-lg font-semibold text-[var(--ink-soft)]">
      Life themes
    </p>

    <p v-if="themes.unreachable" class="px-1 text-xs text-[var(--danger)]">
      {{ themes.error }}
    </p>
    <p v-else-if="themes.loaded && !themes.active.length && !adding" class="px-1 text-xs italic text-[var(--ink-faint)]">
      No themes yet — add your first one below.
    </p>

    <div ref="listEl" class="relative flex flex-col gap-3">
      <ThemeCard v-for="t in themes.active" :key="t.id" :theme="t" data-theme-row />
      <div
        class="theme-drop-line"
        :class="{ 'theme-drop-line--active': dropIndex !== null }"
        :style="indicatorTop !== null ? { top: `${indicatorTop}px` } : {}"
      />
    </div>

    <div v-if="adding" class="paper-card paper-card--soft flex flex-col gap-2 p-3">
      <input
        ref="nameInput"
        v-model="draftName"
        type="text"
        placeholder="Theme name…"
        class="w-full border-0 border-b border-dashed border-[var(--accent-ink)] bg-transparent text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
        @keyup.enter="submit"
        @keyup.esc="cancel"
      >
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          v-for="c in THEME_PALETTE"
          :key="c"
          type="button"
          class="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
          :style="{ background: c, borderColor: draftColor === c ? 'var(--ink)' : 'transparent' }"
          :aria-label="`Pick color ${c}`"
          @click="draftColor = c"
        />
      </div>
      <div class="flex justify-end gap-3 pt-1">
        <button type="button" class="text-xs text-[var(--ink-faint)] hover:text-[var(--ink)]" @click="cancel">Cancel</button>
        <button type="button" class="text-xs font-semibold text-[var(--accent-ink)] hover:text-[var(--accent-ink-dark)]" @click="submit">Add theme</button>
      </div>
    </div>
    <button
      v-else
      type="button"
      class="rounded-none px-2 py-1.5 text-left text-sm font-medium text-[var(--accent-ink)] opacity-80 transition-opacity hover:opacity-100"
      @click="reveal"
    >
      + add a theme
    </button>
  </aside>
</template>
