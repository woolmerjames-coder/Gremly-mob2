/**
 * Everything the day card and the Due today sheet show, from the store.
 *
 * Counts come from the same selectors Today uses (todos due today, habits due
 * today, the quick sweep's count) and the same merged calendar
 * (CalendarService), so the card and Today always agree.
 */

import { useEffect, useMemo, useState } from 'react';
import { useGremlyStore } from '../store/useGremlyStore';
import {
  selectHabitsDueToday,
  selectQuickSweepCandidates,
  selectTodosDueToday,
} from '../store/selectors';
import { getEventsForDate } from '../calendar/CalendarService';
import { getDateService } from '../date/DateService';
import type { Habit, Todo } from '../types';
import { dayOfWeekNumber, habitsBehindThisWeek, weeklyTarget } from './behind';
import { isReturnDay, readDco } from './dco';
import { buildDayRecord, type DayRecord, type DayThreadMeta } from './dayRecord';
import { useTodayThread } from './todayThread';
import {
  habitsLine,
  isCancelledMeeting,
  meetingsLine,
  sweepLine,
  todosLine,
  type DayMeeting,
  type DayPlanned,
} from './dayCard';
import { hhmmToMinutes, localDateOf, minutesOfDay } from './time';

/** The minute of the day now, updated every minute while mounted. */
export function useNowMinutes(): number {
  const [now, setNow] = useState(() => minutesOfDay());
  useEffect(() => {
    const t = setInterval(() => setNow(minutesOfDay()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export interface HabitWeek {
  habit: Habit;
  done: number;
  /** Weekly target, or null for daily habits */
  target: number | null;
  behind: boolean;
}

export interface DayCardData {
  date: string;
  now: number;
  meetings: DayMeeting[];
  planned: DayPlanned[];
  todosDue: Todo[];
  habitsToday: Habit[];
  habitWeeks: HabitWeek[];
  behind: Habit[];
  /** The quick sweep's cards: what still needs a decision */
  sweepWaiting: number;
  /** Of them, todos past their day */
  overdue: number;
  chip: string | null;
  /** Travel, set times, where planning stops (lib/brief/dayRecord.ts) */
  record: DayRecord;
  returnDay: boolean;
  lines: {
    meetings: string;
    todos: string;
    habits: { text: string; warn: boolean };
    sweep: { text: string; warn: boolean };
  };
}

/**
 * The day's timed meetings from the merged calendar (synced, Gremly events and
 * quick events), cancelled ones left out, in minutes from local midnight.
 * Read outside React too (the plan picker's input).
 */
export function meetingsForDay(date: string, cancelled: ReadonlySet<string>): DayMeeting[] {
  return getEventsForDate(date)
    .filter(
      (e) =>
        !e.isAllDay &&
        (e.source === 'synced' || e.source === 'gremly_event' || e.source === 'user_calendar') &&
        !isCancelledMeeting(
          e.title,
          [e.originalId, (e.sourceData?.record as { id?: string } | undefined)?.id],
          cancelled,
        ),
    )
    .map((e) => {
      const start = e.startAt ? minutesOfDay(e.startAt) : hhmmToMinutes(e.startTime);
      const end = e.endAt ? minutesOfDay(e.endAt) : hhmmToMinutes(e.endTime);
      if (start === null) return null;
      return {
        id: e.originalId || e.id,
        title: e.title,
        start,
        end: end !== null && end > start ? end : start + 30,
      };
    })
    .filter((m): m is DayMeeting => m !== null)
    .sort((a, b) => a.start - b.start);
}

/** Planned items: todos and habits Lock it in placed on this day. */
export function plannedForDay(todos: Todo[], habits: Habit[], date: string): DayPlanned[] {
  const out: DayPlanned[] = [];
  const add = (item: Todo | Habit, kind: 'todo' | 'habit') => {
    const iso = item.scheduled_start_iso;
    if (!iso || localDateOf(iso) !== date) return;
    const start = minutesOfDay(iso);
    const dur =
      item.time_estimate_minutes && item.time_estimate_minutes > 0
        ? item.time_estimate_minutes
        : 30;
    out.push({
      id: item.id,
      title: item.name || (item as Todo).title || 'Untitled',
      start,
      end: start + dur,
      kind,
    });
  };
  todos.forEach((t) => !t.archived && !t.completed_at && add(t, 'todo'));
  habits.forEach((h) => !h.archived && add(h, 'habit'));
  return out.sort((a, b) => a.start - b.start);
}

/** Habit completions per habit since Monday of this week. */
export function doneSinceMonday(
  progress: { habit_id: string; occurred_day: string; count?: number }[],
  weekStartMonday: string,
  today: string,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of progress) {
    if (p.occurred_day >= weekStartMonday && p.occurred_day <= today) {
      map.set(p.habit_id, (map.get(p.habit_id) ?? 0) + (p.count ?? 1));
    }
  }
  return map;
}

export function useDayCard(date: string): DayCardData {
  const now = useNowMinutes();
  const todosDue = useGremlyStore(selectTodosDueToday);
  const habitsToday = useGremlyStore(selectHabitsDueToday);
  // the quick sweep: what still needs a decision, the number the brief names
  const quickSweep = useGremlyStore(selectQuickSweepCandidates);
  const todos = useGremlyStore((s) => s.todos);
  const habits = useGremlyStore((s) => s.habits);
  const progress = useGremlyStore((s) => s.habitProgress);
  const dco = useGremlyStore((s) => s.dco);
  // the merged calendar reads the store imperatively; these keep it current
  const syncedToday = useGremlyStore((s) => s.calendarEvents[date]);
  const userEvents = useGremlyStore((s) => s.userCalendarEvents);
  const notes = useGremlyStore((s) => s.notes);

  const cancelledKey = useMemo(() => readDco(dco).cancelledCalendarIds.join(','), [dco]);
  const meetings = useMemo<DayMeeting[]>(
    () => meetingsForDay(date, new Set(cancelledKey ? cancelledKey.split(',') : [])),
    // the merged calendar reads the store itself; these say when it changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [date, syncedToday, userEvents, notes, cancelledKey],
  );

  const planned = useMemo(() => plannedForDay(todos, habits, date), [todos, habits, date]);

  const { habitWeeks, behind } = useMemo(() => {
    const ds = getDateService();
    const monday = ds.startOfWeekMonday(date);
    const daysGone = dayOfWeekNumber(date, monday);
    const done = doneSinceMonday(progress as any[], monday, date);
    const active = habits.filter((h) => !h.archived);
    const weeks: HabitWeek[] = active.map((h) => {
      const target = weeklyTarget(h);
      return { habit: h, done: done.get(h.id) ?? 0, target, behind: false };
    });
    const behindList = habitsBehindThisWeek(active, done, daysGone);
    const behindIds = new Set(behindList.map((h) => h.id));
    weeks.forEach((w) => (w.behind = behindIds.has(w.habit.id)));
    return { habitWeeks: weeks, behind: behindList };
  }, [habits, progress, date]);

  const { anchors, brief, frame } = useMemo(() => readDco(dco), [dco]);
  // set times added in today's thread belong to the day too
  const threadMeta = useTodayThread((s) =>
    (s.thread?.metadata_json as { ritual_day?: string } | undefined)?.ritual_day === date
      ? (s.thread?.metadata_json as DayThreadMeta)
      : null,
  );
  const record = useMemo(
    () => buildDayRecord({ today: date, frame, threadMeta, meetings, anchors }),
    [date, frame, threadMeta, meetings, anchors],
  );
  const chip = record.chip?.text ?? null;
  const returnDay = isReturnDay(brief);

  const plannedHabits = planned.filter((p) => p.kind === 'habit').length;
  const pastDay = useMemo(
    () => quickSweep.filter((c) => c.candidate.kind === 'todo' && c.candidate.isOverdue).length,
    [quickSweep],
  );
  const lines = {
    meetings: meetingsLine(meetings, now),
    todos: todosLine(
      todosDue.map((t) => ({ id: t.id, title: t.name || t.title || 'Untitled' })),
      planned,
    ),
    habits: habitsLine(habitsToday.length, behind.length, plannedHabits),
    sweep: sweepLine(quickSweep.length, pastDay),
  };

  return {
    date,
    now,
    meetings,
    planned,
    todosDue,
    habitsToday,
    habitWeeks,
    behind,
    sweepWaiting: quickSweep.length,
    overdue: pastDay,
    chip,
    record,
    returnDay,
    lines,
  };
}
