/**
 * Daily Context Object, version 4.
 *
 * Built each morning from: today's calendar and items with their real local
 * times, habit progress this week, the fact ledger (dated, with sources), open
 * questions, recent corrections, the absence snapshot and usage counts. The
 * model decides what matters today and writes the words; code computes the
 * counts and free time and assembles the row in the shape the app and chat
 * already read, plus a `brief` block for the morning brief.
 *
 * Every sentence comes with the records it rests on and what it states, and
 * goes through the check (workers/shared/check, data fabric stage 3): code
 * holds the refs, times, dates, numbers and names to the records, and a small
 * model is asked whether it says anything about who someone is, when something
 * is or how many that its records do not hold. A sentence that fails goes back
 * once, alone with its records; one that fails again is left out.
 */

import { CARE_RULES, WRITING_RULES, PRIVATE_RULES, personBlock } from '../careRules';
import {
  db,
  userTimezone,
  localDate,
  localDateTime,
  addDays,
  weekdayName,
  relativeDay,
  daysBetween,
  personIdentity,
} from './db';
import { jsonCall, modelFor } from './llm';
import { readDayFrame, emptyFrame, coversToday } from './dayFrame';
import { recentCorrections } from './corrections';
import { loadStory } from './story';
import { invalidateChatCache } from './cache';
import { readThreadReaction } from '../brief/reaction';
import { personNow } from '../../shared/day.js';
import { spanDays, weeklyDayOf } from '../../shared/week.js';
import { dayOfWeek, easeOn, unpaused, weekAround } from '../../shared/habitWeek.js';
import { weekSettings } from '../week/settings';
import { stateWords } from '../../shared/factTiming.js';
import {
  SENTENCE_SCHEMA,
  STATED_RULES,
  runCheck,
  checkRunRow,
  problemWords,
} from '../../shared/check/index.js';
import { passageRow, recordPassages } from '../../shared/passageRefs.js';
import { askableQuestions } from '../../shared/questionRules.js';

export const DCO_PROMPT_VERSION = 'dco-v4-2026-10-08g';

function trim(text, n) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/**
 * What a habit's line says of a lighter version running today: their own
 * words for it when they gave any. Nothing when the habit has none.
 */
function lighterWords(ease) {
  if (ease?.mode !== 'lighter') return '';
  const said = trim(ease.note, 120);
  return said ? `, lighter version for now: “${said}”` : ', on a lighter version for now';
}

