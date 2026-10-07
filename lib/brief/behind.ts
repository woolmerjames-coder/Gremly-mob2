/**
 * Behind this week (decided 1 Oct, gap 2 of the context handoff).
 *
 * Weekly-target habits only. A habit is behind when what is done so far in
 * their week is under its target pro rata for the days gone:
 *
 *   done < floor(target × days gone ÷ 7)
 *
 * The week is the person's own: the seven days that end on their weekly day,
 * with today counted as gone. So for a Sunday person Wednesday is day 3: on a
 * Wednesday 0 of 3 is behind (floor(9/7) = 1) and 0 of 2 is not (floor(6/7) = 0).
 * Daily habits never count as behind, and nor do habits being broken. A habit
 * is never behind on a day it is paused, and a paused day does not count as gone.
 *
 * The rule itself is shared with the workers (workers/shared/habitWeek.js,
 * reached through lib/week/habitWeek); this module is the app's thin layer
 * over it. One rule feeds the day card, the Behind tags and the plan's
 * candidate pool.
 */

import type { Habit } from '../types';
import type { HabitAdaptationRow } from '../store/useGremlyStore';
import { behindInWeek } from '../week/habitWeek';

export { paceFloor, weeklyTarget } from '../week/habitWeek';

/** The day a habit is judged on, and whose week it is in. */
export interface BehindWeek {
  today: string;
  /** 0 Sunday to 6 Saturday: their week is the seven days that end on it */
  weeklyDay: number;
  /** Their habit_adaptations rows, for the days a habit is paused */
  eases?: HabitAdaptationRow[];
}

export function isBehindThisWeek(
  habit: Pick<
    Habit,
    'id' | 'cadence' | 'target_per_period' | 'days_active' | 'subtype' | 'archived'
  >,
  doneThisWeek: number,
  week: BehindWeek,
): boolean {
  return behindInWeek({
    habit,
    done: doneThisWeek,
    today: week.today,
    weeklyDay: week.weeklyDay,
    eases: week.eases,
  });
}

/** The habits behind this week, in the order given. */
export function habitsBehindThisWeek<H extends Habit>(
  habits: H[],
  doneThisWeek: Map<string, number>,
  week: BehindWeek,
): H[] {
  return habits.filter((h) => isBehindThisWeek(h, doneThisWeek.get(h.id) ?? 0, week));
}
