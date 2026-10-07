/**
 * The rules for asking Gremly's questions, held in one place (data fabric
 * stage 4a). Every place that asks one keeps to them: the brief (the daily
 * picture chooses at most one, context/daily.js), the wrap up
 * (lib/wrapup/questions.ts, whose numbers a test holds to these) and, once the
 * Worlds build has it, the one button above the box on Worlds.
 *
 * Decided by James on 5 Oct for questions about Worlds and Chapters, and the
 * same for every question: nothing is asked at the moment of dropping, a
 * question only uses a place Gremly already asks in, and never adds one.
 *
 * Code applies counts, dates and ids here. Which question is worth asking is
 * still the writer's judgment, among the ones these rules allow.
 */

/** At most this many questions in each place. */
export const QUESTION_CAPS = Object.freeze({
  // the brief: one a day, and none on a return day (brief/index.js)
  brief: 1,
  // the wrap up: two a night
  wrap: 2,
  // the one button above the box on Worlds
  worlds: 1,
});

/**
 * At most this many suggestions to start a Chapter open at once. The writers
 * of those questions come in stage 4b and check this before they write; the
 * database holds it too (gremly_questions_one_open_start_idx).
 */
export const OPEN_CHAPTER_SUGGESTIONS = 1;

/** A question put to them this many days ago or less, and skipped or left, waits. */
export const ASKED_WAIT_DAYS = 3;

/** What a question is about (gremly_questions.kind). */
export const QUESTION_KINDS = Object.freeze([
  // something on record about them (the reader and the weekly pass)
  'fact',
  // starting a Chapter, from the things it would hold
  'start_chapter',
  // closing a Chapter whose dates have passed, or that the records show is over
  'close_chapter',
  // a Chapter that ended while they were away
  'while_away',
]);

function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The fact a question was asked about, as the select returns it (one row or a list of one). */
function factOf(q) {
  return Array.isArray(q?.fact) ? q.fact[0] || null : q?.fact || null;
}

/**
 * The questions that may be asked on this day at all, oldest first: never one
 * about something private or about health, one held until a later day, one put
 * to them in the last few days, one already asked today, or one tied to an
 * item decided today. Pure.
 *
 * @param questions rows with question, created_at, asked_at, hold_until,
 *   record_id and fact (private, health)
 * @param day the person's day, YYYY-MM-DD
 */
export function askableQuestions(questions, { day, askedToday = new Set(), decidedIds = new Set() }) {
  const askedSince = addDays(day, -ASKED_WAIT_DAYS);
  return (questions || [])
    .filter((q) => q && String(q.question || '').trim())
    .filter((q) => {
      const f = factOf(q);
      return !q.private && !f?.private && !f?.health;
    })
    .filter((q) => !q.hold_until || String(q.hold_until).slice(0, 10) <= day)
    .filter((q) => !q.asked_at || String(q.asked_at).slice(0, 10) < askedSince)
    .filter((q) => !askedToday.has(q.id))
    .filter((q) => !q.record_id || !decidedIds.has(q.record_id))
    .slice()
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}
