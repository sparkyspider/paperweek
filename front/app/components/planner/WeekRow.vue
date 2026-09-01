<script setup lang="ts">
/** One week: Monday–Friday as generous, never-squashed columns, with Saturday+Sunday
 *  collapsing into a slim expandable stub at the end. The row scrolls horizontally on
 *  narrower screens rather than shrinking the day columns. */
import { computed } from 'vue'
import { weekDays, fmtISO, DAY_NAMES, DAY_NAMES_SHORT } from '~/utils/dates'
import { useWeekendExpanded } from '~/composables/useWeekendExpanded'

const props = defineProps<{ label: string; weekKey: string; monday: Date; todayISO: string }>()

const days = computed(() => weekDays(props.monday))
const weekdays = computed(() => days.value.slice(0, 5))
const weekend = computed(() => days.value.slice(5, 7))

const { expanded, toggle } = useWeekendExpanded(props.weekKey)
</script>

<template>
  <section class="flex flex-col gap-2">
    <header class="flex items-baseline gap-3 px-1">
      <h2 class="font-hand text-[26px] font-semibold leading-none text-[var(--ink)]">{{ label }}</h2>
      <button
        v-if="expanded"
        type="button"
        class="text-xs font-medium text-[var(--accent-ink)] opacity-70 hover:opacity-100"
        @click="toggle"
      >
        collapse weekend
      </button>
    </header>

    <div class="thin-scroll flex items-stretch gap-3 overflow-x-auto pb-2">
      <DayColumn
        v-for="(d, i) in weekdays"
        :key="fmtISO(d)"
        :date="d"
        :day-name="DAY_NAMES[i]!"
        :is-today="fmtISO(d) === todayISO"
      />

      <template v-if="expanded">
        <DayColumn
          v-for="(d, i) in weekend"
          :key="fmtISO(d)"
          :date="d"
          :day-name="DAY_NAMES[i + 5]!"
          :is-today="fmtISO(d) === todayISO"
        />
      </template>
      <WeekendStub
        v-else
        :sat-label="DAY_NAMES_SHORT[5]!"
        :sun-label="DAY_NAMES_SHORT[6]!"
        @expand="toggle"
      />
    </div>
  </section>
</template>
