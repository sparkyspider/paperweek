/**
 * Plain YYYY-MM-DD date handling — no TZ math server-side (SPEC.md / API contract). Dates
 * are stored as `@db.Date` columns; this is the one place a wire string is turned into a
 * `Date` for Prisma and back, so every route agrees on the shape.
 */

export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' → a UTC midnight Date for a `@db.Date` column. */
export function dateOnlyToDb(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00.000Z`);
}

/** A `@db.Date` column's value → 'YYYY-MM-DD', with no timezone shift. */
export function dbDateToString(d: Date): string {
  return d.toISOString().slice(0, 10);
}
