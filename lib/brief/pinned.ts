/**
 * Words for the ways into today's thread (Daily brief in Chat): the pinned
 * Today card on Chat's fresh home, Gremly's line on Drop, and the speech
 * bubble on Today. All worked out from data, never a model.
 */

import { busyBlocks, clock, type DayMeeting, type DayPlanned } from './dayCard';

const NUMBER_WORDS = [
  'No',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
];

function count(n: number, one: string, many: string): string {
  const word = n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : String(n);
  return `${word} ${n === 1 ? one : many}`;
}

/**
 * The first clear stretch of 45 minutes or more from now, before 10pm (or
 * before `end`, when they set off earlier). Meetings and set times are busy.
 */
export function clearFrom(
  meetings: { start: number; end: number }[],
  now: number,
  end: number = 22 * 60,
): number | null {
  const END = end;
  let cur = Math.max(now, 8 * 60);
  for (const [a, b] of busyBlocks(meetings.filter((m) => m.end > now))) {
    if (a - cur >= 45) return cur;
    cur = Math.max(cur, b);
  }
  return END - cur >= 45 ? cur : null;
}

/**
 * The pinned card's status line once the brief is read: the locked plan
 * (count and next item), else the shape of the rest of the day.
 */
export function pinStatusLine(meetings: DayMeeting[], planned: DayPlanned[], now: number): string {
  if (planned.length) {
    const next = planned.find((p) => p.end > now);
    if (!next) return `${count(planned.length, 'thing', 'things')} planned, all done`;
    return `${planned.length} planned, next ${next.title} at ${clock(next.start)}`;
  }
  const left = meetings.filter((m) => m.end > now);
  if (!meetings.length) return 'Nothing on the calendar today';
  if (!left.length) return 'No more meetings today';
  const free = clearFrom(meetings, now);
  const meetingsLeft = count(left.length, 'meeting', 'meetings');
  if (free === null) return `${meetingsLeft} left today`;
  if (free <= now) return `Clear now, ${meetingsLeft.toLowerCase()} later`;
  return `${meetingsLeft} left, clear from ${clock(free)}`;
}

/** "Thursday 1 Oct" for a YYYY-MM-DD ritual day. */
export function threadDateLabel(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(d);
  const month = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(d);
  return `${weekday} ${d.getUTCDate()} ${month}`;
}

/**
 * Gremly's line when the brief is waiting: on Drop (above the box) and on
 * Today (the speech bubble). On a return day it welcomes them back instead.
 */
export function briefReadyLine(
  day: string,
  opts: { returnDay: boolean; firstName?: string | null; surface: 'drop' | 'today' },
): { lead: string; rest: string } {
  if (opts.returnDay) {
    return {
      lead: opts.firstName ? `Good to see you, ${opts.firstName}.` : 'Good to see you.',
      rest:
        opts.surface === 'drop'
          ? "Today's ready when you are. Tap here"
          : "Today's ready when you are",
    };
  }
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(`${day}T12:00:00Z`),
  );
  return {
    lead: `Your ${weekday}'s ready.`,
    rest: opts.surface === 'drop' ? 'Want the rundown? Tap here' : 'Tap for the rundown',
  };
}

let threadRequests = 0;

/**
 * The params that open Chat on today's thread from anywhere:
 * navigate('Tabs', { screen: 'Gremly', params: todayThreadParams() }).
 * Each call gets its own key, so the same request twice still opens it.
 */
export function todayThreadParams(
  step?: 'plan',
  planDay?: 'tomorrow',
): {
  mode: 'chat';
  thread: 'today';
  step?: 'plan';
  planDay?: 'tomorrow';
  threadKey: string;
} {
  threadRequests += 1;
  return {
    mode: 'chat',
    thread: 'today',
    ...(step ? { step } : {}),
    ...(step && planDay ? { planDay } : {}),
    threadKey: `today-${threadRequests}`,
  };
}
