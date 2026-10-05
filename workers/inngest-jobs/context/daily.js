/**
 * Daily Context Object, version 4.
 *
 * Built each morning from: today's calendar and items with their real local
 * times, habit progress this week, the fact ledger (dated, with sources), open
 * questions, recent corrections, the absence snapshot and usage counts. The
 * model decides what matters today and writes the words; code computes the
 * counts and free time, checks every reference, and assembles the row in the
 * shape the app and chat already read, plus a `brief` block for the morning brief.
 *
 * A second, cheaper model then checks every sentence against the inputs. Any
 * sentence it cannot ground is rewritten once, then cleared if it still fails.
 */

import { CARE_RULES, WRITING_RULES, PRIVATE_RULES, personBlock } from '../careRules';
import {
  db,
  userTimezone,
  localDate,
  localDateTime,
  addDays,
  daysBetween,
  weekdayName,
  relativeDay,
  personIdentity,
} from './db';
import { jsonCall, modelFor } from './llm';
import { readDayFrame, emptyFrame, coversToday } from './dayFrame';
import { recentCorrections } from './corrections';
import { loadStory } from './story';
import { invalidateChatCache } from './cache';
import { readThreadReaction } from '../brief/reaction';
import { personNow } from '../../shared/day.js';

export const DCO_PROMPT_VERSION = 'dco-v4-2026-10-01d';

function trim(text, n) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
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
  const weekStart = addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
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
    worlds,
    prevDco,
    corrections,
    pastFacts,
    anyCalendar,
    story,
    recentNotes,
    reaction,
  ] = await Promise.all([
    d.select(
      `synced_calendar_events?owner_id=eq.${userId}&archived=eq.false&start_at=gte.${encodeURIComponent(dayStart)}&start_at=lt.${encodeURIComponent(horizonEnd)}&select=id,title,location,start_at,end_at,is_all_day&order=start_at.asc&limit=200`,
    ),
    // Events that start in the next few days, and ones that started earlier and are still going.
    d.select(
      `notes?owner_id=eq.${userId}&external_source=is.null&subtype=eq.event&archived=eq.false&or=(target_date.gte.${today},end_date.gte.${today})&target_date=lte.${addDays(today, 3)}&select=id,title,body,target_date,event_time,end_date,created_at&order=target_date.asc&limit=50`,
    ),
    d.select(
      `todos?owner_id=eq.${userId}&completed_at=is.null&archived=eq.false&select=id,title,due_day,scheduled_date,locked_in,time_estimate_minutes,priority_kind,created_at,skipped_in_sweep_at&order=due_day.asc.nullslast&limit=1000`,
    ),
    d.select(
      `todos?owner_id=eq.${userId}&completed_at=gte.${encodeURIComponent(dayStart)}&select=id,title&limit=50`,
    ),
    d.select(
      `habits?owner_id=eq.${userId}&archived=eq.false&select=id,name,title,frequency,cadence,target_per_period,subtype&limit=100`,
    ),
    d.select(
      `habit_progress?owner_id=eq.${userId}&occurred_day=gte.${weekStart}&select=habit_id,occurred_day&limit=2000`,
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
      `life_facts?user_id=eq.${userId}&state=in.(current,planned,unconfirmed)&select=id,statement,subject,about_date,about_date_end,state,date_confidence,observed_at,last_confirmed_at,private&order=last_confirmed_at.desc&limit=250`,
    ),
    d.select(
      `life_fact_changes?user_id=eq.${userId}&created_at=gte.${encodeURIComponent(localStartIso(tz, addDays(today, -7)))}&select=fact_id,from_state,to_state,reason,created_at&order=created_at.desc&limit=40`,
    ),
    d.select(
      `gremly_questions?user_id=eq.${userId}&status=in.(open,asked)&select=id,question,choices,created_at,asked_at,fact:life_facts(private)&order=created_at.asc&limit=20`,
    ),
    d.rpc('absence_snapshot', { p_user: userId }),
    d.rpc('usage_rollup', { p_user: userId, p_grain: 'week', p_periods: 5 }),
    d.select(`user_life_map?user_id=eq.${userId}&select=life_map`),
    d.select(
      `worlds?owner_id=eq.${userId}&phase=in.(candidate,active,evolving)&select=id,display_name,name,card_subtitle,phase`,
    ),
    d.select(
      `user_daily_state?user_id=eq.${userId}&date=lt.${today}&dco->>pipeline=not.is.null&select=date,dco&order=date.desc&limit=1`,
    ),
    recentCorrections(env, userId),
    d.select(
      `life_facts?user_id=eq.${userId}&state=in.(happened,changed)&about_date=gte.${addDays(today, -365)}&select=id,statement,about_date,state,state_reason,private&order=about_date.desc&limit=80`,
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
  ]);
  return {
    today,
    weekStart,
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
    worlds,
    prevDco: prevDco?.[0] || null,
    corrections,
    pastFacts: pastFacts || [],
    calendarConnected: (anyCalendar || []).length > 0,
    story: story || [],
    recentNotes: recentNotes || [],
    reaction: reaction || null,
  };
}

