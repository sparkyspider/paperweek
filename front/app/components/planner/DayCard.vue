<script setup lang="ts">
/** One day, full vertical height: a date header (today softly highlighted with the warm
 *  accent) over a ruled sheet split into Morning / Afternoon / Evening / Notes (see
 *  DaySection) — each leads with a one-ruling-unit label band, so the boundary between
 *  sections doubles as that section's ghost label and no writable line ever sits under one.
 *  Weekends are ordinary cards, just subtly warmer — no collapsing, no special chrome.
 *
 *  Line-budget policy: rather than a flat fixed row count per section, the number of ruled
 *  rows each section gets is computed from the CARD'S OWN RENDERED HEIGHT (a ResizeObserver on
 *  `.day-lines`) minus the four label bands, divided into `--line-h` units. Morning/Afternoon/
 *  Evening each get just enough rows for their own content (plus one trailing blank, floor 3);
 *  Notes absorbs whatever's left (also floor 3) — the flexible tail, like a real planner. If a
 *  very full day needs more rows than the budget allows, `.day-lines` already scrolls
 *  (overflow-y-auto) rather than clipping; the ruling scrolls WITH the content because it's
 *  painted per-section (inside the scrolled content), not on the scrolling container itself —
 *  see `.day-sheet` in main.css, which also carries the margin line so IT scrolls as part of
 *  the sheet too, instead of sitting fixed while text slides under it. */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { fmtISO, fmtDayNumber } from '~/utils/dates'
import { useTasksStore, type Daypart } from '~/stores/tasks'
import { useThemesStore } from '~/stores/themes'
import { occupiedLineCount } from '~/composables/useAutosaveLines'
import { useThemeVisibility } from '~/composables/useThemeVisibility'
import { useDragTaught } from '~/composables/useDragTaught'

const props = defineProps<{ date: Date; isToday: boolean }>()

const dateISO = fmtISO(props.date)
const dayName = props.date.toLocaleDateString(undefined, { weekday: 'long' })
const dow = props.date.getDay()
const isWeekend = dow === 0 || dow === 6

const tasks = useTasksStore()
const themes = useThemesStore()
const visibility = useThemeVisibility()
const dragTaught = useDragTaught()

/** Must match the `--line-h` custom property set on `.day-lines` below — plain JS mirror of it
 *  because the budget math runs in JS (ResizeObserver), not CSS. */
const LINE_H = 34
/** Never render a section thinner than this, even wafer-empty. */
const FLOOR = 3

const linesEl = ref<HTMLElement | null>(null)
/** Sane pre-measurement default (four floor-sized sections) so nothing renders at zero height
 *  before the first ResizeObserver callback fires. */
const budgetLines = ref(FLOOR * 4)

/** No more `BANDS` subtraction (label-geometry rework): each section's un-ruled label band
 *  collapsed — the ghost label now lives inside the section's own first row (see
 *  DaySection.vue / .section-watermark in main.css) instead of displacing a row of its own — so
 *  every `--line-h` of the card's actual height converts straight into a usable line, four rows
 *  more per card than before. */
function measure(): void {
  const h = linesEl.value?.clientHeight ?? 0
  budgetLines.value = Math.max(0, Math.floor(h / LINE_H))
}

let ro: ResizeObserver | null = null
onMounted(() => {
  measure()
  ro = new ResizeObserver(() => measure())
  if (linesEl.value) ro.observe(linesEl.value)
})
onBeforeUnmount(() => ro?.disconnect())

/** How many rows a section needs to show every one of its own tasks plus a trailing blank —
 *  same "occupied + 1" shape as the sidebar's dynamicTrailing, just with a floor instead of
 *  always exactly one blank (a day section keeps some breathing room even near-empty). `floor`
 *  is a param, not always the bare constant, so Morning/Afternoon/Evening can carry one more
 *  line of it than Notes does — see SECTION_FLOOR below. */
function need(daypart: Daypart, floor: number = FLOOR): number {
  const list = tasks.forCell(dateISO, daypart).filter(t => visibility.isVisible(t.themeId))
  return Math.max(occupiedLineCount(list) + 1, list.length + 1, floor)
}

