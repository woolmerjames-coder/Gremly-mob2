// ============================================================================
// brief.js: today's thread on the agent (step 7 of the agent plan, "Gremly
// agent: today's thread").
//
// A message typed in today's thread comes with the day as the app holds it:
// the time, travel, set times, calendar, the plan on screen, the person's
// items, Gremly's open question and the conversation (the same request the
// day turn reads, lib/brief/useDayTurn.ts buildDayTurnRequest). The agent
// reads that day as what it already knows, with Gremly's care rules and
// voice, and answers on the brief surface: a reply, and a card of changes in
// the change model's shape, which can include the plan on screen and today's
// set times. Nothing changes until the person taps.
//
// When the app sends the person's week with the message (the weekly review:
// readWeek), the day carries one line about it, the agent gets the week's
// tools and changes (the brief surface's week variant), and while a review is
// under way it is told where the review is and what has been settled
// (weekContext), the way it is told about the evening wrap up.
//
// When the agent cannot finish, the day turn answers instead, exactly as it
// did before this step, so the thread always gets an answer.
//
// A question of Gremly's that is in play (the brief's open one, or the one the
// wrap up says a message answers) comes with where it came from: the fact it
// was written about and how Gremly knows that fact (questionSource), so a
// person who asks how Gremly knew is told, truthfully. What to do with it is
// said with it, and nowhere else: on a turn with no such question, the agent
// is sent word for word what it was sent before any of this.
//
// Once the answer is sent, the message reaches Gremly's memory as a chat
// message does: a correction goes to the context pipeline straight away
// (learnFromTurn), and the ledger reader reads the rest within the hour.
// ============================================================================

import {
  CARE_RULES,
  CHAT_WRITING_RULES,
  PRIVATE_RULES,
  personBlock,
} from '../../inngest-jobs/careRules.js';
import { readTurnRequest } from '../../inngest-jobs/brief/dayTurn.js';
import { clockTime } from '../../inngest-jobs/brief/writer.js';
import { normTime } from '../../shared/changes/check.js';
import { personIdentity, weekdayName } from '../../shared/db.js';
import {
  DAY_KINDS,
  REVIEW_KINDS,
  REVIEW_STATES,
  WEEK_STEPS,
  cycleOf,
  daysBetween,
  daysOffOf,
  isDay,
  normHours,
  reviewOn,
} from '../../shared/week.js';
import { runAgent } from './run.js';
import { toolContext } from './tools/index.js';
import { AGENT_PROMPT_VERSION, isLate } from './prompt.js';
import { dayEndHourOf } from '../../shared/day.js';
import { sourceWords } from '../../shared/factSource.js';
import { upNextWords } from '../../shared/upNext.js';
import { loadLifePack, lifePackText } from '../../shared/lifePack.js';
import { checkForCorrection } from '../context/corrections.js';

export const BRIEF_AGENT_VERSION = `brief-2026-10-13b/${AGENT_PROMPT_VERSION}`;

// the planning day ends here when nothing earlier ends it, as in the day turn
const DAY_END = 22 * 60;

/** The day the thread sent, for the tools: the plan on screen, set times and items by id. */
export function dayFrameOf(req) {
  return {
    date: req.date,
    // minutes after midnight where they are: the plan runs from here
    now: req.now,
    plan: req.plan ? { status: req.plan.status, items: req.plan.items } : null,
    blocks: req.blocks.map((b) => ({
      id: b.id,
      title: b.title,
      start: b.start,
      end: b.end,
      travel: b.travel,
    })),
    items: new Map(
      req.items.map((x) => [
        x.id,
        {
          id: x.id,
          kind: x.kind,
          title: x.title,
          minutes: x.minutes,
          // a habit they are breaking, which the plan never holds
          breaking: x.breaking === true,
        },
      ]),
    ),
  };
}

/** An item's time as every other time here reads ("2:45pm"), or "-". */
function clockOf(t) {
  const hhmm = normTime(String(t ?? ''));
  if (!hhmm) return '-';
  const [h, m] = hhmm.split(':').map(Number);
  return clockTime(h * 60 + m);
}

/** What an item's last column says: where it stands today, and the goal it is a step towards. */
function noteOf(x) {
  return [x.note, x.towards ? `a step towards "${x.towards}"` : ''].filter(Boolean).join(', ');
}

/**
 * The day in words, with the ids the tools take. dayEndHour, the hour their day
 * ends, marks the small hours as the end of their day. week, when the thread
 * sent it, adds the one line about their week. Their intention for the week
 * today is in follows, when they set one.
 */
export function renderDay(req, dayEndHour = null, week = null) {
  const L = [];
  const late = isLate(req.now, dayEndHour)
    ? `, after midnight; their ${weekdayName(req.date)} ends at ${clockTime(dayEndHour * 60)}`
    : '';
  L.push(`TODAY: ${weekdayName(req.date)} ${req.date}. TIME NOW: ${clockTime(req.now)}${late}.`);
  if (req.travel) {
    L.push(
      `TRAVEL TODAY: ${req.travel.label || 'they travel today'}${
        req.travel.departs !== null
          ? `; they set off at ${clockTime(req.travel.departs)}, and nothing is planned after that`
          : '; the time they set off is not known yet'
      }.`,
    );
  }
  L.push(
    `SET TIMES TODAY (id | time | title): ${
      req.blocks
        .map((b) => `${b.id} | ${clockTime(b.start)}${b.travel ? ' (travel)' : ''} | ${b.title}`)
        .join('; ') || 'none'
    }`,
  );
  L.push(
    `CALENDAR TODAY (time | title; meetings live in their calendar and cannot be changed or copied here): ${
      req.meetings
        .map(
          (m) =>
            `${clockTime(m.start)} to ${clockTime(m.end)} ${m.title}${
              req.planEnd < DAY_END && m.start >= req.planEnd ? ' (after they set off)' : ''
            }`,
        )
        .join('; ') || 'nothing'
    }`,
  );
  L.push(
    req.plan
      ? `THE PLAN ON SCREEN, ${req.plan.status === 'locked' ? 'ON TODAY (they said yes to it)' : 'A PROPOSAL'} (id | time | title):\n${req.plan.items
          .map((x) => `${x.id} | ${clockTime(x.start)} | ${x.title}`)
          .join('\n')}`
      : 'THE PLAN ON SCREEN: none yet.',
  );
  L.push(
    `THEIR ITEMS (id | kind | title | day | time | minutes | note):\n${
      req.items
        .map(
          (x) =>
            `${x.id} | ${x.kind} | ${x.title} | ${x.due_day || 'no day'} | ${clockOf(x.due_time)} | ${x.minutes ? `${x.minutes} min` : '-'} | ${noteOf(x) || '-'}`,
        )
        .join('\n') || '(none)'
    }`,
  );
  if (week) L.push(weekLine(week, req.date));
  if (req.intention) {
    L.push(
      `THEIR INTENTION FOR THIS WEEK (their own words, from their weekly review): "${req.intention}"`,
    );
  }
  L.push(`GREMLY'S OPEN QUESTION: ${req.question ? `"${req.question}"` : 'none'}`);
  return L.join('\n\n');
}