function localStartIso(tz, dateStr) {
  // Midnight local time for dateStr, as a UTC instant.
  const guess = new Date(`${dateStr}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(guess);
  const get = (t) => Number(parts.find((p) => p.type === t)?.value);
  const asLocal = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
  );
  const offset = asLocal - guess.getTime();
  return new Date(guess.getTime() - offset).toISOString();
}

function minutesOfDay(tz, iso) {
  const t = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
  const [h, m] = t.split(':').map(Number);
  return (h % 24) * 60 + m;
}

function hhmm(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Timed events merged into busy blocks, in order. */
export function busyBlocks(timedEvents) {
  const sorted = timedEvents
    .map((e) => [e.start, Math.max(e.start, e.end)])
    .sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const b of sorted) {
    if (merged.length && b[0] <= merged[merged.length - 1][1])
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], b[1]);
    else merged.push([...b]);
  }
  return merged.map(([a, b]) => ({ from: hhmm(a), to: hhmm(b) }));
}

/** Free windows between timed events, 08:00 to 21:00 local, of 45 minutes or more. */
export function freeWindows(timedEvents, dayStart = 480, dayEnd = 1260) {
  const busy = timedEvents
    .map((e) => [Math.max(dayStart, e.start), Math.min(dayEnd, e.end)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const b of busy) {
    if (merged.length && b[0] <= merged[merged.length - 1][1])
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], b[1]);
    else merged.push([...b]);
  }
  const free = [];
  let cur = dayStart;
  for (const [a, b] of merged) {
    if (a - cur >= 45) free.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (dayEnd - cur >= 45) free.push([cur, dayEnd]);
  return free.map(([a, b]) => ({ from: hhmm(a), to: hhmm(b), minutes: b - a }));
}

export async function gatherDay(env, userId, tz, today) {
  const d = db(env);
  const dayStart = localStartIso(tz, today);
  const horizonEnd = localStartIso(tz, addDays(today, 4));
  // Their week ends on their weekly day, which is read below with everything
  // else. So habit progress is read from the earliest day a week holding today
  // can begin, and counted from the first day of theirs (renderDay).
  const earliestWeekStart = addDays(today, -6);
  const [
    calendar,
    noteEvents,
    openTodos,
    doneToday,
    habits,
    progress,
    brief,
    intentions,
    journals,
    facts,
    changes,
    questions,
    absence,
    usage,
    lifeMap,
    prevDco,
    corrections,
    pastFacts,
    anyCalendar,
    story,
    recentNotes,
    reaction,
    settings,
    eases,
    people,
  ] = await Promise.all([
    d.select(
      `synced_calendar_events?owner_id=eq.${userId}&archived=eq.false&start_at=gte.${encodeURIComponent(dayStart)}&start_at=lt.${encodeURIComponent(horizonEnd)}&select=id,title,location,start_at,end_at,is_all_day,cancelled_at&order=start_at.asc&limit=200`,
    ),
    // Events that start in the next few days, and ones that started earlier and are still going.
    d.select(
      `notes?owner_id=eq.${userId}&external_source=is.null&subtype=eq.event&archived=eq.false&or=(target_date.gte.${today},end_date.gte.${today})&target_date=lte.${addDays(today, 3)}&select=id,title,body,target_date,event_time,end_date,created_at&order=target_date.asc&limit=50`,
    ),
    d.select(
      `todos?owner_id=eq.${userId}&completed_at=is.null&archived=eq.false&select=id,title,due_day,scheduled_date,time_estimate_minutes,priority_kind,created_at,skipped_in_sweep_at&order=due_day.asc.nullslast&limit=1000`,
    ),
    d.select(
      `todos?owner_id=eq.${userId}&completed_at=gte.${encodeURIComponent(dayStart)}&select=id,title&limit=50`,
    ),
    d.select(
      `habits?owner_id=eq.${userId}&archived=eq.false&select=id,name,title,frequency,cadence,target_per_period,subtype&limit=100`,
    ),
    d.select(
      `habit_progress?owner_id=eq.${userId}&occurred_day=gte.${earliestWeekStart}&select=habit_id,occurred_day&limit=2000`,
    ),
    d.select(
      `daily_briefs?owner_id=eq.${userId}&date=eq.${today}&select=one_thing_id,one_thing_type`,
    ),
    d.select(
      `notes?owner_id=eq.${userId}&subtype=eq.journal&journal_subtype=eq.intention&created_at=gte.${encodeURIComponent(localStartIso(tz, addDays(today, -7)))}&select=title,body,created_at&order=created_at.desc&limit=1`,
    ),
    d.select(
      `notes?owner_id=eq.${userId}&subtype=eq.journal&created_at=gte.${encodeURIComponent(localStartIso(tz, addDays(today, -3)))}&select=id,title,body,mood,created_at&order=created_at.asc&limit=10`,
    ),
    d.select(
      `life_facts_now?user_id=eq.${userId}&state=in.(current,planned,unconfirmed)&select=id,statement,subject,about_date,about_date_end,state,date_confidence,observed_at,last_confirmed_at,private,health,item_table,item_id&order=last_confirmed_at.desc&limit=250`,
    ),
    d.select(
      `life_fact_changes?user_id=eq.${userId}&created_at=gte.${encodeURIComponent(localStartIso(tz, addDays(today, -7)))}&select=fact_id,from_state,to_state,reason,created_at&order=created_at.desc&limit=40`,
    ),
    d.select(
      `gremly_questions?user_id=eq.${userId}&status=in.(open,asked)&select=id,question,choices,created_at,asked_at,hold_until,fact:life_facts(private,health)&order=created_at.asc&limit=20`,
    ),
    d.rpc('absence_snapshot', { p_user: userId }),
    d.rpc('usage_rollup', { p_user: userId, p_grain: 'week', p_periods: 5 }),
    d.select(`user_life_map?user_id=eq.${userId}&select=life_map`),
    d.select(
      `user_daily_state?user_id=eq.${userId}&date=lt.${today}&dco->>pipeline=not.is.null&select=date,dco&order=date.desc&limit=1`,
    ),
    recentCorrections(env, userId),
    d.select(
      `life_facts_now?user_id=eq.${userId}&state=in.(happened,changed)&about_date=gte.${addDays(today, -365)}&select=id,statement,about_date,state,state_reason,private,health&order=about_date.desc&limit=80`,
    ),
    d.select(
      `synced_calendar_events?owner_id=eq.${userId}&archived=eq.false&start_at=gte.${encodeURIComponent(localStartIso(tz, addDays(today, -30)))}&select=id&limit=1`,
    ),
    loadStory(env, userId, { includePrivate: false, limit: 60 }).catch(() => []),
    // Other notes from the last few days: a later note can cancel or move an event above.
    d.select(
      `notes?owner_id=eq.${userId}&external_source=is.null&archived=eq.false&or=(subtype.is.null,subtype.not.in.(event,journal))&created_at=gte.${encodeURIComponent(localStartIso(tz, addDays(today, -3)))}&select=id,title,body,created_at&order=created_at.asc&limit=25`,
    ),
    // How they reacted to yesterday's brief in Chat (Daily brief in Chat)
    readThreadReaction(env, userId, addDays(today, -1)).catch(() => null),
    // Their weekly day. The day's context never waits on it: unread, their
    // week is counted as ending on Sunday, and the log says why.
    weekSettings(env, userId).catch((err) => {
      console.warn(`[DCO v4] could not read their weekly day: ${err?.message || err}`);
      return null;
    }),
    // The stretches a habit is paused for or on a lighter version, any that
    // reach into a week holding today. Unread, no habit counts as either.
    d
      .select(
        `habit_adaptations?owner_id=eq.${userId}&period_end=gte.${earliestWeekStart}&select=id,habit_id,mode,period_start,period_end,floor_note&limit=200`,
      )
      .catch((err) => {
        console.warn(
          `[DCO v4] could not read their paused and lighter habits: ${err?.message || err}`,
        );
        return [];
      }),
    // The people their facts are about (data fabric stage 2). Unread, no fact
    // names anyone, and the check holds every sentence to the facts alone.
    factPeople(d, userId).catch((err) => {
      console.warn(`[DCO v4] could not read the people in their facts: ${err?.message || err}`);
      return { byFact: new Map() };
    }),
  ]);
  return {
    today,
    weeklyDay: weeklyDayOf(settings?.weekly_day),
    calendar,
    noteEvents,
    openTodos,
    doneToday,
    habits,
    progress,
    brief: brief?.[0] || null,
    intention: intentions?.[0] || null,
    journals,
    facts,
    changes,
    questions,
    absence,
    usage,
    lifeMap: lifeMap?.[0]?.life_map || null,
    prevDco: prevDco?.[0] || null,
    corrections,
    pastFacts: pastFacts || [],
    calendarConnected: (anyCalendar || []).length > 0,
    story: story || [],
    recentNotes: recentNotes || [],
    reaction: reaction || null,
    eases: eases || [],
    people,
  };
}

/**
 * Each fact's people, as the people records hold them: their name, their
 * other names and who they are to the person when the person said it.
 */
export async function factPeople(d, userId) {
  const [ties, people, names] = await Promise.all([
    d.select(`life_fact_people?user_id=eq.${userId}&select=fact_id,person_id&limit=10000`),
    d.select(
      `life_people?user_id=eq.${userId}&merged_into=is.null&select=id,name,relationship&limit=2000`,
    ),
    d.select(`life_person_names?user_id=eq.${userId}&select=person_id,name&limit=10000`),
  ]);
  const namesOf = new Map();
  for (const n of names || [])
    namesOf.set(n.person_id, [...(namesOf.get(n.person_id) || []), n.name]);
  const byId = new Map((people || []).map((p) => [p.id, { ...p, names: namesOf.get(p.id) || [] }]));
  const byFact = new Map();
  for (const t of ties || []) {
    const p = byId.get(t.person_id);
    if (p) byFact.set(t.fact_id, [...(byFact.get(t.fact_id) || []), p]);
  }
  return { byFact };
}

/**
 * The records the check holds each sentence to, one for every ref the model
 * is shown (workers/shared/check/stated.js). label is the line it was shown.
 */
function dayDistance(today, date) {
  return date ? [Math.abs(daysBetween(today, String(date).slice(0, 10)))] : [];
}

/** Build the prompt text, the reference maps and the records the output is checked against. */
export function renderDay(g, tz) {
  const refs = new Map();
  const records = new Map();
  const lines = [];
  const today = g.today;
  const addRef = (prefix, obj) => {
    const ref = `${prefix}${[...refs.keys()].filter((k) => k.startsWith(prefix)).length + 1}`;
    refs.set(ref, obj);
    return ref;
  };
  // the record behind a line: what code can compare, and the line itself
  const hold = (ref, fields, line) => {
    records.set(ref, { ...fields, label: line });
    return line;
  };
  const peopleOf = (factId) => g.people?.byFact?.get(factId) || [];

  // Today itself, and the time away
  const a = g.absence || {};
  const wk = g.usage?.periods || [];
  const thisWeek = wk[0] || null;
  const lastWeeks = wk.slice(1);
  refs.set('d1', { type: 'today' });
  lines.push(
    hold(
      'd1',
      { dates: [today], exact: ['date'] },
      `TODAY (d1): ${weekdayName(today)} ${today}, timezone ${tz}.`,
    ),
  );
  lines.push('');
  const away = a.days_away_before_today ?? 0;
  refs.set('a1', { type: 'app_use' });
  lines.push(
    hold(
      'a1',
      {
        dates: [a.last_active_day_before_today].filter(Boolean),
        numbers: [
          a.days_away_before_today,
          a.active_days_last_7,
          a.active_days_last_30,
          7,
          30,
          ...(thisWeek
            ? [
                thisWeek.active_days,
                thisWeek.drops,
                thisWeek.todos_done,
                thisWeek.habit_checkins,
                thisWeek.journals,
                thisWeek.chat_messages,
                thisWeek.sweeps,
                thisWeek.fed_days,
              ]
            : []),
          ...lastWeeks.map((p) => p.active_days),
        ].filter((n) => Number.isFinite(n)),
        exact: ['date', 'number'],
      },
      `TIME AWAY AND APP USE (a1, counted from app activity): returning after time away: ${away >= 3 ? `yes, ${away} days away from the app before today` : 'no'}; last active before today ${a.last_active_day_before_today || 'never'}; days away before today: ${a.days_away_before_today ?? 'unknown'}; active days in the last 7: ${a.active_days_last_7 ?? 0}, last 30: ${a.active_days_last_30 ?? 0}. This week: ${thisWeek ? `${thisWeek.active_days} active days, ${thisWeek.drops} drops, ${thisWeek.todos_done} todos done, ${thisWeek.habit_checkins} habit check-ins, ${thisWeek.journals} journal entries, ${thisWeek.chat_messages} chat messages, ${thisWeek.sweeps} sweeps, ${thisWeek.fed_days} fed days` : 'none'}. Previous weeks' active days: ${lastWeeks.map((p) => p.active_days).join(', ') || 'none'}.`,
    ),
  );
  lines.push('');

  // Calendar, today and the next three days, in local time.
  const todayTimed = [];
  const calLines = [];
  for (const c of g.calendar) {
    const startDay = c.is_all_day ? c.start_at.slice(0, 10) : localDate(tz, new Date(c.start_at));
    const ref = addRef('c', { type: 'calendar', id: c.id, title: c.title, date: startDay });
    const when = c.is_all_day
      ? `${startDay} all day`
      : `${localDateTime(tz, c.start_at)} to ${localDateTime(tz, c.end_at).slice(11)}`;
    const cancelled = g.cancelledIds?.has(c.id);
    calLines.push(
      hold(
        ref,
        {
          dates: [startDay],
          times: c.is_all_day
            ? []
            : [localDateTime(tz, c.start_at).slice(11), localDateTime(tz, c.end_at).slice(11)],
          numbers: dayDistance(today, startDay),
          exact: ['date', 'time'],
        },
        `${ref} | ${relativeDay(startDay, today)} | ${when} | ${trim(c.title, 120)}${c.location ? ` | ${trim(c.location, 60)}` : ''}${cancelled ? ' | cancelled' : ''}`,
      ),
    );
    // A cancelled entry is not busy time.
    if (!c.is_all_day && startDay === today && !cancelled) {
      todayTimed.push({
        id: c.id,
        start: minutesOfDay(tz, c.start_at),
        end: minutesOfDay(tz, c.end_at) || 1439,
        title: c.title,
      });
    }
  }
  for (const n of g.noteEvents) {
    const ref = addRef('c', { type: 'note_event', id: n.id, title: n.title, date: n.target_date });
    const span = n.end_date && n.end_date > n.target_date ? ` to ${n.end_date}` : '';
    const ongoing = n.target_date < today ? ', still going today' : '';
    const words =
      n.body && trim(n.body, 160) !== trim(n.title, 160)
        ? ` | their note: "${trim(n.body, 160)}"`
        : '';
    const time = /^\d{1,2}:\d{2}/.test(n.event_time || '') ? n.event_time.slice(0, 5) : null;
    calLines.push(
      hold(
        ref,
        {
          spans: [
            [n.target_date, n.end_date && n.end_date > n.target_date ? n.end_date : n.target_date],
          ],
          times: time ? [time] : [],
          numbers: dayDistance(today, n.target_date),
          // the event's own note may give another day or time, in their words
          exact: [],
        },
        `${ref} | ${relativeDay(n.target_date, today)}${ongoing} | ${n.target_date}${time ? ` ${time}` : ''}${span} | ${trim(n.title, 120)} | added ${localDateTime(tz, n.created_at)}${words}`,
      ),
    );
  }
  const free = freeWindows(todayTimed);
  const meetingsToday = todayTimed.length;

  // Items with a possible claim on today.
  const dueToday = g.openTodos.filter((t) => t.due_day === today || t.scheduled_date === today);
  const overdue = g.openTodos.filter(
    (t) => t.due_day && t.due_day < today && t.scheduled_date !== today,
  );
  const undated = g.openTodos.filter((t) => !t.due_day && !t.scheduled_date);
  const comingUp = g.openTodos
    .filter(
      (t) =>
        (t.due_day && t.due_day > today && t.due_day <= addDays(today, 14)) ||
        (t.scheduled_date && t.scheduled_date > today && t.scheduled_date <= addDays(today, 14)),
    )
    .sort((a, b) => ((a.due_day || a.scheduled_date) < (b.due_day || b.scheduled_date) ? -1 : 1));
  const todoLine = (t, note) => {
    const ref = addRef('t', { type: 'todo', id: t.id, title: t.title });
    return hold(
      ref,
      {
        dates: [t.due_day, t.scheduled_date].filter(Boolean),
        numbers: [
          t.time_estimate_minutes,
          ...dayDistance(today, t.due_day || t.scheduled_date || t.created_at),
        ].filter((x) => Number.isFinite(x)),
        // a todo's title is their words, and may hold a day or a number
        exact: [],
      },
      `${ref} | ${trim(t.title, 120)}${t.time_estimate_minutes ? ` | about ${t.time_estimate_minutes} min` : ''}${note ? ` | ${note}` : ''}`,
    );
  };
  const dueLines = dueToday.slice(0, 25).map((t) => todoLine(t, 'due today'));
  const overdueLines = overdue
    .slice(0, 15)
    .map((t) => todoLine(t, `was due ${t.due_day} (${relativeDay(t.due_day, today)})`));
  const comingLines = comingUp.slice(0, 20).map((t) => {
    const when = t.due_day || t.scheduled_date;
    return todoLine(
      t,
      `${t.due_day ? 'due' : 'planned for'} ${when} (${relativeDay(when, today)})`,
    );
  });
  const undatedLines = undated
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 30)
    .map((t) => todoLine(t, `no date, added ${relativeDay(t.created_at.slice(0, 10), today)}`));

  // Habits this week: their own week, the seven days that end on their weekly day.
  const weekFirst = weekAround(today, g.weeklyDay).first;
  const counts = new Map();
  for (const p of g.progress) {
    if (p.occurred_day < weekFirst) continue;
    counts.set(p.habit_id, (counts.get(p.habit_id) || 0) + 1);
  }
  const daysIntoWeek = dayOfWeek(today, g.weeklyDay);
  const daysGone = spanDays(weekFirst, today);
  const habitLines = g.habits.map((h) => {
    const ref = addRef('h', { type: 'habit', id: h.id, title: h.name || h.title });
    const done = counts.get(h.id) || 0;
    const target = h.cadence === 'daily' ? 7 : h.target_per_period || 1;
    // a habit paused today is left alone: its line says when the pause ends, with no count
    const ease = easeOn(g.eases, h.id, today);
    // days of this week it was paused on do not count against it: the line says how many
    const pausedDays = daysGone.length - unpaused(g.eases, h.id, daysGone).length;
    const wasPaused = pausedDays ? `, paused on ${pausedDays} of those days` : '';
    const progress =
      ease?.mode === 'pause'
        ? `paused until ${ease.last}`
        : `${done} of ${target} this week, day ${daysIntoWeek} of 7${wasPaused}${lighterWords(ease)}`;
    return hold(
      ref,
      {
        dates: ease?.mode === 'pause' ? [ease.last] : [],
        numbers:
          ease?.mode === 'pause'
            ? dayDistance(today, ease.last)
            : [done, target, daysIntoWeek, 7, target - done, ...(pausedDays ? [pausedDays] : [])],
        // a habit's name is their words, and may hold a number
        exact: [],
      },
      `${ref} | ${trim(h.name || h.title, 80)} | ${h.subtype === 'break_habit' ? 'breaking a habit' : 'building a habit'} | ${progress}`,
    );
  });

  // The people the facts below are about, as the person said who they are
  const inWindow = (f) => f.about_date >= addDays(today, -14) && f.about_date <= addDays(today, 60);
  const shownFacts = [
    ...g.facts.filter((f) => f.about_date && inWindow(f)),
    ...g.facts.filter((f) => !f.about_date).slice(0, 60),
    ...(g.pastFacts || []),
  ];
  const personRef = new Map();
  const peopleLines = [];
  // someone known here only from private facts, or facts about health, is private too
  const tiedTo = new Map();
  for (const f of shownFacts)
    for (const p of peopleOf(f.id)) tiedTo.set(p.id, [...(tiedTo.get(p.id) || []), f]);
  for (const f of shownFacts) {
    for (const p of peopleOf(f.id)) {
      if (personRef.has(p.id)) continue;
      const ref = addRef('p', { type: 'person', id: p.id, name: p.name });
      personRef.set(p.id, ref);
      const others = (p.names || []).filter(
        (n) => n.toLowerCase() !== (p.name || '').toLowerCase(),
      );
      const isPrivate = tiedTo.get(p.id).every((x) => x.private || x.health);
      peopleLines.push(
        hold(
          ref,
          { names: [p.name, ...others].filter(Boolean), exact: ['person'], private: isPrivate },
          `${ref}${isPrivate ? ' [private]' : ''} | ${p.name || '(no name given yet)'}${others.length ? ` | also called ${others.join(', ')}` : ''}${p.relationship ? ` | ${p.relationship}, as they said` : ' | who they are is not known'}`,
        ),
      );
    }
  }

  // Ledger facts, nearest dates first, then undated.
  const dated = g.facts
    .filter((f) => f.about_date)
    .sort((a, b) => (a.about_date < b.about_date ? -1 : 1));
  const undatedFacts = g.facts.filter((f) => !f.about_date);
  const factRecord = (f) => ({
    spans: f.about_date ? [[f.about_date, f.about_date_end || f.about_date]] : [],
    numbers: dayDistance(today, f.about_date),
    names: [...new Set(peopleOf(f.id).flatMap((p) => [p.name, ...(p.names || [])]))].filter(
      Boolean,
    ),
    // a fact's statement may hold more than its fields
    exact: [],
    private: !!f.private,
    health: !!f.health,
  });
  const whoIn = (f) => {
    const ps = peopleOf(f.id)
      .map((p) => personRef.get(p.id))
      .filter(Boolean);
    return ps.length ? ` | about ${ps.join(', ')}` : '';
  };
  // a fact about health is shown as private: it never goes on a glanceable line
  const factLine = (f) => {
    const ref = addRef('f', { type: 'fact', id: f.id, statement: f.statement });
    const when = f.about_date
      ? `${f.about_date}${f.about_date_end ? ` to ${f.about_date_end}` : ''} (${relativeDay(f.about_date, today)})`
      : 'no date';
    return hold(
      ref,
      factRecord(f),
      `${ref} | ${stateWords(f, today)}${f.private || f.health ? ' [private]' : ''} | ${when} | ${trim(f.statement, 200)} | recorded ${f.observed_at.slice(0, 10)}, last confirmed ${f.last_confirmed_at.slice(0, 10)}${whoIn(f)}`,
    );
  };
  const factLines = [
    ...dated.filter(inWindow).map(factLine),
    ...undatedFacts.slice(0, 60).map(factLine),
  ];
  const pastLines = (g.pastFacts || []).map((f) => {
    const ref = addRef('f', { type: 'fact', id: f.id, statement: f.statement });
    return hold(
      ref,
      factRecord(f),
      `${ref} | ${f.about_date} (${relativeDay(f.about_date, today)}) | ${f.state}${f.private || f.health ? ' [private]' : ''} | ${trim(f.statement, 140)}${whoIn(f)}`,
    );
  });

  // The questions the rules allow today (workers/shared/questionRules.js): none
  // about a private fact, which is for conversation, or about health, which is
  // private here too (careRules.js); none held until a later day; and one put
  // to them in the last few days, and skipped or left, waits
  const qLines = askableQuestions(g.questions, { day: today })
    .slice(0, 10)
    .map((q) => {
      const ref = addRef('q', {
        type: 'question',
        id: q.id,
        question: q.question,
        choices: Array.isArray(q.choices) ? q.choices : [],
      });
      return hold(
        ref,
        { dates: [q.created_at.slice(0, 10)] },
        `${ref} | raised ${q.created_at.slice(0, 10)} | ${trim(q.question, 200)}`,
      );
    });

  const threadLines = [];
  for (const dom of g.lifeMap?.domains || []) {
    for (const t of dom.threads || []) {
      if (t.lifecycle && !['active', 'dormant'].includes(t.lifecycle)) continue;
      const ref = addRef('l', { type: 'thread', name: t.name });
      threadLines.push(
        hold(
          ref,
          { dates: [t.last_activity].filter(Boolean) },
          `${ref} | ${trim(dom.name, 40)} / ${trim(t.name, 60)} | ${t.status || ''}, ${t.momentum || ''} | last activity ${t.last_activity || 'unknown'} | ${trim(t.summary, 220)}`,
        ),
      );
    }
  }

  const calendarNote =
    g.calendarConnected === false && !calLines.length
      ? '(no calendar is connected, so nothing is known about their meetings or plans for the day)'
      : '(nothing on the calendar)';
  lines.push(
    `CALENDAR, TODAY AND NEXT 3 DAYS (ref | relative | when | title | place):\n${calLines.join('\n') || calendarNote}`,
  );
  // Worked out in code so the brief never has to count or add up times itself.
  const blocks = busyBlocks(todayTimed);
  refs.set('s1', { type: 'shape' });
  lines.push(
    hold(
      's1',
      {
        dates: [today],
        times: [
          '08:00',
          '21:00',
          ...blocks.flatMap((b) => [b.from, b.to]),
          ...free.flatMap((w) => [w.from, w.to]),
        ],
        // how long a stretch is may be said in minutes or in whole hours; a
        // number this record does not hold goes to the words question
        numbers: [
          todayTimed.length,
          45,
          ...free.flatMap((w) => [
            w.minutes,
            Math.floor(w.minutes / 60),
            Math.round(w.minutes / 60),
          ]),
        ],
        exact: ['date', 'time'],
      },
      `TODAY'S SHAPE (s1), WORKED OUT FROM THE CALENDAR: ${
        g.calendarConnected === false
          ? 'no calendar is connected, so nothing is known about their meetings, and the day cannot be called open or free'
          : todayTimed.length
            ? `${todayTimed.length} timed ${todayTimed.length === 1 ? 'entry' : 'entries'} (cancelled ones left out); busy ${blocks.map((b) => `${b.from} to ${b.to}`).join(', ')}; clear stretches of 45 minutes or more between 08:00 and 21:00: ${free.map((w) => `${w.from} to ${w.to}`).join(', ') || 'none'}`
            : 'nothing timed on the calendar today'
      }.`,
    ),
  );
  lines.push('');
  refs.set('k1', { type: 'counts' });
  lines.push(
    hold(
      'k1',
      {
        numbers: [
          dueToday.length,
          overdue.length,
          comingUp.length,
          undated.length,
          g.doneToday.length,
          dueLines.length,
          overdueLines.length,
          comingLines.length,
          undatedLines.length,
          14,
        ],
        exact: ['number'],
      },
      `COUNTS (k1): on today or due today ${dueToday.length}; past their date ${overdue.length}; coming up in the next 14 days ${comingUp.length}; undated ${undated.length}; done today ${g.doneToday.length}.`,
    ),
  );
  lines.push(`ON TODAY OR DUE TODAY (ref | title | note):\n${dueLines.join('\n') || '(none)'}`);
  lines.push(
    `PAST THEIR DATE (${overdue.length} in total; first ${overdueLines.length} shown):\n${overdueLines.join('\n') || '(none)'}`,
  );
  lines.push(
    `COMING UP IN THE NEXT 14 DAYS (${comingUp.length} in total; first ${comingLines.length} shown):\n${comingLines.join('\n') || '(none)'}`,
  );
  lines.push(
    `UNDATED, NEWEST FIRST (${undated.length} in total; first ${undatedLines.length} shown):\n${undatedLines.join('\n') || '(none)'}`,
  );
  const doneLines = g.doneToday.map((t) => {
    const ref = addRef('t', { type: 'todo', id: t.id, title: t.title });
    return hold(ref, { dates: [today] }, `${ref} | ${trim(t.title, 60)} | done today`);
  });
  lines.push(`DONE TODAY (ref | title):\n${doneLines.join('\n') || 'nothing yet'}`);
  lines.push('');
  lines.push(
    `HABITS THIS WEEK (ref | habit | kind | progress):\n${habitLines.join('\n') || '(none)'}`,
  );
  lines.push('');
  if (g.intention) {
    refs.set('i1', { type: 'intention' });
    lines.push(
      hold(
        'i1',
        { dates: [g.intention.created_at.slice(0, 10)] },
        `WEEKLY INTENTION (i1): "${trim(g.intention.title, 120)}" ${trim(g.intention.body, 300)} (set ${g.intention.created_at.slice(0, 10)})`,
      ),
    );
  } else lines.push('WEEKLY INTENTION: (none set)');
  lines.push(
    `TODAY'S ONE THING (chosen by the person): ${g.brief?.one_thing_id ? `${g.brief.one_thing_type} ${g.brief.one_thing_id}` : '(none chosen)'}`,
  );
  lines.push('');
  const noteLines = (g.recentNotes || []).map((n) => {
    const ref = addRef('n', { type: 'note', id: n.id, title: n.title });
    return hold(
      ref,
      {
        dates: [localDate(tz, new Date(n.created_at))],
        numbers: dayDistance(today, localDate(tz, new Date(n.created_at))),
      },
      `${ref} | ${localDateTime(tz, n.created_at)} | ${trim(n.title, 100)}${n.body && trim(n.body, 200) !== trim(n.title, 200) ? ` | ${trim(n.body, 200)}` : ''}`,
    );
  });
  lines.push(
    `OTHER NOTES, LAST 3 DAYS (ref | added | title | text):\n${noteLines.join('\n') || '(none)'}`,
  );
  const journalLines = g.journals.map((j) => {
    const ref = addRef('j', { type: 'journal', id: j.id, title: j.title });
    return hold(
      ref,
      {
        dates: [localDate(tz, new Date(j.created_at))],
        numbers: dayDistance(today, localDate(tz, new Date(j.created_at))),
      },
      `${ref} | ${localDateTime(tz, j.created_at)} | "${trim(j.title, 100)}" ${trim(j.body, 900)}${j.mood?.length ? ` | mood: ${j.mood.join(', ')}` : ''}`,
    );
  });
  lines.push(
    `JOURNAL ENTRIES, LAST 3 DAYS (ref | written | entry):\n${journalLines.join('\n') || '(none)'}`,
  );
  lines.push('');
  lines.push(
    `PEOPLE IN THESE FACTS (ref | name | other names | who they are):\n${peopleLines.join('\n') || '(none known yet)'}`,
  );
  lines.push(
    `LEDGER FACTS (ref | state | date | statement | provenance | about):\n${factLines.join('\n') || '(none yet)'}`,
  );
  lines.push(
    `WHAT ALREADY HAPPENED OR CHANGED, LAST YEAR (ref | date | state | statement | about):\n${pastLines.join('\n') || '(none)'}`,
  );
  lines.push(
    `RECENT CHANGES TO FACTS: ${g.changes.map((c) => `${c.created_at.slice(0, 10)} ${c.from_state} to ${c.to_state}: ${trim(c.reason, 140)}`).join('; ') || 'none'}`,
  );
  lines.push(
    `CORRECTIONS THE PERSON MADE (never repeat the corrected claim): ${g.corrections.map((c) => `${c.corrected_at.slice(0, 10)}: "${trim(c.statement, 140)}" is wrong; they said "${trim(c.correction_text, 160)}"`).join('; ') || 'none'}`,
  );
  lines.push('');
  lines.push(
    `QUESTIONS GREMLY HAS FOR THE PERSON (ref | when it was raised | question):\n${qLines.join('\n') || '(none)'}`,
  );
  lines.push('');
  const storyLine = (s, words) => {
    const ref = addRef('y', { type: 'story', id: s.id, title: s.title });
    return hold(ref, { dates: [s.period_start].filter(Boolean) }, `${ref} | ${words}`);
  };
  const loves = (g.story || [])
    .filter((s) => s.kind === 'pattern')
    .slice(0, 12)
    .map((s) => storyLine(s, `${s.pattern_kind || 'pattern'}: ${trim(s.title, 90)}`));
  const proud = (g.story || [])
    .filter((s) => s.kind === 'proud')
    .slice(0, 10)
    .map((s) => storyLine(s, `${s.period_start || 'undated'}: ${trim(s.title, 90)}`));
  lines.push(
    `WHAT THEY LOVE AND DO OFTEN (from their story; ref | what):\n${loves.join('\n') || '(not written yet)'}`,
  );
  lines.push(
    `MOMENTS THEY CAN BE PROUD OF (from their story; ref | when: what):\n${proud.join('\n') || '(not written yet)'}`,
  );
  lines.push('');
  lines.push(
    `LIFE MAP THREADS (ref | domain / thread | state | last activity | summary):\n${threadLines.slice(0, 30).join('\n') || '(none yet)'}`,
  );
  lines.push('');
  lines.push(
    `YESTERDAY'S HEADLINE: ${g.prevDco?.dco?.brief_headline ? `"${g.prevDco.dco.brief_headline}" (${g.prevDco.date})` : '(none)'}`,
  );
  lines.push(g.reaction || "YESTERDAY'S BRIEF: (no brief in Chat yesterday)");

  return {
    text: lines.join('\n'),
    refs,
    records,
    computed: {
      // today's timed entries with their ids (the day frame reads these)
      timed_today: [
        ...todayTimed,
        ...g.noteEvents
          .filter((n) => n.target_date === today && /^\d{1,2}:\d{2}/.test(n.event_time || ''))
          .map((n) => {
            const [h, m] = n.event_time.split(':').map(Number);
            return { id: n.id, title: n.title, start: h * 60 + m, end: h * 60 + m + 60 };
          }),
      ].sort((a, b) => a.start - b.start),
      meetings_today: meetingsToday,
      free_windows: free,
      todos_due_today: dueToday.length,
      overdue_todos: overdue.length,
      undated_todos: undated.length,
      calendar_today: g.calendar
        .filter(
          (c) =>
            (c.is_all_day ? c.start_at.slice(0, 10) : localDate(tz, new Date(c.start_at))) ===
            today,
        )
        .map((c) => c.title),
    },
  };
}

