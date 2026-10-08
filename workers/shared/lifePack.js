/**
 * Their life right now (data fabric stage 4d): what a friend would know about
 * someone on a given day, gathered once for every surface that talks to them,
 * so the brief, today's thread, the wrap up and Ask Gremly all draw on the
 * same picture. What happened yesterday, what falls today, what is close
 * ahead (a yearly date on its next day), what they have said lately, what
 * holds with no date of its own, and the people who come up most.
 *
 * Code only gathers, dates and counts. Which of it matters, and whether to
 * mention any of it, is always the writer's judgment. Private facts and facts
 * about health are kept, marked, for each surface's own rules to handle.
 */

import { addDays, weekdayName } from './db.js';
import { calendarSelects, meetingsFrom } from './calendar.js';
import { asOfToday, nextYearly } from './factTiming.js';

/** Days ahead the pack looks. */
export const AHEAD_DAYS = 21;
/** Days back that count as said lately. */
export const LATELY_DAYS = 10;

const CAP = { yesterday: 8, today: 6, ahead: 10, lately: 8, standing: 12, people: 10 };

const FACT_FIELDS =
  'id,statement,kind,timing,about_date,about_date_end,state,private,health,observed_at,last_confirmed_at,item_table,item_id,item_done,item_archived,item_cancelled,item_gone';

/**
 * Gather the pack for one person on one day.
 * @param d a database client (shared/db.js)
 * @param p.today their day, YYYY-MM-DD
 * @param p.tz their timezone, for yesterday's calendar
 * @returns { yesterday, today, ahead, lately, standing, people }
 */
export async function loadLifePack(d, userId, { today, tz }) {
  // the people are a part of the pack, never the whole of it: a read that
  // fails leaves them out, and says so
  const said = (what) => (err) => {
    console.warn(
      `[ALERT][LifePack] could not read the ${what} for ${userId}: ${err?.message || err}`,
    );
    return [];
  };
  const yesterday = addDays(today, -1);
  const lately = addDays(today, -LATELY_DAYS);
  const [factsRead, synced, noteEvents, quickEvents, peopleRead, ties] = await Promise.all([
    d.select(
      `life_facts_now?user_id=eq.${userId}&state=in.(current,planned,unconfirmed,happened)&select=${FACT_FIELDS}&order=last_confirmed_at.desc&limit=400`,
    ),
    ...calendarSelects(d, userId, tz, yesterday),
    d
      .select(
        `life_people?user_id=eq.${userId}&merged_into=is.null&hidden_at=is.null&select=id,name,relationship&limit=200`,
      )
      .catch(said('people')),
    d
      .select(`life_fact_people?user_id=eq.${userId}&select=person_id&limit=5000`)
      .catch(said('ties')),
  ]);
  // each fact on the day it is true: a yearly one that fell yesterday is
  // yesterday's, any other yearly one on its next day, a standing one undated
  const facts = [];
  const items = new Set();
  for (const f of factsRead || []) {
    // what a gone, archived or cancelled item said is no longer so
    if (f.item_cancelled || f.item_archived || f.item_gone) continue;
    // an item is told once, by its latest fact (they come latest first)
    if (f.item_table && f.item_id) {
      const key = `${f.item_table}:${f.item_id}`;
      if (items.has(key)) continue;
      items.add(key);
    }
    const said = f.about_date ? String(f.about_date).slice(0, 10) : null;
    facts.push(
      f.timing === 'yearly' && said && nextYearly(said, yesterday) === yesterday
        ? { ...f, about_date: yesterday, about_date_end: null, every_year: true }
        : asOfToday(f, today),
    );
  }
  const on = (f) => f.about_date || null;
  const ends = (f) => f.about_date_end || f.about_date;
  const byDate = (a, b) => String(on(a)).localeCompare(String(on(b)));

  const { meetings, allDay } = meetingsFrom({
    synced: synced || [],
    noteEvents: noteEvents || [],
    quickEvents: quickEvents || [],
    tz,
    cancelledIds: new Set(),
  });
  const yesterdayCalendar = [
    ...allDay.map((e) => ({ id: e.id, title: e.title, start: null, end: null })),
    ...meetings.map((m) => ({ id: m.id, title: m.title, start: m.start, end: m.end })),
  ];

  const pick = (list, n) => list.slice(0, n);
  // each fact in one place: what falls on today first, then what ended yesterday
  const todayFacts = facts.filter((f) => on(f) && on(f) <= today && ends(f) >= today);
  const yesterdayFacts = facts.filter((f) => on(f) && ends(f) === yesterday);
  const aheadFacts = facts
    .filter((f) => on(f) && on(f) > today && on(f) <= addDays(today, AHEAD_DAYS))
    .filter((f) => f.state !== 'happened' && !f.item_done)
    .sort(byDate);
  const shown = new Set([...yesterdayFacts, ...todayFacts, ...aheadFacts].map((f) => f.id));
  const latelyFacts = facts.filter(
    (f) =>
      !shown.has(f.id) &&
      f.timing !== 'standing' &&
      String(f.observed_at || '').slice(0, 10) >= lately &&
      // something said lately and far ahead stays out, unless it comes every year
      !(on(f) && on(f) > addDays(today, AHEAD_DAYS) && !f.every_year),
  );
  const standingFacts = facts.filter((f) => f.timing === 'standing');

  // the people who come up most, by how many facts are about them
  const count = new Map();
  for (const t of ties || []) count.set(t.person_id, (count.get(t.person_id) || 0) + 1);
  const people = (peopleRead || [])
    .filter((p) => p.name || p.relationship)
    .map((p) => ({ ...p, facts: count.get(p.id) || 0 }))
    .filter((p) => p.facts > 0)
    .sort((a, b) => b.facts - a.facts)
    .slice(0, CAP.people);

  return {
    today,
    yesterday: {
      calendar: yesterdayCalendar.slice(0, CAP.yesterday),
      facts: pick(yesterdayFacts, CAP.yesterday),
    },
    today_facts: pick(todayFacts, CAP.today),
    ahead: pick(aheadFacts, CAP.ahead),
    lately: pick(latelyFacts, CAP.lately),
    standing: pick(standingFacts, CAP.standing),
    people,
  };
}

