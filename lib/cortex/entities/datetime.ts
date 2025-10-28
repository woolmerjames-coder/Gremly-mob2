/* Shared deterministic due-date parser (EN-only) for Mind Drop + Chat.
   Small, fast, predictable. No LLM. Uses date-fns for date math. */

import {
  addDays,
  setHours,
  setMinutes,
  setSeconds,
  setMilliseconds,
  nextDay,
  isValid as isValidDate,
  parse as parseDateFns,
} from 'date-fns';

export type DueSource = 'explicit' | 'relative' | 'dow' | 'range';
export interface ParsedDue {
  iso?: string;
  confidence: number; // 0..1
  source?: DueSource;
  explain: string;
  hasTime?: boolean;
}

export interface ParseDueOptions {
  now?: Date;
  defaultHour?: number; // default hour if time not present (e.g., 9 = 9:00)
  defaultMinute?: number;
  timezone?: string; // reserved; currently unused (device local)
}

const MONTHS = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*';
const DOW =
  '(mon(day)?|tue(s(day)?)?|wed(nesday)?|thu(r(s(day)?)?)?|fri(day)?|sat(urday)?|sun(day)?)';
const ISO_YMD = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/;
const US_MDY = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;
const MON_D = new RegExp(`\\b${MONTHS}\\s+(\\d{1,2})\\b`, 'i');
const D_MON = new RegExp(`\\b(\\d{1,2})\\s+${MONTHS}\\b`, 'i');
const RELATIVE_SIMPLE = /\b(today|tomorrow|tonight)\b/i;
const THIS_NEXT = /\b(this|next)\s+(week|month|weekend)\b/i;
const DOW_ONLY = new RegExp(`\\b${DOW}\\b`, 'i');
const TIME_12 = /\b([1-9]|1[0-2])(?::([0-5]\d))?\s?(am|pm)\b/i;
const TIME_24 = /\b([01]?\d|2[0-3]):([0-5]\d)\b/;

function clampDate(d: Date, h: number, m: number) {
  return setMilliseconds(setSeconds(setMinutes(setHours(d, h), m), 0), 0);
}

function toIsoLocal(d: Date): string | undefined {
  return isValidDate(d)
    ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString()
    : undefined;
}

function parseYear(y?: string | number): number | undefined {
  if (!y) return undefined;
  const n = typeof y === 'string' ? parseInt(y, 10) : y;
  if (!Number.isFinite(n)) return undefined;
  return n < 100 ? 2000 + n : n;
}

function normalizeDefaults(opts?: ParseDueOptions) {
  return {
    now: opts?.now ?? new Date(),
    defaultHour: typeof opts?.defaultHour === 'number' ? opts.defaultHour : 9,
    defaultMinute: typeof opts?.defaultMinute === 'number' ? opts.defaultMinute : 0,
  };
}

function parseExplicit(text: string, opts?: ParseDueOptions): ParsedDue | null {
  const { now, defaultHour, defaultMinute } = normalizeDefaults(opts);
  const t = text;

  // ISO YYYY-MM-DD
  const iso = t.match(ISO_YMD);
  if (iso) {
    const y = parseInt(iso[1], 10);
    const m = parseInt(iso[2], 10) - 1;
    const d = parseInt(iso[3], 10);
    let dt = new Date(y, m, d);
    // Try to capture an explicit time if present
    let hasTime = false;
    const time12 = t.match(TIME_12);
    const time24 = t.match(TIME_24);
    if (time12) {
      let hh = parseInt(time12[1], 10);
      const mm = time12[2] ? parseInt(time12[2], 10) : 0;
      const ampm = time12[3].toLowerCase();
      if (ampm === 'pm' && hh !== 12) hh += 12;
      if (ampm === 'am' && hh === 12) hh = 0;
      dt = clampDate(dt, hh, mm);
      hasTime = true;
    } else if (time24) {
      const hh = parseInt(time24[1], 10);
      const mm = parseInt(time24[2], 10);
      dt = clampDate(dt, hh, mm);
      hasTime = true;
    } else {
      dt = clampDate(dt, defaultHour, defaultMinute);
    }
    return {
      iso: toIsoLocal(dt),
      confidence: 0.95,
      source: 'explicit',
      explain: 'Parsed YYYY-MM-DD',
      hasTime,
    };
  }

  // US M/D(/Y)
  const mdy = t.match(US_MDY);
  if (mdy) {
    const m = parseInt(mdy[1], 10) - 1;
    const d = parseInt(mdy[2], 10);
    const y = parseYear(mdy[3]) ?? now.getFullYear();
    let dt = new Date(y, m, d);
    let hasTime = false;
    const time12 = t.match(TIME_12);
    const time24 = t.match(TIME_24);
    if (time12) {
      let hh = parseInt(time12[1], 10);
      const mm = time12[2] ? parseInt(time12[2], 10) : 0;
      const ampm = time12[3].toLowerCase();
      if (ampm === 'pm' && hh !== 12) hh += 12;
      if (ampm === 'am' && hh === 12) hh = 0;
      dt = clampDate(dt, hh, mm);
      hasTime = true;
    } else if (time24) {
      const hh = parseInt(time24[1], 10);
      const mm = parseInt(time24[2], 10);
      dt = clampDate(dt, hh, mm);
      hasTime = true;
    } else {
      dt = clampDate(dt, defaultHour, defaultMinute);
    }
    return {
      iso: toIsoLocal(dt),
      confidence: 0.9,
      source: 'explicit',
      explain: 'Parsed M/D(/Y)',
      hasTime,
    };
  }

  // "Nov 3" or "3 Nov"
  const monD = t.match(MON_D);
  const dMon = t.match(D_MON);
  if (monD || dMon) {
    const [monStr, dayStr] = monD ? [monD[0], monD[1]] : [dMon![0], dMon![1]];
    const baseYear = now.getFullYear();
    // Let date-fns parse "Nov 3" using current year for simplicity
    let parsed = parseDateFns(monStr, 'MMM d', new Date(baseYear, 0, 1));
    if (!isValidDate(parsed)) {
      parsed = parseDateFns(dMon![0], 'd MMM', new Date(baseYear, 0, 1));
    }
    // Carry over to next year if already past
    if (parsed < now) {
      parsed = new Date(baseYear + 1, parsed.getMonth(), parsed.getDate());
    }
    // Time
    let hasTime = false;
    const time12 = t.match(TIME_12);
    const time24 = t.match(TIME_24);
    if (time12) {
      let hh = parseInt(time12[1], 10);
      const mm = time12[2] ? parseInt(time12[2], 10) : 0;
      const ampm = time12[3].toLowerCase();
      if (ampm === 'pm' && hh !== 12) hh += 12;
      if (ampm === 'am' && hh === 12) hh = 0;
      parsed = clampDate(parsed, hh, mm);
      hasTime = true;
    } else if (time24) {
      const hh = parseInt(time24[1], 10);
      const mm = parseInt(time24[2], 10);
      parsed = clampDate(parsed, hh, mm);
      hasTime = true;
    } else {
      parsed = clampDate(parsed, defaultHour, defaultMinute);
    }
    return {
      iso: toIsoLocal(parsed),
      confidence: 0.9,
      source: 'explicit',
      explain: 'Parsed textual month/day',
      hasTime,
    };
  }

  return null;
}