const DCO_SCHEMA = {
  type: 'object',
  properties: {
    headline: SENTENCE_SCHEMA,
    day_shape: SENTENCE_SCHEMA,
    tone: {
      type: 'string',
      enum: ['relaxed', 'focused', 'stretched', 'recovering', 'celebratory'],
    },
    day_type: {
      type: 'string',
      enum: [
        'event_day',
        'work_day',
        'milestone_day',
        'routine_day',
        'quiet_day',
        'transition_day',
      ],
    },
    lead_what: SENTENCE_SCHEMA,
    lead_why_today: SENTENCE_SCHEMA,
    today_focus: { type: 'array', items: SENTENCE_SCHEMA },
    also_matters: { type: 'array', items: SENTENCE_SCHEMA },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        properties: { ref: { type: 'string' }, why: SENTENCE_SCHEMA },
        required: ['ref', 'why'],
      },
    },
    reach_ref: { type: 'string', nullable: true },
    reach_why: SENTENCE_SCHEMA,
    reach_fact_refs: { type: 'array', items: { type: 'string' } },
    anchor_refs: { type: 'array', items: { type: 'string' } },
    anchor_labels: {
      type: 'array',
      items: {
        type: 'object',
        properties: { ref: { type: 'string' }, short_label: { type: 'string' } },
        required: ['ref', 'short_label'],
      },
    },
    question_ref: { type: 'string', nullable: true },
    return_note: SENTENCE_SCHEMA,
    voice_note: { type: 'string' },
  },
  required: [
    'headline',
    'day_shape',
    'tone',
    'day_type',
    'lead_what',
    'lead_why_today',
    'today_focus',
    'also_matters',
    'claims',
    'reach_ref',
    'reach_why',
    'reach_fact_refs',
    'anchor_refs',
    'anchor_labels',
    'question_ref',
    'return_note',
    'voice_note',
  ],
};

