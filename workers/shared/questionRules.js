/**
 * The rules for asking Gremly's questions, held in one place (data fabric
 * stage 4a, with the people and Chapter questions of stage 4c). Every place that asks one keeps to them: the brief (the daily
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
 * At most this many suggestions to start a Chapter open at once. Their writer
 * (inngest-jobs context/chapterQuestions.js) checks this before it writes;
 * the database holds it too (gremly_questions_one_open_start_idx).
 */
export const OPEN_CHAPTER_SUGGESTIONS = 1;

/**
 * At most this many questions about the people in their life open at once
 * (data fabric stage 4c), so Gremly never asks about people more than one at a
 * time. Their writer checks it; the database holds it too
 * (gremly_questions_one_open_person_idx).
 */
export const OPEN_PERSON_QUESTIONS = 1;

/**
 * Someone is asked about only once this many facts that are neither private
 * nor about health are tied to them: someone who keeps coming up, not someone
 * named once in passing. A count; which of them is worth asking about is the
 * writer's judgment.
 */
export const PERSON_QUESTION_MIN_FACTS = 3;

/**
 * Away this many days before today, and the day they come back is a welcome
 * back (James, 7 Oct): the Chapters whose dates passed while they were away
 * are put to them as one set (context/chapterQuestions.js).
 */
export const WELCOME_BACK_DAYS = 14;

/**
 * Not seen in the app for more than this many days, they are away: nothing new
 * is asked about a Chapter until they are back.
 */
export const AWAY_AFTER_DAYS = 1;

/**
 * Whether Gremly writes questions about Chapters: suggestions to start one,
 * closing one past its dates, and the welcome back. Built and replayed in
 * stage 4c and left off until the Worlds build can act on an answer
 * (CHAPTER_QUESTIONS = "on" in wrangler.toml switches them on).
 */
export function chapterQuestionsOn(env) {
  return String(env?.CHAPTER_QUESTIONS ?? '').trim() === 'on';
}

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
  // someone in their life: who they are, their name, or whether two are one
  'person',
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

/**
 * The welcome back the daily picture points to: the newest set of questions
 * about Chapters that passed while they were away, still open. Pure; null
 * when there is none, which is always while Chapter questions are off.
 * @returns {{ set_id, count } | null}
 */
export function welcomeBackOf(questions) {
  const open = (questions || []).filter(
    (q) => q?.kind === 'while_away' && q.set_id && ['open', 'asked', undefined].includes(q.status),
  );
  if (!open.length) return null;
  const newest = open.reduce((a, b) => (String(b.created_at) > String(a.created_at) ? b : a));
  return { set_id: newest.set_id, count: open.filter((q) => q.set_id === newest.set_id).length };
}
