/**
 * The record row on the age up page: fed days in total, the best run, and how
 * long Gremly has been with the person. Pure, read from what the store holds.
 */

import { getDateService } from '../date';

export interface MomentRecord {
  fedDays: number;
  bestRun: number;
  /** "14 Aug", or null when the account's start is not known */
  since: string | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "14 Aug" from a YYYY-MM-DD day or an ISO timestamp. */
export function shortDay(value: string | null | undefined): string | null {
  const day = getDateService().extractLocalDate(value);
  if (!day) return null;
  const [, m, d] = day.split('-');
  const month = MONTHS[Number(m) - 1];
  if (!month) return null;
  return `${Number(d)} ${month}`;
}

/** The longest run of consecutive days in a list of YYYY-MM-DD days. */
export function bestRun(days: readonly string[]): number {
  const sorted = Array.from(new Set(days.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))).sort();
  if (sorted.length === 0) return 0;
  const ds = getDateService();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (ds.daysBetween(sorted[i - 1], sorted[i]) === 1) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }
  return best;
}

export function recordFrom(input: {
  fedDays: readonly string[] | null | undefined;
  age: number;
  fedDaysCount: number;
  accountCreatedAt: string | null | undefined;
}): MomentRecord {
  const list = input.fedDays ?? [];
  const counted =
    list.length > 0 ? new Set(list).size : Math.max(0, input.age * 3 + input.fedDaysCount);
  return {
    fedDays: counted,
    bestRun: list.length > 0 ? bestRun(list) : Math.min(counted, 1),
    since: shortDay(input.accountCreatedAt),
  };
}
