import { useMemo } from 'react';
import { useGremlyStore } from './useGremlyStore';
import { getDateService } from '../date';
import { getEventsForDate } from '../calendar/CalendarService';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface WeekDay {
  date: string; // YYYY-MM-DD
  dow: string; // 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat'
  dayNum: number; // day-of-month integer
  tag: 'Today' | 'Tomorrow' | null;
  count: number; // total commitments on this day
  isToday: boolean;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns WeekDay metadata + commitment counts for the next 7 days (today → today+6).
 *
 * @param sessionDecisions  Map<todoId, { dueDateStr?, action }> — in-session overrides from
 *                          SweepDecisionStep. Each todo is counted on its session decision day
 *                          (if action==='keep') rather than its DB due_day.
 */
export function useWeekDays(
  sessionDecisions: Map<string, { dueDateStr?: string; action: string }>,
): WeekDay[] {
  // Subscribe to all slices getEventsForDate reads internally so this stays reactive.
  const todos = useGremlyStore((s) => s.todos);
  const calendarEvents = useGremlyStore((s) => s.calendarEvents);
  const userCalendarEvents = useGremlyStore((s) => s.userCalendarEvents);
  const notes = useGremlyStore((s) => s.notes);

  return useMemo(() => {
    const ds = getDateService();
    const today = ds.today();
    const tomorrow = ds.addDays(today, 1);

    // Build 7 date strings: today through today+6
    const dates: string[] = Array.from({ length: 7 }, (_, i) => ds.addDays(today, i));

    return dates.map((date): WeekDay => {
      // ── Calendar event count ──
      // getEventsForDate snapshots the store imperatively — reactivity is provided by the
      // slice subscriptions above (todos, calendarEvents, userCalendarEvents, notes).
      // Exclude source==='todo' and source==='habit' — those are DB-backed todos/habits
      // surfaced in the calendar view, not external calendar claims.
      const eventsCount = getEventsForDate(date).filter(
        (e) => e.source !== 'todo' && e.source !== 'habit',
      ).length;

      // ── Todo count — reconciled against session decisions ──
      // Build the definitive set of todo ids that should count on `date`.
      const countedIds = new Set<string>();

      for (const todo of todos) {
        if (todo.archived || todo.completed_at) continue;

        const decision = sessionDecisions.get(todo.id);

        if (decision) {
          // Session decision overrides DB: count only if kept and assigned to this date.
          if (decision.action === 'keep' && decision.dueDateStr === date) {
            countedIds.add(todo.id);
          }
          // If moved to a different day (or action !== 'keep'), do NOT count here.
        } else {
          // No session decision — use DB due_day.
          if (todo.due_day === date) {
            countedIds.add(todo.id);
          }
        }
      }

      // Also add todos newly assigned to this date in the session whose id wasn't in the
      // todos array (e.g., freshly converted items not yet in the DB snapshot).
      for (const [todoId, decision] of sessionDecisions.entries()) {
        if (decision.action === 'keep' && decision.dueDateStr === date && !countedIds.has(todoId)) {
          countedIds.add(todoId);
        }
      }

      const todosCount = countedIds.size;

      // ── Derived day metadata ──
      const isToday = date === today;
      const tag: WeekDay['tag'] = isToday ? 'Today' : date === tomorrow ? 'Tomorrow' : null;
      const dayNum = parseInt(date.slice(8, 10), 10);

      // Derive raw weekday name — do NOT use formatForChip (it returns 'Today'/'Tomorrow').
      const dateObj = ds.fromLocalDate(date) ?? new Date(date + 'T12:00:00');
      const dowIndex = dateObj.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
      const dow = DOW[dowIndex];

      const count = eventsCount + todosCount;

      // TEMPORARY DEBUG — remove after diagnosis
      const ev = getEventsForDate(date).filter((e) => e.source !== 'todo' && e.source !== 'habit');
      const dbTodos = todos.filter((t) => !t.archived && !t.completed_at && t.due_day === date);
      const decisionsForDay = [...sessionDecisions.entries()].filter(
        ([, d]) => d.action === 'keep' && d.dueDateStr === date,
      );
      console.log(
        '[wgdbg]',
        date,
        'events=',
        ev.length,
        ev.map((e) => e.source),
        'dbTodos=',
        dbTodos.length,
        'decisions=',
        decisionsForDay.length,
        'FINAL=',
        count,
      );

      return {
        date,
        dow,
        dayNum,
        tag,
        count,
        isToday,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos, calendarEvents, userCalendarEvents, notes, sessionDecisions]);
}