/** Build the prompt text and the reference maps the output is checked against. */
export function renderDay(g, tz) {
  const refs = new Map();
  const lines = [];
  const today = g.today;
  const addRef = (prefix, obj) => {
    const ref = `${prefix}${[...refs.keys()].filter((k) => k.startsWith(prefix)).length + 1}`;
    refs.set(ref, obj);
    return ref;
  };

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
      `${ref} | ${relativeDay(startDay, today)} | ${when} | ${trim(c.title, 120)}${c.location ? ` | ${trim(c.location, 60)}` : ''}${cancelled ? ' | cancelled' : ''}`,
    );
    // Cancelled entries were picked out by readTodayCalendar; they are not busy time.
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
    calLines.push(
      `${ref} | ${relativeDay(n.target_date, today)}${ongoing} | ${n.target_date}${n.event_time ? ` ${n.event_time.slice(0, 5)}` : ''}${span} | ${trim(n.title, 120)} | added ${localDateTime(tz, n.created_at)}${words}`,
    );
  }
  const free = freeWindows(todayTimed);
  const meetingsToday = todayTimed.length;

  // Items with a possible claim on today.
  const dueToday = g.openTodos.filter(
    (t) => t.due_day === today || t.scheduled_date === today || t.locked_in,
  );
  const overdue = g.openTodos.filter(
    (t) => t.due_day && t.due_day < today && t.scheduled_date !== today,
  );
  const undated = g.openTodos.filter((t) => !t.due_day && !t.scheduled_date && !t.locked_in);
  const comingUp = g.openTodos
    .filter(
      (t) =>
        (t.due_day && t.due_day > today && t.due_day <= addDays(today, 14)) ||
        (t.scheduled_date && t.scheduled_date > today && t.scheduled_date <= addDays(today, 14)),
    )
    .sort((a, b) => ((a.due_day || a.scheduled_date) < (b.due_day || b.scheduled_date) ? -1 : 1));
  const todoLine = (t, note) => {
    const ref = addRef('t', { type: 'todo', id: t.id, title: t.title });
    return `${ref} | ${trim(t.title, 120)}${t.time_estimate_minutes ? ` | about ${t.time_estimate_minutes} min` : ''}${note ? ` | ${note}` : ''}`;
  };
  const dueLines = dueToday
    .slice(0, 25)
    .map((t) => todoLine(t, t.locked_in ? 'on Today' : 'due today'));
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

  // Habits this week.
  const counts = new Map();
  for (const p of g.progress) counts.set(p.habit_id, (counts.get(p.habit_id) || 0) + 1);
  const daysIntoWeek = daysBetween(g.weekStart, today) + 1;
  const habitLines = g.habits.map((h) => {
    const ref = addRef('h', { type: 'habit', id: h.id, title: h.name || h.title });
    const done = counts.get(h.id) || 0;
    const target = h.cadence === 'daily' ? 7 : h.target_per_period || 1;
    return `${ref} | ${trim(h.name || h.title, 80)} | ${h.subtype === 'break_habit' ? 'breaking a habit' : 'building a habit'} | ${done} of ${target} this week, day ${daysIntoWeek} of 7`;
  });

  // Ledger facts, nearest dates first, then undated.
  const dated = g.facts
    .filter((f) => f.about_date)
    .sort((a, b) => (a.about_date < b.about_date ? -1 : 1));
  const undatedFacts = g.facts.filter((f) => !f.about_date);
  const factLine = (f) => {
    const ref = addRef('f', { type: 'fact', id: f.id, statement: f.statement });
    const when = f.about_date
      ? `${f.about_date}${f.about_date_end ? ` to ${f.about_date_end}` : ''} (${relativeDay(f.about_date, today)})`
      : 'no date';
    return `${ref} | ${f.state}${f.private ? ' [private]' : ''} | ${when} | ${trim(f.statement, 200)} | recorded ${f.observed_at.slice(0, 10)}, last confirmed ${f.last_confirmed_at.slice(0, 10)}`;
  };
  const factLines = [
    ...dated
      .filter((f) => f.about_date >= addDays(today, -14) && f.about_date <= addDays(today, 60))
      .map(factLine),
    ...undatedFacts.slice(0, 60).map(factLine),
  ];

  // Questions about private facts are for conversation, never the brief.
  // A question put to them in the last three days (and skipped or left) waits
  const askedSince = addDays(today, -3);
  const qLines = g.questions
    .filter((q) => !q.fact?.private)
    .filter((q) => !q.asked_at || q.asked_at.slice(0, 10) < askedSince)
    .slice(0, 10)
    .map((q) => {
      const ref = addRef('q', {
        type: 'question',
        id: q.id,
        question: q.question,
        choices: Array.isArray(q.choices) ? q.choices : [],
      });
      return `${ref} | raised ${q.created_at.slice(0, 10)} | ${trim(q.question, 200)}`;
    });

  const a = g.absence || {};
  const wk = g.usage?.periods || [];
  const thisWeek = wk[0] || null;
  const lastWeeks = wk.slice(1);

  const threadLines = [];
  for (const dom of g.lifeMap?.domains || []) {
    for (const t of dom.threads || []) {
      if (t.lifecycle && !['active', 'dormant'].includes(t.lifecycle)) continue;
      threadLines.push(
        `${trim(dom.name, 40)} / ${trim(t.name, 60)} | ${t.status || ''}, ${t.momentum || ''} | last activity ${t.last_activity || 'unknown'} | ${trim(t.summary, 220)}`,
      );
    }
  }

  lines.push(`TODAY: ${weekdayName(today)} ${today}, timezone ${tz}.`);
  lines.push('');
  const away = a.days_away_before_today ?? 0;
  lines.push(
    `RETURNING AFTER TIME AWAY: ${away >= 3 ? `yes, ${away} days away from the app before today` : 'no'}.`,
  );
  lines.push(
    `TIME AWAY (counted from app activity): last active before today ${a.last_active_day_before_today || 'never'}; days away before today: ${a.days_away_before_today ?? 'unknown'}; active today so far: ${a.active_today ? 'yes' : 'no'}; active days in the last 7: ${a.active_days_last_7 ?? 0}, last 30: ${a.active_days_last_30 ?? 0}.`,
  );
  lines.push(
    `APP USE THIS WEEK: ${thisWeek ? `${thisWeek.active_days} active days, ${thisWeek.drops} drops, ${thisWeek.todos_done} todos done, ${thisWeek.habit_checkins} habit check-ins, ${thisWeek.journals} journal entries, ${thisWeek.chat_messages} chat messages, ${thisWeek.sweeps} sweeps, ${thisWeek.fed_days} fed days` : 'none'}. Previous weeks' active days: ${lastWeeks.map((p) => p.active_days).join(', ') || 'none'}.`,
  );
  lines.push('');
  const calendarNote =
    g.calendarConnected === false && !calLines.length
      ? '(no calendar is connected, so nothing is known about their meetings or plans for the day)'
      : '(nothing on the calendar)';
  lines.push(
    `CALENDAR, TODAY AND NEXT 3 DAYS (ref | relative | when | title | place):\n${calLines.join('\n') || calendarNote}`,
  );
  // Worked out in code so the brief never has to count or add up times itself.
  const blocks = busyBlocks(todayTimed);
  lines.push(
    `TODAY'S SHAPE, WORKED OUT FROM THE CALENDAR: ${
      g.calendarConnected === false
        ? 'no calendar is connected, so nothing is known about their meetings, and the day cannot be called open or free'
        : todayTimed.length
          ? `${todayTimed.length} timed ${todayTimed.length === 1 ? 'entry' : 'entries'} (cancelled ones left out); busy ${blocks.map((b) => `${b.from} to ${b.to}`).join(', ')}; clear stretches of 45 minutes or more between 08:00 and 21:00: ${free.map((w) => `${w.from} to ${w.to}`).join(', ') || 'none'}`
          : 'nothing timed on the calendar today'
    }.`,
  );
  lines.push('');
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
  lines.push(
    `DONE TODAY: ${g.doneToday.map((t) => trim(t.title, 60)).join('; ') || 'nothing yet'}`,
  );
  lines.push('');
  lines.push(
    `HABITS THIS WEEK (ref | habit | kind | progress):\n${habitLines.join('\n') || '(none)'}`,
  );
  lines.push('');
  lines.push(
    `WEEKLY INTENTION: ${g.intention ? `"${trim(g.intention.title, 120)}" ${trim(g.intention.body, 300)} (set ${g.intention.created_at.slice(0, 10)})` : '(none set)'}`,
  );
  lines.push(
    `TODAY'S ONE THING (chosen by the person): ${g.brief?.one_thing_id ? `${g.brief.one_thing_type} ${g.brief.one_thing_id}` : '(none chosen)'}`,
  );
  lines.push('');
  lines.push(
    `OTHER NOTES, LAST 3 DAYS (added | title | text):\n${(g.recentNotes || []).map((n) => `${localDateTime(tz, n.created_at)} | ${trim(n.title, 100)}${n.body && trim(n.body, 200) !== trim(n.title, 200) ? ` | ${trim(n.body, 200)}` : ''}`).join('\n') || '(none)'}`,
  );
  lines.push(
    `JOURNAL ENTRIES, LAST 3 DAYS:\n${g.journals.map((j) => `${localDateTime(tz, j.created_at)} | "${trim(j.title, 100)}" ${trim(j.body, 900)}${j.mood?.length ? ` | mood: ${j.mood.join(', ')}` : ''}`).join('\n') || '(none)'}`,
  );
  lines.push('');
  lines.push(
    `LEDGER FACTS (ref | state | date | statement | provenance):\n${factLines.join('\n') || '(none yet)'}`,
  );
  lines.push(
    `WHAT ALREADY HAPPENED OR CHANGED, LAST YEAR (date | state | statement):\n${(g.pastFacts || []).map((f) => `${f.about_date} (${relativeDay(f.about_date, today)}) | ${f.state}${f.private ? ' [private]' : ''} | ${trim(f.statement, 140)}`).join('\n') || '(none)'}`,
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
  const loves = (g.story || [])
    .filter((s) => s.kind === 'pattern')
    .map((s) => `${s.pattern_kind || 'pattern'}: ${trim(s.title, 90)}`);
  const proud = (g.story || [])
    .filter((s) => s.kind === 'proud')
    .map((s) => `${s.period_start || 'undated'}: ${trim(s.title, 90)}`);
  lines.push(
    `WHAT THEY LOVE AND DO OFTEN (from their story): ${loves.slice(0, 12).join('; ') || '(not written yet)'}`,
  );
  lines.push(
    `MOMENTS THEY CAN BE PROUD OF (from their story): ${proud.slice(0, 10).join('; ') || '(not written yet)'}`,
  );
  lines.push('');
  lines.push(
    `LIFE MAP THREADS (domain / thread | state | last activity | summary):\n${threadLines.slice(0, 30).join('\n') || '(none yet)'}`,
  );
  lines.push('');
  lines.push(
    `YESTERDAY'S HEADLINE: ${g.prevDco?.dco?.brief_headline ? `"${g.prevDco.dco.brief_headline}" (${g.prevDco.date})` : '(none)'}`,
  );
  lines.push(g.reaction || "YESTERDAY'S BRIEF: (no brief in Chat yesterday)");

  return {
    text: lines.join('\n'),
    refs,
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
    headline: { type: 'string' },
    day_shape: { type: 'string' },
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
    lead_what: { type: 'string' },
    lead_why_today: { type: 'string' },
    today_focus: { type: 'array', items: { type: 'string' } },
    also_matters: { type: 'array', items: { type: 'string' } },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        properties: { ref: { type: 'string' }, why: { type: 'string' } },
        required: ['ref', 'why'],
      },
    },
    reach_ref: { type: 'string', nullable: true },
    reach_why: { type: 'string', nullable: true },
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
    return_note: { type: 'string', nullable: true },
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
    'reach_fact_refs',
    'anchor_refs',
    'anchor_labels',
    'return_note',
    'voice_note',
  ],
};

