// ============================================================================
// propose_changes: put changes on a card for the person to accept.
//
// The change model (workers/shared/changes): every change is checked here
// against the item as it is now, the same checks the app runs again before
// the card is drawn, and anything that fails is dropped with the reason, so
// the model can fix it or say so. Nothing is changed: the app applies a card
// only when the person taps. The rows that pass are what the reply may say
// Gremly is offering; the agent runner keeps them for the card.
// ============================================================================

import {
  EASE_OPS,
  OPS,
  TYPES as FIELD_TYPES,
  GROUPS,
  PLAN_KINDS,
  STEP_KINDS,
  WEEK_OPS,
} from '../../../shared/changes/fields.js';
import { checkCard, normTime } from '../../../shared/changes/check.js';
import { DAY_KINDS } from '../../../shared/week.js';
import { EASE_MODES, rowOfEase } from '../../../shared/habitWeek.js';
import { loadItem, worldsAndChapters, isId } from './items.js';
import { arr, bool, day, int, num, obj, str, strEnum, time } from './schema.js';
import { trackTasks } from '../tasks.js';
import { clock, dayWords, trim } from './words.js';

// item changes everywhere; the plan on screen and today's set times only on
// today's thread, where the request carries them (proposeDayChanges)
const AGENT_OPS = Object.keys(OPS).filter((op) => op !== 'plan');
// the week's own changes, only where the thread sent the person's week
// (proposeWeekChanges)
const WEEK_OP_NAMES = Object.keys(WEEK_OPS);
// a habit paused, given a lighter version or set back to usual: only for an
// app build that can apply it, which says so by sending what is eased now
// (proposeEaseChanges, proposeWeekEaseChanges)
const EASE_OP_NAMES = Object.keys(EASE_OPS);

/** The field list in words, for the tool's description, from fields.js. */
export function fieldListWords() {
  return Object.entries(FIELD_TYPES)
    .map(([type, spec]) => {
      const fields = Object.entries(spec.fields)
        .map(([name, def]) => `${name}${def.group === 'asked' ? '*' : ''} (${def.about})`)
        .join(', ');
      return `${type}: ${fields}. Operations: ${spec.ops.join(', ')}.`;
    })
    .join('\n');
}

const DESCRIPTION = `Put changes to the person's items on a card for them to accept with a tap. Nothing changes until they do. Each call puts a new card in place of the last one, so include every change you want on it. Each change is checked against the item as it is now; the result says which changes are on the card and why any were dropped, so you can fix one and propose it again, or tell the person. Only say Gremly is offering a change that is on the card.
Rules:
- Name an item by an id you were given, in what you know or by a tool; never guess an id.
- Put everything for one item in one change.
- Fields marked * are ${GROUPS.asked}.
- Days are YYYY-MM-DD, worked out from today's date. Times are on a 12 hour clock with am or pm, the way every time you read is written.
- To empty a field, name it in clear. To add to an item's text rather than replace it, use text_add.
- Gremly keeps todos, habits and notes. Something that happens on a set day or at a set time whatever they do is an event, and an event is a note with the day it happens and, when known, its time and when it ends. Something they need to do is a todo.
- A todo has one date, the day to do it; set a deadline only when they name one.
- A habit is archived only when the person asks to stop it; to leave it out for today, use skip_today.
- To turn an item into another kind, use convert with to, and fields for the new item.
Fields and operations by kind of item:
${fieldListWords()}`;

const LINKS = obj({
  add: arr(str('an id'), 'ids to add'),
  remove: arr(str('an id'), 'ids to take away'),
});
const WORDS = obj({
  add: arr(str('a word'), 'to add'),
  remove: arr(str('a word'), 'to take away'),
});

const FIELDS = obj({
  name: str('the new name or title'),
  text: str('new text that replaces what the item says'),
  text_add: str('text to add to what the item says'),
  day: day('the day'),
  time: time('the time'),
  deadline: day('the last day a todo can be done by, only when they name one'),
  length: int('how long, in whole minutes'),
  schedule: obj(
    {
      per: strEnum(['day', 'week', 'month'], 'the period'),
      times: int('how many times in each period'),
      days: arr(
        int('a day of the week, 0 Sunday to 6 Saturday'),
        'fixed days of the week, for a weekly habit',
      ),
    },
    ['per'],
    "a habit's schedule",
  ),
  start_day: day('the day a habit starts'),
  end_day: day('the day it ends'),
  end_time: time('the time an event ends'),
  reminder_day: day('the day Gremly reminds them about a note'),
  reminder: obj(
    {
      add: arr(
        obj(
          {
            time: time('when it goes off'),
            day: day('the day, for one that goes off once'),
            repeat: strEnum(
              ['once', 'daily', 'weekdays', 'weekends', 'weekly'],
              'how often; once when left out',
            ),
            days: arr(int('a day of the week, 0 Sunday to 6 Saturday'), 'for weekly'),
          },
          ['time'],
        ),
        'reminders to add',
      ),
      remove: arr(str('a reminder id from get_item'), 'reminders to take off'),
    },
    [],
    'reminders',
  ),
  list: obj(
    {
      add: arr(str('an item for the list'), 'items to add'),
      tick: arr(str('a list item id from get_item'), 'items to tick'),
      untick: arr(str('a list item id from get_item'), 'items to untick'),
      remove: arr(str('a list item id from get_item'), 'items to take off'),
    },
    [],
    "a note's list",
  ),
  part_of_day: strEnum(['morning', 'day', 'evening', 'any'], 'the part of the day'),
  worlds: LINKS,
  chapters: LINKS,
  tags: WORDS,
  pinned: bool('pinned to the top'),
  favourite: bool('a favourite'),
});

