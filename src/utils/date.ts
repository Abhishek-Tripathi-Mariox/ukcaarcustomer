/**
 * Calendar-date helpers anchored to IST (UTC+5:30) — mirrors the backend's
 * src/utils/date.ts so the date a rider books is the same civil date the
 * backend (and the driver app) classifies as upcoming/past.
 *
 * A scheduled departure is a civil date + a slot, not an instant. Deriving the
 * date via `Date.toISOString()` is UTC, so IST midnight rolls back a day and
 * "Today" becomes yesterday. UKCAAR is India-only, so all civil dates are IST.
 *
 * RULE: never use `toISOString().slice(0,10)` for a calendar date — use these.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** `YYYY-MM-DD` for the given instant in IST (defaults to now). */
export function istDateStr(d: Date = new Date()): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Minutes since IST midnight for the given instant (defaults to now). */
export function istMinutesOfDay(d: Date = new Date()): number {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}