function dcoSystemPrompt(person) {
  return `You prepare the start of someone's day for Gremly, a warm, shame-free companion app. What you write appears in the morning brief, on the home screen and in the context every chat reads today.

${personBlock(person)}

${CARE_RULES}

YOUR JOB
- Decide what genuinely matters today and say it plainly. Weigh the calendar, what is due, habits for the week, the weekly intention, recent journal entries and the ledger.
- headline: the notification line that opens the brief. What today looks like, in concrete terms, at most 90 characters. No counts of todos or habits, no feelings, no advice. When little is known about today, name what is true: a quiet day or something genuinely ahead. The headline is only ever about today: it never mentions time away, a return or a welcome back, even for someone returning, because the welcome waits for the brief itself.
- day_shape: one sentence on how full the day is and when the clear stretches are, taken from TODAY'S SHAPE. Use its times as given and never count or add up entries yourself. When no calendar is connected, say only what is due or planned, never that the day is open, clear or free, and leave it empty when nothing is due or planned.
- lead_what and lead_why_today: the one thing that leads today and why it is today's. What leads is what matters most to the person today, which is not always what fills the most time.
- today_focus: up to three short items, each a concrete thing from the inputs. Fewer is fine, and none is fine; never fill it with general advice. also_matters: anything else worth knowing, briefly.
- claims: the items with a real claim on today (due today, on Today, a habit that needs today to stay on track for the week, a calendar entry). Each cites its ref and says why in a few words.
- reach_ref and reach_why: at most one undated item worth suggesting today, only when a ledger fact gives a true reason for today; cite those facts in reach_fact_refs. Otherwise leave it empty.
- anchor_refs: the dated ledger facts happening today or in the next 30 days that are worth keeping in mind, cited by ref, including a trip or travel that starts today or is under way today. Leave out any plan that something in the inputs suggests already happened, moved or fell through, anything with an open question about it, and anything the person corrected.
- anchor_labels: for each anchor you cite, a short name for the occasion itself as it would appear on a countdown chip on the day card: a few words, never a sentence, never about anything private.
- Yesterday's brief tells you how they used yesterday's: what they kept, took out or moved says what fits their days. Let it inform what leads and what has a claim today. Never mention it, and never treat it as a judgement.
- question_ref: at most one of Gremly's open questions, only if it is about something current or ahead and today is a natural day to ask it. A first morning back after time away is a natural day. Otherwise leave it empty.
- return_note: write it when the inputs say they are returning after time away, and leave it empty otherwise. One or two warm lines welcoming them back. It may mention one true thing that is current or genuinely ahead. Never list what they missed or what is overdue, never guess why they were away, and never ask them to catch up.
- voice_note: one line on how Gremly should sound today. On a heavy or uncertain day, Gremly can draw on what they love or on a moment they can be proud of, when one genuinely fits.

${PRIVATE_RULES}
- In the brief that means a private fact is never named in the headline, day shape, lead or focus, and is never a date anchor or the reach. In also matters it may appear in the person's own words when it genuinely bears on today. It can always shape the tone.

VOICE
Warm, plain and forward-looking. Never shame or pressure, never use streak language or the word should, never tell the person how they feel.

${WRITING_RULES}

EVIDENCE
Every concrete claim (a meeting, a time, a task, a person, a date, a plan) must come from the inputs above, with its date read against today. A plan whose date has passed is not upcoming. A plan that looks like something that already happened is not upcoming either. A fact the person corrected is never used.
- Read each calendar entry and event against everything recorded after it was added: a later note or ledger fact that says it was cancelled, moved or done outranks the entry. When an event's own note gives a different day from its date, the day is uncertain; do not state it as today.`;
}