/** Morning/Afternoon/Evening each carry one extra line of breathing room under their label zone
 *  (Mark's call) — Notes keeps the bare FLOOR. Still one ordinary RULED line, not an un-ruled
 *  gap (lined paper has no unruled gaps): the grid rhythm is exact either way, this just changes
 *  how many of those rows a lightly-filled section gets before Notes starts absorbing the
 *  remainder. */
const SECTION_FLOOR = FLOOR + 1

const morningLines = computed(() => need('morning', SECTION_FLOOR))
const afternoonLines = computed(() => need('afternoon', SECTION_FLOOR))
const eveningLines = computed(() => need('evening', SECTION_FLOOR))
/** Notes gets its own minimum need, but grows to fill whatever's left of the budget. */
const notesLines = computed(() => {
  const used = morningLines.value + afternoonLines.value + eveningLines.value
  return Math.max(need('notes'), budgetLines.value - used)
})

/** First-drag teaching note (task 22) — every precondition but "already taught" (that's
 *  reactively re-checked inside DaySection.vue, so the note vanishes the instant a drag lands
 *  anywhere, not just on next load): today, this card has nothing scheduled yet, and at least
 *  one active theme actually has something in its backlog to pull from — otherwise the tip
 *  would be pointing at an empty sidebar. */
const showFirstDragTeaching = computed(() => {
  if (!props.isToday) return false
  const dayparts: Daypart[] = ['morning', 'afternoon', 'evening', 'notes']
  const nothingScheduledToday = dayparts.every(dp => tasks.forCell(dateISO, dp).length === 0)
  if (!nothingScheduledToday) return false
  return themes.active.some(t => tasks.backlogFor(t.id).length > 0)
})

/** Week-density at a glance (task 24): every day card reads the same weight until you read
 *  the ink, so the strip can't show where the busy days are at a squint. A gouache stroke under
 *  the DATE number (not the day name — that's `.gouache-underline`'s full-strength today
 *  marker, a different element so the two treatments never get confused) whose opacity scales
 *  with the day's actual scheduled count, unfiltered by theme visibility (this is about real
 *  workload, not what's currently shown): 0 tasks → none, 1–2 → faint, 3+ → confident, capped
 *  (a slammed day and a merely-busy one both just read as "busy"). */
const scheduledCount = computed(() => {
  const dayparts: Daypart[] = ['morning', 'afternoon', 'evening', 'notes']
  return dayparts.reduce((sum, dp) => sum + tasks.forCell(dateISO, dp).length, 0)
})
const densityOpacity = computed(() => {
  const n = scheduledCount.value
  if (n <= 0) return 0
  if (n <= 2) return 0.32
  return 0.78
})
</script>

<template>
  <div class="day-card flex h-full w-[380px] shrink-0 flex-col p-4">
    <header class="mb-1 flex shrink-0 items-baseline justify-between gap-2 px-1">
      <h3
        class="font-hand text-[26px] font-semibold leading-none text-[var(--ink)]"
        :class="isToday ? 'gouache-underline' : ''"
      >
        {{ dayName }}
      </h3>
      <span
        class="date-density-underline font-stationer text-xs text-[var(--ink-soft)]"
        :style="{ '--density-opacity': densityOpacity }"
      >{{ fmtDayNumber(date) }}</span>
    </header>

    <!-- The scroll viewport: fixed to the card's own rendered height, never itself painted
         (see main.css) — `.day-sheet` inside it is the actual ruled sheet, sized to its natural
         content height, so ruling/content all scroll together as one. `pl-1` matches the
         header's own `px-1` above exactly — the ruled lines' left edge lines up with the day
         name's, per the margin-line removal (no more separate gutter inset). -->
    <div ref="linesEl" class="day-lines relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden no-scrollbar pl-1 pr-1 [--line-h:34px]">
      <div class="day-sheet">
        <DaySection
          :date-i-s-o="dateISO"
          daypart="morning"
          label="Morning"
          :min-lines="morningLines"
          :show-first-drag-tip="showFirstDragTeaching"
        />
        <DaySection :date-i-s-o="dateISO" daypart="afternoon" label="Afternoon" :min-lines="afternoonLines" />
        <DaySection :date-i-s-o="dateISO" daypart="evening" label="Evening" :min-lines="eveningLines" />
        <DaySection :date-i-s-o="dateISO" daypart="notes" label="Notes" :min-lines="notesLines" />
      </div>
    </div>
  </div>
</template>
