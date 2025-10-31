import type { Cadence } from '../../types/habit';

export type TodayItemKind = 'todo' | 'habit';

export interface TodayItem {
  id: string;
  kind: TodayItemKind;
  title: string;
  completed: boolean;
  dueAt?: string | null;
  cadence?: Cadence;
  targetPerPeriod?: number;
  targetPerDay?: number;
  completedCount?: number;
  totalCount?: number;
  lastCompletedAt?: string | null;
}