/**
 * Gremly in today's thread: who it is, the care rules, its voice and the
 * person. The same from one message to the next, so it is read from the
 * provider's cache; the day, which changes, is dayContext.
 */
export function briefPersona(person) {
  return [
    "You are Gremly, a warm, shame-free companion, in the person's thread for today.",
    CARE_RULES,
    `VOICE
Warm, lively and brief, like a friend who knows their day and is glad to be part of it. Share in what today means to them: when it is about something or someone that matters to them, be openly glad with them, in your own words, and see what they are doing today in its light. Gremly has a playful spark; let it show whenever the moment allows. Suggest, never instruct. Reply in one to three short sentences of plain chat text, with no headings, lists, bold or emoji. Say what you would change in your own words, as an offer. Say plainly what cannot be done here and why. Ask a question only when you need the answer to act or to understand them, never to offer more. Never invent an item, a time, a day or a fact.`,
    PRIVATE_RULES,
    CHAT_WRITING_RULES,
    personBlock(person),
  ].join('\n\n');
}

/**
 * What today is about, from Gremly's picture of their day (the DCO the brief
 * is written from): what the day is for, where they are, and how the brief is
 * pitching it. Empty when there is no picture of today yet.
 */
export function dayMeaning(dco) {
  if (!dco || typeof dco !== 'object') return '';
  const lines = [];
  const lead = dco.lead_story;
  if (lead?.what) lines.push(`- ${lead.what}${lead.why_today ? `: ${lead.why_today}` : ''}`);
  const away = dco.day_frame?.away;
  if (away?.label) {
    lines.push(
      `- Away: ${away.label}${away.through ? `, until ${weekdayName(away.through)} ${away.through}` : ''}`,
    );
  }
  if (dco.voice_note) lines.push(`- How Gremly's brief is pitching today: ${dco.voice_note}`);
  // the open Chapter with the nearest date, worked out in code (shared/upNext.js)
  const next = upNextWords(dco.up_next);
  if (next) lines.push(`- Up next among their Chapters: ${next}`);
  return lines.length
    ? `WHAT TODAY IS ABOUT (Gremly's picture of their day)\n${lines.join('\n')}`
    : '';
}

/** Where tonight's wrap up has got to, in words (lib/brief/types.ts WrapStep). */
const WRAP_AT = {
  offer: 'Gremly has opened on the day and offered the cards',
  cards: 'they are going through the cards',
  partial: 'they closed the cards part way',
  habits: 'their habits',
  journal: 'their journal',
  questions: "Gremly's questions",
  close: 'the close',
  declined: 'they put it off for now',
  done: 'it is finished',
};

const UUID_LIKE = /^[0-9a-f-]{36}$/i;

/**
 * Tonight's wrap up as the app sends it with a message in today's thread
 * (lib/wrapup): where it is, what was sorted (each card by its item's id, with
 * what it was before when it moved), and the question the message answers,
 * when it answers one. Null when there is none.
 */
export function readWrap(raw) {
  if (!raw || typeof raw !== 'object' || !WRAP_AT[raw.step]) return null;
  const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const decisions = (Array.isArray(raw.decisions) ? raw.decisions : [])
    .map((d) => ({
      id: UUID_LIKE.test(String(d?.id || '')) ? d.id : null,
      type: d?.type === 'note' ? 'note' : 'todo',
      title: str(d?.title, 100),
      outcome: str(d?.outcome, 40),
      was: str(d?.was, 40),
    }))
    .filter((d) => d.title && d.outcome)
    .slice(0, 20);
  const a = raw.answering;
  const item = a?.item && UUID_LIKE.test(String(a.item.id || '')) ? a.item : null;
  return {
    step: raw.step,
    decisions,
    answering: str(a?.question, 300)
      ? {
          question: str(a.question, 300),
          item: item
            ? {
                id: item.id,
                kind: ['todo', 'habit', 'note'].includes(item.kind) ? item.kind : 'item',
                title: str(item.title, 100),
                when: str(item.when, 30),
              }
            : null,
        }
      : null,
  };
}

/**
 * Tonight's wrap up, for the agent: where it is, what the cards settled and how
 * to put one back, and the question a message answers. week, when the thread
 * sent it, means the week's changes are on, so one put off can be offered too.
 */
