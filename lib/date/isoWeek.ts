/**
 * ISO week helpers (local-timezone aware).
 * Extracted from worldsSelectors so cadence heatmaps and world cards share
 * the same week-bucketing logic without duplication.
 */

/**
 * Returns the Monday of the ISO week containing d, at 00:00:00 local time.
 */
export function startOfIsoWeek(d: Date): Date {
  const day = d.getDay() || 7; // Sun = 7
  const offset = day - 1; // Mon = 0
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - offset);
  return r;
}

/**
 * Returns 'YYYY-MM-DD' for the Monday of the ISO week containing d.
 */
export function weekKey(d: Date): string {
  const monday = startOfIsoWeek(d);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const day = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