const CHECK_SCHEMA = {
  type: 'object',
  properties: {
    problems: {
      type: 'array',
      items: {
        type: 'object',
        properties: { field: { type: 'string' }, problem: { type: 'string' } },
        required: ['field', 'problem'],
      },
    },
  },
  required: ['problems'],
};

function checkSystemPrompt(person) {
  return `${personBlock(person)}

You check a daily brief written for a person against the inputs it was written from. For each field, decide whether every concrete claim in it is supported by the inputs: meetings, times, tasks, people, places, dates, plans and how near they are. Report a field when it states something the inputs do not support, places a past plan in the future, uses a fact the person corrected, treats a plan or event as on when a later input says it was cancelled, moved or done, mislabels a day or time, reads a gap in app use as a statement about the person's life, uses pronouns for the person other than those given, or uses clinical language. Judge meaning, not wording. Report nothing when a field is sound.

${CARE_RULES}`;
}

function textFields(o) {
  const out = {
    headline: o.headline,
    day_shape: o.day_shape,
    lead_what: o.lead_what,
    lead_why_today: o.lead_why_today,
    reach_why: o.reach_why,
    return_note: o.return_note,
  };
  (o.today_focus || []).forEach((t, i) => (out[`today_focus_${i}`] = t));
  (o.also_matters || []).forEach((t, i) => (out[`also_matters_${i}`] = t));
  (o.claims || []).forEach((c, i) => (out[`claims_${i}_why`] = c.why));
  return out;
}