const PLAN = obj(
  {
    kind: strEnum(
      PLAN_KINDS,
      'what changes in the plan or the set times, or plan_day to make a plan',
    ),
    id: str(
      'the item id for plan_add, plan_remove and plan_move; the set time id for remove_block',
    ),
    title: str('for add_block, what the set time is'),
    time: time(
      'the start: for add_block and plan_move; for plan_add, only when they said when it should happen, a time or a part of the day, and then the start of it; when they did not say when, leave it out, and the app fits the item into the free time',
    ),
    end_time: time('for add_block, when it ends, if they said'),
    after: time(
      'for plan_add, when they asked for a stretch of the day to be filled rather than a time: when that stretch starts; the app fits the item into the free time from there',
    ),
    length: int('for plan_add, how long in whole minutes, if they said'),
    travel: bool('for add_block, true when it is part of their travel'),
  },
  ['kind'],
  "for plan: a change to the plan on screen or today's set times",
);

/** What travels with the card: Gremly's reply and the task list, so one step does it all. */
const WITH_CARD = {
  reply: str(
    "your reply to the person, in Gremly's voice, offering what is on the card; shown with the card when every change makes it",
  ),
  tasks: trackTasks.parameters.properties.tasks,
};

const SHAPE = obj(
  {
    busy_days: arr(
      str('a day, YYYY-MM-DD'),
      'every busy day of the week, in place of the busy days before',
    ),
    hours: obj(
      {
        normal_day: num('hours free on a normal day'),
        busy_day: num('hours free on a busy day'),
        weekend_day: num('hours free on a day off'),
      },
      [],
      'the hours they have free for their own things on each kind of day, in half hours; only the ones that change',
    ),
  },
  [],
  'for week_shape: the busy days, the free hours, or both',
);

const MILESTONE = obj(
  {
    goal: str('what it is for, in a few words'),
    date: day('the date it is for'),
    steps: arr(
      obj(
        {
          title: str('what the step is'),
          by: day('the day to finish it by, between today and the date it is for'),
          minutes: int('roughly how long it takes, in whole minutes'),
          kind: strEnum(
            STEP_KINDS,
            'todo for something they do; check_in for a moment Gremly asks how it is going, in an evening wrap up',
          ),
        },
        ['title', 'by', 'kind'],
      ),
      'the steps, in order',
    ),
  },
  ['goal', 'date', 'steps'],
  'for milestone: something big more than a week away, and the steps towards it',
);

/**
 * A habit eased for a stretch of days. Everything the model is told about it
 * is here, on the change's own field, and nothing is added to what the tool
 * says of itself: a longer description cost other turns their card (the day
 * set under --with-ease, 6 October). Where the week's own changes are offered
 * too (week), it is set apart from habit_days, which moves a habit's days
 * inside the week.
 */
function easeField(week) {
  const apart = week
    ? 'Leaving a habit out for today alone is skip_today, moving its days inside this week is habit_days, and stopping it for good is archive.'
    : 'Leaving a habit out for today alone is skip_today, and stopping it for good is archive.';
  return obj(
    {
      mode: strEnum(
        EASE_MODES,
        'pause to leave the habit alone for those days; lighter for a smaller version that still counts; usual to end a pause or a lighter version, from today or from the day given as from',
      ),
      from: day(
        'the first day; left out, it is today, or in the weekly review the first day being planned',
      ),
      until: day(
        'the last day; left out, it is the end of their week, or in the weekly review the last day being planned',
      ),
      note: str('for lighter, what the smaller version is, in a few of their words'),
    },
    ['mode'],
    `for ease: a habit they are building paused for a stretch of days, or given a lighter version for those days, with the habit itself left as it is. A paused habit is left alone on those days: it is off their day, nothing asks them about it, and it is never counted against them. ${apart}`,
  );
}

