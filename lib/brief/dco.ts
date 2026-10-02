/**
 * The parts of today's DCO (v4, user_daily_state.dco) the brief reads.
 * Built by workers/inngest-jobs/context/daily.js; see
 * docs/2026-10-01-life-context-for-daily-brief.md.
 */

export interface DcoAnchor {
  /** The fact as recorded (a whole sentence) */
  label: string;
  /** A few words for the countdown chip, such as "Anniversary" */
  short_label?: string | null;
  date: string;
  /** The last day, for something that spans days (a trip) */
  date_end?: string | null;
  confidence?: string | null;
  fact_id?: string | null;
}

/** A set time the day is planned around (minutes from local midnight). */
export interface DcoFrameBlock {
  id: string;
  title: string;
  start: number;
  end: number | null;
  travel: boolean;
  fact_id?: string | null;
}

/**
 * Travel and set times the day is planned around, read from memory and the
 * calendar (workers/inngest-jobs/context/dayFrame.js).
 */
export interface DcoDayFrame {
  date: string;
  travel: { label: string; departs: number | null } | null;
  away: { label: string; through: string | null } | null;
  blocks: DcoFrameBlock[];
  travel_calendar_ids: string[];
}

export interface DcoClaim {
  type: 'todo' | 'habit' | 'calendar' | 'note_event' | 'fact';
  id: string;
  title?: string;
  why?: string;
}

export interface DcoReach {
  type: string;
  id: string;
  title?: string;
  statement?: string;
  why: string;
  facts: { id: string; statement: string }[];
}

export interface DcoQuestion {
  id: string;
  question: string;
  /** Two to four short answers (gap 4); absent on questions written before them */
  choices?: string[] | null;
}

export interface DcoReturn {
  days_away: number;
  note: string;
}

export interface DcoBrief {
  headline: string | null;
  day_shape: string | null;
  claims: DcoClaim[];
  reach: DcoReach | null;
  question: DcoQuestion | null;
  return: DcoReturn | null;
}

export interface DcoForBrief {
  date: string | null;
  brief: DcoBrief | null;
  anchors: DcoAnchor[];
  /** Today's synced calendar rows that are cancelled but still on the calendar */
  cancelledCalendarIds: string[];
  /** Travel and set times; null when the DCO has none (older rows) */
  frame: DcoDayFrame | null;
}

const isMin = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 24 * 60;

/** The day frame as stored, with anything malformed left out. */
export function readFrame(raw: unknown): DcoDayFrame | null {
  const f = raw as Record<string, any> | null | undefined;
  if (!f || typeof f !== 'object' || typeof f.date !== 'string') return null;
  const t = f.travel;
  const a = f.away;
  return {
    date: f.date,
    travel:
      t && typeof t.label === 'string' && t.label
        ? { label: t.label, departs: isMin(t.departs) ? t.departs : null }
        : null,
    away:
      a && typeof a.label === 'string' && a.label
        ? { label: a.label, through: typeof a.through === 'string' ? a.through : null }
        : null,
    blocks: (Array.isArray(f.blocks) ? f.blocks : [])
      .filter((b: any) => b && typeof b.id === 'string' && typeof b.title === 'string' && isMin(b.start))
      .map((b: any) => ({
        id: b.id,
        title: b.title,
        start: b.start,
        end: isMin(b.end) && b.end > b.start ? b.end : null,
        travel: b.travel === true,
        fact_id: typeof b.fact_id === 'string' ? b.fact_id : null,
      })),
    travel_calendar_ids: Array.isArray(f.travel_calendar_ids)
      ? f.travel_calendar_ids.filter((x: unknown): x is string => typeof x === 'string')
      : [],
  };
}

/** Read the brief's parts from whatever DCO row is loaded; anything missing is empty. */
export function readDco(dco: unknown): DcoForBrief {
  const d = (dco ?? {}) as Record<string, any>;
  const b = d.brief as Record<string, any> | undefined;
  const anchors: DcoAnchor[] = Array.isArray(d.named_anchors)
    ? d.named_anchors.filter(
        (a: any) => a && typeof a.date === 'string' && typeof a.label === 'string',
      )
    : [];
  return {
    date: typeof d.date === 'string' ? d.date : null,
    anchors,
    cancelledCalendarIds: Array.isArray(d.cancelled_calendar_ids)
      ? d.cancelled_calendar_ids.filter((x: unknown): x is string => typeof x === 'string')
      : [],
    frame: readFrame(d.day_frame),
    brief: b
      ? {
          headline: b.headline ?? null,
          day_shape: b.day_shape ?? null,
          claims: Array.isArray(b.claims) ? b.claims : [],
          reach: b.reach ?? null,
          question: b.question ?? null,
          return: b.return ?? null,
        }
      : null,
  };
}

export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 864e5);
}

/**
 * The countdown chip: the nearest dated anchor still ahead that has a short
 * label, such as "Anniversary in 13 days". Null when there is none; the chip
 * is then left off. A long fact statement is never put on the chip.
 */
export function countdownChip(
  anchors: DcoAnchor[],
  today: string,
): { text: string; days: number; anchor: DcoAnchor } | null {
  const ahead = anchors
    .filter((a) => a.short_label && a.short_label.trim() && a.date >= today)
    .sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  const a = ahead[0];
  if (!a) return null;
  const days = daysBetween(today, a.date);
  const label = a.short_label!.trim();
  const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
  return { text: `${label} ${when}`, days, anchor: a };
}

/** A return day: the DCO says the person is back after three or more days away. */
export function isReturnDay(brief: DcoBrief | null): boolean {
  return !!brief?.return && (brief.return.days_away ?? 0) >= 3;
}
