/**
 * What every weekly read must get right (the plan's replay checks), looked at
 * as structure, ids, dates and numbers. Nothing here judges what the words
 * mean: the one thing that needs reading, discretion about health, goes to a
 * judge model (run.mjs).
 *
 * The worker's own check (checkRead) has already dropped anything with an id
 * it was not given, a date out of place or a count over its limit, so a read
 * that reaches the app is always sound. Here a drop is a failure: it means
 * the model did not follow the prompt, which is what a replay is for.
 */

import { daysBetween } from '../../workers/shared/week.js';
import { READ_LIMITS } from '../../workers/inngest-jobs/week/read.js';

/** Everything Gremly wrote in a read, each with where it sits. */
export function wordsOf(read) {
  const out = [];
  const add = (where, text) => {
    if (typeof text === 'string' && text.trim()) out.push({ where, text });
  };
  add('challenge', read.challenge?.headline);
  add('why', read.challenge?.why);
  for (const e of read.evidence || []) add('evidence', `${e.figure} ${e.label}`);
  add('coming off', read.coming_off);
  for (const c of read.coming_up || []) add('coming up', c.what);
  for (const p of read.priority_options || []) {
    add('priority', p.text);
    add('priority why', p.why);
  }
  for (const line of read.intention_drafts || []) add('intention', line);
  add('free hours reason', read.free_hours_guess?.reason);
  for (const m of read.milestones || []) {
    add('milestone', m.goal);
    for (const s of m.steps || []) add('milestone step', s.title);
  }
  for (const n of read.needs_you || []) {
    add('needs you', n.title);
    add('needs you why', n.stuck_because);
    add('needs you question', n.question);
    for (const a of n.answers || []) add('needs you answer', a);
  }
  for (const h of read.habit_days || []) add('habit reason', h.reason);
  return out;
}

const DASH = /[–—]|\s-\s|--/;

/**
 * The numbers the code gave: every number in the input once the dates, the
 * times of day and the short ids are taken out, so a year or an id is never
 * mistaken for a figure.
 */
export function figuresGiven(input) {
  const plain = String(input || '')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}(?::\d{2})?(?:am|pm)\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}\b/g, ' ')
    .replace(/\b[thdc]\d+\b/g, ' ');
  return new Set((plain.match(/\d+(?:\.\d+)?/g) || []).map(Number));
}

/**
 * How much of a needs you title is made of its todos' own words: the share of
 * its longer words that one of those todos' names has too, by how each word
 * starts, so a word in another form still counts. A measure for the replay
 * alone, to compare one prompt with another.
 */
const starts = (text) =>
  String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3)
    .map((w) => w.slice(0, 4));
export function ownWords(title, itemTitles) {
  const mine = starts(title);
  if (!mine.length) return 1;
  const theirs = new Set(itemTitles.flatMap(starts));
  return mine.filter((w) => theirs.has(w)).length / mine.length;
}

