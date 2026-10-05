/**
 * The words for a change: one line for a row on the card, the button for a
 * card with one change, and the closing line once it is done. Written here
 * from the change and the item, never by the model. Closing lines name the
 * date, so they are still true tomorrow. A moved item's row says where it was
 * as well as where it goes.
 */
import { formatDay, formatDays, formatTime } from '../chat/dayWords';
import type { Change, Schedule } from './model';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
// the three kinds of day a week's free hours are set for, in the order they are said
const DAY_KIND_WORDS = [
  ['normal_day', 'a normal day'],
  ['busy_day', 'a busy day'],
  ['weekend_day', 'a day off'],
] as const;
const KIND = { todo: 'todo', habit: 'habit', note: 'note' } as const;

type Opts = { relative?: boolean };

/** "and" before the last of several. */
export function listWords(parts: string[]): string {
  if (parts.length < 2) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** "3 times a week", "every day", "on Mon, Wed and Fri". */
export function scheduleWords(s: Schedule | null | undefined): string {
  if (!s) return '';
  if (s.days?.length) {
    if (s.days.length === 7) return 'every day';
    return `on ${listWords(s.days.map((d) => WEEKDAYS[d]))}`;
  }
  const period = s.per === 'day' ? 'day' : s.per === 'week' ? 'week' : 'month';
  if (s.times === 1) return s.per === 'day' ? 'every day' : `once a ${period}`;
  if (s.times === 2) return `twice a ${period}`;
  return `${s.times} times a ${period}`;
}

/** "20 min", "1 hr", "1 hr 30 min". */
export function minutesWords(n: number | null | undefined): string {
  if (!n) return '';
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (!h) return `${m} min`;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** "Fri 3 Oct, 3:00pm", either half on its own. */
export function whenWords(
  day: string | null | undefined,
  time: string | null | undefined,
  opts: Opts = {},
) {
  return [formatDay(day, opts), formatTime(time)].filter(Boolean).join(', ');
}

function reminderWords(
  r: { time: string; repeat: string; day?: string; days?: number[] },
  opts: Opts,
) {
  const at = formatTime(r.time);
  switch (r.repeat) {
    case 'daily':
      return `every day at ${at}`;
    case 'weekdays':
      return `on weekdays at ${at}`;
    case 'weekends':
      return `at weekends at ${at}`;
    case 'weekly':
      return `on ${listWords((r.days ?? []).map((d) => WEEKDAYS[d]))} at ${at}`;
    default:
      return `${formatDay(r.day, opts)} at ${at}`;
  }
}

/** The words for each field of a change, in order, for a row. */
function fieldPhrases(change: Change, names: NameLookup, opts: Opts): string[] {
  const f = change.fields ?? {};
  const out: string[] = [];
  if ('day' in f || 'time' in f) {
    const day = 'day' in f ? f.day : change.before?.day;
    const time = 'time' in f ? f.time : change.before?.time;
    if ('day' in f && f.day === null) out.push('no day');
    else if ('time' in f && f.time === null && !('day' in f)) out.push('no time');
    else out.push(whenWords(day, time, opts));
  }
  if ('name' in f) out.push(`called “${f.name}”`);
  if ('text' in f) {
    out.push(
      f.text === null
        ? 'its notes cleared'
        : typeof f.text === 'object'
          ? `“${f.text.add}” added to its notes`
          : 'its notes rewritten',
    );
  }
  if ('schedule' in f) out.push(scheduleWords(f.schedule));
  if ('deadline' in f) out.push(f.deadline ? `due ${formatDay(f.deadline, opts)}` : 'no deadline');
  if ('length' in f) out.push(f.length ? `taking ${minutesWords(f.length)}` : 'no length');
  if ('start_day' in f)
    out.push(f.start_day ? `starting ${formatDay(f.start_day, opts)}` : 'no start day');
  if ('end_day' in f) out.push(f.end_day ? `until ${formatDay(f.end_day, opts)}` : 'no end day');
  if ('end_time' in f) out.push(f.end_time ? `ending at ${formatTime(f.end_time)}` : 'no end time');
  if ('reminder_day' in f) {
    out.push(
      f.reminder_day ? `a reminder on ${formatDay(f.reminder_day, opts)}` : 'no reminder day',
    );
  }
  if ('reminder' in f) {
    for (const r of f.reminder.add) out.push(`a reminder ${reminderWords(r, opts)}`);
    if (f.reminder.remove.length)
      out.push(f.reminder.remove.length === 1 ? 'a reminder taken off' : 'reminders taken off');
  }
  if ('list' in f) {
    const l = f.list;
    if (l.add.length)
      out.push(`${listWords(l.add.map((t: string) => `“${t}”`))} added to the list`);
    if (l.tick.length) out.push(`${l.tick.length} ticked off`);
    if (l.untick.length) out.push(`${l.untick.length} unticked`);
    if (l.remove.length) out.push(`${l.remove.length} taken off the list`);
  }
  if ('part_of_day' in f)
    out.push(f.part_of_day ? `in the ${f.part_of_day}` : 'any part of the day');
  for (const k of ['worlds', 'chapters'] as const) {
    if (!(k in f)) continue;
    const named = (ids: string[]) => listWords(ids.map((id) => names(k, id)));
    if (f[k].add.length) out.push(`in ${named(f[k].add)}`);
    if (f[k].remove.length) out.push(`out of ${named(f[k].remove)}`);
  }
  if ('tags' in f) {
    if (f.tags.add.length) out.push(`tagged ${listWords(f.tags.add)}`);
    if (f.tags.remove.length) out.push(`no longer tagged ${listWords(f.tags.remove)}`);
  }
  if ('pinned' in f) out.push(f.pinned ? 'pinned' : 'unpinned');
  if ('favourite' in f) out.push(f.favourite ? 'a favourite' : 'not a favourite');
  return out;
}

/**
 * Where a moved item was, in the same terms as where it goes: its day when
 * the day changes, its time when only the time changes. Empty when it had
 * neither, so the row says only where it goes.
 */
function movedFrom(change: Change, opts: Opts): string {
  const f = change.fields ?? {};
  const b = change.before ?? {};
  const day = typeof b.day === 'string' ? b.day : null;
  const time = typeof b.time === 'string' ? b.time : null;
  if ('day' in f && 'time' in f) return whenWords(day, time, opts);
  if ('day' in f) return formatDay(day, opts);
  return formatTime(time);
}

export type NameLookup = (kind: 'worlds' | 'chapters', id: string) => string;
const noNames: NameLookup = () => 'a World';

// ── The week's own changes (the weekly review) ──────────────────────────────

/** "1 hr 30 min free on a normal day and 4 hr on a day off", for the hours a change sets. */
function hoursPhrase(hours: Record<string, number> | undefined): string {
  const parts = DAY_KIND_WORDS.filter(([kind]) => hours?.[kind] != null).map(
    ([kind, words], i) =>
      `${minutesWords(Math.round(hours![kind] * 60)) || 'no time'}${i === 0 ? ' free' : ''} on ${words}`,
  );
  return listWords(parts);
}

/** What changed in a habit's days: one day moved, days added, days taken off, or the whole list. */
function habitDaysWords(change: Change, opts: Opts): string {
  const t = change.title;
  const days = change.days ?? [];
  const was: string[] = change.before?.days ?? [];
  const added = days.filter((d) => !was.includes(d));
  const removed = was.filter((d) => !days.includes(d));
  if (!days.length) return `Take ${t} off the week`;
  if (added.length === 1 && removed.length === 1) {
    return `Move ${t} from ${formatDay(removed[0], opts)} to ${formatDay(added[0], opts)}`;
  }
  if (added.length && !removed.length && was.length)
    return `Add ${t} on ${formatDays(added, opts)}`;
  if (removed.length && !added.length) return `Take ${t} off ${formatDays(removed, opts)}`;
  return `Plan ${t} on ${formatDays(days, opts)}`;
}

/** The busy days and the free hours a change to the week's shape sets, each as a phrase. */
function shapePhrases(change: Change, opts: Opts): { busy: string | null; hours: string | null } {
  const s = change.shape ?? {};
  return {
    busy: s.busy_days
      ? s.busy_days.length
        ? `${formatDays(s.busy_days, opts)} as busy ${s.busy_days.length === 1 ? 'day' : 'days'}`
        : 'no busy days'
      : null,
    hours: s.hours ? hoursPhrase(s.hours) : null,
  };
}

/** "2 steps to do and 1 check in" */
function stepsWords(change: Change): string {
  const steps = change.milestone?.steps ?? [];
  const todos = steps.filter((s) => s.kind === 'todo').length;
  const asks = steps.length - todos;
  return listWords(
    [
      todos ? `${todos} ${todos === 1 ? 'step' : 'steps'} to do` : '',
      asks ? `${asks} check ${asks === 1 ? 'in' : 'ins'}` : '',
    ].filter(Boolean),
  );
}

/** The row for one of the week's own changes, or null when the change is not one. */
function weekRowWords(change: Change, opts: Opts): string | null {
  const t = change.title;
  switch (change.op) {
    case 'later': {
      const back = formatDay(change.fields?.back_on, opts);
      // already put off: the day it comes back moves
      return change.before?.back_on
        ? `Bring ${t} back on ${back}, not ${formatDay(change.before.back_on, opts)}`
        : `Put ${t} off until ${back}`;
    }
    case 'habit_days':
      return habitDaysWords(change, opts);
    case 'week_shape': {
      const { busy, hours } = shapePhrases(change, opts);
      return `This week: ${[busy, hours].filter(Boolean).join(', with ')}`;
    }
    case 'intention':
      return `Set this week's intention: “${change.fields?.text ?? t}”`;
    case 'milestone':
      return `Set up ${t} for ${formatDay(change.milestone?.date, opts)}: ${stepsWords(change)}`;
    case 'weekly_day':
      return `Move your weekly review to ${WEEKDAY_NAMES[change.fields?.weekday]}s`;
    default:
      return null;
  }
}

/** One line for the change's row on a card. */
export function rowWords(change: Change, opts: Opts & { names?: NameLookup } = {}): string {
  const t = change.title;
  const names = opts.names ?? noNames;
  switch (change.op) {
    case 'add': {
      const rest = Object.fromEntries(
        Object.entries(change.fields ?? {}).filter(([k]) => k !== 'name'),
      );
      const phrases = fieldPhrases({ ...change, fields: rest }, names, opts);
      return [`Add ${KIND[change.type!]} “${t}”`, ...phrases].join(', ');
    }
    case 'change': {
      const f = change.fields ?? {};
      const phrases = fieldPhrases(change, names, opts);
      if ('day' in f || 'time' in f) {
        const was = movedFrom(change, opts);
        return was
          ? `Move ${t} from ${was} to ${phrases.join(', ')}`
          : `Move ${t} to ${phrases.join(', ')}`;
      }
      if (Object.keys(f).length === 1 && 'name' in f) return `Rename ${t} to “${f.name}”`;
      return `${t}: ${phrases.join(', ')}`;
    }
    case 'done':
      return `Mark ${t} done`;
    case 'reopen':
      return `Mark ${t} not done`;
    case 'log':
      return `Log ${t} for ${formatDays(change.days ?? [], opts)}`;
    case 'unlog':
      return `Take back ${t} for ${formatDays(change.days ?? [], opts)}`;
    case 'skip_today':
      return `Skip ${t} today`;
    case 'archive':
      return change.type === 'todo'
        ? `Cancel ${t}`
        : change.type === 'habit'
          ? `Stop ${t}`
          : `Archive ${t}`;
    case 'restore':
      return `Bring back ${t}`;
    case 'convert':
      return `Turn ${t} into a ${KIND[change.to!]}`;
    case 'plan':
      return planWords(change);
    default:
      return weekRowWords(change, opts) ?? t;
  }
}

function planWords(change: Change): string {
  const p = change.plan!;
  if (p.label) return p.label;
  const at =
    p.start != null
      ? formatTime(`${Math.floor(p.start / 60)}:${String(p.start % 60).padStart(2, '0')}`)
      : '';
  switch (p.kind) {
    case 'add_block':
      return at ? `${change.title} at ${at}` : change.title;
    case 'remove_block':
      return `Take out ${change.title}`;
    case 'plan_add':
      if (at) return `Fit ${change.title} in at ${at}`;
      return p.after != null
        ? `Fit ${change.title} in from ${formatTime(`${Math.floor(p.after / 60)}:${String(p.after % 60).padStart(2, '0')}`)}`
        : `Fit ${change.title} in today`;
    case 'plan_remove':
      return `Take ${change.title} out of today's plan`;
    case 'plan_day':
      return 'Plan the rest of today';
    default:
      return at ? `Move ${change.title} to ${at}` : `Move ${change.title}`;
  }
}

/** The button on a card with one change. */
export function buttonWords(change: Change): string {
  switch (change.op) {
    case 'add':
      return 'Yes, add it';
    case 'change': {
      const f = change.fields ?? {};
      if ('day' in f) return 'Yes, move it';
      if ('time' in f) return 'Yes, change the time';
      if (Object.keys(f).length === 1 && 'name' in f) return 'Yes, rename it';
      if (Object.keys(f).length === 1 && 'text' in f && typeof f.text === 'object')
        return 'Yes, add it';
      return 'Yes, change it';
    }
    case 'done':
      return 'Yes, mark it done';
    case 'log':
      return 'Yes, log it';
    case 'archive':
      return change.type === 'todo' ? 'Yes, cancel it' : 'Yes, put it away';
    case 'convert':
      return 'Yes, turn it into one';
    case 'later':
      return 'Yes, put it off';
    case 'habit_days':
      return 'Yes, plan it';
    case 'week_shape':
      return 'Yes, change my week';
    case 'intention':
      return 'Yes, set it';
    case 'milestone':
      return 'Yes, set it up';
    case 'weekly_day':
      return 'Yes, move it';
    default:
      return 'Yes, do it';
  }
}

/** The closing line once a change is done. Names the date, never Today. */
export function doneWords(change: Change, opts: { names?: NameLookup } = {}): string {
  const fixed = { relative: false };
  const t = change.title;
  switch (change.op) {
    case 'add':
      return `Added ${t}.`;
    case 'change': {
      const f = change.fields ?? {};
      if (Object.keys(f).length === 1 && 'name' in f) return `Renamed to ${f.name}.`;
      if (Object.keys(f).length === 1 && 'text' in f && typeof f.text === 'object')
        return `Added to ${t}.`;
      if (Object.keys(f).length === 1 && 'text' in f) return 'Note updated.';
      return `${t} is now ${fieldPhrases(change, opts.names ?? noNames, fixed).join(', ')}.`;
    }
    case 'done':
      return `${t} is done.`;
    case 'reopen':
      return `${t} is open again.`;
    case 'log':
      return `Logged ${t} for ${formatDays(change.days ?? [], fixed)}.`;
    case 'unlog':
      return `Took back ${t} for ${formatDays(change.days ?? [], fixed)}.`;
    case 'skip_today':
      return `Skipped ${t} today.`;
    case 'archive':
      return change.type === 'todo' ? `Cancelled ${t}.` : `Put ${t} away.`;
    case 'restore':
      return `${t} is back.`;
    case 'convert':
      return `${t} is now a ${KIND[change.to!]}.`;
    case 'later':
      return `${t} comes back on ${formatDay(change.fields?.back_on, fixed)}.`;
    case 'habit_days':
      return change.days?.length
        ? `${t} is planned on ${formatDays(change.days, fixed)}.`
        : `${t} has no days planned.`;
    case 'week_shape': {
      const { busy, hours } = shapePhrases(change, fixed);
      return `Your week now has ${listWords([busy, hours].filter((p): p is string => !!p))}.`;
    }
    case 'intention':
      return 'Your intention is set.';
    case 'milestone':
      return `${t} is set up.`;
    case 'weekly_day':
      return `Your weekly review is now on ${WEEKDAY_NAMES[change.fields?.weekday]}s.`;
    default:
      return 'Done.';
  }
}