/** What each line of the day is, one source for the day's prompt and for a line sent back. */
const FIELD_RULES = {
  headline:
    'headline: the notification line that opens the brief. What today looks like, in concrete terms, at most 90 characters. No counts of todos or habits, no feelings, no advice. When little is known about today, name what is true: a quiet day or something genuinely ahead. The headline is only ever about today: it never mentions time away, a return or a welcome back, even for someone returning, because the welcome waits for the brief itself.',
  day_shape:
    "day_shape: one sentence on how full the day is and when the clear stretches are, taken from TODAY'S SHAPE. Use its times as given and never count or add up entries yourself. When no calendar is connected, say only what is due or planned, never that the day is open, clear or free, and leave it empty when nothing is due or planned.",
  lead: "lead_what and lead_why_today: the one thing that leads today and why it is today's. What leads is what matters most to the person today, which is not always what fills the most time.",
  focus:
    'today_focus: up to three short items, each a concrete thing from the inputs. Fewer is fine, and none is fine; never fill it with general advice. also_matters: anything else worth knowing, briefly.',
  claims:
    'claims: the items with a real claim on today (due today, on Today, a habit that needs today to stay on track for the week, a calendar entry). Each cites its ref and says why in a few words.',
  reach:
    'reach_ref and reach_why: at most one undated item worth suggesting today, only when a ledger fact gives a true reason for today; cite those facts in reach_fact_refs. Otherwise leave them empty.',
  return_note:
    'return_note: write it when the inputs say they are returning after time away, and leave it empty otherwise. One or two warm lines welcoming them back. It may mention one true thing that is current or genuinely ahead. Never list what they missed or what is overdue, never guess why they were away, and never ask them to catch up.',
};

