/**
 * The month view of the journal: a month's days laid out in weeks, the months
 * there is something to look at, and how an entry reads in a list.
 *
 * Days and months are the calendar's own (YYYY-MM-DD and YYYY-MM), so nothing
 * here depends on the clock. Whoever shows the calendar says which day is
 * today, which is the person's day.
 */
import type { JournalEntry } from './entry';
import { entryDay } from './entry';
import { layoutParts, readLayout } from './page';
import { JOURNAL_COPY, dayWords } from './words';

/** The week runs Sunday to Saturday, as the month view shows it */
export const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-10" for a day in it */
export function monthOf(day: string): string {
  return day.slice(0, 7);
}

/** The month this many months later, or earlier for a number below zero. */
export function shiftMonth(month: string, by: number): string {
  const at = Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1) + by;
  return `${Math.floor(at / 12)}-${pad((at % 12) + 1)}`;
}

/** "October 2026" */
export function monthTitle(month: string): string {
  return dayWords(`${month}-01`).month;
}

/** A month's days in order, and how many empty places come before the first in its week. */
export function monthDays(month: string): { lead: number; days: string[] } {
  const year = Number(month.slice(0, 4));
  const at = Number(month.slice(5, 7)) - 1;
  const lead = new Date(Date.UTC(year, at, 1, 12)).getUTCDay();
  const count = new Date(Date.UTC(year, at + 1, 0, 12)).getUTCDate();
  return { lead, days: Array.from({ length: count }, (_, i) => `${month}-${pad(i + 1)}`) };
}

/**
 * The months worth showing: from the first entry's month to this month. The
 * calendar never runs ahead of today.
 */
export function monthsToShow(
  entries: JournalEntry[],
  today: string,
): { first: string; last: string } {
  const last = monthOf(today);
  let first = last;
  for (const e of entries) {
    const day = entryDay(e);
    if (day && monthOf(day) < first) first = monthOf(day);
  }
  return { first, last };
}

/** "1 entry this month", "4 entries this month" */
export function monthCount(count: number): string {
  return `${count} ${count === 1 ? 'entry' : 'entries'} this month`;
}

/** What an entry is called in a list: its title, or its first words when it has none. */
export function entryTitle(entry: Pick<JournalEntry, 'title' | 'body'>): string {
  const title = String(entry.title ?? '').trim();
  if (title) return title;
  const first = String(entry.body ?? '')
    .trim()
    .split('\n')[0]
    .trim();
  return first ? first.slice(0, 60) : JOURNAL_COPY.untitled;
}

/**
 * An entry's words on one line, for a preview. One written on the page gives
 * its answers without the prompts over them.
 */
export function entrySnippet(entry: Pick<JournalEntry, 'body' | 'views'>): string {
  const body = String(entry.body ?? '').trim();
  const layout = readLayout(entry.views);
  const words =
    layout && layout.text.trim() === body
      ? layoutParts(layout)
          .map((p) => p.text)
          .join(' ')
      : body;
  return words.replace(/\s+/g, ' ').trim();
}

/** How far along today's page is */
export type TodayState = 'saved' | 'started' | 'empty';

/**
 * What the calendar says about today, and what its button does.
 * `here` is when today's page is the one on screen behind the calendar, and
 * `back` is when that page is waiting behind an older entry being read.
 */
export function todayCard(
  state: TodayState,
  where: { here?: boolean; back?: boolean } = {},
): { text: string; action: string } {
  if (where.here) return { text: JOURNAL_COPY.calWritingNow, action: JOURNAL_COPY.calKeepWriting };
  const text =
    state === 'saved'
      ? JOURNAL_COPY.calSavedToday
      : state === 'started'
        ? JOURNAL_COPY.calStartedToday
        : JOURNAL_COPY.calNothingToday;
  if (where.back) return { text, action: JOURNAL_COPY.backToToday };
  const action =
    state === 'saved'
      ? JOURNAL_COPY.calOpenToday
      : state === 'started'
        ? JOURNAL_COPY.calKeepWriting
        : JOURNAL_COPY.calWriteToday;
  return { text, action };
}