export function wrapContext(wrap, week = null) {
  if (!wrap) return '';
  const done = wrap.step === 'done';
  const L = done
    ? [
        "TONIGHT'S WRAP UP, FINISHED",
        'They wrapped up their day with Gremly earlier in this thread.',
      ]
    : [
        'THE EVENING WRAP UP, UNDER WAY',
        `They are wrapping up their day with Gremly in this thread: the cards for what waits for a decision, their habits, their journal, Gremly's questions, then the close. Where it is now: ${WRAP_AT[wrap.step]}.`,
      ];
  if (wrap.decisions.length) {
    L.push(
      `Sorted in the cards tonight (id | what it is | what they decided | before tonight):\n${wrap.decisions
        .map(
          (d) =>
            `${d.id || 'no id'} | ${d.type} "${d.title}" | ${d.outcome} | ${d.was || 'not moved'}`,
        )
        .join('\n')}`,
      // with the week's changes on, putting one off can go on a card too
      week
        ? "When they want one of tonight's decisions put back or changed, offer the change by its id: its day as it was before tonight, or restore one they let go. Keeping one as it is is the cards' own and cannot go on a card. One sent to a later night can be brought back sooner by offering it a day, or put off until another day."
        : "When they want one of tonight's decisions put back or changed, offer the change by its id: its day as it was before tonight, or restore one they let go. Keeping one as it is and bringing one back on a later night are the cards' own and cannot go on a card; to bring one of those sooner, offer it a day.",
    );
  }
  if (!done) {
    L.push(
      'The wrap up carries on by itself after your reply, from where it is, so answer what they said and leave its steps to it.',
    );
  }
  const a = wrap.answering;
  if (a) {
    const about = a.item
      ? `, about their ${a.item.kind} "${a.item.title}" (id ${a.item.id})${a.item.when ? `, ${a.item.when}` : ''}`
      : '';
    // What this says on purpose (the day replay, 7 October). The answer being
    // saved changes no item: said as "already saved to what Gremly knows",
    // the model took the matter as closed and put no card up, 8 times in 30
    // with the week on. The change is to the item asked about alone: it moved
    // a todo that goes with it as well, 4 or 5 times in 30. And the case that
    // changes nothing comes first: put after the card rule, the model went to
    // the card to find out, and proposed the day the item already had.
    const first = a.item
      ? 'Then see whether that item already agrees with the answer.'
      : 'Then see whether any of their items disagrees with the answer.';
    const same = a.item ? 'When it does' : 'When none does';
    const differs = a.item ? 'When it does not, the item' : 'When one does, it';
    const alone = a.item
      ? ', and change that item alone, since an item that goes with it stays as it is until they ask'
      : '';
    L.push(
      '',
      "THEIR MESSAGE ANSWERS GREMLY'S QUESTION",
      `Gremly asked: "${a.question}"${about}. Their message is the answer. Take it in as a friend would, in one or two short sentences. ${first} ${same}, the reply is the whole turn: no card, and no remark that nothing changes. ${differs} is still as it was, because saving the answer to what Gremly knows about them changes no item: put the change to it on the card with propose_changes, with your reply, in this step${alone}.`,
    );
  }
  return L.join('\n');
}