function changeSchema({ plan, week, ease }) {
  const ops = [
    ...AGENT_OPS,
    ...(plan ? ['plan'] : []),
    ...(week ? WEEK_OP_NAMES : []),
    ...(ease ? EASE_OP_NAMES : []),
  ];
  const props = {
    op: strEnum(ops, 'what the change does'),
    type: strEnum(
      ['todo', 'habit', 'note'],
      week
        ? "the kind of item; left out for plan and for the week's shape, priority, intention, milestone and weekly day"
        : plan
          ? 'the kind of item; left out for plan'
          : 'the kind of item',
    ),
    id: str('the item id; left out for add'),
    to: strEnum(['todo', 'habit', 'note'], 'for convert, the kind it becomes'),
    days: arr(
      str('a day, YYYY-MM-DD'),
      week
        ? 'for log and unlog; for habit_days, every day the habit is planned on in the week'
        : 'for log and unlog',
    ),
    fields: FIELDS,
    clear: arr(str('a field name'), 'fields to empty'),
  };
  if (plan) props.plan = PLAN;
  if (week) {
    props.back_on = day('for later, the day the todo comes back to them');
    props.shape = SHAPE;
    props.priority = str(
      'for priority, the thing that matters most to them this week, in a few of their own words',
    );
    props.intention = str('for intention, their intention for the week, one short line');
    props.milestone = MILESTONE;
    props.weekday = int('for weekly_day, the day of the week, 0 Sunday to 6 Saturday');
  }
  if (ease) props.ease = easeField(week);
  return obj(props, plan ? ['op'] : ['op', 'type']);
}

const DAY_DESCRIPTION = `${DESCRIPTION}
In today's thread the plan on screen and today's set times change too, with op plan and plan.kind:
- add_block: a set time today that the day must be planned around and that is not one of their items, with travel true when it is part of their travel. It is the whole change for that time, so it is not also made a new item. Something new they tell you about on another day is a new item for that day and time instead: a note when it happens whatever they do, a todo when it is something they do.
- remove_block: one of today's set times that no longer holds, by its id.
- plan_add fits one of their items for today into the plan on screen: from the time or the part of the day they named, or, when they named none, into the free time, which the app finds after the time now, around meetings and set times, up to the end of planning. plan_remove takes an item out of the plan; plan_move moves an item in the plan to a new time. When they ask for a stretch of the day to be filled rather than giving a time, each plan_add gives the start of that stretch as after, and no time. The app puts each item at its time, or at the first free time after it when a meeting or something in the plan is already there. The plan is for the rest of today, so no time in it is earlier than the time now.
- plan_day, when there is no plan on screen: when they accept it, Gremly plans the rest of today from their items, around what is fixed, and shows the plan for them to keep or change.
Calendar meetings live in their calendar and cannot be changed here, and nothing is added to stand in for one: say plainly that it moves in their calendar. When they give a time for something already listed, change that item rather than adding a new one.`;

const WEEK_DESCRIPTION = `${DAY_DESCRIPTION}
Their week changes too, with these operations. The days they act on, the week's free hours and busy days and its intention are in what you know about their week:
- later puts a todo off for now: it leaves its day and comes back to them on back_on, a day still to come and within four weeks. Choose a day when there is likely to be room or before it matters, and bring several back on different days.
- habit_days sets the days a habit is planned on in the week. Give every day it should be on as days, because the list takes the place of the days it was on; an empty list takes it off the week. Moving a habit to another day of this week, or off one of its days, is habit_days: it changes where the habit sits in this week and leaves how often it repeats as it is. A habit's schedule changes only when they say the routine itself is different from now on.
- week_shape sets which days of the week are busy and the hours they have free for their own things. busy_days is every busy day, in place of the ones before. hours is in half hours, for a normal day, a busy day and a day off, and only the ones that change.
- priority adds one thing to what matters most to them this week, beside the ones already there. It is what the week is for, in a few of their words, and it needs no item behind it.
- intention sets their intention for the week: one short line in the first person, in their words when they gave them.
- milestone sets up something big with a date more than a week away: what it is for, its date, and two to four steps in order, each with the day to finish it by, and whether it is a todo for them to do or a check_in, a moment Gremly asks how it is going. Only for something that has a date.
- weekly_day moves the day of the week their weekly review happens on, given as weekday.`;

