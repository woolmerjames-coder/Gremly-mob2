/**
 * Notifications policy: every rule about when Gremly sends, holds back or stays
 * quiet, in one place. Pure functions only, so the planner, the sender and the
 * simulator all run exactly the same rules, and the unit tests pin them down.
 *
 * The database enforces the daily limit, spacing and duplicates atomically
 * (claim_send) using the numbers here; everything else is decided here.
 */

import { minutesOf } from './reminderTimes';

export const POLICY = Object.freeze({
  // Gremly started notifications per day, by engagement state
  maxPerDay: Object.freeze({ engaged: 3, drifting: 1, lapsed: 1, resting: 1 }),
  firstDayBackMax: 1,
  minGapMinutes: 180,
  quietDefault: Object.freeze({ start: '21:30', end: '07:30' }),
  holdIfActiveWithinMinutes: 30,
  holdForUpToMinutes: 60,
  meetingShiftMaxMinutes: 90,
  outcomeWindowMinutes: 120,
  // days since the last open
  states: Object.freeze({ driftingFrom: 2, lapsedFrom: 5, restingFrom: 21 }),
  ladderDays: Object.freeze([5, 9, 14]),
  lastNoteDay: 21,
  // misses in a row for one moment
  miss: Object.freeze({ changeAngle: 3, everyOtherDay: 5, pause: 8 }),
  pausedAskAgainDays: 30,
  permissionAskGapDays: 14,
  angleHalfLifeDays: 15,
  anglePriorWeight: 4,
  noRepeatLineDays: 30,
  bestHoursLookbackDays: 28,
  bestHoursMinDays: 7,
  defaultNudgeMinutes: 15 * 60,
  briefLate: Object.freeze({ minutes: 40, daysNeeded: 6, windowDays: 10 }),
});

/**
 * The moments. Priority decides who wins when more qualify than the budget
 * allows (lower wins). `gremlyTimed` moments are timed by Gremly, so quiet hours
 * apply; the brief and sweep go at the times the person chose.
 */
export const MOMENTS = Object.freeze({
  reminder: {
    priority: 0,
    counts: false,
    interruption: 'time-sensitive',
    pref: 'reminders_enabled',
    gremlyTimed: false,
  },
  good_news: {
    priority: 1,
    counts: true,
    interruption: 'active',
    pref: 'good_news_enabled',
    gremlyTimed: true,
  },
  brief: {
    priority: 2,
    counts: true,
    interruption: 'active',
    pref: 'morning_enabled',
    gremlyTimed: false,
  },
  sweep: {
    priority: 3,
    counts: true,
    interruption: 'active',
    pref: 'evening_enabled',
    gremlyTimed: false,
  },
  habit_checkin: {
    priority: 4,
    counts: true,
    interruption: 'passive',
    pref: 'habit_checkins_enabled',
    gremlyTimed: true,
  },
  nudge: {
    priority: 5,
    counts: true,
    interruption: 'passive',
    pref: 'checkins_enabled',
    gremlyTimed: true,
  },
  return_note: {
    priority: 6,
    counts: true,
    interruption: 'passive',
    pref: 'checkins_enabled',
    gremlyTimed: true,
  },
});

/** Angles each moment can take. The writer gets the angle as a rule, never an example. */
export const ANGLES = Object.freeze({
  reminder: ['plain'],
  brief: ['day_shape', 'callback', 'celebration', 'gremly_state'],
  sweep: ['tiny_invite', 'gremly_state', 'day_shape', 'callback'],
  habit_checkin: ['callback', 'tiny_invite', 'celebration'],
  nudge: ['gremly_state', 'callback', 'tiny_invite', 'celebration', 'something_waiting'],
  good_news: ['something_waiting', 'celebration'],
  return_note: ['tiny_invite', 'gremly_state', 'memory'],
});

// ─── Engagement ─────────────────────────────────────────────────────────────

/** Engagement state from whole days since the last open. */
export function engagementState(daysAway) {
  const d = Math.max(0, Number(daysAway) || 0);
  if (d >= POLICY.states.restingFrom) return 'resting';
  if (d >= POLICY.states.lapsedFrom) return 'lapsed';
  if (d >= POLICY.states.driftingFrom) return 'drifting';
  return 'engaged';
}

