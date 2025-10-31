export type TodayItemKind = 'todo' | 'habit';

export interface TodayItem {
  id: string;
  kind: TodayItemKind;
  title: string;
  completed: boolean;
  dueAt?: string | null;
  cadence?: 'daily' | 'weekly' | 'monthly';
  targetPerPeriod?: number;
  targetPerDay?: number;
  periodCount?: number;
  todayCount?: number;
  lastCompletedAt?: string | null;
}
