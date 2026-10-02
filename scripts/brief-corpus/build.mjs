/**
 * Turns a short scenario (scenarios.mjs, real/*.json) into the snapshot the
 * worker's gatherBrief returns, using the worker's own code for the shape of
 * the day, clashes, behind this week and the offer rule.
 */

import { clashesOf, dayPartAt, isCancelledEntry, shapeOfDay } from '../../workers/inngest-jobs/brief/data.js';
import { dayOfWeekNumber, isBehindThisWeek } from '../../workers/inngest-jobs/brief/behind.js';
import { decideOffer } from '../../workers/inngest-jobs/brief/offer.js';

const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export function buildSnapshot(s) {
  const now = toMin(s.at);
  const meetings = (s.meetings || [])
    .map(([from, to, title], i) => ({ id: `${s.id}-m${i + 1}`, title, start: toMin(from), end: toMin(to) }))
    .filter((m) => !isCancelledEntry(m, new Set()))
    .sort((a, b) => a.start - b.start);
  const allDay = (s.allDay || []).map((title, i) => ({ id: `${s.id}-a${i + 1}`, title }));
  const { busy, free } = shapeOfDay(meetings);
  const daysGone = dayOfWeekNumber(s.today);
  const habits = (s.habits || []).map((h, i) => {
    const row = h.breaking
      ? { subtype: 'break_habit', cadence: 'daily' }
      : h.target
        ? { cadence: 'weekly', target_per_period: h.target }
        : { cadence: 'daily' };
    return {
      id: `${s.id}-h${i + 1}`,
      title: h.title,
      done: h.done || 0,
      target: h.target || null,
      daily: !!h.daily && !h.breaking,
      behind: isBehindThisWeek(row, h.done || 0, daysGone),
      scheduledToday: false,
      minutes: h.minutes || null,
    };
  });
  const habitsForToday = habits.filter((h) => h.daily || h.behind || h.scheduledToday);
  const todosDue = (s.todos || []).map((title, i) => ({ id: `${s.id}-t${i + 1}`, title }));
  const reach = s.reach
    ? {
        type: 'todo',
        id: `${s.id}-r1`,
        title: s.reach.title,
        why: s.reach.why,
        facts: (s.reach.facts || []).map((statement, i) => ({ id: `${s.id}-f${i + 1}`, statement })),
      }
    : null;
  const ret = s.ret && s.ret.days_away >= 3 ? s.ret : null;
  const question = s.question
    ? { id: `${s.id}-q1`, question: s.question.question, choices: s.question.choices || [] }
    : null;
  const g = {
    tz: 'America/Los_Angeles',
    today: s.today,
    ritualDay: s.today,
    now,
    part: dayPartAt(now),
    person: s.person || { first_name: null, pronouns: null, identity: {} },
    gremlyAge: s.gremlyAge ?? 30,
    briefInChat: true,
    meetings,
    allDay,
    busy,
    free,
    clashes: clashesOf(meetings),
    todosDue,
    overdue: s.overdue || 0,
    unsorted: s.unsorted || 0,
    // the quick sweep (what still needs a decision) is overdue + unsorted;
    // sweepAll is the whole evening Sweep, when the day says
    sweep: {
      all: Number.isFinite(s.sweepAll) ? s.sweepAll : (s.overdue || 0) + (s.unsorted || 0),
      quick: (s.overdue || 0) + (s.unsorted || 0),
      pastDay: s.overdue || 0,
      noDay: s.unsorted || 0,
      other: 0,
      notes: 0,
      newSince: Number.isFinite(s.newSince) ? s.newSince : null,
      lastSweepAt: s.lastSweepAt || null,
    },
    sweepWaiting: (s.overdue || 0) + (s.unsorted || 0),
    habits,
    habitsForToday,
    candidates: todosDue.length + habitsForToday.length + (reach ? 1 : 0),
    question,
    reach,
    ret,
    anchors: s.anchors || [],
    claims: s.claims || [],
    dayShape: s.dayShape || null,
    reaction: s.reaction || null,
    // words the brief must never say on this day (checked, not sent to the writer)
    forbid: s.forbid || [],
  };
  const offer = decideOffer({
    returnDay: !!ret,
    overdue: g.overdue,
    unsorted: g.unsorted,
    candidates: g.candidates,
    freeWindows: g.free,
    now,
  });
  return { g, offer };
}