/** Gremly started notifications allowed today. */
export function dailyLimit(state, { firstDayBack = false } = {}) {
  if (firstDayBack) return POLICY.firstDayBackMax;
  return POLICY.maxPerDay[state] ?? 0;
}

/** True on a day a return note goes out (days 5, 9, 14, and the last note on day 21). */
export function returnNoteDay(daysAway) {
  return POLICY.ladderDays.includes(daysAway) || daysAway === POLICY.lastNoteDay;
}

/** True for the last return note, after which Gremly stays quiet until they open the app. */
export function isLastNote(daysAway) {
  return daysAway === POLICY.lastNoteDay;
}

/**
 * What a run of misses means for one moment.
 * 'normal' | 'change_angle' | 'every_other_day' | 'paused'
 */
export function missAction(streak) {
  const s = Number(streak) || 0;
  if (s >= POLICY.miss.pause) return 'paused';
  if (s >= POLICY.miss.everyOtherDay) return 'every_other_day';
  if (s >= POLICY.miss.changeAngle) return 'change_angle';
  return 'normal';
}

// ─── Time helpers ───────────────────────────────────────────────────────────

/** True when `m` (minutes since local midnight) falls in quiet hours, which may wrap midnight. */
export function inQuietHours(m, start = POLICY.quietDefault.start, end = POLICY.quietDefault.end) {
  const s = minutesOf(start);
  const e = minutesOf(end);
  if (s === null || e === null || s === e) return false;
  return s > e ? m >= s || m < e : m >= s && m < e;
}

export function momentEnabled(moment, prefs) {
  const def = MOMENTS[moment];
  if (!def) return false;
  if (!prefs) return false;
  const v = prefs[def.pref];
  return v === undefined ? moment !== 'nudge' && moment !== 'return_note' : !!v;
}