async function checkDay(env, inputText, output, person) {
  const fields = Object.entries(textFields(output)).filter(([, v]) => v);
  const { output: res } = await jsonCall(env, {
    primary: modelFor(env, 'reader'),
    fallback: modelFor(env, 'readerFallback'),
    system: checkSystemPrompt(person),
    user: `INPUTS:\n${inputText}\n\nBRIEF TO CHECK (field | text):\n${fields.map(([k, v]) => `${k} | ${v}`).join('\n')}`,
    schema: CHECK_SCHEMA,
    maxTokens: 3000,
    effort: 'low',
  });
  return res.problems || [];
}

function clearField(o, field) {
  if (field.startsWith('today_focus_')) o.today_focus[Number(field.split('_')[2])] = null;
  else if (field.startsWith('also_matters_')) o.also_matters[Number(field.split('_')[2])] = null;
  else if (field.startsWith('claims_')) o.claims[Number(field.split('_')[1])] = null;
  else if (field in o) o[field] = null;
  if (field === 'reach_why') o.reach_ref = null;
}

const CANCELLED_SCHEMA = {
  type: 'object',
  properties: { cancelled_refs: { type: 'array', items: { type: 'string' } } },
  required: ['cancelled_refs'],
};

/**
 * Some calendars keep a cancelled meeting and only mark it in the title. A
 * small model picks those out of today's timed entries, so code can work out
 * the shape of the day without counting them as busy.
 */
