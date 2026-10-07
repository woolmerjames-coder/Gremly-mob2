/**
 * Where a fact's date stands against the person's today. An exact comparison
 * of dates, which is code's to make; whether a passed plan happened is the
 * reader's or the weekly pass's judgment, never this file's.
 *
 *   ahead    it starts after today
 *   now      today falls within it
 *   passed   it ended before today
 *   undated  it has no date
 */
export function factTiming(fact, today) {
  const start = fact?.about_date ? String(fact.about_date).slice(0, 10) : null;
  if (!start || !today) return 'undated';
  const end = fact.about_date_end ? String(fact.about_date_end).slice(0, 10) : start;
  if (end < today) return 'passed';
  if (start > today) return 'ahead';
  return 'now';
}

/** A plan whose date has gone by. It is never handed to a writer as ahead. */
export function planPassed(fact, today) {
  return fact?.state === 'planned' && factTiming(fact, today) === 'passed';
}

/** The state as a writer should read it: a passed plan says so. */
export function stateWords(fact, today) {
  return planPassed(fact, today) ? 'planned, date passed' : fact?.state || '';
}
