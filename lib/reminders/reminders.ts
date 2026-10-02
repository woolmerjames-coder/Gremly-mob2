/**
 * Reminders on items: the quick picks the bell offers and the plain words for
 * a reminder. Pure functions of `now`, so they test without a clock.
 *
 * The app only saves reminders (ItemReminder in reminders_json); the server
 * plans and sends them (workers/inngest-jobs/notifications).
 */
import type { ItemReminder } from '../types';

export type ReminderKind = 'todo' | 'habit' | 'event' | 'note' | 'person';
export interface EventStart {
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:MM, null for all day
}
export interface QuickPick {
  key: string;
  label: string;
  detail: string;
  /** The reminder this pick sets, or what it opens instead */
  reminder?: ItemReminder;
  opens?: 'pick-time' | 'repeat';
}

const pad = (n: number) => String(n).padStart(2, '0');
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_SHORT = [
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

export const hhmm = (h: number, m: number) => `${pad(h)}:${pad(m)}`;
export const localDay = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n, 12);
  return localDay(dt);
}

function weekday(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getDay();
}

/** "6:00 PM" from "18:00". */
export function clockLabel(time?: string | null): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m || 0)} ${suffix}`;
}

export function newReminderId(now: Date): string {
  return `r-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function minutesOf(time?: string | null): number | null {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : null;
}

const once = (id: string, date: string, time: string): ItemReminder => ({
  id,
  frequency: 'once',
  date,
  time,
});

/** The bell's quick picks for one kind of item. */
export function quickPicks(
  kind: ReminderKind,
  { now, eventStart }: { now: Date; eventStart?: EventStart | null },
): QuickPick[] {
  const id = newReminderId(now);
  const today = localDay(now);
  const tomorrow = addDays(today, 1);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const pickTime: QuickPick = {
    key: 'pick',
    label: 'Pick a time',
    detail: 'Any day and time',
    opens: 'pick-time',
  };
  const repeat: QuickPick = {
    key: 'repeat',
    label: 'Repeat',
    detail: 'Daily, weekly, more',
    opens: 'repeat',
  };

  if (kind === 'event' && eventStart?.date) {
    if (eventStart.time) {
      const start = minutesOf(eventStart.time) ?? 0;
      const before = (mins: number) =>
        clockLabel(
          hhmm(Math.floor(((start - mins + 1440) % 1440) / 60), (start - mins + 1440) % 60),
        );
      return [
        {
          key: 'hour',
          label: '1 hour before',
          detail: before(60),
          reminder: { id, kind: 'before', minutes: 60 },
        },
        {
          key: 'quarter',
          label: '15 minutes before',
          detail: before(15),
          reminder: { id, kind: 'before', minutes: 15 },
        },
        {
          key: 'evening',
          label: 'The evening before',
          detail: '6:00 PM the day before',
          reminder: { id, kind: 'before', evening: true },
        },
        pickTime,
      ];
    }
    return [
      {
        key: 'evening',
        label: 'The evening before',
        detail: '6:00 PM the day before',
        reminder: { id, kind: 'before', evening: true },
      },
      {
        key: 'morning',
        label: 'That morning',
        detail: '9:00 AM',
        reminder: once(id, eventStart.date, '09:00'),
      },
      pickTime,
    ];
  }

  if (kind === 'habit') {
    return [
      {
        key: 'daily',
        label: 'Every day',
        detail: '9:00 AM',
        reminder: { id, frequency: 'daily', time: '09:00' },
      },
      {
        key: 'weekdays',
        label: 'Weekdays',
        detail: '9:00 AM',
        reminder: { id, frequency: 'weekdays', time: '09:00' },
      },
      { ...repeat, label: 'Pick days', detail: 'Any days and time' },
      { ...pickTime, label: 'Just once', detail: 'Any day and time' },
    ];
  }

  if (kind === 'person') {
    let nextMonday = addDays(today, 1);
    while (weekday(nextMonday) !== 1) nextMonday = addDays(nextMonday, 1);
    return [
      {
        key: 'sunday',
        label: 'Every Sunday',
        detail: '6:00 PM',
        reminder: { id, frequency: 'weekly', days_of_week: [0], time: '18:00' },
      },
      {
        key: 'next-week',
        label: 'Next week',
        detail: 'Monday at 9:00 AM',
        reminder: once(id, nextMonday, '09:00'),
      },
      pickTime,
      repeat,
    ];
  }

  // todos, notes, and events without a date
  let later: QuickPick;
  if (nowMin < 17 * 60) {
    later = {
      key: 'later',
      label: 'Later today',
      detail: '6:00 PM',
      reminder: once(id, today, '18:00'),
    };
  } else if (nowMin < 21 * 60 + 30) {
    const inHour = Math.ceil((nowMin + 60) / 15) * 15;
    const t = hhmm(Math.floor(inHour / 60) % 24, inHour % 60);
    later = {
      key: 'later',
      label: 'In an hour',
      detail: clockLabel(t),
      reminder: once(id, today, t),
    };
  } else {
    later = {
      key: 'later',
      label: 'Tomorrow evening',
      detail: '6:00 PM',
      reminder: once(id, tomorrow, '18:00'),
    };
  }
  return [
    later,
    {
      key: 'tomorrow',
      label: 'Tomorrow morning',
      detail: '9:00 AM',
      reminder: once(`${id}t`, tomorrow, '09:00'),
    },
    pickTime,
    repeat,
  ];
}

