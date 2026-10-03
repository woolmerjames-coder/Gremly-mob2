/**
 * The change model's field list: every field Gremly may propose a change to,
 * on each kind of item, and every operation it may propose. One list read by
 * both Workers (to check a proposal before it is shown, and to describe the
 * fields to the model) and by the app (to check again, word the card and
 * apply it). Agreed in "Gremly agent: one change model" (2 Oct 2026).
 *
 * Each field has:
 * - kind: how its value is read and checked (see check.js)
 * - group: 'main' fields are proposed when the conversation calls for them;
 *   'asked' fields are rarely used, so Gremly changes one only when the person
 *   brings that field up, and never suggests or asks about it
 * - column: where the app's store keeps it on the item
 * - about: what the field means, in plain words, for the model's instructions
 * - clear: the field can be emptied
 * - add: text that can be added to as well as replaced
 * - events: a note field that belongs to events (a note with a date)
 *
 * Off limits, whatever is asked: anything synced from a calendar, bookkeeping
 * (ids, owners, timestamps, Sweep's marks, the classifier's flags, the
 * planner's own slots), lock ins and commitments, buddies, stacking and taper
 * plans, and Worlds and Chapters themselves. None of them appear here.
 */

export const FIELDS_VERSION = 1;

export const GROUPS = {
  main: 'proposed when the conversation calls for it',
  asked:
    'changed only when the person asks for this field themselves; never suggested and never asked about',
};

export const OPS = {
  add: 'add a new item',
  change: 'change one or more fields of an item',
  done: 'mark a todo done',
  reopen: 'mark a done todo as not done',
  log: 'log a habit as done on one or more days',
  unlog: 'take back a habit check in on one or more days',
  skip_today: 'skip a habit today without changing the habit',
  archive: 'put an item away; nothing is deleted',
  restore: 'bring back an archived item',
  convert: 'turn an item into another kind of item',
  plan: "change today's plan or its set times, in today's thread",
};

const NAME_MAX = 200;
const TEXT_MAX = 4000;