const HINTS = {
  no_item: 'no item of theirs has that kind and id; look it up with find_items',
  archived: 'it is archived; restore it first if they want it back',
  not_archived: 'it is not archived',
  calendar_item: 'it comes from their calendar, which Gremly can read but not change',
  no_change: 'it already is that way',
  conflict:
    'another change on this card is already about that item; put everything for one item in one change',
  add_needs_name: 'a new item needs a name',
  op_not_for_type: 'that operation does not apply to that kind of item',
  future_day: 'a habit cannot be logged for a day still to come',
  bad_days: 'days must be YYYY-MM-DD',
  bad_convert: 'convert needs to, another kind of item',
  no_fields: 'nothing to change was given',
  unknown_op: 'that operation is not one Gremly has',
  unknown_type:
    'Gremly keeps todos, habits and notes; something that happens at a set day or time is a note with its day and time',
  not_here: "the plan and set times change only in today's thread",
  bad_plan: 'that plan change is missing what it needs: a kind, and an id or a title',
  bad_plan_time: 'times are on a 12 hour clock with am or pm',
  past_time:
    'that time has already gone today; the plan runs from the time now, and with no time named the app finds the free time',
  no_plan:
    'there is no plan on screen to change; plan_day offers to make one, and to set a time on an item today, change its time',
  has_plan: 'there is already a plan on screen; change it with plan_add, plan_remove or plan_move',
  not_in_plan: 'that item is not in the plan on screen; plan_add fits it in',
  in_plan: 'it is already in the plan on screen; plan_move changes its time',
  no_block: 'there is no set time today with that id',
  not_today: 'that item is not one of their things for today; change its day first',
  plan_breaking:
    'a habit they are breaking has nothing to do at a set time, so the plan never holds it; Today keeps it in sight and the evening wrap up checks in on it',
  needs_title: 'a set time needs a title',
  needs_time: 'it needs a time, on a 12 hour clock with am or pm',
  covered:
    "the change to that item already moves it in or out of today's plan, so the card needs only that one row",
  no_week: 'their week is not known here',
  already_done: 'it is already done',
  back_not_ahead: 'a todo put off comes back on a day still to come',
  back_too_far: 'a todo put off comes back within four weeks',
  outside_week:
    'that day is outside the days these changes act on; the days are in what you know about their week',
  no_review:
    'their week has no review to keep that on yet; offer_week puts the button to plan their week under your reply',
  bad_shape: 'the shape needs busy_days, hours or both',
  no_priorities:
    'their app cannot keep a new priority from here yet; say what you understood, and that what matters most is chosen on its card in the review',
  priorities_full:
    'the week already holds as many things as it keeps as mattering most; say so, and ask which one this should take the place of before offering anything',
  bad_milestone: 'a milestone needs what it is for and the date it is for',
  milestone_not_ahead: 'a milestone is for a date still to come',
  milestone_needs_steps: 'a milestone needs at least one step',
  too_many_steps: 'a milestone takes at most six steps',
  bad_step:
    'each step needs a title, the day to finish it by as YYYY-MM-DD, and whether it is a todo or a check_in',
  step_outside: 'each step is finished between today and the date the milestone is for',
  day_paused:
    'the habit is paused on one of those days. Choose days it is not paused on; or offer to end the pause first, with op ease and ease.mode usual, and set its days once they have accepted that',
  ease_already:
    'it is already that way on every one of those days. To make a pause or a lighter version end sooner, give the last day it should run as ease.until, or use ease.mode usual with ease.from the first day it should be back to usual',
  bad_ease: 'ease needs ease.mode: pause, lighter or usual',
  ease_past: 'a pause or a lighter version starts today or later',
  ease_ends_first: 'its last day is on or after its first day',
  ease_too_far: 'a pause or a lighter version ends within four weeks of today',
  ease_breaking: 'a habit they are breaking is not paused or made lighter',
  days_breaking: 'a habit they are breaking is never planned on days',
};

// what a week change's own value has to be, when it could not be read
const WEEK_VALUES = {
  from: 'ease.from is a day, YYYY-MM-DD',
  until: 'ease.until is a day, YYYY-MM-DD',
  back_on: 'back_on is a day, YYYY-MM-DD',
  hours: 'hours are in half hours, from none up to sixteen',
  priority: 'a priority is a few words, one short line',
  intention: 'the intention is one short line',
  weekday: 'weekday is a whole number, 0 Sunday to 6 Saturday',
};

function hint(reason) {
  if (HINTS[reason]) return HINTS[reason];
  const [code, field] = String(reason).split(':');
  switch (code) {
    case 'unknown_field':
      return `${field} is not a field of that kind of item`;
    case 'bad_value':
      if (WEEK_VALUES[field]) return WEEK_VALUES[field];
      return `the value for ${field} is not valid: days are YYYY-MM-DD, times on a 12 hour clock with am or pm, lengths whole minutes`;
    case 'cannot_clear':
      return `${field} cannot be emptied`;
    case 'cannot_add':
      return `${field} cannot be added to`;
    case 'not_an_event':
      return `${field} belongs to events; give the note its day in the same change`;
    case 'unknown_link':
      return `one of the ${field} ids is not one of theirs`;
    case 'unknown_list_item':
      return 'one of the list item ids is not on that list; read it with get_item';
    case 'unknown_reminder':
      return 'one of the reminder ids is not on that item; read it with get_item';
    default:
      return reason;
  }
}