function fieldRule(key) {
  if (key === 'headline') return FIELD_RULES.headline;
  if (key === 'day_shape') return FIELD_RULES.day_shape;
  if (key.startsWith('lead_')) return FIELD_RULES.lead;
  if (key.startsWith('today_focus_') || key.startsWith('also_matters_')) return FIELD_RULES.focus;
  if (key.startsWith('claims_')) return FIELD_RULES.claims;
  if (key === 'reach_why') return FIELD_RULES.reach;
  return FIELD_RULES.return_note;
}

const DAY_PRIVATE = `${PRIVATE_RULES}
- In the brief that means a private fact is never named in the headline, day shape, lead or focus, and is never a date anchor or the reach. In also matters it may appear in the person's own words when it genuinely bears on today. It can always shape the tone.`;

const DAY_STATED = `${STATED_RULES}
- A sentence's refs include every record it draws on: each entry, item, fact and person it names, TODAY'S SHAPE and COUNTS when it says how full, open or quiet the day is or how many things there are, TIME AWAY AND APP USE when it speaks of time away or a return, and TODAY when it names the day.
- Who someone is to the person comes only from PEOPLE IN THESE FACTS or from the record that says it. Someone whose relationship is not known is named, never described.`;

const DAY_VOICE = `VOICE
Warm, plain and forward-looking. Never shame or pressure, never use streak language or the word should, never tell the person how they feel.`;

