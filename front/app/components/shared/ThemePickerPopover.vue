<script setup lang="ts">
/**
 * The ONE theme picker — a small floating list of swatch **+ name** options, anchored under
 * whatever dot opened it. Names are the whole point: seven or more pastel washes are genuinely
 * indistinguishable from each other as bare circles, so a colour-only picker is not a picker
 * (Mark's ruling, 2026-09-10 — see docs/process/evidence/headings-2026-09-10/RULINGS.md).
 *
 * Lifted verbatim out of DaySection.vue so the day card's margin dot and a bold heading's
 * edit-mode dot (TaskChip.vue) share one implementation rather than drifting into two.
 *
 * Teleported to <body> and fixed-positioned from the trigger's own `getBoundingClientRect()`
 * rather than sitting `position: absolute` in place: `.ruled-line` clips overflow on both axes
 * to hold the one-grid-unit row height, so an in-place popover would be silently invisible.
 *
 * The caller owns "is it open and for what" (it is the one with several dots), and hands this
 * component the trigger element so the outside-click check can recognise it — see `onDocClick`.
 */
import { nextTick, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import type { Theme } from '~/stores/themes'

const props = defineProps<{
  open: boolean
  /** The dot BUTTON that opened this popover. Read by `onDocClick` below — see its comment. */
  trigger: HTMLElement | null
  themes: Theme[]
  selectedId: string | null
}>()

const emit = defineEmits<{ select: [themeId: string]; close: [] }>()

const pos = ref<{ top: number; left: number }>({ top: 0, left: 0 })
const panel = ref<HTMLElement | null>(null)

/** Below the dot by default; ABOVE it when there isn't room below — and never off either edge.
 *  This is not cosmetic: the panel is `position: fixed`, so a list that overflows the bottom of
 *  the window cannot be scrolled to and its lower options are simply unreachable. That bit a real
 *  case the moment a heading's own dot could sit near the foot of a long sidebar (the day card's
 *  margin dot, which this was lifted from, had the same latent flaw). Measured in two passes —
 *  place, `nextTick`, then re-place now that the panel has a real height. */
async function place(): Promise<void> {
  const trigger = props.trigger
  if (!trigger) return
  const r = trigger.getBoundingClientRect()
  pos.value = { top: r.bottom + 4, left: r.left }
  await nextTick()
  const el = panel.value
  if (!el) return
  const GAP = 4
  const MARGIN = 8
  const h = el.offsetHeight
  const w = el.offsetWidth
  let top = r.bottom + GAP
  if (top + h > window.innerHeight - MARGIN) {
    const above = r.top - GAP - h
    top = above >= MARGIN ? above : Math.max(MARGIN, window.innerHeight - MARGIN - h)
  }
  const left = Math.max(MARGIN, Math.min(r.left, window.innerWidth - w - MARGIN))
  pos.value = { top, left }
}

watch(
  () => [props.open, props.trigger] as const,
  ([open, trigger]) => { if (open && trigger) void place() },
  { immediate: true },
)

/** Root-caused bug (task 27), kept intact through the lift: this is a real, non-Vue
 *  `document.addEventListener('click', …)` — needed so it also catches clicks OUTSIDE the
 *  opener's own tree (another day-section's dot, empty page background); a Vue `@click` binding
 *  only ever sees clicks inside its own template. Because a native click bubbles all the way to
 *  `document` in the SAME synchronous dispatch as the click that just opened the popover
 *  (target-phase `togglePicker` runs first, then bubbling continues up through that exact button
 *  to `document`), this used to see that SAME click, find the popover open and the target outside
 *  `panel` (freshly opened, possibly not even rendered yet this tick) — and close it before a
 *  frame painted. Real mouse clicks hit this every time; `el.click()` in a test dodged it, which
 *  is what made it look automation-only. The fix is recognising the trigger BUTTON itself, not
 *  just the panel. */
function onDocClick(e: MouseEvent): void {
  if (!props.open) return
  const target = e.target as Node
  if (props.trigger && props.trigger.contains(target)) return
  if (panel.value && !panel.value.contains(target)) emit('close')
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))

/** Cheap keyboard nav within the open list — Tab already reaches every option and Enter/Space
 *  already activates one (they're plain buttons), so this only adds Arrow keys moving focus
 *  between them without leaving the list. */
function onKeydown(e: KeyboardEvent): void {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  e.preventDefault()
  const items = Array.from(panel.value?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])
  if (!items.length) return
  const i = items.indexOf(document.activeElement as HTMLElement)
  const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length
  items[next]?.focus()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="panel"
      role="listbox"
      aria-label="Choose theme"
      class="paper-card fixed z-30 min-w-[10rem] p-1"
      :style="{ top: `${pos.top}px`, left: `${pos.left}px` }"
      @keydown="onKeydown"
      @keydown.esc="emit('close')"
    >
      <!-- `@mousedown.prevent` is load-bearing wherever this picker is opened from a line that is
           mid-rename (a bold heading's edit-mode dot): without it the mousedown blurs the rename
           input, the blur-commit closes edit mode, the row re-renders — in the backlog it can
           unmount outright — and the click never reaches a button that no longer exists. -->
      <button
        v-for="th in themes"
        :key="th.id"
        type="button"
        role="option"
        :aria-selected="selectedId === th.id"
        class="font-ui flex w-full items-center gap-2 rounded-none px-2 py-1 text-left text-xs text-[var(--ink-soft)] transition-colors hover:text-[var(--accent-ink)]"
        @mousedown.prevent
        @click="emit('select', th.id)"
      >
        <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ background: th.color }" aria-hidden="true" />
        {{ th.name }}
      </button>
    </div>
  </Teleport>
</template>