// ── The week (the weekly review) ────────────────────────────────────────────

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "Monday 5 Oct" */
function dayName(day) {
  const d = new Date(`${day}T12:00:00Z`);
  return `${WEEKDAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
}

/** What each kind of thing settled in the review is, in words. */
const SETTLED = {
  priority: 'a priority for the week',
  hours: 'the hours they have free',
  busy_days: 'the busy days',
  intention: 'their intention',
  milestone: 'a milestone set up',
  needs_you: 'something that needed them',
  habit_days: "a habit's days",
  day: 'a todo given a day',
  later: 'a todo put off for later',
};

/** An id as the app sends one: a string in the shape of an id, and nothing else. */
const isIdLike = (v) => typeof v === 'string' && UUID_LIKE.test(v);
const SETTLED_KINDS = Object.keys(SETTLED);
// lists are cut to length before they are read, so a huge one costs nothing
const ids = (list, max) =>
  (Array.isArray(list) ? list.slice(0, max * 4) : []).filter(isIdLike).slice(0, max);
const dayList = (list, max) =>
  [...new Set((Array.isArray(list) ? list.slice(0, max * 4) : []).filter(isDay))]
    .sort()
    .slice(0, max);

/** The week's free hours as the thread sent them, or null when none are set. */
function readHours(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const k of DAY_KINDS) {
    const h = normHours(raw[k]);
    if (h !== undefined) out[k] = h;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * The person's week as the app sends it with a message in today's thread
 * (lib/cortex/CortexClient.ts WeekTurnContext): their weekly day and days off,
 * this week's review as its row has it, whether the one extra review of the
 * week is used, the week's free hours, busy days, intention and what matters
 * most as they stand, and, while a review is under way, where it is and what
 * has been settled.
 * Null when the app sent none: an app build that does not know the week. With
 * today, a review whose days have all gone, or are further off than the week
 * after next, is not one under way.
 *
 * eased is the habits paused or on a lighter version now or soon, from an app
 * build that can apply such a change: a list, empty when there are none. An
 * app build that cannot leaves it out, and it is null here, so the change is
 * never offered to it (surfaces.js, the ease variants).
 *
 * priorities is what matters most to them this week, each in its own words,
 * from an app build that can keep a new one: a list, empty when there are
 * none. A build that cannot leaves it out, and it is null here, so adding one
 * is never put to it (the change model's priority).
 */
export function readWeek(raw, today = null) {
  if (!raw || typeof raw !== 'object' || !Number.isInteger(raw.weekly_day)) return null;
  if (raw.weekly_day < 0 || raw.weekly_day > 6) return null;
  const str = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
  const r = raw.review;
  const review =
    r && typeof r === 'object' && isDay(r.week_start) && REVIEW_STATES.includes(r.status)
      ? {
          week_start: r.week_start,
          span_start: isDay(r.span_start) ? r.span_start : r.week_start,
          status: r.status,
          kind: REVIEW_KINDS.includes(r.kind) ? r.kind : 'weekly',
        }
      : null;
  const i = raw.intention;
  const intention =
    i && typeof i === 'object' && str(i.text, 200)
      ? { id: isIdLike(i.id) ? i.id : null, text: str(i.text, 200) }
      : null;
  return {
    weekly_day: raw.weekly_day,
    days_off: daysOffOf(raw.days_off),
    review,
    extra_used: raw.extra_used === true,
    hours: readHours(raw.hours),
    busy_days: dayList(raw.busy_days, 14),
    intention,
    priorities: Array.isArray(raw.priorities)
      ? raw.priorities
          .slice(0, 12)
          .map((p) => str(p, 120))
          .filter(Boolean)
          .slice(0, 6)
      : null,
    under_way: readUnderWay(raw.under_way, str, today),
    eased: readEased(raw.eased, str, today),
  };
}

/**
 * What matters most to them this week as it stands, for what Gremly knows
 * about their week. Nothing from an app build that did not say.
 */
export function prioritiesWords(week) {
  if (!Array.isArray(week?.priorities)) return '';
  return week.priorities.length
    ? ` What matters most to them this week, as it stands: ${week.priorities.map((p) => `“${p}”`).join('; ')}.`
    : ' Nothing is chosen as mattering most this week yet.';
}

/** The habits paused or on a lighter version, as the app sent them; null when it sent none at all. */
function readEased(list, str, today) {
  if (!Array.isArray(list)) return null;
  return list
    .slice(0, 120)
    .map((e) => ({
      habit_id: isIdLike(e?.habit_id) ? e.habit_id : null,
      title: str(e?.title, 100) || 'Habit',
      mode: e?.mode === 'pause' ? 'pause' : e?.mode === 'lighter' ? 'lighter' : null,
      first: isDay(e?.first) ? e.first : null,
      last: isDay(e?.last) ? e.last : null,
      note: str(e?.note, 200),
    }))
    .filter(
      (e) =>
        e.habit_id &&
        e.mode &&
        e.first &&
        e.last &&
        e.last >= e.first &&
        !(today && e.last < today),
    )
    .slice(0, 40);
}

/**
 * The habits eased now or soon, for what Gremly knows about their week: one
 * line each, with the id a change to it needs. Nothing when none are.
 */
export function easedWords(week) {
  const list = week?.eased || [];
  if (!list.length) return '';
  const rows = list.map((e) => {
    const what =
      e.mode === 'pause' ? 'paused' : e.note ? `lighter version: “${e.note}”` : 'lighter version';
    return `${e.habit_id} | ${e.title} | ${what} | ${e.first} | ${e.last}`;
  });
  return `\nHABITS EASED FOR NOW (habit id | habit | how | first day | last day). A paused habit is left alone on those days: it is not on their day and nothing is asked of them about it. One on a lighter version stays on, and the smaller version counts in full.\n${rows.join('\n')}`;
}

/** A review under way, as the thread sent it; null when none is. */
function readUnderWay(u, str, today) {
  if (!u || typeof u !== 'object' || !WEEK_STEPS.includes(u.step)) return null;
  if (!isDay(u.first) || !isDay(u.last) || u.last < u.first) return null;
  // a review plans a week or the rest of one, around now
  if (daysBetween(u.first, u.last) > 13) return null;
  if (today && (u.last < today || daysBetween(today, u.first) > 14)) return null;
  const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
  const c = u.challenge;
  const a = u.about;
  return {
    step: u.step,
    // the days being planned, and the first day of the week they belong to
    first: u.first,
    last: u.last,
    week_start: isDay(u.week_start) && u.week_start <= u.first ? u.week_start : u.first,
    challenge:
      c && typeof c === 'object' && str(c.headline, 200)
        ? { headline: str(c.headline, 200), why: str(c.why, 400) }
        : null,
    picks: list(u.picks, 10)
      .map((p) => ({ text: str(p?.text, 120), item_ids: ids(p?.item_ids, 8) }))
      .filter((p) => p.text)
      .slice(0, 5),
    settled: list(u.settled, 120)
      .map((s) => ({
        kind: s?.kind,
        id: isIdLike(s?.id) ? s.id : null,
        item_ids: ids(s?.item_ids, 8),
        type: ['todo', 'habit', 'note'].includes(s?.type) ? s.type : null,
        title: str(s?.title, 100),
        outcome: str(s?.outcome, 100),
        was: str(s?.was, 100),
      }))
      .filter((s) => SETTLED_KINDS.includes(s.kind) && (s.title || s.outcome))
      .slice(0, 60),
    // the board's working picture, none of it saved until they finish
    habit_days: list(u.habit_days, 80)
      .filter((h) => isIdLike(h?.id))
      .map((h) => ({ id: h.id, days: dayList(h.days, 14) }))
      .slice(0, 40),
    placed: list(u.placed, 400)
      .filter((p) => isIdLike(p?.id) && isDay(p.day))
      .map((p) => ({ id: p.id, day: p.day }))
      .slice(0, 200),
    later: list(u.later, 400)
      .filter((p) => isIdLike(p?.id) && isDay(p.back_on))
      .map((p) => ({ id: p.id, back_on: p.back_on }))
      .slice(0, 200),
    // the one they opened to talk through, on a needs you card
    about:
      a && typeof a === 'object' && str(a.title, 100)
        ? {
            title: str(a.title, 100),
            item_ids: ids(a.item_ids, 8),
            stuck_because: str(a.stuck_because, 200),
            question: str(a.question, 300),
          }
        : null,
    // the question Gremly's last reply left the review waiting on
    hold: str(u.hold, 300),
  };
}

/**
 * This week's review, as the app sent it: the row for the week of the cycle
 * today is in. A row for any other week is not this week's, whatever it says,
 * so one kept from before their weekly day moved is left out.
 */
export function reviewOf(week, today) {
  const r = week?.review;
  return r && r.week_start === cycleOf(today, week.weekly_day).week_start ? r : null;
}

/**
 * Whether no review can be started today: a review started now would be the
 * week's one extra, and that one is used and done. An extra left part way is
 * not in the way, since opening the review picks it up where it was. On the
 * weekly day and the two days after, the weekly review itself can still be
 * done; the day before the weekly day, next week can be brought forward.
 */
export function reviewBlocked(week, today) {
  if (!week?.extra_used) return false;
  const on = reviewOn(today, week.weekly_day);
  if (on.kind !== 'extra' && on.kind !== 'weekly') return false;
  return reviewOf(week, today)?.status === 'done';
}

/**
 * The person's week for the tools (ctx.week), worked out from what the thread
 * sent and today's date alone: the days the week's changes act on (the days
 * being planned while a review is under way, otherwise from today to the end
 * of this week), the days get_week shows (every day the changes can act on,
 * and the days of this week already gone), the week those changes belong to,
 * and the week's shape and intention as they stand.
 */
export function weekFrameOf(week, today) {
  if (!week) return null;
  const cycle = cycleOf(today, week.weekly_day);
  // a finished review is no longer under way: the tools read what is saved
  const u = week.under_way && week.under_way.step !== 'done' ? week.under_way : null;
  const review = reviewOf(week, today);
  const started = !!review && ['started', 'done'].includes(review.status);
  return {
    weekly_day: week.weekly_day,
    days_off: week.days_off,
    review,
    extra_used: week.extra_used,
    // no review can be started today: the one extra of the week is used
    blocked: reviewBlocked(week, today),
    next_review: cycle.since === 0 && !started ? today : cycle.next,
    first: u ? u.first : today,
    last: u ? u.last : cycle.week_end,
    // on the weekly day the week starts tomorrow, and today is shown with it
    view_first: u ? u.first : today < cycle.week_start ? today : cycle.week_start,
    view_last: u ? u.last : cycle.week_end,
    // the week the shape, the intention and the check ins are kept for
    week_start: u ? u.week_start : cycle.week_start,
    hours: week.hours,
    busy_days: week.busy_days,
    intention: week.intention,
    // what matters most as it stands; null from an app build that cannot keep a new one
    priorities: week.priorities ?? null,
    // the week's shape and its check ins are kept on its review
    has_review: started || !!u,
    under_way: u,
    // the habits paused or on a lighter version; null from an app build that cannot apply one
    eased: week.eased ?? null,
  };
}

/**
 * The variant of a surface a request with their week gets (surfaces.js): the
 * week's, and with it a habit's pause or lighter version when the app build
 * said what is eased now.
 */
export function weekVariant(week, { answering = false } = {}) {
  if (!week) return undefined;
  // A turn that answers a question of Gremly's has one job: take the answer
  // in, and offer the change to the item it was about. A habit's pause is no
  // part of that, and with it offered such a turn more often said its change
  // without putting it on the card (the day replay under --with-ease, 6
  // October: 8 of 24 against 5 of 37), so it is left off there.
  return Array.isArray(week.eased) && !answering ? 'week_ease' : 'week';
}

/**
 * One line about their week, for the day: their weekly day, whether this
 * week's review is done, and whether the one extra review is still free.
 * moveOnCard is whether the weekly day can be moved on the card where the line
 * is read: it can in today's thread, and not in Ask Gremly.
 */
export function weekLine(week, today, { moveOnCard = true } = {}) {
  const cycle = cycleOf(today, week.weekly_day);
  const day = WEEKDAY_NAMES[week.weekly_day];
  const status = reviewOf(week, today)?.status;
  const u = week.under_way && week.under_way.step !== 'done' ? week.under_way : null;
  const state = u
    ? 'is under way in this thread'
    : status === 'done'
      ? 'is done'
      : status === 'started'
        ? 'was started and not finished'
        : status === 'skipped'
          ? 'was skipped'
          : 'has not been done';
  // on the weekly day the review is for the week that starts tomorrow; one
  // under way says its own days, which are next week's when it is brought forward
  const starts = u ? u.first : cycle.week_start;
  const ahead = starts > today && (cycle.since === 0 || starts > cycle.week_end);
  const which = ahead ? 'the week ahead' : 'this week';
  const range = u
    ? `${dayName(u.first)} to ${dayName(u.last)}`
    : `${dayName(cycle.week_start)} to ${dayName(cycle.week_end)}`;
  const when =
    cycle.since === 0
      ? `Today is their weekly day, ${day}, when they plan their week with Gremly in a weekly review.`
      : `Their weekly review is on ${day}s, and the next is ${dayName(cycle.next)}.`;
  // with the extra used and no review left to start today, what can be offered
  // is the weekly day itself, moved on the card
  const extra = !week.extra_used
    ? 'The one extra review a week is still free.'
    : !reviewBlocked(week, today)
      ? 'The one extra review a week has been used.'
      : moveOnCard
        ? 'The one extra review a week has been used, so no other review can be started today; what Gremly can offer instead is to move their weekly day, on the card.'
        : "The one extra review a week has been used, so no other review can be started today. Their weekly day can be moved from today's thread, and not from here.";
  return `THEIR WEEK: ${when} The review for ${which}, ${range}, ${state}. ${extra}${prioritiesWords(week)}${easedWords(week)}`;
}

/** Where the weekly review has got to, in words (workers/shared/week.js WEEK_STEPS). */
const WEEK_AT = {
  offer: 'Gremly has offered the review',
  challenge: 'the challenge, the one thing most likely to make the week go wrong',
  priorities: 'choosing what matters most this week',
  shape: 'the shape of the week: deadlines, busy days and the hours they have free',
  intention: 'their intention for the week',
  ahead: 'what is ahead: big things more than a week away',
  needs_you: 'what needs them: the things that are stuck',
  board: 'the board, each day of the week with what is on it',
  done: 'it is finished',
};

/**
 * The weekly review, for the agent: where it is, the challenge and Gremly's
 * picks, everything settled so far with ids and what each was before, how to
 * put any of it back, and how to answer what they type while it is under way.
 */
export function weekContext(week) {
  const u = week?.under_way;
  if (!u) return '';
  const done = u.step === 'done';
  // fewer than the seven days of a whole week: it started part way through
  const part =
    daysBetween(u.first, u.last) < 6
      ? ', the rest of this week rather than a whole one, so plan only those days and judge how much fits by how many are left'
      : '';
  const L = done
    ? [
        'THE WEEKLY REVIEW, FINISHED',
        `They planned their week with Gremly earlier in this thread, ${dayName(u.first)} to ${dayName(u.last)}.`,
      ]
    : [
        'THE WEEKLY REVIEW, UNDER WAY',
        `They are planning their week with Gremly in this thread: the challenge, what matters most, the shape of the week, their intention, what is ahead, what needs them, then the board. It plans ${dayName(u.first)} to ${dayName(u.last)}${part}. Where it is now: ${WEEK_AT[u.step]}.`,
      ];
  if (u.challenge) {
    L.push(
      `The challenge Gremly opened with: "${u.challenge.headline}"${u.challenge.why ? ` ${u.challenge.why}` : ''}`,
    );
  }
  if (u.picks.length) {
    L.push(
      `Gremly's picks for what matters most (what | the todos it covers):\n${u.picks
        .map((p) => `${p.text} | ${p.item_ids.join(', ') || 'none'}`)
        .join('\n')}`,
    );
  }
  if (!done && u.habit_days.length) {
    L.push(
      `Habit days as the review has them now (habit id | the days it is planned on):\n${u.habit_days
        .map((h) => `${h.id} | ${h.days.map(dayName).join(', ') || 'none'}`)
        .join('\n')}`,
    );
  }
  if (u.settled.length) {
    L.push(
      `Settled so far in the review (what it is | id | what | as it is now | before):\n${u.settled
        .map(
          (s) =>
            `${SETTLED[s.kind]} | ${s.id || s.item_ids.join(', ') || 'no id'} | ${s.type ? `${s.type} ` : ''}"${s.title}" | ${s.outcome || 'set'} | ${s.was || 'not set before'}`,
        )
        .join('\n')}`,
      'When they want something settled here put back or changed, offer the change that does it, by its id where it has one: a todo back on the day it was, a habit back on the days it was on, the hours, busy days or intention as they were.',
    );
  }
  if (!done) {
    L.push(
      'They can type anything at any moment of the review. Read what they wrote as a person would and answer what they mean. When it changes the week, say back briefly what you understood and put the changes that clearly follow from what they said on the card, and no others. The card is an offer they can turn down or correct, so offer what follows rather than asking whether you should, and never hold a change back to ask for a detail it can be offered without: something new they tell you about goes on the card with what they told you, and what they did not say about it is theirs to fill in. A todo with no length is counted as half an hour on the board until they give it one, so how long something takes is never a thing to ask first. Only when it is unclear what they want changed, ask one short question instead and put nothing on the card. When it is a question, answer it from what you know, and say so plainly when you do not know. When it is about how they feel, answer that first. Then let it shape the week: where it means the week should ask less of them, or more, offer that on the card, or ask one short question about what would help.',
      // Work Gremly cannot see, and what is already on their calendar (James, 7
      // October). Before this a load they mentioned was made into a todo on a
      // day, and something on their calendar into a note beside it. The task
      // comes first and is said as a thing to do: said last, as "a todo as
      // ever", a task named beside a load was left off the card in 14 runs of
      // 30, folded into the priority's words or held back to ask which day.
      `What they tell you about may be work or a commitment that is not among their items, which Gremly cannot see. A message like that can hold two different things, and each goes on the card in its own way, in the same step. One is a task: something they say they have to do, one piece of work with an end. It is a new todo, put on the card with add whatever else the message is about. Take it as they said it, without asking whether they want it or which day: give it the day they said, or a day before whatever they say it has to be ready for, or no day at all when they said nothing of when, and the board finds it one. The other is a load on the days being planned, something that takes their time and attention without being one piece of work they could tick off. The load itself is never a todo and never a note. Take it in as the shape of the week, with week_shape: the days they say it falls on become busy days. Change the hours they have free only when they say how many hours it takes or leaves them.${
        Array.isArray(week.priorities)
          ? ' And when the load is what the week is for, or a large part of it, add the load to what matters most this week with priority, in a few of their own words: the load alone, never a task they named, which is its own todo.'
          : ''
      } When they name no particular days for it, mark no day busy for it: saying it is this week names none. Ask which days it takes only when the week cannot be planned without knowing.`,
      'What is on their calendar on the days being planned is theirs already, and it stays there. get_week shows it for each day, beside the todos. When what they tell you about is on their calendar, nothing new stands for it: never put a todo, a note or a set time on the card for a calendar entry. The most it does is shape the week, as a busy day.',
      'The days being planned are read with get_week, which has them as the review has them now: where each todo sits on the board, what is put off, what is on their calendar, and the room each day has left. The list of their items for today, and get_day, have only what is saved.',
      'The review carries on after your reply, from the step it is on, and nothing on that step is lost, so leave its steps to it. Only when your reply ends by asking them something the step cannot be settled without, call hold with your reply, and the review waits for their answer. What carries the review on is a button under the thread, which they tap when they are ready.',
      'Some of what you know is about their health, body or mind. Let it shape the week: their energy, appointments, rest and how much to ask of them. Plan health todos and habits like any others. Write about it only as discreetly as they would want on a screen someone else might glance at, and never name a condition, treatment or medication in your own words; the titles of their items stay exactly as they wrote them.',
    );
    if (u.hold) {
      L.push(
        `The review is waiting on this step for their answer to what Gremly asked: "${u.hold}" When their message settles it, let the review carry on; when it does not, hold again.`,
      );
    }
    if (u.about) {
      const a = u.about;
      // Talking one through ends with something to say yes to (James, 9
      // October): before this a reply could stop at another question.
      L.push(
        '',
        'THEY OPENED ONE TO TALK IT THROUGH',
        `"${a.title}"${a.item_ids.length ? ` (todos ${a.item_ids.join(', ')})` : ''}${a.stuck_because ? `. Why it seems stuck: ${a.stuck_because}` : ''}${a.question ? `. Gremly asked: "${a.question}"` : ''}. Their message is about this: it is their answer to what Gremly asked. Help them get it unstuck the way a friend would, and do not leave it at talk or at another question. End your reply with one concrete offer on the card: the change to these todos, or the one new todo, that moves it on from what they just told you. When what they said could go more than one way, offer the likeliest and say the other in a few words.`,
      );
    }
  }
  return L.join('\n');
}

/** Two wordings of one question are the same when they match after spaces are evened out, up to the length the app sends. */
const sameWords = (v) =>
  String(v || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/…$/, '')
    .slice(0, 300);

/**
 * The question of Gremly's that is in play with this message: the one the wrap
 * up says the message answers, or the open one the thread carries.
 */
export function questionInPlay(req, wrap) {
  return wrap?.answering?.question || req?.question || '';
}

/**
 * Where one of Gremly's questions came from: the fact it was written about,
 * with how Gremly knows that fact (public.fact_sources). The app sends the
 * question's words and not its id, so it is found among the person's own
 * questions by its words, the newest first. Null when the question rests on no
 * single fact; null, and said in the log, when it cannot be read. Never stops
 * the turn.
 */
export async function questionSource(ctx, userId, question) {
  const asked = sameWords(question);
  if (!asked || !ctx?.db) return null;
  try {
    const rows = await ctx.db.select(
      `gremly_questions?user_id=eq.${userId}&about_fact_id=not.is.null&select=question,about_fact_id&order=created_at.desc&limit=40`,
    );
    const hit = (rows || []).find((r) => sameWords(r.question) === asked);
    if (!hit) return null;
    const facts = await ctx.db.rpc('fact_sources', {
      p_user: userId,
      p_fact_ids: [hit.about_fact_id],
    });
    const fact = Array.isArray(facts) ? facts[0] : null;
    return fact?.statement ? fact : null;
  } catch (err) {
    console.warn(
      "[BriefTurn] where Gremly's question came from could not be read",
      String(err?.message || err).slice(0, 200),
    );
    return null;
  }
}

/**
 * Where the question in play came from, for the agent: how Gremly knows the
 * fact it was written about, and what that is for. '' when there is no
 * question or no source.
 *
 * Everything about it is said here, with the record, and only on a turn that
 * has one (the day replay, 7 October). Said as a standing rule in who Gremly
 * is, and as a line in the wrap up's own words, it cost the card on a plain
 * answer: with the item wrong and the answer given, the change went on the
 * card 96 times in 130, against 125 in 130 before, and 12 times in 40 once
 * this record was beside it. Said here, for the one case it is for, 39 in 40.
 * And called the record itself: left to look the fact up again, Luna believed
 * an empty lookup over what it had been given.
 */
export function questionSourceContext(question, fact, { today = null, timezone = 'UTC' } = {}) {
  const asked = sameWords(question);
  const statement = sameWords(fact?.statement);
  if (!asked || !statement) return '';
  const how = sourceWords(fact, { today, timezone, quote: 240 });
  // their own words say it best; the fact as Gremly wrote it stands in when none were kept
  const from = how
    ? `Gremly asked "${asked}" because of ${how}.${fact.source_quote ? '' : ` On record from it: "${statement}"`}`
    : `Gremly asked "${asked}" because of this on record about them: "${statement}"`;
  return `IF THEY ASK WHERE GREMLY'S QUESTION CAME FROM\n${from}\nThis is the record itself, read just now, and it is here for one case only: when their message asks where the question came from, or how Gremly knew, rather than answering it. Then it is not an answer: tell them plainly and warmly from this, the day, where they said it and what they said, with no lookup. When their message answers the question, leave this out of your reply and handle the answer as above.`;
}

