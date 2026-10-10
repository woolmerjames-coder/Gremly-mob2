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
 * - values: the values an enum takes, or the kinds a note can be made
 *
 * Off limits, whatever is asked: anything synced from a calendar, bookkeeping
 * (ids, owners, timestamps, Sweep's marks, the classifier's flags, the
 * planner's own slots), lock ins and commitments, buddies, stacking and taper
 * plans. None of them appear here. Worlds and Chapters themselves have their
 * own list below (PLACE_TYPES), offered only to an app build that can apply
 * those changes.
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

/**
 * The week's own operations (the weekly review). Each changes the person's
 * week rather than a field of one item: a todo put off with the day it comes
 * back, the days a habit is planned on, the week's busy days and free hours,
 * something added to what matters most in it, the week's intention, the steps
 * towards something big, and the day the review happens on. They are kept
 * apart from OPS on purpose: every surface's
 * tool list is built from OPS, and the week's operations are offered only
 * where the person's week is known (today's thread, when the app sends it).
 * The checks are checkWeekChange in check.js; the app applies them in
 * lib/changes/week.ts.
 */
export const WEEK_OPS = {
  later: 'put a todo off for now, with the day it comes back to them',
  habit_days: 'choose the days a habit is planned on in the week',
  week_shape:
    'set which days of the week are busy, and how many hours they have free on each kind of day',
  priority: 'add something to what matters most to them this week',
  intention: 'set their intention for the week',
  milestone:
    'set up the steps towards something big that is more than a week away, with todos to do and check ins for Gremly to hold',
  weekly_day: 'move the day of the week their weekly review happens on',
};

/**
 * A habit eased for a stretch of days: paused, given a lighter version, or
 * set back to usual (workers/shared/habitWeek.js has the rules). Kept apart
 * from OPS for the same reason as the week's operations: every surface's tool
 * list is built from OPS, and this one is offered only to an app build that
 * can apply it. Such a build says so by sending what is eased now with its
 * week (the request's week.eased), on today's thread and in chat alike. The
 * check is checkEase in check.js; the app applies it in lib/changes/ease.ts.
 */
export const EASE_OPS = {
  ease: 'pause a habit for a stretch of days, give it a lighter version for one, or set it back to usual',
};

/**
 * Worlds and Chapters themselves (Worlds rebuild, stage 2): the changes Gremly
 * may put on a card to a person's Worlds and Chapters. A World is a lasting
 * part of their life; a Chapter is something with a shape inside one, a trip,
 * a goal, a project, with its own dates. Kept apart from TYPES and OPS on
 * purpose, like the week's operations and a habit's ease: every surface's tool
 * list is built from those, and these are offered only to an app build that
 * can apply them, which says so with its request (worldsCard). Nothing here
 * deletes a World or a Chapter: deleting stays something the person does by
 * hand (James, 8 Oct). Their check is checkPlaceChange in check.js; the app
 * applies them in lib/changes/places.ts with the same actions the Worlds
 * screens use (lib/worlds/actions.ts).
 *
 * Field kinds of their own: world (one of their Worlds, by id), items (their
 * todos, habits and notes by kind and id, gathered into a new Chapter) and
 * gremly (one of the Gremly outfits, workers/shared/gremlys.js).
 */
export const PLACE_OPS = {
  close: 'close a Chapter that is finished, so it becomes part of their story',
  merge: 'merge one World into another, so everything in it moves across',
};

const PLACE_NAME_MAX = 120;
const PLACE_WORDS_MAX = 300;

export const PLACE_TYPES = {
  chapter: {
    ops: ['add', 'change', 'close', 'reopen'],
    fields: {
      name: {
        kind: 'text',
        group: 'main',
        column: 'title',
        max: PLACE_NAME_MAX,
        about: 'what it is called',
      },
      end_day: {
        kind: 'day',
        group: 'main',
        column: 'end_date',
        clear: true,
        about:
          'its date: the day it happens or is due by, or its last day when it runs over several days',
      },
      start_day: {
        kind: 'day',
        group: 'main',
        column: 'start_date',
        clear: true,
        about: 'its first day, only when it runs over several days or began on a day of its own',
      },
      world: {
        kind: 'world',
        group: 'main',
        column: 'primary_world_id',
        about: 'the World it belongs in',
      },
      items: {
        kind: 'items',
        group: 'main',
        column: null,
        add_only: true,
        about: 'for a new one, the items of theirs that belong in it, which move in with it',
      },
      words: {
        kind: 'text',
        group: 'asked',
        column: 'card_subtitle',
        max: PLACE_WORDS_MAX,
        clear: true,
        about: 'a line or two about it in their own words',
      },
      gremly: {
        kind: 'gremly',
        group: 'asked',
        column: 'mascot_slug',
        clear: true,
        new_main: true,
        about:
          "the Gremly outfit it wears, which Gremly may choose for a new one when one fits; cleared, it wears its World's",
      },
    },
  },
  world: {
    ops: ['add', 'change', 'merge', 'archive', 'restore'],
    fields: {
      name: {
        kind: 'text',
        group: 'main',
        column: 'name',
        max: PLACE_NAME_MAX,
        about: 'what it is called',
      },
      words: {
        kind: 'text',
        group: 'asked',
        column: 'card_subtitle',
        max: PLACE_WORDS_MAX,
        clear: true,
        about: 'a line about it in their own words',
      },
      gremly: {
        kind: 'gremly',
        group: 'asked',
        column: 'mascot_slug',
        new_main: true,
        about: 'the Gremly outfit it wears, which Gremly chooses for a new one',
      },
    },
  },
};

/** What archive and restore mean for a World: hidden, and brought back. */
export const PLACE_OP_WORDS = {
  archive: 'hide a World; nothing in it is deleted and it can be brought back',
  restore: 'bring back a hidden World',
};

export function placeFieldDef(type, field) {
  return PLACE_TYPES[type]?.fields?.[field] || null;
}

/** What a milestone's step is: a todo to do, or a check in Gremly holds in an evening wrap up. */
export const STEP_KINDS = ['todo', 'check_in'];

export const WEEK_LIMITS = {
  /** An intention is one short line */
  intention: 200,
  /** Something that matters most this week is a few words */
  priority: 120,
  /** A week keeps this many things as mattering most (the review's card takes as many) */
  priorities: 3,
  /** What a milestone is for */
  goal: 120,
  /** The most steps one milestone is set up with */
  steps: 6,
};

const NAME_MAX = 200;
const TEXT_MAX = 4000;

/** The kinds a note can be made: its subtype, with a plain note stored as catchall. */
export const NOTE_KINDS = ['note', 'event', 'idea'];

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
      // what kind of note it is (its subtype). A journal entry is read as one
      // and never made or unmade here: the journal keeps its own entries.
      kind: {
        kind: 'note_kind',
        values: NOTE_KINDS,
        group: 'main',
        column: 'subtype',
        about:
          'what kind of note it is: a note, an event (something that happens on a day, kept with that day) or an idea; a journal entry is always one',
      },
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
export const PLAN_KINDS = [
  'add_block',
  'remove_block',
  'plan_add',
  'plan_remove',
  'plan_move',
  // make a plan for the rest of today, when there is none on screen
  'plan_day',
];

/** The longest name an item takes, for a milestone's steps too. */
export const NAME_LIMIT = NAME_MAX;

export function fieldsOf(type) {
  return TYPES[type]?.fields || null;
}

export function fieldDef(type, field) {
  return TYPES[type]?.fields?.[field] || null;
}
