import type { Habit as BaseHabit, Cadence } from '../lib/types';

export type { Cadence };

export interface Habit extends BaseHabit {
  cadence: Cadence;
  target_per_period?: number;
  target_per_day?: number;
  days_active?: string[] | null; // Day names like ['monday', 'wednesday', 'friday']
  last_completed_at?: string | null;
  period_start_at?: string | null;
}