/** What Gremly knows about today, with their latest message: what the day is about, the day itself, the wrap up or the weekly review when one is under way, and where the question in play came from. */
export function dayContext(
  req,
  dco = null,
  wrap = null,
  dayEndHour = null,
  week = null,
  asked = '',
  life = '',
) {
  const meaning = dayMeaning(dco);
  const evening = wrapContext(wrap, week);
  const review = weekContext(week);
  // what a friend would know about their life today (shared/lifePack.js, data fabric stage 4d)
  const lifeNow = life
    ? `THEIR LIFE RIGHT NOW (what a friend would know; draw on it the way a friend would, when it fits what they said and when a friend would raise it in reply, once and in a few words; never list it, and never tell them as news what they told you)\n${life}`
    : '';
  return `WHAT YOU KNOW ABOUT TODAY\n${meaning ? `${meaning}\n\n` : ''}${renderDay(req, dayEndHour, week)}${lifeNow ? `\n\n${lifeNow}` : ''}${evening ? `\n\n${evening}` : ''}${review ? `\n\n${review}` : ''}${asked ? `\n\n${asked}` : ''}`;
}

/** Their life right now (shared/lifePack.js) as lines; never stops the turn, and says when it cannot be read. */
async function readLife(ctx, userId, today, tz) {
  try {
    return lifePackText(await loadLifePack(ctx.db, userId, { today, tz }));
  } catch (err) {
    console.warn(
      `[ALERT][BriefTurn] could not read their life for ${userId}: ${err?.message || err}`,
    );
    return '';
  }
}

