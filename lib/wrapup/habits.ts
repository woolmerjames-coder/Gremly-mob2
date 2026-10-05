/**
 * The habits the evening wrap up checks in on: the ones still open on the
 * person's day, on one card. A habit being built that is on for the day and
 * not yet logged, and every habit being broken that has no answer yet (the
 * evening is the only place those are checked in). Pure, so it can be tested.
 *
 * It is counted for the day given, which after midnight is still yesterday
 * until their day ends, so a check in at 12:30am lands on the right day.
 */
import { scheduleOf } from '../changes/model';
import type { SweepHabitRow } from '../brief/types';

type Row = Record<string, any>;

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
function mondayOf(day: string): string {
  const w = weekdayOf(day);
  return addDays(day, w === 0 ? -6 : 1 - w);
}

const titleOf = (h: Row) => String(h.name || h.title || 'Untitled').trim();

/** Days in a row up to and including the day before, for a daily habit. */
export function runBefore(logged: ReadonlySet<string>, day: string): number {
  let n = 0;
  let d = addDays(day, -1);
  while (logged.has(d)) {
    n += 1;
    d = addDays(d, -1);
  }
  return n;
}

export interface HabitCheckIn {
  rows: SweepHabitRow[];
  /** Names of the habits already logged that day */
  already: string[];
}

export function habitsToCheckIn(
  habits: Row[],
  habitProgress: { habit_id: string; occurred_day: string }[],
  day: string,
): HabitCheckIn {
  const rows: SweepHabitRow[] = [];
  const already: string[] = [];
  const byHabit = new Map<string, Set<string>>();
  for (const p of habitProgress) {
    const set = byHabit.get(p.habit_id) ?? new Set<string>();
    set.add(String(p.occurred_day).slice(0, 10));
    byHabit.set(p.habit_id, set);
  }

  for (const h of habits) {
    if (h.archived) continue;
    // not started yet, or over
    if (!h.start_date && !h.start_date_confirmed) continue;
    if (h.start_date && String(h.start_date).slice(0, 10) > day) continue;
    if (h.end_date && String(h.end_date).slice(0, 10) < day) continue;

    const logged = byHabit.get(h.id) ?? new Set<string>();
    const title = titleOf(h);
    if (logged.has(day)) {
      already.push(title);
      continue;
    }
    if (h.subtype === 'break_habit') {
      rows.push({ id: h.id, title, kind: 'break' });
      continue;
    }

    const s = scheduleOf(h);
    if (s.days?.length) {
      if (!s.days.includes(weekdayOf(day))) continue;
      rows.push({ id: h.id, title, kind: 'build', note: 'On for today' });
      continue;
    }
    if (s.per === 'day') {
      const run = runBefore(logged, day);
      rows.push({
        id: h.id,
        title,
        kind: 'build',
        note: run >= 2 ? `Daily, ${run} days running` : 'Daily',
      });
      continue;
    }
    const start = s.per === 'week' ? mondayOf(day) : `${day.slice(0, 8)}01`;
    const sofar = [...logged].filter((d) => d >= start && d <= day).length;
    // met for the week or month already: nothing left open
    if (sofar >= s.times) continue;
    rows.push({
      id: h.id,
      title,
      kind: 'build',
      note: `${sofar} of ${s.times} this ${s.per}`,
    });
  }

  // habits being built first, then the ones being broken
  rows.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'build' ? -1 : 1));
  return { rows, already };
}
