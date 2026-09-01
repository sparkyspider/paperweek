<script setup lang="ts">
/** The endless horizontal strip of day cards — the whole planner, replacing the old two-week
 *  grid. Starts docked on today at the left edge; extends both directions as the user nears
 *  an edge (lazy date-range fetch + windowed DOM via useDayStrip). Dragging a task near
 *  either edge auto-scrolls the strip so a day off-screen can still be a drop target.
 *
 *  Deliberately no CSS scroll-snap: even `proximity` was cutting a flick's momentum short.
 *  Native momentum runs completely untouched; once the scroll actually comes to rest (native
 *  'scrollend', with a debounced-scroll fallback for browsers that don't fire it — Safari at
 *  time of writing) the nearest card is smoothly docked flush to the left edge in JS. */
import { ref, onMounted, nextTick } from 'vue'
import { fmtISO } from '~/utils/dates'
import { useDayStrip } from '~/composables/useDayStrip'

const { days, todayISO, initialFetch, extendFuture, extendPast } = useDayStrip()

const container = ref<HTMLElement | null>(null)
const busyFuture = ref(false)
const busyPast = ref(false)

/** How close (px) to an edge before the window grows — generous, so the fetch/render lands
 *  well before the user actually reaches blank space. */
const EDGE_PX = 900

/** Matches .day-strip's own left padding (1.25rem) — a docked card's left edge should land
 *  exactly at the strip's visible content start, not at raw scrollLeft 0. */
const STRIP_INSET_PX = 20

function dayEl(dateISO: string): HTMLElement | null {
  return container.value?.querySelector<HTMLElement>(`[data-date="${dateISO}"]`) ?? null
}

/** The date currently at (or just past) the container's left edge — used to keep the strip
 *  visually still when days are added/removed ahead of it. */
function leadingVisibleDate(): string | null {
  const el = container.value
  if (!el) return null
  const left = el.getBoundingClientRect().left
  const kids = el.querySelectorAll<HTMLElement>('[data-date]')
  for (const k of kids) {
    if (k.getBoundingClientRect().right > left) return k.dataset.date ?? null
  }
  return kids[kids.length - 1]?.dataset.date ?? null
}

/** Run a window mutation, then restore scroll position relative to whichever date was
 *  leading the viewport before the mutation — so growing/trimming the window never causes a
 *  visible jump. */
async function withAnchor(mutate: () => Promise<void>): Promise<void> {
  const el = container.value
  if (!el) { await mutate(); return }
  const anchor = leadingVisibleDate()
  const beforeLeft = anchor ? dayEl(anchor)?.getBoundingClientRect().left : undefined

  await mutate()
  await nextTick()

  if (!anchor || beforeLeft === undefined) return
  const afterLeft = dayEl(anchor)?.getBoundingClientRect().left
  if (afterLeft !== undefined) el.scrollLeft += afterLeft - beforeLeft
}

async function onScroll(): Promise<void> {
  const el = container.value
  if (!el) return
  const distRight = el.scrollWidth - (el.scrollLeft + el.clientWidth)
  const distLeft = el.scrollLeft

  if (distRight < EDGE_PX && !busyFuture.value) {
    busyFuture.value = true
    await withAnchor(extendFuture)
    busyFuture.value = false
  }
  if (distLeft < EDGE_PX && !busyPast.value) {
    busyPast.value = true
    await withAnchor(extendPast)
    busyPast.value = false
  }

  scheduleDockFallback()
}

// --- Settle-then-dock: native momentum runs free; once it stops, the nearest card is docked
// flush to the left edge. ------------------------------------------------------------------

let dockTimer: ReturnType<typeof setTimeout> | null = null
let dockInFlight = false

/** Whichever card's left-docked scrollLeft is closest to where the strip actually is right
 *  now — the one requiring the least further travel to dock. */
function nearestDockLeft(): number | null {
  const el = container.value
  if (!el) return null
  const kids = el.querySelectorAll<HTMLElement>('[data-date]')
  let best: number | null = null
  let bestDist = Infinity
  for (const k of kids) {
    const candidate = k.offsetLeft - STRIP_INSET_PX
    const dist = Math.abs(candidate - el.scrollLeft)
    if (dist < bestDist) { bestDist = dist; best = candidate }
  }
  return best
}

