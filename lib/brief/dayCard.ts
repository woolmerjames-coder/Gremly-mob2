/**
 * The day card's words and day strip, worked out from data (never the model),
 * so the card cannot name a meeting or a todo that is not there.
 */

export interface DayMeeting {
  id: string;
  title: string;
  /** Minutes from local midnight */
  start: number;
  end: number;
}

export interface DayPlanned {
  id: string;
  title: string;
  start: number;
  end: number;
  kind: 'todo' | 'habit';
}

/**
 * Google and Outlook keep a cancelled meeting with "Canceled: " at the start of
 * its title. Only that exact form counts here; anything else is left to the
 * DCO's calendar reader (its cancelled ids).
 */
const CANCELLED_TITLE = /^\s*(canceled|cancelled)\s*:/i;

/**
 * A meeting that is cancelled but still on the calendar: the DCO's reader
 * named it, or its title says so. It is not part of the day.
 */
export function isCancelledMeeting(
  title: string | null | undefined,
  ids: (string | null | undefined)[],
  cancelledIds: ReadonlySet<string>,
): boolean {
  if (ids.some((id) => !!id && cancelledIds.has(id))) return true;
  return CANCELLED_TITLE.test(title ?? '');
}

/** "8:00", "1:15", "12:30" */
export function clock(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}`;
}

export function ampm(min: number): 'AM' | 'PM' {
  return Math.floor(min / 60) % 24 >= 12 ? 'PM' : 'AM';
}

/** Overlapping or touching meetings merged into busy blocks. */
export function busyBlocks(meetings: { start: number; end: number }[]): [number, number][] {
  const sorted = meetings
    .map((m) => [m.start, Math.max(m.start, m.end)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const b of sorted) {
    const last = out[out.length - 1];
    if (last && b[0] <= last[1]) last[1] = Math.max(last[1], b[1]);
    else out.push([b[0], b[1]]);
  }
  return out;
}

/**
 * Meetings row. Before any have started: "8 today, first at 8:00". Once the
 * day is under way: "2 left, clear from 1:15". After the last: "All done for
 * today". With none: "Nothing on the calendar".
 */
export function meetingsLine(meetings: DayMeeting[], now: number): string {
  if (!meetings.length) return 'Nothing on the calendar';
  const sorted = [...meetings].sort((a, b) => a.start - b.start);
  const left = sorted.filter((m) => m.end > now);
  if (!left.length) return 'All done for today';
  if (sorted[0].start >= now) {
    return `${sorted.length} today, first at ${clock(sorted[0].start)}`;
  }
  const blocks = busyBlocks(left);
  const clearFrom = blocks[blocks.length - 1][1];
  return `${left.length} left, clear from ${clock(clearFrom)}`;
}

/** Todos row: "Nothing due today", "1 due, Buy Oat Milk", "4 due, 2 planned". */
export function todosLine(due: { id: string; title: string }[], planned: DayPlanned[]): string {
  if (!due.length) return 'Nothing due today';
  const plannedTodos = planned.filter((p) => p.kind === 'todo');
  if (due.length === 1) {
    const at = plannedTodos.find((p) => p.id === due[0].id);
    return `1 due, ${due[0].title}${at ? ` at ${clock(at.start)}` : ''}`;
  }
  const n = plannedTodos.filter((p) => due.some((d) => d.id === p.id)).length;
  return `${due.length} due${n ? `, ${n} planned` : ''}`;
}

/**
 * Habits row: "8 today, 1 behind this week", "8 today, on track this week",
 * or once a plan is locked "8 today, 3 planned". The behind count is a
 * warning except on a return day.
 */
export function habitsLine(
  todayCount: number,
  behindCount: number,
  plannedHabits: number,
): { text: string; warn: boolean } {
  const lead = `${todayCount} today`;
  if (plannedHabits > 0) return { text: `${lead}, ${plannedHabits} planned`, warn: false };
  if (behindCount > 0) return { text: `${lead}, ${behindCount} behind this week`, warn: true };
  return { text: `${lead}, on track this week`, warn: false };
}

/**
 * Sweep row, from the quick sweep (what still needs a decision): "7 to sort,
 * 3 past their dates", "2 to sort", "All sorted". What was already decided
 * (given a day, a Lock In, a resurface date) is not counted.
 */
export function sweepLine(toSort: number, pastDate: number): { text: string; warn: boolean } {
  if (toSort <= 0) return { text: 'All sorted', warn: false };
  if (pastDate > 0) {
    return {
      text: `${toSort} to sort, ${pastDate} past ${pastDate === 1 ? 'its date' : 'their dates'}`,
      warn: true,
    };
  }
  return { text: `${toSort} to sort`, warn: false };
}

/** The day strip runs 6am to 10pm. */
export const STRIP_START = 360;
export const STRIP_END = 1320;

/** Where a minute sits on the strip, 0 to 100. */
export function stripPercent(min: number): number {
  const p = ((min - STRIP_START) / (STRIP_END - STRIP_START)) * 100;
  return Math.max(0, Math.min(100, p));
}
