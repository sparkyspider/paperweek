<script setup lang="ts">
/** One day: a soft paper card with a date header (today softly highlighted) and the three
 *  daypart sections. Comfortable min-width, never squashed — the row scrolls horizontally
 *  instead of shrinking these on small screens. */
import { fmtISO, fmtDayNumber } from '~/utils/dates'

const props = defineProps<{ date: Date; dayName: string; isToday: boolean }>()

const dateISO = fmtISO(props.date)
</script>

<template>
  <div
    class="paper-card flex min-w-[210px] flex-1 flex-col gap-3 p-3"
    :class="isToday ? 'today-wash' : ''"
  >
    <header class="flex items-baseline justify-between gap-2 px-1">
      <h3
        class="font-hand text-[22px] font-semibold leading-none text-[var(--ink)]"
        :class="isToday ? 'gouache-underline' : ''"
      >
        {{ dayName }}
      </h3>
      <span class="text-xs text-[var(--ink-soft)]">{{ fmtDayNumber(date) }}</span>
    </header>

    <DaypartSection :date-i-s-o="dateISO" daypart="morning" label="Morning" />
    <div class="h-px bg-[var(--line-soft)]" />
    <DaypartSection :date-i-s-o="dateISO" daypart="afternoon" label="Afternoon" />
    <div class="h-px bg-[var(--line-soft)]" />
    <DaypartSection :date-i-s-o="dateISO" daypart="evening" label="Evening" />
  </div>
</template>
