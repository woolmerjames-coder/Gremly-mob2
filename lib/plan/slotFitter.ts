/**
 * The slot fitter (Daily brief in Chat): places a plan's items on the day,
 * on the device, with no AI call. A pure function, so every remove, add or
 * move re-runs it instantly and the same input always gives the same plan.
 *
 * Each item, in the order given, goes in the first start inside its window
 * that clears every meeting and every item already placed by the buffer (15
 * minutes), on 5-minute steps, and ends inside the window and the planning
 * day. An item with no such start comes back unplaced.
 */

export const BUFFER_MINUTES = 15;
export const STEP_MINUTES = 5;
/** Planning never runs past 10pm */
export const PLAN_DAY_END = 22 * 60;

export interface FitItem {
  id: string;
  /** How long it takes, in minutes (at least 5) */
  minutes: number;
  /** Earliest start and latest end, minutes from local midnight */
  window: [number, number];
}

export interface Busy {
  start: number;
  end: number;
}

export interface Placed {
  id: string;
  start: number;
  end: number;
}

export interface FitResult {
  placed: Placed[];
  unplaced: string[];
}

const up = (m: number) => Math.ceil(m / STEP_MINUTES) * STEP_MINUTES;

/**
 * @param items in priority order
 * @param busy meetings (and anything else fixed) on the day
 * @param from nothing starts before this (the time now, rounded up)
 * @param dayEnd nothing ends after this
 */
export function fitSlots(
  items: FitItem[],
  busy: Busy[],
  from: number,
  dayEnd: number = PLAN_DAY_END,
): FitResult {
  const taken: Busy[] = busy
    .filter((b) => b.end > b.start)
    .map((b) => ({ start: b.start, end: b.end }));
  const placed: Placed[] = [];
  const unplaced: string[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const minutes = Math.max(STEP_MINUTES, Math.round(item.minutes || 0));
    const lo = up(Math.max(item.window[0], from));
    const hi = Math.min(item.window[1], dayEnd);
    let start = lo;
    let found: number | null = null;
    // each pass either fits or jumps past the block it hit, so this ends
    for (let guard = 0; guard < 500 && start + minutes <= hi; guard++) {
      const end = start + minutes;
      const hit = taken
        .filter((b) => start < b.end + BUFFER_MINUTES && end > b.start - BUFFER_MINUTES)
        .sort((a, b) => b.end - a.end)[0];
      if (!hit) {
        found = start;
        break;
      }
      start = up(hit.end + BUFFER_MINUTES);
    }
    if (found === null) {
      unplaced.push(item.id);
      continue;
    }
    placed.push({ id: item.id, start: found, end: found + minutes });
    taken.push({ start: found, end: found + minutes });
  }

  placed.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  return { placed, unplaced };
}

/** Minutes of free time in [from, to] once meetings and the plan are taken out. */
export function freeMinutes(busy: Busy[], placed: Placed[], from: number, to: number): number {
  const blocks = [...busy, ...placed]
    .map((b) => [Math.max(b.start, from), Math.min(b.end, to)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let used = 0;
  let cur = from;
  for (const [a, b] of blocks) {
    const s = Math.max(a, cur);
    if (b > s) {
      used += b - s;
      cur = b;
    }
  }
  return Math.max(0, to - from - used);
}