export async function readTodayCalendar(env, g, tz, today) {
  const timed = g.calendar.filter(
    (c) => !c.is_all_day && localDate(tz, new Date(c.start_at)) === today,
  );
  if (!timed.length) return new Set();
  const byRef = new Map(timed.map((c, i) => [`e${i + 1}`, c.id]));
  const lines = timed.map(
    (c, i) =>
      `e${i + 1} | ${localDateTime(tz, c.start_at).slice(11)} to ${localDateTime(tz, c.end_at).slice(11)} | ${trim(c.title, 160)}`,
  );
  try {
    const { output } = await jsonCall(env, {
      primary: modelFor(env, 'reader'),
      fallback: modelFor(env, 'readerFallback'),
      system:
        "Some calendars keep a meeting after it has been cancelled and show that only in the entry itself. From today's calendar entries, list the refs of the ones that are cancelled and will not happen. When unsure, leave an entry out.",
      user: `TODAY'S TIMED CALENDAR ENTRIES (ref | when | title):\n${lines.join('\n')}`,
      schema: CANCELLED_SCHEMA,
      maxTokens: 1500,
      effort: 'low',
    });
    return new Set((output.cancelled_refs || []).map((r) => byRef.get(r)).filter(Boolean));
  } catch (err) {
    console.warn(`[DCO v4] calendar read failed: ${err.message}`);
    return new Set();
  }
}

