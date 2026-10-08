/**
 * When a fact is true (data fabric stage 4d), as the reader judges it and code
 * stores it: one day, a stretch, standing with no date of its own, or the same
 * day every year. Null until judged.
 */
export const FACT_TIMINGS = ['day', 'span', 'standing', 'yearly'];

const TIMING_SET = new Set(FACT_TIMINGS);

/** The timing as given, when it is one of the list; otherwise none. */
export function validTiming(timing) {
  return typeof timing === 'string' && TIMING_SET.has(timing) ? timing : null;
}

/** The rule every prompt that gives a fact its timing carries. */
export const TIMING_RULES = `WHEN A FACT IS TRUE
- Give each fact its timing, by when it is true:
  day: it is about one day, ahead or past.
  span: it is about a stretch of time with a start and an end.
  standing: it holds with no date of its own: how their life runs, what they like, who they are, or who someone is to them. A standing fact has no date, whatever day it was said.
  yearly: it falls on the same day every year. Its date is that day, with the year when it is known.
- An occasion and a plan made around it are separate facts, each with its own timing.`;

/**
 * The next day on or after from (YYYY-MM-DD) that falls on the month and day
 * of date; a 29 February falls on the 28th in other years. The same sum as
 * public.next_yearly. Null without two dates.
 */
export function nextYearly(date, from) {
  const d = String(date || '').slice(0, 10);
  const f = String(from || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return null;
  const month = Number(d.slice(5, 7));
  const day = Number(d.slice(8, 10));
  const on = (year) => {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
  };
  const year = Number(f.slice(0, 4));
  const first = on(year);
  return first >= f ? first : on(year + 1);
}

/**
 * The day a fact is on, as a writer should read it today: a yearly fact on
 * its next day, a standing one on none, any other on its own.
 */
export function dayOn(fact, today) {
  if (!fact?.about_date || fact.timing === 'standing') return null;
  const start = String(fact.about_date).slice(0, 10);
  return fact.timing === 'yearly' && today ? nextYearly(start, today) : start;
}

/**
 * A fact as a writer should read it today: a yearly fact on its next day and
 * marked every_year, a standing fact with no date, any other as it is. A copy;
 * what is stored is never changed.
 */
export function asOfToday(fact, today) {
  if (!fact) return fact;
  if (fact.timing === 'standing' && fact.about_date)
    return { ...fact, about_date: null, about_date_end: null };
  if (fact.timing === 'yearly' && fact.about_date && today)
    return { ...fact, about_date: dayOn(fact, today), about_date_end: null, every_year: true };
  return fact;
}

/**
 * When a fact is true, in words for a reader's line: a standing fact holds
 * with no date of its own, a yearly one comes every year on its day (and its
 * next day from `from`, when given), any other has its dates. Nothing stored
 * is changed.
 */
export function whenTrue(fact, from = null) {
  if (fact?.timing === 'standing') return 'holds with no date of its own';
  const start = fact?.about_date ? String(fact.about_date).slice(0, 10) : null;
  if (!start) return 'no date';
  if (fact.timing === 'yearly')
    return `every year on ${start.slice(5)}${from ? `, next ${nextYearly(start, from)}` : ''}`;
  const end = fact.about_date_end ? String(fact.about_date_end).slice(0, 10) : null;
  return `${start}${end && end !== start ? ` to ${end}` : ''}`;
}

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
  if (fact?.timing === 'standing') return 'undated';
  const start = fact?.about_date ? String(fact.about_date).slice(0, 10) : null;
  if (!start || !today) return 'undated';
  // a yearly fact is ahead until its day comes round again, never passed
  if (fact.timing === 'yearly') return nextYearly(start, today) === today ? 'now' : 'ahead';
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