/** Today's picture of the day, if the brief has made one; never stops the turn. */
async function readDco(ctx, userId, date) {
  try {
    const rows = await ctx.db.select(
      `user_daily_state?user_id=eq.${userId}&date=eq.${date}&select=dco&limit=1`,
    );
    return rows?.[0]?.dco || null;
  } catch {
    return null;
  }
}

/** A short, stable key for one person's turns in today's thread (the provider's prompt cache). */
export function cacheKeyFor(userId) {
  let h = 0x811c9dc5;
  for (const ch of String(userId || '')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `gremly-brief-${h.toString(16)}`;
}

/**
 * One message in today's thread, answered by the agent, or by the day turn
 * when the agent is switched off or cannot finish.
 * @param {object} p
 * @param {object} p.env
 * @param {string} p.userId
 * @param {object} p.body the app's request (DayTurnRequest, plus timezone and tasks)
 * @param {boolean} p.useAgent AGENT_BRIEF
 * @param {(body: object) => Promise<object|null>} p.dayTurn asks the day turn, as before
 * @param {(line: string) => void} [p.onStatus]
 * @param {object} [p.deps] { person, ctx, models, agent, dayEndHour } for tests and replays
 * @returns {Promise<object>} engine 'agent' with reply, card and tasks, or engine
 *   'day_turn' with the day turn's own answer
 */
export async function runBriefTurn({ env, userId, body, useAgent, dayTurn, onStatus, deps = {} }) {
  const fromDayTurn = async (extra = {}) => {
    const data = dayTurn ? await dayTurn(body).catch(() => null) : null;
    return { engine: 'day_turn', ...(data || { about_day: false, error: 'no answer' }), ...extra };
  };
  if (!useAgent) return fromDayTurn();

  const req = readTurnRequest(body || {});
  if (!req.date || !req.text) return { engine: 'agent', error: 'nothing to read' };
  const timezone = typeof body?.timezone === 'string' && body.timezone ? body.timezone : 'UTC';
  const day = dayFrameOf(req);
  // their week, when this app build sends it: the week's tools and changes come with it
  const week = readWeek(body?.week, req.date);
  const weekFrame = weekFrameOf(week, req.date);
  const ctx = deps.ctx
    ? { ...deps.ctx, today: req.date, day, week: weekFrame }
    : toolContext(env, { userId, today: req.date, timezone, day, week: weekFrame });
  const wrap = readWrap(body?.wrap);
  const question = questionInPlay(req, wrap);
  const [person, dco, dayEndHour, source, life] = await Promise.all([
    deps.person || personIdentity(env, userId),
    readDco(ctx, userId, req.date),
    // when their day ends, so the small hours read as the end of it
    deps.dayEndHour ?? dayEndHourOf(env, userId),
    // where the question in play came from, so "how did you know" has its answer
    questionSource(ctx, userId, question),
    // their life right now, as the brief and the wrap up read it
    deps.life !== undefined ? deps.life : readLife(ctx, userId, req.date, timezone),
  ]);
  const asked = questionSourceContext(question, source, { today: req.date, timezone });

  const r = await runAgent({
    surface: 'brief',
    variant: weekVariant(week, { answering: !!wrap?.answering }),
    persona: briefPersona(person),
    context: dayContext(req, dco, wrap, dayEndHour, week, asked, life),
    cacheKey: cacheKeyFor(userId),
    history: req.history,
    message: req.text,
    ctx,
    nowMin: req.now,
    dayEndHour,
    tasks: Array.isArray(body?.tasks) ? body.tasks : [],
    onStatus,
    firstStatus: 'Looking at your day',
    models: deps.models,
    deps: deps.agent,
  });
  const how = {
    model: r.model,
    ms: r.ms,
    stopped: r.stopped,
    tools: r.steps.filter((s) => s.kind === 'tool').map((s) => s.name),
    prompt_version: BRIEF_AGENT_VERSION,
  };
  if (r.ok) {
    return {
      engine: 'agent',
      reply: r.reply,
      card: r.card,
      tasks: r.tasks,
      // the weekly review stays on its step; the week's button goes under the reply
      ...(r.hold ? { hold: r.hold } : {}),
      ...(r.offer ? { offer: r.offer } : {}),
      ...how,
    };
  }
  console.warn('[BriefTurn] the agent could not finish, the day turn answers', r.error);
  return fromDayTurn({ agent_error: String(r.error || 'failed').slice(0, 200), agent: how });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether today's thread answers the message itself. One it does not answer
 * (nothing to say and no card) goes on to normal chat in the app (useDayTurn),
 * and chat runs its own correction check on it, so it is checked there, once.
 */
export function answeredInThread(result) {
  if (!result || result.error) return false;
  if (result.engine === 'agent')
    return !!(String(result.reply || '').trim() || result.card?.length);
  return !!(result.about_day && (result.reply || result.changes?.length));
}

/**
 * After the answer is sent, what they just said reaches Gremly's memory the way
 * a chat message does: when they say Gremly has something about their life
 * wrong, the context pipeline corrects it straight away. The message is the one
 * checked; the conversation before it and the reply are its background.
 *
 * @param {object} p
 * @param {object} p.env
 * @param {string} p.userId
 * @param {object} p.body the app's request
 * @param {object|null} p.result what answered, as the route sends it
 * @param {object} [p.deps] { checkForCorrection } for tests
 * @returns {Promise<{sent: number}>}
 */
export async function learnFromTurn({ env, userId, body, result, deps = {} }) {
  const req = readTurnRequest(body || {});
  if (!req.text || !answeredInThread(result)) return { sent: 0 };
  // an answer to one of Gremly's questions is saved by the app as the answer
  // (lib/wrapup, answerQuestion), so it is not read a second time here
  if (readWrap(body?.wrap)?.answering) return { sent: 0 };
  const lines = req.history.map((m) => `${m.role === 'user' ? 'User' : 'Gremly'}: ${m.content}`);
  lines.push(`User: ${req.text}`);
  if (typeof result?.reply === 'string' && result.reply) lines.push(`Gremly: ${result.reply}`);
  const check = deps.checkForCorrection || checkForCorrection;
  return check({
    conversationText: lines.join('\n\n'),
    latest: req.text,
    chatId: typeof body?.chat_id === 'string' && UUID.test(body.chat_id) ? body.chat_id : null,
    userId,
    env,
    surface: 'brief',
  });
}

/** A ping goes down the line this often while a turn runs. */
const PING_EVERY_MS = 5000;

/**
 * The route's answer: status lines while the turn runs, then the result, as
 * server-sent events ({ status } lines, then { done: true, ... }). The stream
 * closes with the result; learning from the turn runs after that, so it adds
 * no wait.
 *
 * A ping goes first and then every few seconds until the result. The app asks
 * once and never posts a message again by itself, so the pings are how it
 * knows the line is still open: when they stop with no result, the stream
 * ended without its answer, and the app says so instead of waiting out its
 * whole time (lib/cortex/CortexClient.ts callBriefTurn).
 */
export function briefTurnResponse({ waitUntil, pingEvery = PING_EVERY_MS, ...p }) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  let open = true;
  const send = async (obj) => {
    if (!open) return;
    try {
      await writer.write(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
    } catch {
      open = false;
    }
  };
  const work = (async () => {
    let result = null;
    await send({ ping: true });
    const beat = setInterval(() => void send({ ping: true }), pingEvery);
    try {
      result = await runBriefTurn({ ...p, onStatus: (line) => void send({ status: line }) });
    } catch (err) {
      console.error('[BriefTurn] failed', err);
    }
    // the pings stop before the result goes, so the result is the last thing sent
    clearInterval(beat);
    try {
      await send(result ? { done: true, ...result } : { done: true, error: 'failed' });
    } finally {
      open = false;
      try {
        await writer.close();
      } catch {
        // already closed
      }
    }
    if (result)
      await learnFromTurn({
        env: p.env,
        userId: p.userId,
        body: p.body,
        result,
        deps: p.deps?.learn,
      }).catch((err) => console.warn('[BriefTurn] learning from the turn failed', err?.message));
  })();
  if (typeof waitUntil === 'function') waitUntil(work);
  return new Response(readable, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