function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  const [, m, d] = date.split('-').map(Number);
  return `${DAY_SHORT[weekday(date)]} ${d} ${MONTH_SHORT[m - 1]}`;
}

/** Plain words for one reminder: "Today at 6:00 PM", "Every Sunday at 6:00 PM", "1 hour before". */
export function describeReminder(r: ItemReminder, { now }: { now: Date }): string {
  if (r.kind === 'before') {
    if (r.evening) return 'The evening before';
    const m = Number(r.minutes || 0);
    if (m === 60) return '1 hour before';
    if (m > 60 && m % 60 === 0) return `${m / 60} hours before`;
    return `${m} minutes before`;
  }
  const at = clockLabel(r.time);
  switch (r.frequency) {
    case 'daily':
      return `Every day at ${at}`;
    case 'weekdays':
      return `Weekdays at ${at}`;
    case 'weekends':
      return `Weekends at ${at}`;
    case 'weekly': {
      const days = [...(r.days_of_week || [])].sort((a, b) => a - b);
      if (days.length === 1) return `Every ${DAY_LONG[days[0]]} at ${at}`;
      return `${days.map((d) => DAY_SHORT[d]).join(', ')} at ${at}`;
    }
    default:
      return r.date ? `${dayLabel(r.date, localDay(now))} at ${at}` : `At ${at}`;
  }
}

/** True for a one off reminder whose time has gone. */
export function isSpent(r: ItemReminder, now: Date): boolean {
  if (r.kind === 'before' || (r.frequency && r.frequency !== 'once')) return false;
  if (!r.date || !r.time) return false;
  const [y, m, d] = r.date.split('-').map(Number);
  const [h, mi] = r.time.split(':').map(Number);
  return new Date(y, m - 1, d, h, mi).getTime() <= now.getTime();
}

/** The row summary: "Off", the one reminder, or a count. Spent one offs are left out. */
export function summarizeReminders(
  list: ItemReminder[] | null | undefined,
  { now }: { now: Date },
): string {
  const live = (list || []).filter((r) => !isSpent(r, now));
  if (!live.length) return 'Off';
  if (live.length === 1) return describeReminder(live[0], { now });
  return `${live.length} reminders`;
}

/** "Done. I'll remind you today at 6:00 PM." */
export function confirmation(r: ItemReminder, { now }: { now: Date }): string {
  const words = describeReminder(r, { now });
  return `Done. I’ll remind you ${words.charAt(0).toLowerCase()}${words.slice(1)}.`;
}

/** What gets saved: no on-phone ids from the old scheduler, no spent one offs. */
export function cleanReminders(list: ItemReminder[] | null | undefined, now: Date): ItemReminder[] {
  return (list || [])
    .filter((r) => !isSpent(r, now))
    .map(({ notificationId: _old, ...rest }) => rest);
}
