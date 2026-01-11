/**
 * getSweepInsight
 *
 * Generate a heuristic insight for the sweep summary.
 * Returns first matching insight or null.
 *
 * v1: Uses immediately available data only.
 * TODO v2: Add streak-based insights (lock-in streak, habit records, journal streak)
 */

interface SweepInsightInput {
  lockInCompleted: number;
  lockInTotal: number;
  habitsChecked: number;
  archivedCount: number;
  totalSwept: number;
}

export function getSweepInsight(input: SweepInsightInput): string | null {
  const { lockInCompleted, lockInTotal, habitsChecked, archivedCount, totalSwept } = input;

  // Priority 1: All locked-in completed
  if (lockInTotal > 0 && lockInCompleted === lockInTotal) {
    return 'All locked-in items done. Nice work.';
  }

  // Priority 2: High archive count (>5)
  if (archivedCount > 5) {
    return `Let go of ${archivedCount} things tonight. Lighter already.`;
  }

  // Priority 3: High volume (>10)
  if (totalSwept > 10) {
    return `${totalSwept} items cleared. That's a big sweep.`;
  }

  // Priority 4: Solid habits session (3+)
  if (habitsChecked >= 3) {
    return `${habitsChecked} habits checked off. Consistency builds.`;
  }

  // No insight - keep it special
  return null;
}
