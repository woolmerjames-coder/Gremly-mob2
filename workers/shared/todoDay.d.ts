export interface TodoDays {
  due_day?: string | null;
  scheduled_date?: string | null;
  target_date?: string | null;
}
export type TodoDayKind = 'planned' | 'deadline' | null;
export function dayOnly(value: unknown): string | null;
export function plannedDayOf(todo: TodoDays | null | undefined): string | null;
export function deadlineOf(todo: TodoDays | null | undefined): string | null;
export function todoDayOf(
  todo: TodoDays | null | undefined,
  planned?: string | null,
): string | null;
export function todoDayKind(
  todo: TodoDays | null | undefined,
  planned?: string | null,
): TodoDayKind;
export function isTodoOn(
  todo: TodoDays | null | undefined,
  day: string,
  planned?: string | null,
): boolean;
export function isTodoOverdue(
  todo: TodoDays | null | undefined,
  today: string,
  planned?: string | null,
): boolean;
export function isTodoOnOrBefore(
  todo: TodoDays | null | undefined,
  day: string,
  planned?: string | null,
): boolean;
export function isTodoUndated(todo: TodoDays | null | undefined, planned?: string | null): boolean;
export function hasUnscheduledDeadline(
  todo: TodoDays | null | undefined,
  planned?: string | null,
): boolean;
export function deadlineWords(
  todo: TodoDays | null | undefined,
  today: string,
  planned?: string | null,
): 'Due today' | 'Overdue' | null;
export function todoDayFilter(op: 'eq' | 'lt' | 'lte' | 'gt' | 'gte', day: string): string;
export function todoDayRangeFilter(first: string, last: string): string;
export function todoOnOrBeforeFilter(day: string): string;