export const TYPES = {
  todo: {
    ops: ['add', 'change', 'done', 'reopen', 'archive', 'restore', 'convert'],
    fields: {
      name: {
        kind: 'text',
        group: 'main',
        column: 'name',
        max: NAME_MAX,
        about: 'what it is called',
      },
      text: {
        kind: 'text',
        group: 'main',
        column: 'body',
        max: TEXT_MAX,
        add: true,
        clear: true,
        about: 'its notes, replaced or added to',
      },
      day: {
        kind: 'day',
        group: 'main',
        column: 'due_day',
        clear: true,
        about: 'the day they plan to do it',
      },
      time: {
        kind: 'time',
        group: 'main',
        column: 'due_time',
        clear: true,
        about: 'the time they plan to do it',
      },
      deadline: {
        kind: 'day',
        group: 'main',
        column: 'target_date',
        clear: true,
        about: 'the last day it can be done by, apart from the day they plan to do it',
      },
      length: {
        kind: 'minutes',
        group: 'main',
        column: 'time_estimate_minutes',
        clear: true,
        about: 'how long it takes',
      },
      reminder: {
        kind: 'reminder',
        group: 'main',
        column: 'reminders',
        about: 'reminders at a set time',
      },
      part_of_day: {
        kind: 'enum',
        values: ['morning', 'day', 'evening', 'any'],
        group: 'asked',
        column: 'time_window',
        clear: true,
        about: 'the part of the day it belongs to',
      },
      worlds: {
        kind: 'links',
        group: 'asked',
        column: 'world_ids',
        about: 'the Worlds it belongs to',
      },
      chapters: {
        kind: 'links',
        group: 'asked',
        column: 'chapter_ids',
        about: 'the Chapters it belongs to',
      },
      tags: { kind: 'tags', group: 'asked', column: 'tags', about: 'its tags' },
      pinned: { kind: 'flag', group: 'asked', column: 'is_pinned', about: 'pinned to the top' },
    },
  },
  habit: {
    ops: ['add', 'change', 'log', 'unlog', 'skip_today', 'archive', 'restore', 'convert'],
    fields: {
      name: {
        kind: 'text',
        group: 'main',
        column: 'name',
        max: NAME_MAX,
        about: 'what it is called',
      },
      text: {
        kind: 'text',
        group: 'main',
        column: 'notes',
        max: TEXT_MAX,
        add: true,
        clear: true,
        about: 'its notes, replaced or added to',
      },
      schedule: {
        kind: 'schedule',
        group: 'main',
        column: 'schedule',
        about: 'how often they do it, and on which days of the week when that is fixed',
      },
      length: {
        kind: 'minutes',
        group: 'main',
        column: 'time_estimate_minutes',
        clear: true,
        about: 'how long one session takes',
      },
      start_day: {
        kind: 'day',
        group: 'main',
        column: 'start_date',
        clear: true,
        about: 'the day it starts',
      },
      end_day: {
        kind: 'day',
        group: 'main',
        column: 'end_date',
        clear: true,
        about: 'the day it ends',
      },
      reminder: {
        kind: 'reminder',
        group: 'main',
        column: 'reminders',
        about: 'reminders at a set time',
      },
      part_of_day: {
        kind: 'enum',
        values: ['morning', 'day', 'evening', 'any'],
        group: 'asked',
        column: 'time_window',
        clear: true,
        about: 'the part of the day it belongs to',
      },
      worlds: {
        kind: 'links',
        group: 'asked',
        column: 'world_ids',
        about: 'the Worlds it belongs to',
      },
      chapters: {
        kind: 'links',
        group: 'asked',
        column: 'chapter_ids',
        about: 'the Chapters it belongs to',
      },
      tags: { kind: 'tags', group: 'asked', column: 'tags', about: 'its tags' },
      pinned: { kind: 'flag', group: 'asked', column: 'is_pinned', about: 'pinned to the top' },
    },
  },
  note: {
    ops: ['add', 'change', 'archive', 'restore', 'convert'],
    fields: {
      name: { kind: 'text', group: 'main', column: 'title', max: NAME_MAX, about: 'its title' },
      text: {
        kind: 'text',
        group: 'main',
        column: 'body',
        max: TEXT_MAX,
        add: true,
        clear: true,
        about: 'what it says, replaced or added to',
      },
      day: {
        kind: 'day',
        group: 'main',
        column: 'target_date',
        clear: true,
        about: 'the date it is about, such as the date an event happens',
      },
      time: {
        kind: 'time',
        group: 'main',
        column: 'event_time',
        clear: true,
        events: true,
        about: 'for an event, the time it starts',
      },
      end_day: {
        kind: 'day',
        group: 'main',
        column: 'end_date',
        clear: true,
        events: true,
        about: 'for an event over several days, the day it ends',
      },
      end_time: {
        kind: 'time',
        group: 'main',
        column: 'end_time',
        clear: true,
        events: true,
        about: 'for an event, the time it ends',
      },
      reminder_day: {
        kind: 'day',
        group: 'main',
        column: 'reminder_date',
        clear: true,
        about: 'the day Gremly reminds them about it',
      },
      list: {
        kind: 'list',
        group: 'main',
        column: 'list_items',
        about: 'its list: items added, ticked, unticked or removed',
      },
      worlds: {
        kind: 'links',
        group: 'asked',
        column: 'world_ids',
        about: 'the Worlds it belongs to',
      },
      chapters: {
        kind: 'links',
        group: 'asked',
        column: 'chapter_ids',
        about: 'the Chapters it belongs to',
      },
      tags: { kind: 'tags', group: 'asked', column: 'tags', about: 'its tags' },
      pinned: { kind: 'flag', group: 'asked', column: 'is_pinned', about: 'pinned to the top' },
      favourite: {
        kind: 'flag',
        group: 'asked',
        column: 'is_favorite',
        about: 'marked as a favourite',
      },
    },
  },
};

/** Day changes in today's thread (the day turn's set times and plan). */
export const PLAN_KINDS = ['add_block', 'remove_block', 'plan_add', 'plan_remove', 'plan_move'];

export function fieldsOf(type) {
  return TYPES[type]?.fields || null;
}

export function fieldDef(type, field) {
  return TYPES[type]?.fields?.[field] || null;
}