/** A time as Gremly writes it (normTime reads either clock), in minutes from midnight. */
const toMinutes = (v) => {
  const t = normTime(String(v ?? ''));
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/**
 * A plan row, checked against the day the thread sent (ctx.day: its plan on
 * screen, set times and items), in the change model's own shape.
 * @returns {{raw: object} | {reason: string}}
 */
export function readPlanRow(c, cid, day) {
  if (!day) return { reason: 'not_here' };
  const p = c?.plan && typeof c.plan === 'object' ? c.plan : null;
  if (!p || !PLAN_KINDS.includes(p.kind)) return { reason: 'bad_plan' };
  const given = (v) => v !== undefined && v !== null && v !== '';
  const start = given(p.time) ? toMinutes(p.time) : null;
  const end = given(p.end_time) ? toMinutes(p.end_time) : null;
  const after = given(p.after) ? toMinutes(p.after) : null;
  if (
    (given(p.time) && start == null) ||
    (given(p.end_time) && end == null) ||
    (given(p.after) && after == null)
  )
    return { reason: 'bad_plan_time' };
  // the plan is for the rest of today: a time already gone is not one to plan at
  if (
    (p.kind === 'plan_add' || p.kind === 'plan_move') &&
    start != null &&
    Number.isFinite(day.now) &&
    start < day.now
  )
    return { reason: 'past_time' };
  const inPlan = new Map((day.plan?.items || []).map((x) => [x.id, x]));
  // the item may be named on the plan change or on the change around it
  const pid = p.id ?? c?.id;
  const item = day.items.get(pid) || null;
  const row = (title, plan, type = null, id = null) => ({
    raw: { cid, op: 'plan', type, id, title, plan: { ...plan, title } },
  });
  switch (p.kind) {
    case 'add_block': {
      const title = String(p.title || '').trim();
      if (!title) return { reason: 'needs_title' };
      if (start == null) return { reason: 'needs_time' };
      return row(title, {
        kind: 'add_block',
        start,
        end: end != null && end > start ? end : null,
        travel: p.travel === true,
      });
    }
    case 'remove_block': {
      const block = day.blocks.find((b) => b.id === pid);
      if (!block) return { reason: 'no_block' };
      return row(block.title, { kind: 'remove_block', id: block.id }, null, block.id);
    }
    case 'plan_add': {
      if (!day.plan) return { reason: 'no_plan' };
      if (inPlan.has(pid)) return { reason: 'in_plan' };
      if (!item) return { reason: 'not_today' };
      if (item.breaking) return { reason: 'plan_breaking' };
      const minutes =
        Number.isInteger(p.length) && p.length >= 5 && p.length <= 480 ? p.length : null;
      return row(
        item.title,
        {
          kind: 'plan_add',
          id: item.id,
          item: item.kind,
          start,
          ...(start == null && after != null ? { after } : {}),
          minutes: minutes ?? item.minutes ?? null,
        },
        item.kind,
        item.id,
      );
    }
    case 'plan_day':
      // Gremly makes the plan when they accept, from their items, around what is fixed
      if (day.plan) return { reason: 'has_plan' };
      return row('Plan the rest of today', { kind: 'plan_day' });
    case 'plan_remove':
    case 'plan_move': {
      const placed = inPlan.get(pid);
      if (!day.plan) return { reason: 'no_plan' };
      if (!placed) return { reason: 'not_in_plan' };
      if (p.kind === 'plan_move' && start == null) return { reason: 'needs_time' };
      const plan = { kind: p.kind, id: placed.id, item: placed.kind };
      if (p.kind === 'plan_move') plan.start = start;
      return row(item?.title || placed.title, plan, placed.kind, placed.id);
    }
    default:
      return { reason: 'bad_plan' };
  }
}

// the kind of item a week change is about, when it is about one
const WEEK_TYPE = { later: 'todo', habit_days: 'habit' };

/** One of the week's own changes, in the change model's own shape. */
export function toWeekChange(c, i) {
  const out = { cid: `c${i + 1}`, op: c.op, type: c.type || WEEK_TYPE[c.op] || null };
  if (c.id) out.id = c.id;
  if (c.op === 'later') out.back_on = c.back_on;
  if (c.op === 'habit_days') out.days = c.days;
  if (c.op === 'week_shape') out.shape = c.shape;
  if (c.op === 'priority') out.priority = c.priority;
  if (c.op === 'intention') out.intention = c.intention;
  if (c.op === 'milestone') out.milestone = c.milestone;
  if (c.op === 'weekly_day') out.weekday = c.weekday;
  return out;
}

/** A habit's pause, lighter version or return to usual, in the change model's own shape. */
export function toEaseChange(c, i) {
  const out = { cid: `c${i + 1}`, op: c.op, type: c.type || 'habit' };
  if (c.id) out.id = c.id;
  out.ease = c.ease;
  return out;
}

/** The tool's change, in the change model's own shape. */
export function toModelChange(c, i) {
  const out = { cid: `c${i + 1}`, op: c?.op, type: c?.type };
  if (c?.id) out.id = c.id;
  if (c?.to) out.to = c.to;
  if (Array.isArray(c?.days)) out.days = c.days;
  const given = c?.fields && typeof c.fields === 'object' ? { ...c.fields } : {};
  const fields = {};
  for (const [k, v] of Object.entries(given)) {
    if (v === undefined || v === null) continue;
    if (k === 'text_add') fields.text = { add: v };
    else fields[k] = v;
  }
  for (const k of Array.isArray(c?.clear) ? c.clear : []) {
    if (typeof k === 'string') fields[k === 'text_add' ? 'text' : k] = null;
  }
  if (['add', 'change', 'convert'].includes(c?.op)) out.fields = fields;
  return out;
}

function fieldWords(field, value, ctx, names) {
  if (value === null) return `${field} cleared`;
  if (field === 'text' && typeof value === 'object') return `adds “${trim(value.add, 80)}”`;
  if (field === 'text') return `text “${trim(value, 80)}”`;
  if (['day', 'deadline', 'start_day', 'end_day', 'reminder_day'].includes(field)) {
    return `${field} ${dayWords(value, ctx.today)}`;
  }
  if (field === 'time' || field === 'end_time') return `${field} ${clock(value)}`;
  if (field === 'worlds' || field === 'chapters') {
    const n = (ids) => ids.map((id) => names.get(id) || id).join(', ');
    return [
      value.add.length ? `into ${n(value.add)}` : '',
      value.remove.length ? `out of ${n(value.remove)}` : '',
    ]
      .filter(Boolean)
      .join(', ');
  }
  return `${field} ${JSON.stringify(value)}`;
}

function planWords(c) {
  const p = c.plan || {};
  const at = p.start != null ? ` at ${clock(p.start)}` : '';
  switch (p.kind) {
    case 'add_block':
      return `set time today “${trim(c.title, 60)}”${at}${p.end != null ? ` to ${clock(p.end)}` : ''}${p.travel ? ', travel' : ''}`;
    case 'remove_block':
      return `take out the set time “${trim(c.title, 60)}”`;
    case 'plan_add':
      return `fit “${trim(c.title, 60)}” into the plan${at || (p.after != null ? ` from ${clock(p.after)}` : '')}`;
    case 'plan_remove':
      return `take “${trim(c.title, 60)}” out of the plan`;
    default:
      return `move “${trim(c.title, 60)}” in the plan${at}`;
  }
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const KIND_WORDS = { normal_day: 'a normal day', busy_day: 'a busy day', weekend_day: 'a day off' };

/** One of the week's changes on the card, in words for the model. */
function weekWords(c, ctx) {
  const days = (list) => list.map((d) => dayWords(d, ctx.today)).join(', ');
  switch (c.op) {
    case 'later':
      return `later todo “${trim(c.title, 60)}”: comes back ${dayWords(c.fields.back_on, ctx.today)}`;
    case 'habit_days':
      return `habit_days habit “${trim(c.title, 60)}”: ${c.days.length ? `planned on ${days(c.days)}` : 'off the week'}`;
    case 'week_shape': {
      const s = c.shape || {};
      const parts = [];
      if (s.busy_days)
        parts.push(s.busy_days.length ? `busy days ${days(s.busy_days)}` : 'no busy days');
      if (s.hours) {
        parts.push(
          `free hours ${DAY_KINDS.filter((k) => k in s.hours)
            .map((k) => `${s.hours[k]} on ${KIND_WORDS[k]}`)
            .join(', ')}`,
        );
      }
      return `week_shape: ${parts.join('; ')}`;
    }
    case 'priority':
      return `priority: “${trim(c.fields.text, 120)}” added to what matters most this week`;
    case 'intention':
      return `intention: “${trim(c.fields.text, 120)}”`;
    case 'milestone': {
      const n = c.milestone.steps.length;
      return `milestone “${trim(c.title, 60)}” for ${dayWords(c.milestone.date, ctx.today)}: ${n} step${n === 1 ? '' : 's'}`;
    }
    default:
      return `weekly_day: ${WEEKDAY_NAMES[c.fields.weekday]}`;
  }
}

/** A habit's pause, lighter version or return to usual on the card, in words for the model. */
function easeChangeWords(c, ctx) {
  const e = c.ease;
  const title = `ease habit “${trim(c.title, 60)}”`;
  // the pause or lighter version it ends runs to its last day
  if (e.mode === 'usual')
    return `${title}: back to usual from ${dayWords(e.first, ctx.today)}, ending what runs to ${dayWords(e.last, ctx.today)}`;
  const span =
    e.first === e.last
      ? dayWords(e.first, ctx.today)
      : `${dayWords(e.first, ctx.today)} to ${dayWords(e.last, ctx.today)}`;
  if (e.mode === 'pause') return `${title}: paused ${span}`;
  return `${title}: lighter version ${span}${e.note ? `, “${trim(e.note, 120)}”` : ''}`;
}

/** Whether an item row already settles where the item sits in today's plan. */
function coversPlan(c, today) {
  if (c.op === 'plan' || !c.id) return false;
  if (['done', 'archive', 'skip_today', 'log', 'convert', 'later'].includes(c.op)) return true;
  // paused from today, it is off today
  if (c.op === 'ease') return c.ease?.mode === 'pause' && c.ease.first === today;
  return c.op === 'change' && ('time' in (c.fields || {}) || 'day' in (c.fields || {}));
}

/**
 * What a habit's ease is checked against (checkEase): their weekly day, and
 * what is eased now as the thread sent it (ctx.week.eased), as rows. Null
 * when the thread did not say what is eased, so the change cannot be made.
 */
export function easeCheckOf(week) {
  if (!week || !Array.isArray(week.eased)) return null;
  const u = week.under_way;
  return {
    weekly_day: week.weekly_day,
    rows: week.eased.map(rowOfEase),
    // in the weekly review a stretch with no days given is the days being planned
    span: u?.first && u?.last ? { first: u.first, last: u.last } : null,
  };
}

/**
 * The person's week as the week's changes are checked against it
 * (checkWeekChange): the days they act on, the shape, what matters most and
 * the intention as they stand, and the weekly day, from what the thread sent
 * (ctx.week).
 */
export function weekCheckOf(week) {
  if (!week) return null;
  return {
    first: week.first,
    last: week.last,
    week_start: week.week_start,
    hours: week.hours || null,
    busy_days: week.busy_days || [],
    has_review: !!week.has_review,
    intention: week.intention || null,
    // null from an app build that cannot keep a new priority: it is never offered one
    priorities: Array.isArray(week.priorities) ? week.priorities : null,
    weekly_day: week.weekly_day,
  };
}

/**
 * The days each habit named by a habit_days change is planned on now: the
 * review's working days when it has them, otherwise the days saved. The saved
 * days are read from the start of the week Gremly is shown, so a day already
 * gone that he names beside the new ones is known to be planned and is left
 * as it is (checkWeekChange).
 */
async function plannedDays(ctx, raws) {
  const ids = [
    ...new Set(raws.filter((r) => r.op === 'habit_days' && isId(r.id)).map((r) => r.id)),
  ];
  const out = new Map();
  if (!ids.length || !ctx.week) return out;
  const working = new Map((ctx.week.under_way?.habit_days || []).map((h) => [h.id, h.days]));
  const toRead = ids.filter((id) => !working.has(id));
  for (const id of ids) if (working.has(id)) out.set(id, working.get(id));
  if (toRead.length) {
    const rows = await ctx.db.select(
      `habit_plans?owner_id=eq.${ctx.userId}&habit_id=in.(${toRead.join(',')})&planned_date=gte.${ctx.week.view_first || ctx.week.first}&planned_date=lte.${ctx.week.last}&select=habit_id,planned_date&limit=200`,
    );
    for (const id of toRead) out.set(id, []);
    for (const r of rows || []) {
      out.set(r.habit_id, [...(out.get(r.habit_id) || []), String(r.planned_date).slice(0, 10)]);
    }
  }
  return out;
}

/**
 * propose_changes, with the plan on screen and today's set times when plan is
 * true, and the week's own changes when week is true.
 */
function makeProposeChanges({ plan, week = false, ease = false }) {
  const about = week ? WEEK_DESCRIPTION : plan ? DAY_DESCRIPTION : DESCRIPTION;
  return {
    name: 'propose_changes',
    description: about,
    parameters: obj(
      {
        changes: arr(changeSchema({ plan, week, ease }), 'the changes, one per item'),
        ...WITH_CARD,
      },
      ['changes'],
    ),

    async run(ctx, input = {}) {
      const given = (Array.isArray(input.changes) ? input.changes : []).slice(0, 20);
      // plan rows are read against the day the thread sent; item rows as before
      const early = [];
      const raws = given.map((c, i) => {
        if (WEEK_OP_NAMES.includes(c?.op)) {
          if (week) return toWeekChange(c, i);
          early.push({ cid: `c${i + 1}`, reason: 'unknown_op' });
          return null;
        }
        if (EASE_OP_NAMES.includes(c?.op)) {
          if (ease) return toEaseChange(c, i);
          early.push({ cid: `c${i + 1}`, reason: 'unknown_op' });
          return null;
        }
        if (c?.op !== 'plan') return toModelChange(c, i);
        const r = plan ? readPlanRow(c, `c${i + 1}`, ctx.day) : { reason: 'unknown_op' };
        if (r.reason) {
          early.push({ cid: `c${i + 1}`, reason: r.reason });
          return null;
        }
        return r.raw;
      });
      const kept = raws.filter(Boolean);
      const lw = await worldsAndChapters(ctx);
      // each item named once, read fresh
      const wanted = new Map();
      for (const r of kept) {
        if (r.op !== 'plan' && r.id && isId(r.id) && FIELD_TYPES[r.type])
          wanted.set(`${r.type}:${r.id}`, [r.type, r.id]);
      }
      const [loadedList, planned] = await Promise.all([
        Promise.all(
          [...wanted.entries()].map(async ([key, [type, id]]) => [
            key,
            (await loadItem(ctx, type, id))?.item ?? null,
          ]),
        ),
        week ? plannedDays(ctx, kept) : Promise.resolve(new Map()),
      ]);
      const loaded = new Map(loadedList);
      // a habit is read with the days it is planned on, for habit_days
      for (const [id, days] of planned) {
        const item = loaded.get(`habit:${id}`);
        if (item) item.planned_days = days;
      }
      const weekCheck = week ? weekCheckOf(ctx.week) : null;
      const easeCheck = ease ? easeCheckOf(ctx.week) : null;
      const { changes, dropped } = checkCard(kept, (raw) => ({
        today: ctx.today,
        item: raw.id && raw.op !== 'plan' ? (loaded.get(`${raw.type}:${raw.id}`) ?? null) : null,
        worlds: lw.worlds.map((w) => w.id),
        chapters: lw.chapters.map((c) => c.id),
        week: weekCheck,
        ease: easeCheck,
      }));
      // one row per item: a change that already moves an item in or out of
      // today's plan (a new time or day, done, skipped, stopped, paused) covers it
      const covering = new Set(changes.filter((c) => coversPlan(c, ctx.today)).map((c) => c.id));
      const covered = changes.filter(
        (c) => c.op === 'plan' && c.plan?.kind?.startsWith('plan_') && covering.has(c.id),
      );
      const order = (cid) => Number(String(cid).slice(1));
      return {
        changes: changes.filter((c) => !covered.includes(c)),
        dropped: [
          ...early,
          ...dropped,
          ...covered.map((c) => ({ cid: c.cid, reason: 'covered' })),
        ].sort((x, y) => order(x.cid) - order(y.cid)),
        names: [...lw.worlds, ...lw.chapters],
      };
    },

    render({ changes, dropped, names }, ctx) {
      const byId = new Map(names.map((n) => [n.id, n.name]));
      const lines = [];
      if (changes.length) {
        lines.push('On the card, for the person to accept or not:');
        for (const c of changes) {
          if (c.op === 'plan') {
            lines.push(`- ${c.cid} plan: ${planWords(c)}`);
            continue;
          }
          if (WEEK_OP_NAMES.includes(c.op)) {
            lines.push(`- ${c.cid} ${weekWords(c, ctx)}`);
            continue;
          }
          if (EASE_OP_NAMES.includes(c.op)) {
            lines.push(`- ${c.cid} ${easeChangeWords(c, ctx)}`);
            continue;
          }
          const what = [
            c.op === 'convert' ? `into a ${c.to}` : '',
            ...Object.entries(c.fields || {}).map(([f, v]) => fieldWords(f, v, ctx, byId)),
            c.days ? `days ${c.days.map((d) => dayWords(d, ctx.today)).join(', ')}` : '',
          ].filter(Boolean);
          lines.push(
            `- ${c.cid} ${c.op} ${c.type} “${trim(c.title, 60)}”${what.length ? `: ${what.join('; ')}` : ''}`,
          );
        }
      } else {
        lines.push('Nothing made it onto the card.');
      }
      if (dropped.length) {
        lines.push('Dropped:');
        for (const d of dropped) lines.push(`- ${d.cid}: ${hint(d.reason)}`);
        // proposing again replaces this card, so a fix alone would lose the rest
        if (changes.length)
          lines.push(
            'Proposing again puts a new card in place of this one, so a fix goes in with every change above that should stay.',
          );
      }
      return lines.join('\n');
    },
  };
}

export const proposeChanges = makeProposeChanges({ plan: false });

/** Today's thread: the same tool, which can also change the plan on screen and today's set times. */
export const proposeDayChanges = makeProposeChanges({ plan: true });

/** Today's thread when it sent the person's week: the week's own changes too. */
export const proposeWeekChanges = makeProposeChanges({ plan: true, week: true });

/** Chat, for an app build that says what is eased now: a habit's pause or lighter version too. */
export const proposeEaseChanges = makeProposeChanges({ plan: false, ease: true });

/** Today's thread with their week, for such a build: the week's changes and a habit's ease. */
export const proposeWeekEaseChanges = makeProposeChanges({ plan: true, week: true, ease: true });