function dockToNearest(): void {
  const el = container.value
  if (!el) return
  const target = nearestDockLeft()
  if (target === null) return
  const clamped = Math.max(0, Math.min(target, el.scrollWidth - el.clientWidth))
  if (Math.abs(clamped - el.scrollLeft) < 1) return
  dockInFlight = true
  el.scrollTo({ left: clamped, behavior: 'smooth' })
}

/** Safari (and any other browser without 'scrollend') fallback: dock once no further scroll
 *  event has arrived for a beat. Harmless to also have this armed on browsers that DO fire
 *  'scrollend' — by the time it would fire, the position is already docked and dockToNearest
 *  no-ops (distance < 1px). */
function scheduleDockFallback(): void {
  if (dockTimer !== null) clearTimeout(dockTimer)
  dockTimer = setTimeout(dockToNearest, 140)
}

/** Native settle signal — fires once momentum/inertial scrolling has actually finished. */
function onScrollEndNative(): void {
  if (dockInFlight) { dockInFlight = false; return }
  if (dockTimer !== null) { clearTimeout(dockTimer); dockTimer = null }
  dockToNearest()
}

let autoScrollTimer: ReturnType<typeof setInterval> | null = null
function stopAutoScroll(): void {
  if (autoScrollTimer !== null) { clearInterval(autoScrollTimer); autoScrollTimer = null }
}
function onDragOverStrip(e: DragEvent): void {
  const el = container.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const EDGE = 90
  const step = e.clientX < rect.left + EDGE ? -16 : e.clientX > rect.right - EDGE ? 16 : 0
  if (step === 0) { stopAutoScroll(); return }
  if (autoScrollTimer !== null) return
  autoScrollTimer = setInterval(() => {
    container.value?.scrollBy({ left: step })
    onScroll()
  }, 16)
}

/** Docks today flush at the strip's left edge — same STRIP_INSET_PX math as dockToNearest,
 *  so "jump to today" and "settle after a flick" always agree on where a docked card sits.
 *  Now that the container carries no CSS scroll-snap at all, a plain scrollLeft assignment is
 *  reliable (it previously wasn't — scroll-snap-type was quietly overriding it). */
function scrollToToday(smooth = true): void {
  const el = container.value
  const target = dayEl(todayISO)
  if (!el || !target) return
  const left = Math.max(0, target.offsetLeft - STRIP_INSET_PX)
  if (smooth) el.scrollTo({ left, behavior: 'smooth' })
  else el.scrollLeft = left
}

/** The very first centering has to wait for the strip's own box to settle to its final width
 *  (sidebar/header layout, scrollbars) — a single rAF isn't always enough. A ResizeObserver
 *  that only fires the centering once the size has been quiet for a beat is more robust than
 *  guessing a frame count. */
let centered = false
let settleTimer: ReturnType<typeof setTimeout> | null = null
let resizeObserver: ResizeObserver | null = null

function scheduleInitialCenter(): void {
  if (centered) return
  if (settleTimer !== null) clearTimeout(settleTimer)
  settleTimer = setTimeout(() => {
    if (centered) return
    centered = true
    scrollToToday(false)
    resizeObserver?.disconnect()
  }, 120)
}

onMounted(async () => {
  await initialFetch()
  await nextTick()
  if (container.value) {
    resizeObserver = new ResizeObserver(scheduleInitialCenter)
    resizeObserver.observe(container.value)
  }
  scheduleInitialCenter()
})

defineExpose({ scrollToToday })
</script>

<template>
  <div
    ref="container"
    class="day-strip thin-scroll"
    @scroll="onScroll"
    @dragover.prevent="onDragOverStrip"
    @dragleave="stopAutoScroll"
    @drop="stopAutoScroll"
  >
    <DayCard
      v-for="d in days"
      :key="fmtISO(d)"
      :data-date="fmtISO(d)"
      :date="d"
      :is-today="fmtISO(d) === todayISO"
    />
  </div>
</template>