/** A time in minutes as people say it: 8am, 8:30pm. */
function clock(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h >= 12 ? 'pm' : 'am'}`;
}

function oneLine(text, n = 200) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

const mark = (f) => (f.private || f.health ? ' [private]' : '');

/**
 * The pack as plain lines for a surface that is not checked line by line
 * (today's thread, the wrap up, Ask Gremly): no refs, each fact marked when
 * it is private, a yearly one said to come every year. Empty sections are
 * left out; nothing at all gives an empty string. A surface that already
 * shows a section from its own reads leaves it out by name (p.leave: any of
 * yesterday, today, ahead, lately, standing, people), so nothing is said twice.
 */
export function lifePackText(pack, { leave = [] } = {}) {
  if (!pack) return '';
  const skip = new Set(leave);
  const fact = (f) =>
    `- ${f.about_date ? `${f.about_date}${f.every_year ? ', every year' : ''}: ` : ''}${oneLine(f.statement)}${mark(f)}`;
  const parts = [];
  const yesterday = addDays(pack.today, -1);
  const y = [
    ...pack.yesterday.calendar.map(
      (c) =>
        `- on their calendar yesterday: ${oneLine(c.title, 100)}${Number.isFinite(c.start) ? `, ${clock(c.start)} to ${clock(c.end)}` : ', all day'}`,
    ),
    ...pack.yesterday.facts.map(fact),
  ];
  if (y.length && !skip.has('yesterday'))
    parts.push(`Yesterday, ${weekdayName(yesterday)} ${yesterday}, already past:\n${y.join('\n')}`);
  if (pack.today_facts.length && !skip.has('today'))
    parts.push(
      `Falls on today, ${weekdayName(pack.today)} ${pack.today}:\n${pack.today_facts.map(fact).join('\n')}`,
    );
  if (pack.ahead.length && !skip.has('ahead'))
    parts.push(`Coming up:\n${pack.ahead.map(fact).join('\n')}`);
  if (pack.lately.length && !skip.has('lately'))
    parts.push(`Said lately:\n${pack.lately.map(fact).join('\n')}`);
  if (pack.standing.length && !skip.has('standing'))
    parts.push(`How their life runs (no date of its own):\n${pack.standing.map(fact).join('\n')}`);
  if (pack.people.length && !skip.has('people'))
    parts.push(
      `The people who come up most:\n${pack.people
        .map((p) =>
          p.name
            ? `- ${p.name}${p.relationship ? `, ${p.relationship}` : ''}`
            : `- their ${p.relationship} (no name given yet)`,
        )
        .join('\n')}`,
    );
  return parts.join('\n');
}