function parseRelative(text: string, opts?: ParseDueOptions): ParsedDue | null {
  const { now, defaultHour, defaultMinute } = normalizeDefaults(opts);
  const t = text;

  const rel = t.match(RELATIVE_SIMPLE);
  if (rel) {
    const word = rel[1].toLowerCase();
    let d = new Date(now);
    let explain = '';
    if (word === 'today') {
      explain = 'today';
    } else if (word === 'tomorrow') {
      d = addDays(d, 1);
      explain = 'tomorrow';
    } else if (word === 'tonight') {
      d = clampDate(d, 20, 0);
      return {
        iso: toIsoLocal(d),
        confidence: 0.85,
        source: 'relative',
        explain: 'tonight',
        hasTime: true,
      };
    }
    d = clampDate(d, defaultHour, defaultMinute);
    return {
      iso: toIsoLocal(d),
      confidence: 0.85,
      source: 'relative',
      explain: explain || 'relative day',
    };
  }

  const tn = t.match(THIS_NEXT);
  if (tn) {
    const when = tn[1].toLowerCase(); // this|next
    const unit = tn[2].toLowerCase(); // week|month|weekend
    let d = new Date(now);
    if (unit === 'week') {
      // Map to Monday 09:00
      const base = when === 'this' ? now : addDays(now, 7);
      // Go to Monday of that week
      const day = base.getDay(); // 0..6 (Sun..Sat)
      const diffToMon = (1 - day + 7) % 7;
      d = clampDate(addDays(base, diffToMon), defaultHour, defaultMinute);
      return {
        iso: toIsoLocal(d),
        confidence: 0.75,
        source: 'relative',
        explain: `${when} week (Monday)`,
      };
    }
    if (unit === 'weekend') {
      // Saturday 10:00
      const base = when === 'this' ? now : addDays(now, 7);
      const day = base.getDay();
      const diffToSat = (6 - day + 7) % 7;
      d = clampDate(addDays(base, diffToSat), 10, 0);
      return {
        iso: toIsoLocal(d),
        confidence: 0.75,
        source: 'relative',
        explain: `${when} weekend (Saturday)`,
      };
    }
    if (unit === 'month') {
      // First day next/this month at default time
      const year = d.getFullYear();
      const month = d.getMonth() + (when === 'next' ? 1 : 0);
      d = clampDate(new Date(year, month, 1), defaultHour, defaultMinute);
      return {
        iso: toIsoLocal(d),
        confidence: 0.7,
        source: 'relative',
        explain: `${when} month (1st)`,
      };
    }
  }

  const dow = t.match(DOW_ONLY);
  if (dow) {
    const s = dow[0];
    const map: Record<string, number> = {
      sun: 0,
      mon: 1,
      tue: 2,
      wed: 3,
      thu: 4,
      fri: 5,
      sat: 6,
    };
    const key = s.substring(0, 3).toLowerCase();
    const target = map[key];
    const next = nextDay(now, target as any);
    const dt = clampDate(next, defaultHour, defaultMinute);
    return { iso: toIsoLocal(dt), confidence: 0.85, source: 'dow', explain: `next ${s}` };
  }

  // time-only phrases without date → ignore (no date anchor)
  return null;
}

/** Parse due date/time from free text. Returns ISO (local), confidence, and an explanation. */
export function parseDue(text: string, options?: ParseDueOptions): ParsedDue {
  const t = String(text ?? '').trim();
  if (!t) return { confidence: 0, explain: 'empty' };

  // Highest priority: explicit
  const ex = parseExplicit(t, options);
  if (ex) return ex;

  // Relative phrases, day-of-week
  const rel = parseRelative(t, options);
  if (rel) return rel;

  return { confidence: 0, explain: 'no strong temporal signals' };
}
