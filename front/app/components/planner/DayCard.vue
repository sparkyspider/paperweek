<script setup lang="ts">
/** One day, full vertical height: a date header (today softly highlighted with the warm
 *  accent) over one continuous sheet of ruled paper — Morning, Afternoon, Evening and Notes
 *  are regions of that single sheet (see DaySection), not separate boxes. Weekends are
 *  ordinary cards, just subtly warmer — no collapsing, no special chrome. */
import { fmtISO, fmtDayNumber } from '~/utils/dates'

const props = defineProps<{ date: Date; isToday: boolean }>()

const dateISO = fmtISO(props.date)
const dayName = props.date.toLocaleDateString(undefined, { weekday: 'long' })
const dow = props.date.getDay()
const isWeekend = dow === 0 || dow === 6
</script>

<template>
  <div
    class="day-card paper-card flex h-full w-[380px] shrink-0 flex-col p-4"
    :class="[isToday ? 'today-wash' : '', !isToday && isWeekend ? 'weekend-wash' : '']"
  >
    <header class="mb-1 flex shrink-0 items-baseline justify-between gap-2 px-1">
      <h3
        class="font-hand text-[26px] font-semibold leading-none text-[var(--ink)]"
        :class="isToday ? 'gouache-underline' : ''"
      >
        {{ dayName }}
      </h3>
      <span class="font-ui text-xs text-[var(--ink-soft)]">{{ fmtDayNumber(date) }}</span>
    </header>

    <!-- One continuous sheet of ruled lines for the whole card — the four dayparts are just
         regions of it (marked by their watermark, see DaySection), never separate boxes, so
         the ruling never seams or breaks between them. -->
    <div class="ruled-paper day-lines relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden pl-7 pr-1 [--line-h:34px]">
      <DaySection :date-i-s-o="dateISO" daypart="morning" label="Morning" />
      <DaySection :date-i-s-o="dateISO" daypart="afternoon" label="Afternoon" />
      <DaySection :date-i-s-o="dateISO" daypart="evening" label="Evening" />
      <DaySection :date-i-s-o="dateISO" daypart="notes" label="Notes" />
    </div>
  </div>
</template>
