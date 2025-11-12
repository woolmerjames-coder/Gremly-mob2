import { addDays, setHours, setMinutes, startOfDay } from 'date-fns';

/**
 * parseDue - lightweight natural language due date/time parser
 *
 * Supports:
 * - today, tomorrow, tonight, this evening, this morning, this afternoon
 * - next mon/tue/... or next monday...
 * - at 3pm, 3:30 pm, 14:00
 * - 11/5, 11/5/2025, 2025-11-05, 2025-11-05 14:00
 * - in 2h, in 30m, eod, eom
 *
 * Returns an ISO string in local timezone (offset applied), plus date/time strings for UI,
 * confidence, the matched text, and the text without the matched "when" phrase (for optional title cleanup).
 */
export type ParsedDue = {
  iso: string; // ISO with timezone offset applied
  date: string; // YYYY-MM-DD in local time
  time: string | null; // HH:MM in local time when granularity is time
  confidence: number; // 0..1
  granularity: 'date' | 'time';
  matched: string;
  textWithoutWhen: string;
};

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function toIsoLocal(d: Date) {
  // ISO with timezone offset (not Z) so the backend can store local time if needed
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  const tz = -d.getTimezoneOffset();
  const sign = tz >= 0 ? '+' : '-';
  const tzh = pad(Math.floor(Math.abs(tz) / 60));
  const tzm = pad(Math.abs(tz) % 60);
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}${sign}${tzh}:${tzm}`;
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeStr(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nextWeekday(from: Date, target: number) {
  const d = new Date(from);
  const day = d.getDay(); // 0..6 Sun..Sat
  let delta = target - day;
  if (delta <= 0) delta += 7;
  d.setDate(d.getDate() + delta);
  return d;
}

const WEEKDAYS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

export function parseDue(input: string, now: Date = new Date()): ParsedDue | null {
  if (!input || !input.trim()) return null;
  const text = input.trim();
  const low = text.toLowerCase();

  let matched = '';
  let d = new Date(now);
  let granularity: ParsedDue['granularity'] = 'date';
  let confidence = 0;

  // Helpers
  const rm = (m: string) => {
    const idx = low.indexOf(m.toLowerCase());
    if (idx >= 0) {
      matched = text.slice(idx, idx + m.length);
      const before = text.slice(0, idx).trim();
      const after = text.slice(idx + m.length).trim();
      return `${before} ${after}`.replace(/\s+/g, ' ').trim();
    }
    return text;
  };

  const removeSpan = (start: number, end: number) => {
    const before = text.slice(0, start).trim();
    const after = text.slice(end).trim();
    matched = text.slice(start, end);
    return `${before} ${after}`.replace(/\s+/g, ' ').trim();
  };

  const applyTrailingTime = (after: string) => {
    const time12Tail = /^\s*(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/.exec(after);
    if (time12Tail) {
      let hour = Number(time12Tail[1]);
      const minute = Number(time12Tail[2] ?? '0');
      const mer = time12Tail[3];
      if (mer === 'pm' && hour < 12) hour += 12;
      if (mer === 'am' && hour === 12) hour = 0;
      return { consumed: time12Tail[0].length, hour, minute } as const;
    }
    const time24Tail = /^\s*(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/.exec(after);
    if (time24Tail) {
      const hour = Number(time24Tail[1]);
      const minute = Number(time24Tail[2]);
      return { consumed: time24Tail[0].length, hour, minute } as const;
    }
    return null;
  };

  const finish = (cleaned: string) => ({
    iso: toIsoLocal(d),
    date: toDateStr(d),
    time: granularity === 'time' ? toTimeStr(d) : null,
    confidence,
    granularity,
    matched,
    textWithoutWhen: cleaned,
  });

  // Explicit ISO or date-like first
  // yyyy-mm-dd( hh:mm)? or mm/dd(/yyyy)?
  const isoDateTime = /\b(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?\b/.exec(low);
  if (isoDateTime) {
    const [, Y, M, D, H, I] = isoDateTime;
    d = new Date(Number(Y), Number(M) - 1, Number(D), Number(H ?? '9'), Number(I ?? '0'), 0, 0);
    confidence = H ? 0.98 : 0.95;
    granularity = H ? 'time' : 'date';
    const start = isoDateTime.index ?? low.indexOf(isoDateTime[0]);
    let end = start + isoDateTime[0].length;
    if (!H) {
      const trailing = applyTrailingTime(low.slice(end));
      if (trailing) {
        d.setHours(trailing.hour, trailing.minute, 0, 0);
        granularity = 'time';
        confidence = Math.max(confidence, 0.97);
        end += trailing.consumed;
      }
    }
    return finish(removeSpan(start, end));
  }

  const usDate = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(low);
  if (usDate) {
    const [, m, day, yearRaw] = usDate;
    const year = yearRaw
      ? Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw)
      : now.getFullYear();
    d = new Date(year, Number(m) - 1, Number(day), 9, 0, 0, 0);
    confidence = 0.92;
    granularity = 'date';
    const start = usDate.index ?? low.indexOf(usDate[0]);
    let end = start + usDate[0].length;
    const trailing = applyTrailingTime(low.slice(end));
    if (trailing) {
      d.setHours(trailing.hour, trailing.minute, 0, 0);
      granularity = 'time';
      confidence = Math.max(confidence, 0.93);
      end += trailing.consumed;
    }
    return finish(removeSpan(start, end));
  }

  // Relative: in 2h / 30m
  const inRel = /\bin\s+(\d+)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/.exec(low);
  if (inRel) {
    const [, nStr, unit] = inRel;
    const n = Number(nStr);
    d = new Date(now);
    if (/h/.test(unit)) d.setHours(d.getHours() + n);
    else d.setMinutes(d.getMinutes() + n);
    confidence = 0.9;
    granularity = 'time';
    return finish(rm(inRel[0]));
  }

  // --- Noon / Midday support ---
  const middayMatch = /\b(noon|midday)\b/i.exec(low);
  if (middayMatch) {
    const tomorrowWordMatch = /\btomorrow\b/i.exec(low);
    const todayWordMatch = /\btoday\b/i.exec(low);
    const baseDate = tomorrowWordMatch ? addDays(startOfDay(now), 1) : startOfDay(now);
    const dt = setHours(setMinutes(baseDate, 0), 12);
    d = new Date(dt.getTime());
    confidence = 0.86;
    granularity = 'time';

    const middayStart = middayMatch.index ?? low.indexOf(middayMatch[0]);
    let removeStart = middayStart;
    let removeEnd = middayStart + middayMatch[0].length;

    if (tomorrowWordMatch) {
      const tomorrowStart = tomorrowWordMatch.index ?? low.indexOf(tomorrowWordMatch[0]);
      removeStart = Math.min(removeStart, tomorrowStart);
      removeEnd = Math.max(removeEnd, tomorrowStart + tomorrowWordMatch[0].length);
    } else if (todayWordMatch) {
      const todayStart = todayWordMatch.index ?? low.indexOf(todayWordMatch[0]);
      removeStart = Math.min(removeStart, todayStart);
      removeEnd = Math.max(removeEnd, todayStart + todayWordMatch[0].length);
    }

    return finish(removeSpan(removeStart, removeEnd));
  }

  // today / tomorrow
  const todayMatch = /\btoday\b/.exec(low);
  if (todayMatch) {
    d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0, 0, 0); // default 5pm local
    confidence = 0.86;
    granularity = 'date';
    let end = todayMatch.index + todayMatch[0].length;
    const trailing = applyTrailingTime(low.slice(end));
    if (trailing) {
      d.setHours(trailing.hour, trailing.minute, 0, 0);
      granularity = 'time';
      confidence = Math.max(confidence, 0.9);
      end += trailing.consumed;
    }
    return finish(removeSpan(todayMatch.index, end));
  }
  const tomorrowMatch = /\btomorrow\b/.exec(low);
  if (tomorrowMatch) {
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    d = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 9, 0, 0, 0); // default 9am next day
    confidence = 0.9;
    granularity = 'date';
    let end = tomorrowMatch.index + tomorrowMatch[0].length;
    const trailing = applyTrailingTime(low.slice(end));
    if (trailing) {
      d.setHours(trailing.hour, trailing.minute, 0, 0);
      granularity = 'time';
      confidence = Math.max(confidence, 0.92);
      end += trailing.consumed;
    }
    return finish(removeSpan(tomorrowMatch.index, end));
  }

  // eod / eom
  const eodMatch = /\b(eod|end of day)\b/i.exec(low);
  if (eodMatch) {
    d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0, 0, 0);
    confidence = 0.85;
    granularity = 'time';
    return finish(rm(eodMatch[0]));
  }
  const eomMatch = /\b(eom|end of month)\b/i.exec(low);
  if (eomMatch) {
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    d = new Date(last.getFullYear(), last.getMonth(), last.getDate(), 17, 0, 0, 0);
    confidence = 0.84;
    granularity = 'date';
    return finish(rm(eomMatch[0]));
  }

  // next weekday
  const nextWd =
    /\bnext\s+(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.exec(
      low,
    );
  if (nextWd) {
    const wd = nextWd[1];
    const target = WEEKDAYS[wd];
    const tmp = nextWeekday(now, target);
    d = new Date(tmp.getFullYear(), tmp.getMonth(), tmp.getDate(), 9, 0, 0, 0);
    confidence = 0.88;
    granularity = 'date';
    return finish(rm(nextWd[0]));
  }

  // at HH:MM or H[H]am/pm
  const time12 = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/.exec(low);
  const time24 = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(low);
  if (time12 || time24) {
    let H = 9;
    let I = 0;
    if (time12) {
      let h = Number(time12[1]);
      const i = Number(time12[2] || '0');
      const mer = time12[3];
      if (mer === 'pm' && h < 12) h += 12;
      if (mer === 'am' && h === 12) h = 0;
      H = h;
      I = i;
      matched = text.slice(time12.index, time12.index + time12[0].length);
    } else if (time24) {
      H = Number(time24[1]);
      I = Number(time24[2]);
      matched = text.slice(time24.index, time24.index + time24[0].length);
    }
    // Date defaults to "today"
    d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), H, I, 0, 0);
    confidence = 0.87;
    granularity = 'time';
    return finish(rm(matched));
  }

  // tonight / this evening / this afternoon / this morning
  if (/\btonight\b/.test(low) || /\bthis evening\b/.test(low)) {
    d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 0, 0, 0);
    confidence = 0.82;
    granularity = 'time';
    const phrase = /\btonight\b/.test(low) ? 'tonight' : 'this evening';
    return finish(rm(phrase));
  }
  if (/\bthis afternoon\b/.test(low)) {
    d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 15, 0, 0, 0);
    confidence = 0.8;
    granularity = 'time';
    return finish(rm('this afternoon'));
  }
  if (/\bthis morning\b/.test(low)) {
    d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0);
    confidence = 0.8;
    granularity = 'time';
    return finish(rm('this morning'));
  }

  return null;
}
