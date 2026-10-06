/**
 * Behind this week, for the brief writer's input and the candidate counts: a
 * door to the rules the app and the workers share (workers/shared/habitWeek.js),
 * so the brief never counts a different week from the app.
 *
 * The week is the person's own: the seven days that end on their weekly day,
 * so Monday to Sunday for someone whose weekly day is Sunday. Weekly-target
 * habits only: behind when done < floor(target × days gone ÷ 7), today counted
 * as gone. A day a habit was paused on does not count as gone, and it is never
 * behind on a day it is paused. Daily habits and habits being broken never
 * count.
 */

import { behindInWeek, weeklyTarget } from '../../shared/habitWeek.js';

export { weeklyTarget };

/**
 * Whether a habit is behind in their week today.
 * @param {object} habit the habit's row
 * @param {number} done how many are done in their week so far
 * @param {{today: string, weeklyDay: number, eases?: object[]}} week their
 *   week: today, their weekly day and their habit_adaptations rows
 */
export function isBehindThisWeek(habit, done, week) {
  return behindInWeek({
    habit,
    done,
    today: week.today,
    weeklyDay: week.weeklyDay,
    eases: week.eases,
  });
}