/** A clock time for reasons people read: 7:12pm, 9:00am. */
export function clock(m) {
  const h = Math.floor(m / 60) % 24;
  const mm = String(m % 60).padStart(2, '0');
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm}${suffix}`;
}

/** The duplicate key: one decision per person, moment, subject and local date. */
export function dedupeKey({ userId, moment, subject = '', localDate, slot = '' }) {
  return [userId, moment, subject || '-', localDate, slot || '-'].join(':');
}

// ─── Planning ───────────────────────────────────────────────────────────────

/**
 * Today's candidate notifications for one person (reminders are planned from the
 * reminder schedule, not here).
 *
 * @param {object} input
 *   prefs        notification_preferences row
 *   daysAway     whole days since the last open
 *   firstDayBack true on the first day after a lapse
 *   dayIndex     days since some fixed date, for every other day rules
 *   missStreaks  { moment: n }
 *   pausedMoments { moment: { paused_at } }
 *   bestMinutes  best hours as minutes since midnight, most responsive first (or null)
 *   facts        { briefExpected, habits: [{id, title, usualMinutes, loggedToday}],
 *                  goodNews: [{kind, id}], nudgeReasons: [{kind, id?, weight?}] }
 * @returns {{ plan: Array, skipped: Array, state: string, limit: number }}
 */
export function planDay(input) {
  const {
    prefs = {},
    daysAway = 0,
    firstDayBack = false,
    dayIndex = 0,
    missStreaks = {},
    pausedMoments = {},
    bestMinutes = null,
    facts = {},
  } = input;
  const state = engagementState(daysAway);
  const limit = dailyLimit(state, { firstDayBack });
  const quietStart = prefs.quiet_start || POLICY.quietDefault.start;
  const quietEnd = prefs.quiet_end || POLICY.quietDefault.end;
  const skipped = [];
  const candidates = [];

  const add = (moment, atMinutes, extra = {}) => {
    if (!momentEnabled(moment, prefs)) {
      skipped.push({ moment, reason: 'Switched off in Settings' });
      return;
    }
    if (pausedMoments?.[moment]) {
      skipped.push({ moment, reason: 'Paused after missing several in a row' });
      return;
    }
    const action = missAction(missStreaks?.[moment]);
    if (action === 'paused') {
      skipped.push({ moment, reason: 'Paused after missing several in a row' });
      return;
    }
    if (action === 'every_other_day' && dayIndex % 2 === 1) {
      skipped.push({ moment, reason: 'Every other day while it keeps missing' });
      return;
    }
    if (MOMENTS[moment].gremlyTimed && inQuietHours(atMinutes, quietStart, quietEnd)) {
      skipped.push({ moment, reason: 'Would land in quiet hours' });
      return;
    }
    candidates.push({
      moment,
      atMinutes,
      priority: MOMENTS[moment].priority,
      counts: MOMENTS[moment].counts,
      interruption: state === 'engaged' ? MOMENTS[moment].interruption : 'passive',
      changeAngle: action === 'change_angle',
      ...extra,
    });
  };

  // Gremly picks the hour for nudges and good news: the person's best hour that
  // is not in quiet hours and still ahead, else a sensible default.
  const gremlyMinute = (fallback) => {
    for (const m of bestMinutes || []) {
      if (!inQuietHours(m, quietStart, quietEnd)) return m;
    }
    return fallback;
  };

  if (state === 'lapsed' || state === 'resting') {
    if (returnNoteDay(daysAway)) {
      add('return_note', gremlyMinute(18 * 60), {
        lastNote: isLastNote(daysAway),
        subject: `day-${daysAway}`,
      });
    } else {
      skipped.push({
        moment: 'return_note',
        reason: `Away ${daysAway} days: not a return note day`,
      });
    }
    return finish();
  }

  if (facts.briefExpected) add('brief', minutesOf(prefs.morning_time) ?? 8 * 60);
  add('sweep', minutesOf(prefs.evening_time) ?? 20 * 60);
  for (const h of facts.habits || []) {
    if (h.loggedToday || h.usualMinutes == null) continue;
    add('habit_checkin', h.usualMinutes + 60, { subject: h.id });
  }
  for (const g of facts.goodNews || []) {
    add('good_news', gremlyMinute(18 * 60), { subject: `${g.kind}:${g.id ?? ''}` });
  }
  const reasons = [...(facts.nudgeReasons || [])].sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));
  if (reasons.length) {
    add('nudge', gremlyMinute(POLICY.defaultNudgeMinutes), {
      subject: reasons[0].kind,
      reason: reasons[0],
    });
  }
  return finish();

  function finish() {
    // keep the most important within the day's limit; reminders never count
    const ordered = [...candidates].sort(
      (a, b) => a.priority - b.priority || a.atMinutes - b.atMinutes,
    );
    let left = limit;
    const kept = [];
    for (const c of ordered) {
      if (!c.counts) {
        kept.push(c);
        continue;
      }
      if (left <= 0) {
        skipped.push({ moment: c.moment, subject: c.subject, reason: 'Daily limit reached' });
        continue;
      }
      kept.push(c);
      left--;
    }
    const spaced = spaceOut(kept, quietStart, quietEnd);
    for (const s of spaced.dropped) skipped.push(s);
    return {
      state,
      limit,
      plan: spaced.kept.sort((a, b) => a.atMinutes - b.atMinutes),
      skipped,
    };
  }
}

/**
 * Keeps at least the minimum gap between Gremly started notifications. Times
 * the person chose (brief, sweep) never move and are placed first; Gremly timed
 * ones then go in priority order, moving later when they would land too close,
 * and drop out if no room is left before quiet hours.
 */
export function spaceOut(list, quietStart, quietEnd) {
  const gap = POLICY.minGapMinutes;
  const counted = list
    .filter((c) => c.counts)
    .sort(
      (a, b) =>
        Number(MOMENTS[a.moment].gremlyTimed) - Number(MOMENTS[b.moment].gremlyTimed) ||
        a.priority - b.priority,
    );
  const fixed = [];
  const dropped = [];
  for (const c of counted) {
    if (!MOMENTS[c.moment].gremlyTimed) {
      fixed.push(c);
      continue;
    }
    let at = c.atMinutes;
    const clash = () => fixed.find((f) => Math.abs(f.atMinutes - at) < gap);
    let guard = 0;
    while (clash() && guard++ < 8) at = clash().atMinutes + gap;
    if (clash() || at >= 24 * 60 || inQuietHours(at, quietStart, quietEnd)) {
      dropped.push({
        moment: c.moment,
        subject: c.subject,
        reason: 'No room with enough space around it',
      });
      continue;
    }
    fixed.push({ ...c, atMinutes: at });
  }
  return { kept: [...list.filter((c) => !c.counts), ...fixed], dropped };
}

// ─── At send time ───────────────────────────────────────────────────────────

/**
 * The last check before sending, with live facts.
 * @returns {{action: 'send'} | {action: 'hold', minutes: number, reason: string} | {action: 'drop', reason: string}}
 *
 * ctx: moment, nowMinutes (local), prefs, pausedUntilLabel (string when paused),
 *      healthyDevices, stillTrue ({ok, reason}), minutesSinceOpen (or null),
 *      heldSoFar (minutes already held), meetingEndsInMinutes (or null)
 */
export function decideAtSend(ctx) {
  const { moment, nowMinutes, prefs = {}, healthyDevices = 0 } = ctx;
  const def = MOMENTS[moment];
  if (!def) return { action: 'drop', reason: `Unknown moment ${moment}` };
  if (healthyDevices <= 0) return { action: 'drop', reason: 'No phone can receive notifications' };
  if (!momentEnabled(moment, prefs)) return { action: 'drop', reason: 'Switched off in Settings' };
  if (moment !== 'reminder' && ctx.pausedUntilLabel) {
    return { action: 'drop', reason: `Paused until ${ctx.pausedUntilLabel}` };
  }
  if (ctx.stillTrue && ctx.stillTrue.ok === false)
    return { action: 'drop', reason: ctx.stillTrue.reason };
  if (moment === 'reminder') return { action: 'send' };

  const quietStart = prefs.quiet_start || POLICY.quietDefault.start;
  const quietEnd = prefs.quiet_end || POLICY.quietDefault.end;
  if (def.gremlyTimed && inQuietHours(nowMinutes, quietStart, quietEnd)) {
    return { action: 'drop', reason: 'Quiet hours' };
  }

  const held = ctx.heldSoFar || 0;
  if (ctx.minutesSinceOpen != null && ctx.minutesSinceOpen < POLICY.holdIfActiveWithinMinutes) {
    if (held + 15 > POLICY.holdForUpToMinutes) {
      return {
        action: 'drop',
        reason:
          moment === 'brief'
            ? 'They were in the app, so the brief waited in Chat'
            : `In the app ${ctx.minutesSinceOpen} minutes ago`,
      };
    }
    return {
      action: 'hold',
      minutes: 15,
      reason: `In the app ${ctx.minutesSinceOpen} minutes ago`,
    };
  }

  if (ctx.meetingEndsInMinutes != null && ctx.meetingEndsInMinutes > 0) {
    if (held + ctx.meetingEndsInMinutes > POLICY.meetingShiftMaxMinutes) {
      return { action: 'drop', reason: 'In meetings for too long to move it' };
    }
    return { action: 'hold', minutes: ctx.meetingEndsInMinutes + 2, reason: 'In a meeting' };
  }

  return { action: 'send' };
}

/** iOS delivery level for a moment, given the state and whether the phone allows time sensitive. */
export function interruptionFor(moment, state, { timeSensitiveAllowed = true } = {}) {
  const def = MOMENTS[moment];
  if (!def) return 'active';
  if (def.interruption === 'time-sensitive')
    return timeSensitiveAllowed ? 'time-sensitive' : 'active';
  if (state !== 'engaged') return 'passive';
  return def.interruption;
}

// ─── Learning ───────────────────────────────────────────────────────────────

/**
 * Picks an angle. Each angle's result for this person is blended with everyone's
 * (so a new person starts sensible), a recently used angle scores lower and
 * recovers over about 15 days, and yesterday's angle for the same moment is never
 * used again today. Deterministic, so a simulation repeats exactly.
 *
 * @param {object} p
 *   moment, eligible (angles whose facts exist today; default all for the moment),
 *   stats { angle: {s, n} } for this person, globalStats { angle: {s, n} },
 *   daysSinceUsed { angle: days }, yesterday (angle used yesterday for this moment)
 */
export function chooseAngle({
  moment,
  eligible,
  stats = {},
  globalStats = {},
  daysSinceUsed = {},
  yesterday = null,
}) {
  const all = ANGLES[moment] || ['plain'];
  let pool = (eligible?.length ? all.filter((a) => eligible.includes(a)) : all).filter(
    (a) => a !== yesterday,
  );
  if (!pool.length) pool = all.filter((a) => a !== yesterday);
  if (!pool.length) pool = all;
  const totalN = pool.reduce((t, a) => t + (stats[a]?.n || 0), 0) + 1;
  let best = null;
  for (const a of pool) {
    const g = globalStats[a] || { s: 1, n: 2 };
    const prior = POLICY.anglePriorWeight;
    const gMean = (g.s + 1) / (g.n + 2);
    const mine = stats[a] || { s: 0, n: 0 };
    const mean = (mine.s + prior * gMean) / (mine.n + prior);
    const days = daysSinceUsed[a];
    const recovery = days == null ? 1 : 1 - 0.5 * Math.pow(0.5, days / POLICY.angleHalfLifeDays);
    const explore = Math.sqrt(Math.log(totalN + 1) / (mine.n + 1)) * 0.05;
    const score = mean * recovery + explore;
    if (!best || score > best.score + 1e-9) best = { angle: a, score };
  }
  return best.angle;
}

/**
 * The person's most responsive hours, from the last 28 days of app opens,
 * as minutes since midnight (on the hour), most opens first. Null until there
 * are opens on at least 7 different days.
 * @param {Array<{date: string, minutes: number}>} opens  local date and minutes of each open
 */
export function bestMinutes(opens) {
  if (!opens?.length) return null;
  const days = new Set(opens.map((o) => o.date));
  if (days.size < POLICY.bestHoursMinDays) return null;
  const perHour = new Map();
  for (const o of opens) {
    const h = Math.floor(o.minutes / 60);
    if (!perHour.has(h)) perHour.set(h, new Set());
    perHour.get(h).add(o.date);
  }
  return [...perHour.entries()]
    .map(([h, ds]) => ({ h, n: ds.size }))
    .filter((x) => x.n >= 2)
    .sort((a, b) => b.n - a.n || a.h - b.h)
    .slice(0, 3)
    .map((x) => x.h * 60);
}

/**
 * Whether to offer a later brief time: on most recent days the brief was opened
 * well after it arrived. Returns the suggested time ('HH:MM', quarter hours) or null.
 * @param {Array<{arrived: number, opened: number|null}>} days  minutes since midnight
 */
export function suggestBriefTime(days, current) {
  const recent = (days || []).slice(-POLICY.briefLate.windowDays);
  const late = recent.filter(
    (d) => d.opened != null && d.opened - d.arrived >= POLICY.briefLate.minutes,
  );
  if (late.length < POLICY.briefLate.daysNeeded) return null;
  const sorted = late.map((d) => d.opened).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const q = Math.round(median / 15) * 15;
  const hhmm = `${String(Math.floor(q / 60)).padStart(2, '0')}:${String(q % 60).padStart(2, '0')}`;
  return current && minutesOf(current) === q ? null : hhmm;
}

/** What counts as the moment working, by activity kind. */
export const SUCCESS_KINDS = Object.freeze({
  reminder: ['item_done', 'opened'],
  brief: ['brief_seen', 'opened'],
  sweep: ['sweep', 'opened'],
  habit_checkin: ['habit_logged', 'opened'],
  nudge: ['drop', 'app_open', 'opened'],
  good_news: ['app_open', 'opened'],
  return_note: ['app_open', 'opened'],
});

/**
 * Did it work? A notification succeeded if it was opened, or if the person did
 * the thing within two hours, tapped or not. Undecided until the window closes.
 * @returns {'succeeded' | 'missed' | null}
 */
export function outcomeOf({ moment, sentAt, openedAt, activities = [], now, subject }) {
  if (!sentAt) return null;
  const start = new Date(sentAt).getTime();
  const end = start + POLICY.outcomeWindowMinutes * 60000;
  if (openedAt && new Date(openedAt).getTime() <= end) return 'succeeded';
  const kinds = SUCCESS_KINDS[moment] || ['opened'];
  const hit = activities.some((a) => {
    const t = new Date(a.at).getTime();
    if (t < start || t > end || !kinds.includes(a.kind)) return false;
    if (moment === 'habit_checkin' && subject && a.subject && a.subject !== subject) return false;
    return true;
  });
  if (hit) return 'succeeded';
  return new Date(now).getTime() > end ? 'missed' : null;
}

/** Next miss streak after an outcome. */
export function nextStreak(streak, outcome) {
  if (outcome === 'succeeded') return 0;
  if (outcome === 'missed') return (Number(streak) || 0) + 1;
  return Number(streak) || 0;
}

/** True when a permission ask may be shown again. */
export function mayAskPermission(lastAskAt, now) {
  if (!lastAskAt) return true;
  return (
    new Date(now).getTime() - new Date(lastAskAt).getTime() >=
    POLICY.permissionAskGapDays * 86400000
  );
}