// A brief is written again only when one of these fails the check; any other
// field that fails is dropped instead, so most days need one draft.
const MUST_PASS = new Set(['headline', 'lead_what']);

/** Generate, check, retry once if needed, assemble. Returns the DCO object and run notes. */
export async function buildDcoV4(env, userId, { tz: tzIn } = {}) {
  const tz = tzIn || (await userTimezone(env, userId));
  // their day: after midnight it is still yesterday until their day ends, the
  // same day the brief reads (brief/data.js)
  const { today } = await personNow(env, userId, tz);
  const [g, person] = await Promise.all([
    gatherDay(env, userId, tz, today),
    personIdentity(env, userId),
  ]);
  g.cancelledIds = await readTodayCalendar(env, g, tz, today);
  const { text, refs, computed } = renderDay(g, tz);

  const gen = async (extra) =>
    jsonCall(env, {
      primary: modelFor(env, 'daily'),
      fallback: modelFor(env, 'dailyFallback'),
      system: dcoSystemPrompt(person),
      user: extra ? `${text}\n\n${extra}` : text,
      schema: DCO_SCHEMA,
      maxTokens: 6000,
      thinking: 'low',
      effort: 'low',
    });

  // the day's frame (travel and set times) is read beside the brief
  const framePromise = readDayFrame(env, {
    today,
    meetings: computed.timed_today,
    facts: g.facts,
  }).catch((err) => {
    console.warn(`[DCO v4] day frame failed: ${err.message}`);
    return emptyFrame(today, null);
  });
  let { output, model } = await gen();
  let problems = await checkDay(env, text, output, person);
  let attempts = 1;
  if (problems.some((p) => MUST_PASS.has(p.field))) {
    attempts = 2;
    const retry = await gen(
      `A checker found these problems in your first draft. Write the brief again and fix them:\n${problems.map((p) => `- ${p.field}: ${p.problem}`).join('\n')}`,
    );
    output = retry.output;
    model = retry.model;
    problems = await checkDay(env, text, output, person);
  }
  for (const p of problems) clearField(output, p.field);
  // The brief always needs a headline: fall back to a sound line the checker passed.
  if (!output.headline) {
    const fallback = [output.day_shape, output.lead_what].find(
      (t) => typeof t === 'string' && t.trim(),
    );
    output.headline = fallback ? trim(fallback, 120) : null;
  }

  // References must exist; unknown ones are dropped.
  const claims = (output.claims || [])
    .filter(
      (c) =>
        c &&
        refs.has(c.ref) &&
        !(
          refs.get(c.ref).type === 'fact' &&
          g.facts.some((f) => f.private && f.id === refs.get(c.ref).id)
        ),
    )
    .map((c) => ({ ...refs.get(c.ref), why: trim(c.why, 160) }));
  const reachObj =
    output.reach_ref && refs.has(output.reach_ref) && output.reach_why
      ? refs.get(output.reach_ref)
      : null;
  const privateIds = new Set(g.facts.filter((f) => f.private).map((f) => f.id));
  const reachFacts = (output.reach_fact_refs || [])
    .filter((r) => refs.has(r) && refs.get(r).type === 'fact' && !privateIds.has(refs.get(r).id))
    .map((r) => ({ id: refs.get(r).id, statement: refs.get(r).statement }));
  const reach =
    reachObj && reachFacts.length
      ? { ...reachObj, why: trim(output.reach_why, 200), facts: reachFacts }
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
    daysAway != null && daysAway >= 3 && output.return_note
      ? { days_away: daysAway, note: trim(output.return_note, 200) }
      : null;

  // Date anchors are the upcoming facts the model judged to be genuinely ahead.
  const factById = new Map(g.facts.map((f) => [f.id, f]));
  const upcomingFacts = [...new Set(output.anchor_refs || [])]
    .map((r) => refs.get(r))
    .filter((r) => r && r.type === 'fact')
    .map((r) => factById.get(r.id))
    .filter(
      (f) =>
        f &&
        !f.private &&
        f.about_date &&
        (f.about_date >= today || coversToday(f, today)) &&
        f.about_date <= addDays(today, 30) &&
        ['planned', 'current'].includes(f.state),
    )
    .sort((a, b) => (a.about_date < b.about_date ? -1 : 1))
    .slice(0, 8);

  // The chip's few words, per anchor fact (gap 1 of the brief's context handoff)
  const shortLabels = new Map();
  for (const a of output.anchor_labels || []) {
    const r = refs.get(a?.ref);
    const label = trim(a?.short_label, 40);
    if (r?.type === 'fact' && label && !/[.!?]$/.test(label) && label.split(' ').length <= 5)
      shortLabels.set(r.id, label);
  }

  const nowIso = new Date().toISOString();
  const lead = output.lead_what
    ? { what: output.lead_what, why_today: output.lead_why_today || null, detail: output.lead_what }
    : null;
  const focus = (output.today_focus || []).filter(Boolean).slice(0, 3);
  const dco = {
    day_type: output.day_type || null,
    tone: output.tone || null,
    life_moment: null,
    brief_headline: output.headline || null,
    today_focus: focus,
    lead_story: lead,
    voice_note: output.voice_note || null,
    also_matters: (output.also_matters || []).filter(Boolean),
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
      habit_streak_risk: [],
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
    week_recap: [],
    recent_context: {},
    worlds_summary: null,
    brief: {
      headline: output.headline || null,
      day_shape: output.day_shape || null,
      claims,
      reach,
      question,
      return: ret,
    },
    absence: g.absence,
    // Today's calendar entries that are cancelled but still on the calendar.
    // The brief and the app's day card leave these out of the day.
    cancelled_calendar_ids: [...(g.cancelledIds || [])],
    // Travel and set times the day is planned around (context/dayFrame.js)
    day_frame: await framePromise,
    review_flags: problems.map((p) => ({ field: p.field, problem: p.problem })),
    user_id: userId,
    date: today,
    generated_at: nowIso,
    ttl_days: 7,
    model_used: model,
    pipeline: 'dco-v4',
    prompt_version: DCO_PROMPT_VERSION,
  };
  return { dco, today, tz, attempts, problems, inputChars: text.length };
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
  await d.upsert(
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
        },
        expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
        updated_at: nowIso,
      },
    ],
    'user_id,date',
  );
  await invalidateChatCache(env, userId);
  return { written: true, shadow: false };
}
