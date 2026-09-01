/**
 * Date helpers for the two-week planner. Weeks start Monday. Everything here works in the
 * viewer's LOCAL calendar day — never UTC — so `Date#toISOString()` is deliberately avoided
 * (it would slide a task to the wrong day for anyone west of Greenwich in the evening).
 */

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
export const DAY_NAMES_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** `YYYY-MM-DD` in the local calendar — the wire format the API expects. */
export function fmtISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

/** The Monday of the week containing `d` (Sunday counts as day 7 of the PRECEDING week). */
export function startOfWeekMonday(d: Date): Date {
  const date = new Date(d)
  date.setHours(0, 0, 0, 0)
  const day = date.getDay() // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day
  return addDays(date, diff)
}

/** Monday..Sunday, given the week's Monday. */
export function weekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

export function isSameDate(a: Date, b: Date): boolean {
  return fmtISO(a) === fmtISO(b)
}

/** "3 September" — the friendly date under the day name. */
export function fmtDayNumber(d: Date): string {
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
}
