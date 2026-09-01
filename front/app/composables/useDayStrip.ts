/**
 * The endless day strip's date window. Starts centred on today and grows in both directions
 * as `DayStrip.vue` reports the user scrolling near an edge — the DOM stays bounded (never
 * more than `MAX_DAYS` cards) by trimming the far side once the window outgrows that cap, but
 * today itself is never trimmed away no matter how far the user has scrolled.
 *
 * Task data is fetched in range chunks as the window grows (`GET /api/tasks?from&to`), not
 * for the whole window at once — each `extendFuture`/`extendPast` call only asks the store
 * for the newly-added slice.
 */
import { ref, computed } from 'vue'
import { addDays, fmtISO } from '~/utils/dates'
import { useTasksStore } from '~/stores/tasks'

const INITIAL_RADIUS = 30
const EXTEND_BY = 21
const MAX_DAYS = 180

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

export function useDayStrip() {
  const tasks = useTasksStore()

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayISO = fmtISO(today)

  const startDate = ref(addDays(today, -INITIAL_RADIUS))
  const endDate = ref(addDays(today, INITIAL_RADIUS))

  const days = computed<Date[]>(() => {
    const list: Date[] = []
    let d = startDate.value
    while (d.getTime() <= endDate.value.getTime()) {
      list.push(d)
      d = addDays(d, 1)
    }
    return list
  })

  function initialFetch(): Promise<void> {
    return tasks.fetchRange(fmtISO(startDate.value), fmtISO(endDate.value))
  }

  /** Grow the window one chunk further into the future. If that pushes the window past
   *  MAX_DAYS, trim the same amount off the past end — but never past today. */
  async function extendFuture(): Promise<void> {
    const from = addDays(endDate.value, 1)
    endDate.value = addDays(endDate.value, EXTEND_BY)
    const fetching = tasks.fetchRange(fmtISO(from), fmtISO(endDate.value))

    const span = daysBetween(startDate.value, endDate.value) + 1
    if (span > MAX_DAYS) {
      const trimmed = addDays(startDate.value, span - MAX_DAYS)
      if (trimmed.getTime() < today.getTime()) startDate.value = trimmed
    }
    await fetching
  }

  /** Grow the window one chunk further into the past. Mirrors extendFuture, trimming the
   *  future end instead — again, never past today. */
  async function extendPast(): Promise<void> {
    const to = addDays(startDate.value, -1)
    startDate.value = addDays(startDate.value, -EXTEND_BY)
    const fetching = tasks.fetchRange(fmtISO(startDate.value), fmtISO(to))

    const span = daysBetween(startDate.value, endDate.value) + 1
    if (span > MAX_DAYS) {
      const trimmed = addDays(endDate.value, -(span - MAX_DAYS))
      if (trimmed.getTime() > today.getTime()) endDate.value = trimmed
    }
    await fetching
  }

  return { days, todayISO, initialFetch, extendFuture, extendPast }
}