const DAY_EVIDENCE = `EVIDENCE
Every concrete claim (a meeting, a time, a task, a person, a date, a plan) must come from the inputs above, with its date read against today. A plan whose date has passed is not upcoming. A plan that looks like something that already happened is not upcoming either. A fact the person corrected is never used.
- Read each calendar entry and event against everything recorded after it was added: a later note or ledger fact that says it was cancelled, moved or done outranks the entry. When an event's own note gives a different day from its date, the day is uncertain; do not state it as today.`;

function dcoSystemPrompt(person) {
  return `You prepare the start of someone's day for Gremly, a warm, shame-free companion app. What you write appears in the morning brief, on the home screen and in the context every chat reads today.

${personBlock(person)}

${CARE_RULES}

YOUR JOB
- Decide what genuinely matters today and say it plainly. Weigh the calendar, what is due, habits for the week, the weekly intention, recent journal entries and the ledger.
- Every line you write below is one sentence, given with its refs and what it states. A line with nothing to say has empty text.
- ${FIELD_RULES.headline}
- ${FIELD_RULES.day_shape}
- ${FIELD_RULES.lead}
- ${FIELD_RULES.focus}
- ${FIELD_RULES.claims}
- ${FIELD_RULES.reach}
- anchor_refs: the dated ledger facts happening today or in the next 30 days that are worth keeping in mind, cited by ref, including a trip or travel that starts today or is under way today. Leave out any plan that something in the inputs suggests already happened, moved or fell through, anything with an open question about it, and anything the person corrected.
- anchor_labels: for each anchor you cite, a short name for the occasion itself as it would appear on a countdown chip on the day card: a few words, never a sentence, never about anything private.
- Yesterday's brief tells you how they used yesterday's: what they kept, took out or moved says what fits their days. Let it inform what leads and what has a claim today. Never mention it, and never treat it as a judgement.
- question_ref: at most one of Gremly's open questions, only if it is about something current or ahead and today is a natural day to ask it. A first morning back after time away is a natural day. Otherwise leave it empty.
- ${FIELD_RULES.return_note}
- voice_note: one line on how Gremly should sound today. On a heavy or uncertain day, Gremly can draw on what they love or on a moment they can be proud of, when one genuinely fits.

${DAY_PRIVATE}

${DAY_VOICE}

${WRITING_RULES}

${DAY_STATED}

${DAY_EVIDENCE}`;
}

/**
 * What the model is told when one line goes back to it: only what that line
 * needs, so a line sent back costs little.
 */
export function rewriteSystemPrompt(person, key) {
  return `You write one line of the start of someone's day for Gremly, a warm, shame-free companion app.

${personBlock(person)}

${CARE_RULES}

THE LINE
- ${fieldRule(key)}

${DAY_PRIVATE}

${DAY_VOICE}

${WRITING_RULES}

${DAY_STATED}

${DAY_EVIDENCE}

ONE SENTENCE AGAIN
You are given one sentence you wrote for the line named, what was wrong with it, and only the records it rests on. Write that one sentence again for the same line, so that it says only what those records hold, with its refs and what it states. Cite only the records given here. When nothing true can be said for that line from them, return empty text.`;
}

function fieldName(key) {
  if (key.startsWith('today_focus_')) return 'today_focus, one of the focus items';
  if (key.startsWith('also_matters_')) return 'also_matters, one of its items';
  if (key.startsWith('claims_')) return 'the why of one claim on today';
  return key;
}

