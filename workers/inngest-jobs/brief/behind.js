/**
 * Behind this week, the same rule as the app (lib/brief/behind.ts), for the
 * brief writer's input and the candidate counts.
 *
 * Weekly-target habits only: behind when done < floor(target × days gone ÷ 7),
 * weeks from Monday, today counted as gone. Daily habits and habits being
 * broken never count.
 */

/** Monday of the week a YYYY-MM-DD falls in. */
export function mondayOf(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** 1 on Monday through 7 on Sunday. */
export function dayOfWeekNumber(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return ((d.getUTCDay() + 6) % 7) + 1;
}

export function weeklyTarget(habit) {
  if (!habit || habit.subtype === 'break_habit') return null;
  if ((habit.cadence || 'daily') !== 'weekly') return null;
  const t =
    habit.target_per_period ??
    (Array.isArray(habit.days_active) && habit.days_active.length ? habit.days_active.length : 1);
  return t > 0 ? t : null;
}

export function isBehindThisWeek(habit, done, daysGone) {
  if (!habit || habit.archived) return false;
  const target = weeklyTarget(habit);
  if (target === null) return false;
  return done < Math.floor((target * daysGone) / 7);
}
