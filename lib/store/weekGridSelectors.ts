import { useMemo } from 'react';
import { useGremlyStore } from './useGremlyStore';
import { getDateService } from '../date';
import { getEventsForDate } from '../calendar/CalendarService';
import { computeWorldsForEntity } from './worldsSelectors';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface WeekDayItem {
  id: string; // todo id
  title: string; // todo.name || todo.title || 'Untitled'
  kind: 'todo'; // todos only this phase
  assignedDay: string; // YYYY-MM-DD
  fromSession: boolean; // true if placed via a session decision this sweep
  world: { name: string; accentColor: string } | null; // primary world (user-pin-aware)
}

export interface WeekDay {
  date: string; // YYYY-MM-DD
  dow: string; // 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat'
  dayNum: number; // day-of-month integer
  tag: 'Today' | 'Tomorrow' | null;
  items: WeekDayItem[]; // todo items placed on this day
  todoCount: number; // = items.length
  eventCount: number; // calendar events on this day
  isToday: boolean;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns WeekDay metadata + items/counts for the next 7 days (today → today+6).
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
  // World data — reactive so world dots update when user re-pins mid-session.
  const worlds = useGremlyStore((s) => s.worlds);
  const dropWorldLinks = useGremlyStore((s) => s.dropWorldLinks);

  return useMemo(() => {
    const ds = getDateService();
    const today = ds.today();
    const tomorrow = ds.addDays(today, 1);

    // Build a quick lookup: todoId → todo (for title resolution)
    const todoById = new Map(todos.map((t) => [t.id, t]));

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

      // ── Todo items — reconciled against session decisions ──
      // Build the definitive set of todo ids that should count on `date`.
      const countedIds = new Set<string>();
      // Track which ids were placed via a session decision (vs pre-existing DB due_day).
      const sessionIds = new Set<string>();

      for (const todo of todos) {
        if (todo.archived || todo.completed_at) continue;

        const decision = sessionDecisions.get(todo.id);

        if (decision) {
          // Session decision overrides DB: count only if kept and assigned to this date.
          if (decision.action === 'keep' && decision.dueDateStr === date) {
            countedIds.add(todo.id);
            sessionIds.add(todo.id);
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
          sessionIds.add(todoId);
        }
      }

      // ── Build WeekDayItem list ──
      const items: WeekDayItem[] = [];
      for (const id of countedIds) {
        const todo = todoById.get(id);
        const title = todo?.name || (todo as any)?.title || 'Untitled';
        const fromSession = sessionIds.has(id);

        const worldsForEntity = computeWorldsForEntity(worlds, dropWorldLinks, id);
        const primaryWorld = worldsForEntity[0]
          ? { name: worldsForEntity[0].name, accentColor: worldsForEntity[0].accentColor }
          : null;

        items.push({
          id,
          title,
          kind: 'todo',
          assignedDay: date,
          fromSession,
          world: primaryWorld,
        });
      }

      // ── Derived day metadata ──
      const isToday = date === today;
      const tag: WeekDay['tag'] = isToday ? 'Today' : date === tomorrow ? 'Tomorrow' : null;
      const dayNum = parseInt(date.slice(8, 10), 10);

      // Derive raw weekday name — do NOT use formatForChip (it returns 'Today'/'Tomorrow').
      const dateObj = ds.fromLocalDate(date) ?? new Date(date + 'T12:00:00');
      const dowIndex = dateObj.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
      const dow = DOW[dowIndex];

      return {
        date,
        dow,
        dayNum,
        tag,
        items,
        todoCount: items.length,
        eventCount: eventsCount,
        isToday,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos, calendarEvents, userCalendarEvents, notes, worlds, dropWorldLinks, sessionDecisions]);
}