/** The sentences of the day the check reads, keyed by field, and which are glanceable. */
export function daySentences(o) {
  const items = [];
  const add = (key, sentence, glanceable) => {
    if (sentence && typeof sentence === 'object') items.push({ key, sentence, glanceable });
  };
  // the headline, the day's shape, the lead, the focus and the reach are seen
  // at a glance: in the notification and on the home screen
  add('headline', o.headline, true);
  add('day_shape', o.day_shape, true);
  add('lead_what', o.lead_what, true);
  add('lead_why_today', o.lead_why_today, true);
  (o.today_focus || []).forEach((s, i) => add(`today_focus_${i}`, s, true));
  (o.also_matters || []).forEach((s, i) => add(`also_matters_${i}`, s, false));
  (o.claims || []).forEach((c, i) => add(`claims_${i}_why`, c?.why, false));
  if (o.reach_ref) add('reach_why', o.reach_why, true);
  add('return_note', o.return_note, false);
  return items;
}

/**
 * The day card's dated chips: the upcoming facts the model cited as genuinely
 * ahead, open ones only, within 30 days, at most eight, and a dated thing once:
 * two facts about the same item are one chip. A chip is seen at a glance, so
 * nothing private or about health is one.
 */
export function upcomingAnchorFacts(anchorRefs, refs, facts, today) {
  const factById = new Map(facts.map((f) => [f.id, f]));
  return [...new Set(anchorRefs || [])]
    .map((r) => refs.get(r))
    .filter((r) => r && r.type === 'fact')
    .map((r) => factById.get(r.id))
    .filter(
      (f) =>
        f &&
        !f.private &&
        !f.health &&
        f.about_date &&
        (f.about_date >= today || coversToday(f, today)) &&
        f.about_date <= addDays(today, 30) &&
        ['planned', 'current'].includes(f.state),
    )
    .sort((a, b) => (a.about_date < b.about_date ? -1 : 1))
    .filter(
      (f, i, all) =>
        !f.item_id ||
        all.findIndex((x) => x.item_table === f.item_table && x.item_id === f.item_id) === i,
    )
    .slice(0, 8);
}

/** The table each kind of item the day can rest on lives in, for passage_refs. */
const ITEM_TABLE = {
  calendar: 'synced_calendar_events',
  note_event: 'notes',
  todo: 'todos',
  habit: 'habits',
  question: 'gremly_questions',
  journal: 'notes',
  note: 'notes',
  story: 'story_items',
};

/** Cancelled entries: the reader stamps them (context/reader.js); they are not part of the day. */
export function cancelledCalendarIds(calendar) {
  return new Set((calendar || []).filter((c) => c.cancelled_at).map((c) => c.id));
}

/** Generate, check, assemble. Returns the DCO object and run notes. */
export async function buildDcoV4(env, userId, { tz: tzIn } = {}) {
  const tz = tzIn || (await userTimezone(env, userId));
  // their day: after midnight it is still yesterday until their day ends, the
  // same day the brief reads (brief/data.js)
  const { today } = await personNow(env, userId, tz);
  const [g, person] = await Promise.all([
    gatherDay(env, userId, tz, today),
    personIdentity(env, userId),
  ]);
  g.cancelledIds = cancelledCalendarIds(g.calendar);
  const { text, refs, records, computed } = renderDay(g, tz);
  const system = dcoSystemPrompt(person);

  // the day's frame (travel and set times) is read beside the brief
  const framePromise = readDayFrame(env, {
    today,
    meetings: computed.timed_today,
    facts: g.facts,
  }).catch((err) => {
    console.warn(`[DCO v4] day frame failed: ${err.message}`);
    return emptyFrame(today, null);
  });
  const { output, model } = await jsonCall(env, {
    primary: modelFor(env, 'daily'),
    fallback: modelFor(env, 'dailyFallback'),
    system,
    user: text,
    schema: DCO_SCHEMA,
    maxTokens: 8000,
    thinking: 'low',
    effort: 'low',
  });

  // Every sentence through the check (workers/shared/check): one that fails
  // goes back once, alone with its records, to the model that wrote it
  const [wrote, other] =
    model === modelFor(env, 'dailyFallback').model
      ? [modelFor(env, 'dailyFallback'), modelFor(env, 'daily')]
      : [modelFor(env, 'daily'), modelFor(env, 'dailyFallback')];
  const check = await runCheck({
    items: daySentences(output),
    records,
    today,
    // the day is written in the small hours, for the whole of it
    moment: 'written before the day begins, for the whole day',
    person,
    ask: async (req) =>
      (
        await jsonCall(env, {
          primary: modelFor(env, 'check'),
          fallback: modelFor(env, 'checkFallback'),
          ...req,
          maxTokens: 600,
          effort: 'low',
          thinking: 'low',
        })
      ).output,
    rewrite: async ({ key, sentence, records: own, problems }) =>
      (
        await jsonCall(env, {
          primary: wrote,
          fallback: other,
          system: rewriteSystemPrompt(person, key),
          user: `FIELD: ${fieldName(key)}\nTODAY: ${weekdayName(today)} ${today}.\n\nRECORDS:\n${own.map((r) => r.label).join('\n') || '(none)'}\n\nWHAT YOU WROTE: ${sentence.text}\n\nWHAT WAS WRONG:\n${problems.map((p) => `- ${p}`).join('\n')}`,
          schema: SENTENCE_SCHEMA,
          maxTokens: 1500,
          thinking: 'low',
          effort: 'low',
        })
      ).output,
  });
  const said = (key) => check.results.get(key)?.sentence?.text || null;

  // a fact about health is private here too (careRules.js)
  const privateIds = new Set(g.facts.filter((f) => f.private || f.health).map((f) => f.id));
  // A claim is a decision about an item; its why is a sentence, kept only when it holds
  const claimed = (output.claims || [])
    .map((c, i) => ({ c, key: `claims_${i}_why`, why: said(`claims_${i}_why`) }))
    .filter(
      ({ c }) =>
        c &&
        refs.has(c.ref) &&
        !(refs.get(c.ref).type === 'fact' && privateIds.has(refs.get(c.ref).id)),
    );
  // a claim whose why was left out keeps no why at all: corrections take a
  // claim whose why they cleared (a null) out of the day
  const claims = claimed.map(({ c, why }) => ({
    ...refs.get(c.ref),
    ...(why ? { why: trim(why, 160) } : {}),
  }));
  const claimKeys = claimed.map(({ key }) => key);
  const reachObj =
    output.reach_ref && refs.has(output.reach_ref) && said('reach_why')
      ? refs.get(output.reach_ref)
      : null;
  const reachFacts = (output.reach_fact_refs || [])
    .filter((r) => refs.has(r) && refs.get(r).type === 'fact' && !privateIds.has(refs.get(r).id))
    .map((r) => ({ id: refs.get(r).id, statement: refs.get(r).statement }));
  const reach =
    reachObj && reachFacts.length
      ? { ...reachObj, why: trim(said('reach_why'), 200), facts: reachFacts }
      : null;
  const question =
    output.question_ref &&
    refs.has(output.question_ref) &&
    refs.get(output.question_ref).type === 'question'
      ? {
          id: refs.get(output.question_ref).id,
          question: refs.get(output.question_ref).question,
          choices: refs.get(output.question_ref).choices || [],
        }
      : null;
  const daysAway = g.absence?.days_away_before_today ?? null;
  const ret =
    daysAway != null && daysAway >= 3 && said('return_note')
      ? { days_away: daysAway, note: trim(said('return_note'), 200) }
      : null;

  const upcomingFacts = upcomingAnchorFacts(output.anchor_refs, refs, g.facts, today);

  // The chip's few words, per anchor fact (gap 1 of the brief's context handoff)
  const shortLabels = new Map();
  for (const a of output.anchor_labels || []) {
    const r = refs.get(a?.ref);
    const label = trim(a?.short_label, 40);
    if (r?.type === 'fact' && label && !/[.!?]$/.test(label) && label.split(' ').length <= 5)
      shortLabels.set(r.id, label);
  }

  const nowIso = new Date().toISOString();
  const lead = said('lead_what')
    ? { what: said('lead_what'), why_today: said('lead_why_today'), detail: said('lead_what') }
    : null;
  const focus = (output.today_focus || [])
    .map((_, i) => said(`today_focus_${i}`))
    .filter(Boolean)
    .slice(0, 3);
  const also = (output.also_matters || []).map((_, i) => said(`also_matters_${i}`)).filter(Boolean);
  const headline = said('headline');

  // What each line that stands was written from, by the field that holds it
  // (passage_refs, data fabric stage 2), for corrections to find in stage 6
  const passages = [];
  const pass = (key, field) => {
    const r = check.results.get(key);
    if (!r?.sentence) return;
    const cited = r.refs.map((x) => refs.get(x)).filter((x) => x?.id);
    passages.push({
      field,
      factIds: cited.filter((x) => x.type === 'fact').map((x) => x.id),
      personIds: cited.filter((x) => x.type === 'person').map((x) => x.id),
      items: cited
        .filter((x) => ITEM_TABLE[x.type])
        .map((x) => ({ table: ITEM_TABLE[x.type], id: x.id })),
    });
  };
  pass('headline', 'brief_headline');
  pass('day_shape', 'brief.day_shape');
  if (lead) {
    pass('lead_what', 'lead_story.what');
    pass('lead_why_today', 'lead_story.why_today');
  }
  (output.today_focus || [])
    .map((_, i) => `today_focus_${i}`)
    .filter((k) => said(k))
    .slice(0, 3)
    .forEach((k, j) => pass(k, `today_focus.${j}`));
  (output.also_matters || [])
    .map((_, i) => `also_matters_${i}`)
    .filter((k) => said(k))
    .forEach((k, j) => pass(k, `also_matters.${j}`));
  claimKeys.forEach((k, j) => pass(k, `brief.claims.${j}.why`));
  if (reach) pass('reach_why', 'brief.reach.why');
  if (ret) pass('return_note', 'brief.return.note');

  const dco = {
    day_type: output.day_type || null,
    tone: output.tone || null,
    brief_headline: headline,
    today_focus: focus,
    lead_story: lead,
    voice_note: output.voice_note || null,
    also_matters: also,
    named_anchors: upcomingFacts.map((f) => ({
      short_label: shortLabels.get(f.id) || null,
      label: f.statement,
      title: f.statement,
      type: 'fact',
      date: f.about_date,
      date_end: f.about_date_end && f.about_date_end > f.about_date ? f.about_date_end : null,
      confidence: f.date_confidence,
      fact_id: f.id,
    })),
    active_today: {
      calendar_events: computed.calendar_today,
      todos_due_today: computed.todos_due_today,
      overdue_todos: computed.overdue_todos,
      upcoming_in_7d: upcomingFacts
        .filter((f) => f.about_date <= addDays(today, 7))
        .map((f) => ({ date: f.about_date, title: f.statement })),
    },
    weekly_intention: g.intention
      ? { title: g.intention.title, set_on: g.intention.created_at.slice(0, 10) }
      : null,
    daily_focus: {
      day_type: output.day_type || null,
      tone: output.tone || null,
      today_focus: focus,
      lead_story: lead,
    },
    worlds_summary: null,
    brief: {
      headline,
      day_shape: said('day_shape'),
      claims,
      reach,
      question,
      return: ret,
    },
    absence: g.absence,
    // Calendar entries the reader found cancelled that are still on the
    // calendar, today and the next few days (synced_calendar_events.cancelled_at).
    // The brief and the app's day card leave these out of the day.
    cancelled_calendar_ids: [...(g.cancelledIds || [])],
    // Travel and set times the day is planned around (context/dayFrame.js)
    day_frame: await framePromise,
    // what the check sent back or left out, field by field
    review_flags: check.details.map((d) => ({
      field: d.key,
      outcome: d.outcome,
      problem: problemWords(d),
    })),
    user_id: userId,
    date: today,
    generated_at: nowIso,
    ttl_days: 7,
    model_used: model,
    pipeline: 'dco-v4',
    prompt_version: DCO_PROMPT_VERSION,
  };
  return {
    dco,
    today,
    tz,
    attempts: 1,
    problems: dco.review_flags,
    check: { counts: check.counts, details: check.details },
    passages,
    // what each line that stands rests on, for the replays
    kept: [...check.results]
      .filter(([, r]) => r.sentence)
      .map(([key, r]) => ({
        key,
        text: r.sentence.text,
        refs: r.refs,
        ids: r.refs.map((x) => refs.get(x)?.id).filter(Boolean),
      })),
    inputChars: text.length,
  };
}