export function checkRun(s, out) {
  const checks = [];
  const add = (level, name, ok, detail = '') => checks.push({ level, name, ok: !!ok, detail });
  const g = s.g;
  const read = out.read;
  const today = g.today;

  const drops = [...new Set((out.dropped || []).map((d) => `${d.what}: ${d.why}`))];
  add('fail', 'Nothing had to be dropped by the code check', !drops.length, drops.join('; '));

  // every id is one of theirs
  const todoIds = new Set(g.todos.map((t) => t.id));
  const habitIds = new Set(g.habits.map((h) => h.id));
  const datedIds = new Set([...g.dated.map((d) => d.id), ...todoIds]);
  const strays = [
    ...read.priority_options.flatMap((p) => p.item_ids).filter((id) => !todoIds.has(id)),
    ...read.needs_you.flatMap((n) => n.item_ids).filter((id) => !todoIds.has(id)),
    ...read.habit_days.map((h) => h.habit_id).filter((id) => !habitIds.has(id)),
    ...read.milestones.map((m) => m.about.id).filter((id) => !datedIds.has(id)),
  ];
  add('fail', 'Every id is real', !strays.length, strays.join(', '));

  // the figures quoted are figures the code gave
  const given = figuresGiven(out.input);
  const wrong = [];
  for (const e of read.evidence) {
    for (const n of (e.figure.match(/\d+(?:\.\d+)?/g) || []).map(Number)) {
      if (!given.has(n)) wrong.push(`${e.figure} (${e.label})`);
    }
  }
  add('fail', "The figures quoted match the code's figures", !wrong.length, wrong.join('; '));
  add(
    'fail',
    'Two to four evidence figures',
    read.evidence.length >= 2 && read.evidence.length <= READ_LIMITS.evidence,
    `${read.evidence.length}`,
  );

  const dashed = wordsOf(read).filter((w) => DASH.test(w.text));
  add('fail', 'No dashes', !dashed.length, dashed.map((w) => `${w.where}: ${w.text}`).join(' | '));

  // the short ids are for the id fields: none belongs in what the person reads
  const withIds = wordsOf(read).filter((w) => /\b[thdc]\d+\b/.test(w.text));
  add(
    'fail',
    'No id in what Gremly wrote',
    !withIds.length,
    withIds.map((w) => `${w.where}: ${w.text}`).join(' | '),
  );
  // nor a date in the form the data gives it
  const rawDates = wordsOf(read).filter((w) => /\b\d{4}-\d{2}-\d{2}\b/.test(w.text));
  add(
    'fail',
    'Dates are said the way a person says them',
    !rawDates.length,
    rawDates.map((w) => `${w.where}: ${w.text}`).join(' | '),
  );

  add('fail', 'The why and the week just gone are written', !!read.challenge.why && !!read.coming_off, '');

  const picks = read.priority_options.filter((p) => p.gremly_pick).length;
  add(
    'fail',
    'Up to five priority options, one to three of them picks',
    read.priority_options.length >= 1 &&
      read.priority_options.length <= READ_LIMITS.priorities &&
      picks >= 1 &&
      picks <= READ_LIMITS.picks,
    `${read.priority_options.length} options, ${picks} picks`,
  );

  const words = (line) => line.trim().split(/\s+/).length;
  // the prompt asks for ten words or fewer; up to twelve still fits the card, so only more fails
  add(
    'fail',
    'Three intention drafts, none over twelve words',
    read.intention_drafts.length === 3 && read.intention_drafts.every((l) => words(l) <= 12),
    read.intention_drafts.map((l) => `${words(l)}`).join(', '),
  );

  const f = read.free_hours_guess;
  add(
    'fail',
    'A free hours guess for each kind of day, with a reason',
    !!f && [f.normal_day, f.busy_day, f.weekend_day].every((h) => typeof h === 'number') && !!f.reason,
    JSON.stringify(f),
  );

  // milestones: only for dated things more than a week out, in two to four ordered steps
  const badMilestones = read.milestones.filter((m) => {
    const ordered = m.steps.every((st, i) => i === 0 || m.steps[i - 1].by <= st.by);
    return (
      daysBetween(today, m.date) <= 7 || m.steps.length < 2 || m.steps.length > 4 || !ordered
    );
  });
  add(
    'fail',
    'Milestones lead up to dated things more than a week out, in two to four ordered steps',
    !badMilestones.length,
    badMilestones.map((m) => `${m.goal}: ${m.steps.length} steps, for ${m.date}`).join('; '),
  );

  // every milestone gives them something to do, not only moments Gremly asks about
  const askOnly = read.milestones.filter((m) => !m.steps.some((st) => st.kind === 'todo'));
  add(
    'fail',
    'Every milestone has a todo among its steps',
    !askOnly.length,
    askOnly.map((m) => m.goal).join('; '),
  );

  // a step is something new to add: one named exactly as a todo they have would be added twice
  const titles = new Set(g.todos.map((t) => t.title.trim().toLowerCase()));
  const twice = read.milestones
    .flatMap((m) => m.steps)
    .filter((st) => st.kind === 'todo' && titles.has(st.title.trim().toLowerCase()));
  add(
    'fail',
    'No milestone step repeats a todo they already have',
    !twice.length,
    twice.map((st) => st.title).join('; '),
  );

  add(
    'fail',
    'Up to four needs you, each with why it is stuck and a question',
    read.needs_you.length <= READ_LIMITS.needs_you &&
      read.needs_you.every((n) => n.stuck_because && n.question),
    `${read.needs_you.length}`,
  );

  // each needs you card has answers of its own to tap (one too long to tap shows as a drop)
  const noAnswers = read.needs_you.filter(
    (n) => !Array.isArray(n.answers) || n.answers.length < 2 || n.answers.length > READ_LIMITS.answers,
  );
  add(
    'fail',
    'Every needs you has two to four answers to tap',
    !noAnswers.length,
    noAnswers.map((n) => `${n.title}: ${(n.answers || []).join(' / ') || 'none'}`).join('; '),
  );

  // A needs you title is in its todos' own words. Where health is in it the
  // title is in general terms instead, which the judge reads.
  if (!s.judge) {
    const name = new Map(g.todos.map((t) => [t.id, t.title]));
    const renamed = read.needs_you
      .map((n) => ({ n, share: ownWords(n.title, n.item_ids.map((id) => name.get(id) || '')) }))
      .filter((x) => x.share < 0.6);
    add(
      'fail',
      "Needs you titles are in the todos' own words",
      !renamed.length,
      renamed.map((x) => `${x.n.title} (${Math.round(x.share * 100)}%)`).join('; '),
    );
  }

  // What is on a calendar is not all meetings. Where none of it is, Gremly
  // calls none of it one; where only some is, never counts or describes it
  // all as meetings (one entry that is a meeting may still be called one).
  if (s.calendar) {
    const all = s.calendar === 'none' ? /\bmeetings?\b/i : /\bmeetings\b|\bmeeting\s+(?:time|hours?|heavy)\b/i;
    const meetings = wordsOf(read).filter((w) => all.test(w.text));
    add(
      'fail',
      'Does not call what is on their calendar meetings',
      !meetings.length,
      meetings.map((w) => `${w.where}: ${w.text}`).join(' | '),
    );
  }

  // a milestone is for something that needs preparing for, never one todo
  const deliverables = new Set(s.deliverables || []);
  const forOne = read.milestones.filter((m) => m.about.type === 'todo' && !deliverables.has(m.about.id));
  add(
    'fail',
    'No milestone leads up to a single todo',
    !forOne.length,
    forOne.map((m) => m.about.title).join('; '),
  );

  // the coming up list is dated moments still ahead, in order (the code sorts and bounds it)
  add('warn', 'Something is coming up when dated things exist', !g.dated.length || read.coming_up.length >= 1, '');

  for (const c of s.expect ? s.expect(read, g) : []) checks.push(c);
  return checks;
}
