import { useGremlyStore } from '../store/useGremlyStore';

export type TodayEmptyState = 'first-time' | 'post-sweep' | 'regular';

export interface TodayEmptyStateContent {
  title: string;
  subtitle: string;
}

export function getTodayEmptyState(): TodayEmptyState {
  const { firstTodayVisitCompletedAt, lastSweepCompletedAt } = useGremlyStore.getState();

  // First time: user has never visited Today screen before
  if (!firstTodayVisitCompletedAt) {
    return 'first-time';
  }

  // Post-sweep: sweep completed within last 30 minutes
  if (lastSweepCompletedAt) {
    const sweepTime = new Date(lastSweepCompletedAt).getTime();
    const now = Date.now();
    const thirtyMinutes = 30 * 60 * 1000;

    if (now - sweepTime < thirtyMinutes) {
      return 'post-sweep';
    }
  }

  // Default: regular empty state
  return 'regular';
}

export function getTodayEmptyStateContent(state: TodayEmptyState): TodayEmptyStateContent {
  switch (state) {
    case 'first-time':
      return {
        title: 'This is your focus for the day.',
        subtitle: 'Drop something in Mind Drop or tap + Add to Today to get started.',
      };
    case 'post-sweep':
      return {
        title: 'All clear.',
        subtitle: "You've swept and there's nothing demanding your attention. Enjoy the calm.",
      };
    case 'regular':
    default:
      return {
        title: 'Nothing planned for today.',
        subtitle: 'Tap + Add to Today or drop something in Mind Drop.',
      };
  }
}