/** Write a DCO v4 row (live) or into dco_shadow beside the live row (shadow). */
export async function writeDco(env, userId, built, { shadow }) {
  const d = db(env);
  const nowIso = new Date().toISOString();
  const [existing] = await d.select(
    `user_daily_state?user_id=eq.${userId}&date=eq.${built.today}&select=id,dco`,
  );
  if (shadow) {
    // Shadow never creates a row: an empty live DCO would blank the app's morning brief.
    if (!existing) return { written: false, reason: 'no live row for today' };
    await d.update(`user_daily_state?id=eq.${existing.id}`, { dco_shadow: built.dco });
    return { written: true, shadow: true };
  }
  // The Worlds headline comes from the latest applied weekly synthesis and holds all week.
  const [synth] = await d.select(
    `synthesis_runs?user_id=eq.${userId}&status=eq.applied&kind=in.(weekly,catch_up)&select=output,completed_at&order=completed_at.desc&limit=1`,
  );
  const carried = synth?.output?.worlds_summary_resolved || existing?.dco?.worlds_summary || null;
  const dco = { ...built.dco, worlds_summary: carried };
  const [row] = await d.upsert(
    'user_daily_state',
    [
      {
        user_id: userId,
        date: built.today,
        dco,
        extraction_raw: {
          pipeline: 'dco-v4',
          attempts: built.attempts,
          input_chars: built.inputChars,
          review_flags: built.problems.length,
          check: built.check?.counts || null,
        },
        expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
        updated_at: nowIso,
      },
    ],
    'user_id,date',
  );
  await invalidateChatCache(env, userId);
  // what each line was written from. The day written again replaces its
  // records, so none outlives its line
  if (row?.id && built.passages) {
    const at = new Date().toISOString();
    const rows = built.passages.map((p) =>
      passageRow({
        userId,
        surface: 'daily',
        table: 'user_daily_state',
        id: row.id,
        field: p.field,
        factIds: p.factIds,
        personIds: p.personIds,
        items: p.items,
        writer: 'daily',
        model: built.dco.model_used,
        promptVersion: DCO_PROMPT_VERSION,
        at,
      }),
    );
    await d
      .remove(`passage_refs?user_id=eq.${userId}&row_table=eq.user_daily_state&row_id=eq.${row.id}`)
      .then(() => recordPassages(d, rows))
      .catch((err) =>
        console.warn(`[DCO v4] could not record what the day rests on: ${err.message}`),
      );
  }
  // what the check did, so the share left out can be watched; the morning
  // never waits on its log
  if (built.check) {
    await d
      .insertQuiet('check_runs', [
        checkRunRow({
          userId,
          job: 'daily',
          day: built.today,
          counts: built.check.counts,
          details: built.check.details,
          model: built.dco.model_used,
        }),
      ])
      .catch((err) => console.warn(`[DCO v4] could not log the check: ${err.message}`));
  }
  return { written: true, shadow: false };
}
