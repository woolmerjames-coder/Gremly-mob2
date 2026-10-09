/**
 * First Worlds (data fabric stage 4b): a new person's first Worlds, made for
 * them without asking. It is the one time Gremly makes something without a
 * tap (James's rule 4).
 *
 * Code decides when (firstWorldsDue): an active person who holds no Worlds
 * (holdsWorlds: none a drop can be filed into, none they put away by hand,
 * and none with anything filed in it), who has
 * dropped something, once they have 5 drops or reach their third day,
 * whichever comes first. Their first day is the day of their first drop. The
 * same holds for a returning person with none, who is past their third day.
 * Worlds are made once: a person who later removes them all is not given new
 * ones. A try that made none is tried again only once they have dropped more.
 *
 * The model reads their items and what Gremly holds about them, and names one
 * to five Worlds, each with a Gremly from the catalogue and the records it
 * rests on. Code checks every ref and slug and writes the Worlds. Then the
 * backfill files what they already have by the filing rules, and the words
 * writer writes each World's line (context/functions.js).
 *
 * Starts: the hourly dispatcher (hourlyContextEvents), and a drop filed while
 * the person has no Worlds (cortex assign-worlds, /api/first-worlds).
 */

import { CARE_RULES, PRIVATE_RULES, WRITING_RULES, personBlock } from '../careRules';
import { db, userTimezone, localDate, daysBetween, weekdayName, personIdentity } from './db';
import { jsonCall, modelFor } from './llm';
import { itemOf, readFacts, readFactPeople, readItemMarks, markItems } from './filed';
import { stateWords } from '../../shared/factTiming.js';
import { oldWorldsFieldsStopped } from '../../shared/worldsFields.js';
import { GREMLY_CATALOG, GREMLY_SLUGS, PLAIN_GREMLY } from '../../shared/gremlys.js';
import { whoSaid } from '../../shared/whoSaid.js';

export const FIRST_WORLDS_VERSION = 'first-worlds-2026-10-07c';

/** What a World made here records as its source. */
export const FIRST_WORLDS_SOURCE = 'first_worlds';

/** Decided by James on 7 Oct: 5 drops or the third day, whichever comes first. */
export const FIRST_WORLDS_START = Object.freeze({ drops: 5, day: 3 });

/** At most this many Worlds. */
export const MOST_FIRST_WORLDS = 5;

/** The events rows that remember a make or a try. */
export const MADE_KIND = 'worlds.first_made';
export const TRIED_KIND = 'worlds.first_tried';

/** Items and facts the model is shown at most. */
const MOST_ITEMS = 80;
const MOST_FACTS = 80;
/** A name longer than this is not a name. */
const NAME_MAX = 40;

// ── when ─────────────────────────────────────────────────────────────────

/**
 * Whether first Worlds are due, and why. Pure: code applies counts and dates.
 * @param s { hasWorlds, made, lastTry: { drops } | null, drops, firstDropDay, today }
 */
export function firstWorldsDue(s) {
  if (s.hasWorlds) return { due: false, why: 'they have Worlds' };
  if (s.made) return { due: false, why: 'first Worlds were made before' };
  if (!s.drops) return { due: false, why: 'nothing dropped yet' };
  if (s.lastTry && (s.lastTry.drops ?? 0) >= s.drops)
    return { due: false, why: 'tried, and nothing dropped since' };
  const day = s.firstDropDay ? daysBetween(s.firstDropDay, s.today) + 1 : 1;
  if (s.drops >= FIRST_WORLDS_START.drops) return { due: true, why: `${s.drops} drops`, day };
  if (day >= FIRST_WORLDS_START.day) return { due: true, why: `day ${day}`, day };
  return { due: false, why: `${s.drops} drops on day ${day}`, day };
}

/**
 * Whether the person is new to Gremly: still within the first days that first
 * Worlds waits for. Only then may one record be enough for a World (James,
 * 7 Oct). Pure.
 */
export function isNewTo(s) {
  if (!s?.firstDropDay || !s.today) return true;
  return daysBetween(s.firstDropDay, s.today) + 1 <= FIRST_WORLDS_START.day;
}

/**
 * The phases of a World a drop can be filed into (context/filing.js loadGraph).
 */
export function livePhases(env) {
  return oldWorldsFieldsStopped(env) ? ['active'] : ['candidate', 'active', 'evolving'];
}

/**
 * Whether one World means its owner holds Worlds. Pure. It does when a drop
 * can be filed into it; when the person put it away by hand (archived), as
 * that was their choice and they are not given new ones; or when something is
 * filed in it. A World Gremly made that holds nothing and that nothing can be
 * filed into (a dormant one, or a suggestion once the old fields stop) does
 * not.
 * @param w { id, phase }
 * @param live the phases a drop can be filed into (livePhases)
 * @param filedIn Set of the ids of Worlds with something filed
 */
export function countsAsWorld(w, live, filedIn = new Set()) {
  return live.includes(w.phase) || w.phase === 'archived' || filedIn.has(w.id);
}

/** Whether a person holds Worlds (countsAsWorld for any of theirs). Pure. */
export function holdsWorlds(worlds, live, filedIn = new Set()) {
  return (worlds || []).some((w) => countsAsWorld(w, live, filedIn));
}

/**
 * The people among these who hold Worlds (holdsWorlds), read in a few queries.
 * @returns Set of owner ids
 */
export async function ownersWithWorlds(env, d, ownerIds) {
  const live = livePhases(env);
  const byOwner = new Map();
  for (let i = 0; i < ownerIds.length; i += 100)
    for (const w of (await d.select(
      `worlds?owner_id=in.(${ownerIds.slice(i, i + 100).join(',')})&select=id,owner_id,phase`,
    )) || [])
      byOwner.set(w.owner_id, [...(byOwner.get(w.owner_id) || []), w]);
  const held = new Set();
  const unsure = [];
  for (const [owner, worlds] of byOwner) {
    if (holdsWorlds(worlds, live)) held.add(owner);
    else unsure.push(...worlds);
  }
  // only for those whose Worlds all fall short: is anything filed in one?
  const filedIn = new Set();
  await Promise.all(
    unsure.map(async (w) => {
      const [link] =
        (await d.select(
          `drop_world_links?owner_id=eq.${w.owner_id}&world_id=eq.${w.id}&select=world_id&limit=1`,
        )) || [];
      if (link) filedIn.add(w.id);
    }),
  );
  for (const [owner, worlds] of byOwner)
    if (!held.has(owner) && holdsWorlds(worlds, live, filedIn)) held.add(owner);
  return held;
}

/** Their drops: what filing files, notes from a calendar left out. */
function dropSelects(userId, cols = 'id,created_at', limit = 500) {
  return [
    [
      'note',
      `notes?owner_id=eq.${userId}&archived=is.false&external_source=is.null&select=${cols.note || cols}&order=created_at.desc&limit=${limit}`,
    ],
    [
      'todo',
      `todos?owner_id=eq.${userId}&archived=is.false&select=${cols.todo || cols}&order=created_at.desc&limit=${limit}`,
    ],
    [
      'habit',
      `habits?owner_id=eq.${userId}&archived=is.false&select=${cols.habit || cols}&order=created_at.desc&limit=${limit}`,
    ],
  ];
}

/** What firstWorldsDue reads, for one person. */
export async function firstWorldsStats(env, userId, { tz = null, at = new Date() } = {}) {
  const d = db(env);
  const zone = tz || (await userTimezone(env, userId));
  const [held, marks, ...drops] = await Promise.all([
    ownersWithWorlds(env, d, [userId]),
    d.select(
      `events?owner_id=eq.${userId}&kind=in.(${MADE_KIND},${TRIED_KIND})&select=kind,payload_json,created_at&order=created_at.desc&limit=20`,
    ),
    ...dropSelects(userId).map(([, path]) => d.select(path)),
  ]);
  const all = drops.flatMap((rows) => rows || []);
  const first = all.reduce(
    (min, r) => (r.created_at && (!min || r.created_at < min) ? r.created_at : min),
    null,
  );
  const lastTry = (marks || []).find((m) => m.kind === TRIED_KIND) || null;
  return {
    hasWorlds: held.has(userId),
    made: (marks || []).some((m) => m.kind === MADE_KIND),
    lastTry: lastTry ? { drops: lastTry.payload_json?.drops ?? 0 } : null,
    drops: all.length,
    firstDropDay: first ? localDate(zone, new Date(first)) : null,
    today: localDate(zone, at),
  };
}

/**
 * The people due first Worlds now, among those active in the last 30 days, as
 * events for the first Worlds job. The event id carries their drop count, so
 * a person is sent once for each count.
 */
export async function firstWorldsEvents(env, at = new Date()) {
  const d = db(env);
  const people = (await d.rpc('get_active_people', { active_days: 30 })) || [];
  if (!people.length) return [];
  const withWorlds = await ownersWithWorlds(
    env,
    d,
    people.map((p) => p.user_id),
  );
  const events = [];
  for (const p of people) {
    if (withWorlds.has(p.user_id)) continue;
    try {
      const s = await firstWorldsStats(env, p.user_id, { tz: p.timezone || null, at });
      if (firstWorldsDue(s).due)
        events.push({
          id: `first-worlds-${p.user_id}-${s.drops}`,
          name: 'app/worlds.first',
          data: { user_id: p.user_id },
        });
    } catch (err) {
      console.warn(
        `[ALERT][FirstWorlds] could not tell whether first Worlds are due for ${p.user_id}: ${err.message}`,
      );
    }
  }
  return events;
}

// ── what the model is asked ─────────────────────────────────────────────

const RULES = `FIRST WORLDS
- Gremly keeps a person's life as Worlds. A World is a lasting part of their life that they come back to: something they do, look after, care about or keep up over time. A single task, a single event, or something with an end of its own is not a World; it belongs inside one. The part of their life it belongs inside is a World, even when it is all the records show of that part.
- This person has no Worlds yet. From their records, name the parts of their life the records show, at least one and at most five. Make as many as the records plainly show and no more.
- For someone new to Gremly, one record that plainly shows a lasting part of their life is enough for a World. For anyone else, a World rests on several records.
- Two Worlds never cover the same part of life. A record that belongs to no lasting part of their life belongs to no World.
- Name each World as they would name that part of their own life, in a few plain words. A World about one person in their life is named for that person, as the records call them.
- A World's name is seen at a glance. It never names a health condition, a treatment, a medication, or anything private. A part of their life that is about their health is named plainly as their health.
- For each World, give the refs of the records it rests on: every record shown that plainly belongs to it, and at least one.
- Choose a Gremly for each World from the Gremlys listed: the one whose look best suits that part of their life. Never one whose look could jar or hurt given what that part of life holds for them. When none suits it well, choose the plain Gremly.
- Say in a few words why each World is a part of their life, from the records.`;

export const FIRST_WORLDS_SCHEMA = {
  type: 'object',
  properties: {
    worlds: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          gremly: { type: 'string', enum: [...GREMLY_SLUGS] },
          rests_on: { type: 'array', items: { type: 'string' } },
          why: { type: 'string' },
        },
        required: ['name', 'gremly', 'rests_on', 'why'],
      },
    },
  },
  required: ['worlds'],
};

export function firstWorldsSystemPrompt(person) {
  return {
    fixed: `You name the first Worlds of someone's life for Gremly, a warm, shame-free companion app.

${CARE_RULES}

${RULES}

${PRIVATE_RULES}

${WRITING_RULES}`,
    varying: personBlock(person),
  };
}

function trim(text, n) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

const KIND_WORDS = { note: 'a note', todo: 'a todo', habit: 'a habit' };
const NOTE_KIND = { journal: 'a journal entry', event: 'an event' };

/**
 * The model's input and the refs it may give. Pure.
 * @param p { items, facts, peopleOf, today }
 */
export function firstWorldsRequest({
  items,
  facts,
  peopleOf = new Map(),
  today,
  isNew = false,
  firstDropDay = null,
}) {
  const refs = new Map();
  const counts = new Map();
  const add = (prefix, obj) => {
    const n = (counts.get(prefix) || 0) + 1;
    counts.set(prefix, n);
    const ref = `${prefix}${n}`;
    refs.set(ref, obj);
    return ref;
  };
  const personRef = new Map();
  const peopleLines = [];
  for (const f of facts)
    for (const p of peopleOf.get(f.id) || []) {
      if (personRef.has(p.id)) continue;
      const ref = add('p', { type: 'person', id: p.id });
      personRef.set(p.id, ref);
      const others = (p.names || []).filter(
        (n) => n.toLowerCase() !== (p.name || '').toLowerCase(),
      );
      peopleLines.push(
        `${ref} | ${p.name || '(no name given yet)'}${others.length ? `, also called ${others.join(', ')}` : ''}${p.relationship ? ` | ${whoSaid(p)}` : ''}`,
      );
    }
  const itemLines = items.map((it) => {
    const ref = add('i', { type: it.type, id: it.id });
    const what =
      it.type === 'note' ? NOTE_KIND[it.subtype] || 'a note' : KIND_WORDS[it.type] || 'an item';
    return `${ref} | ${it.private || it.health ? '[private] ' : ''}${what}${it.done ? `, done ${it.done}` : ''} | ${it.date || 'no day'} | ${trim(it.title, 100)}${it.body && it.body !== it.title ? `: ${trim(it.body, 300)}` : ''}`;
  });
  const factLines = facts.map((f) => {
    const ref = add('f', { type: 'fact', id: f.id });
    const when = f.about_date
      ? `${f.about_date}${f.about_date_end ? ` to ${f.about_date_end}` : ''}`
      : 'no date';
    const who = (peopleOf.get(f.id) || []).map((p) => personRef.get(p.id)).filter(Boolean);
    return `${ref} | ${f.private || f.health ? '[private] ' : ''}${stateWords(f, today)} | ${when} | ${trim(f.statement, 220)}${who.length ? ` | about ${who.join(', ')}` : ''}`;
  });
  const gremlyLines = GREMLY_CATALOG.map(
    (g) => `${g.slug} | ${g.slug === PLAIN_GREMLY ? 'the plain Gremly: ' : ''}${g.visual}`,
  );
  const text = [
    `TODAY: ${weekdayName(today)} ${today}.`,
    `NEW TO GREMLY: ${isNew ? 'yes' : 'no'}${firstDropDay ? `, their first record was on ${firstDropDay}` : ''}.`,
    '',
    'THEIR RECORDS, newest first (ref | what | its day | title and words):',
    itemLines.join('\n') || '(none)',
    '',
    'WHAT GREMLY HOLDS ABOUT THEM (ref | state | when | what | about):',
    factLines.join('\n') || '(none)',
    '',
    'PEOPLE IN THEIR LIFE (ref | name | who they are):',
    peopleLines.join('\n') || '(none)',
    '',
    'THE GREMLYS (slug | how it looks):',
    gremlyLines.join('\n'),
  ].join('\n');
  return { text, refs };
}

/**
 * The Worlds the answer holds, checked: at most five, each with a name, at
 * least one ref it was given, and a Gremly from the catalogue. Pure.
 * @returns {{ worlds: [{ name, gremly, rests_on: [{type,id}], why }], problems: string[] }}
 */
export function decideFirstWorlds(output, refs) {
  const problems = [];
  const seen = new Set();
  const worlds = [];
  for (const w of Array.isArray(output?.worlds) ? output.worlds : []) {
    const name = String(w?.name || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!name) {
      problems.push('a World came back with no name');
      continue;
    }
    if (name.length > NAME_MAX) {
      problems.push(`a name longer than ${NAME_MAX} characters was left out`);
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      problems.push('the same name came back twice');
      continue;
    }
    const restsOn = [...new Set((w.rests_on || []).filter((r) => refs.has(r)))].map((r) =>
      refs.get(r),
    );
    if ((w.rests_on || []).some((r) => !refs.has(r)))
      problems.push('a World named a record it was not given');
    if (!restsOn.length) {
      problems.push('a World rested on no record it was given');
      continue;
    }
    const gremly = GREMLY_SLUGS.includes(w.gremly) ? w.gremly : PLAIN_GREMLY;
    if (gremly !== w.gremly) problems.push('a Gremly not in the catalogue became the plain one');
    seen.add(key);
    worlds.push({ name, gremly, rests_on: restsOn, why: trim(w.why, 200) });
  }
  if (worlds.length > MOST_FIRST_WORLDS) problems.push(`more than ${MOST_FIRST_WORLDS} came back`);
  return { worlds: worlds.slice(0, MOST_FIRST_WORLDS), problems };
}

// ── the run ─────────────────────────────────────────────────────────────

/** Their newest items and what Gremly holds, as the model is shown them. */
export async function loadFirstWorldsRecords(env, userId) {
  const d = db(env);
  const cols = {
    note: 'id,title,body,subtype,date,target_date,created_at',
    todo: 'id,name,title,body,notes,created_at,completed_at',
    habit: 'id,name,title,notes,subtype,created_at',
  };
  const lists = await Promise.all(
    dropSelects(userId, cols, MOST_ITEMS).map(async ([type, path]) =>
      ((await d.select(path)) || []).map((r) => itemOf(type, r)),
    ),
  );
  const items = lists
    .flat()
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, MOST_ITEMS);
  const fromItems = await readFacts(d, userId, items, { limit: MOST_FACTS });
  // and what Gremly holds that came from anywhere else, chat among it
  const others = await d.select(
    `life_facts_now?user_id=eq.${userId}&state=in.(current,planned,unconfirmed,happened)&select=id,statement,subject,about_date,about_date_end,state,observed_at,last_confirmed_at,private,health,item_table,item_id&order=last_confirmed_at.desc&limit=${MOST_FACTS}`,
  );
  const have = new Set(fromItems.map((f) => f.id));
  const facts = [...fromItems, ...(others || []).filter((f) => !have.has(f.id))].slice(
    0,
    MOST_FACTS,
  );
  const [peopleOf, marks] = await Promise.all([
    readFactPeople(d, userId, facts),
    readItemMarks(d, userId, items),
  ]);
  return { items: markItems(items, facts, marks), facts, peopleOf };
}

/** Ask for the Worlds. Writes nothing. */
export async function proposeFirstWorlds(
  env,
  { person, items, facts, peopleOf, today, isNew = false, firstDropDay = null },
) {
  const { text, refs } = firstWorldsRequest({ items, facts, peopleOf, today, isNew, firstDropDay });
  const { output, model, fellBackFrom } = await jsonCall(env, {
    primary: modelFor(env, 'firstWorlds'),
    fallback: modelFor(env, 'firstWorldsFallback'),
    system: firstWorldsSystemPrompt(person),
    user: text,
    schema: FIRST_WORLDS_SCHEMA,
    maxTokens: 6000,
    thinking: 'low',
    effort: 'medium',
  });
  return {
    ...decideFirstWorlds(output, refs),
    model,
    fellBackFrom: fellBackFrom || null,
    inputChars: text.length,
  };
}

/**
 * Make a person's first Worlds when they are due. Checks again just before it
 * writes, so two runs never make two sets.
 * @returns {{ made: [{id, name, gremly}], skipped?: string, problems, model }}
 */
export async function makeFirstWorlds(env, userId, { dryRun = false } = {}) {
  const d = db(env);
  const tz = await userTimezone(env, userId);
  const stats = await firstWorldsStats(env, userId, { tz });
  const due = firstWorldsDue(stats);
  if (!due.due && !dryRun) {
    // a run that wrote its Worlds and stopped before it marked them made (the
    // job's retry lands here): mark them, and hand them on to be filled
    if (stats.hasWorlds && !stats.made) {
      const ours = await d.select(
        `worlds?owner_id=eq.${userId}&source=eq.${FIRST_WORLDS_SOURCE}&select=id,name,mascot_slug&order=created_at.asc`,
      );
      if (ours?.length) {
        await d.insertQuiet('events', [
          {
            owner_id: userId,
            kind: MADE_KIND,
            payload_json: {
              drops: stats.drops,
              day: null,
              worlds: ours.length,
              recovered: true,
              version: FIRST_WORLDS_VERSION,
              problems: [],
            },
          },
        ]);
        return {
          made: ours.map((w) => ({ id: w.id, name: w.name, gremly: w.mascot_slug })),
          recovered: true,
          problems: [],
        };
      }
    }
    return { made: [], skipped: due.why, problems: [] };
  }
  const [person, got] = await Promise.all([
    personIdentity(env, userId),
    loadFirstWorldsRecords(env, userId),
  ]);
  const proposed = await proposeFirstWorlds(env, {
    person,
    ...got,
    today: stats.today,
    isNew: isNewTo(stats),
    firstDropDay: stats.firstDropDay,
  });
  if (dryRun) return { made: [], proposed, stats, problems: proposed.problems };

  // they may have made one by hand while the model was asked
  if ((await ownersWithWorlds(env, d, [userId])).has(userId))
    return { made: [], skipped: 'they have Worlds', problems: proposed.problems };

  const now = new Date().toISOString();
  const rows = proposed.worlds.map((w) => {
    const days = w.rests_on
      .map((r) => got.items.find((it) => it.id === r.id && it.type === r.type)?.date)
      .filter(Boolean)
      .sort();
    return {
      owner_id: userId,
      name: w.name,
      display_name: w.name,
      phase: 'active',
      source: FIRST_WORLDS_SOURCE,
      mascot_slug: w.gremly,
      mascot_slug_source: FIRST_WORLDS_SOURCE,
      mascot_slug_updated_at: now,
      confirmed_at: now,
      first_signal_at: days[0] ? `${days[0]}T12:00:00Z` : null,
    };
  });
  const made = rows.length ? (await d.insert('worlds', rows)) || [] : [];
  await d.insertQuiet('events', [
    {
      owner_id: userId,
      kind: made.length ? MADE_KIND : TRIED_KIND,
      payload_json: {
        drops: stats.drops,
        day: due.day ?? null,
        worlds: made.length,
        model: proposed.model,
        version: FIRST_WORLDS_VERSION,
        problems: proposed.problems,
      },
    },
  ]);
  if (proposed.problems.length)
    console.warn(
      `[ALERT][FirstWorlds] ${proposed.problems.length} problem(s) in the answer for ${userId}: ${[...new Set(proposed.problems)].join('; ')}`,
    );
  return {
    made: made.map((w) => ({ id: w.id, name: w.name, gremly: w.mascot_slug })),
    model: proposed.model,
    problems: proposed.problems,
    why: due.why,
  };
}

/**
 * What filing what they have did, summed over its batches
 * (dropAssignmentBackfill.ts), and whether that is a problem: a skipped run,
 * or every drop skipped. Pure.
 * @returns {{ drops, filed, skipped, problem: string|null }}
 */
export function filedTotals(result) {
  if (!result) return { drops: null, filed: null, skipped: null, problem: 'no backfill ran' };
  if (result.error)
    return { drops: null, filed: null, skipped: null, problem: `it stopped: ${result.error}` };
  const filed = { world: 0, chapter: 0, nowhere: 0, by_them: 0 };
  const skipped = {};
  for (const b of result.batches || []) {
    filed.world += b.filed_world || 0;
    filed.chapter += b.filed_chapter || 0;
    filed.nowhere += b.filed_nowhere || 0;
    filed.by_them += b.person_placed || 0;
    for (const [why, n] of Object.entries(b.skipped || {})) skipped[why] = (skipped[why] || 0) + n;
  }
  const drops = result.drops ?? 0;
  const skippedCount = Object.values(skipped).reduce((a, n) => a + n, 0);
  const problem =
    typeof result.skipped === 'string'
      ? `the whole run was skipped: ${result.skipped}`
      : drops > 0 && skippedCount >= drops
        ? `all ${drops} drops were skipped: ${Object.entries(skipped)
            .map(([w, n]) => `${w} ${n}`)
            .join(', ')}`
        : null;
  return { drops, filed, skipped, problem };
}

/**
 * POST /api/first-worlds { user_id } (admin key checked upstream). Cortex sends
 * it when a drop is filed while the person has no Worlds. Starts the first
 * Worlds job when they are due, and says why or why not.
 */
export async function handleFirstWorldsApi(request, env, corsResponse, { send }) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId =
      typeof body.user_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.user_id)
        ? body.user_id
        : null;
    if (!userId) return corsResponse({ error: 'user_id is required' }, 400);
    const stats = await firstWorldsStats(env, userId);
    const due = firstWorldsDue(stats);
    if (due.due)
      await send(env, [
        {
          id: `first-worlds-${userId}-${stats.drops}`,
          name: 'app/worlds.first',
          data: { user_id: userId },
        },
      ]);
    return corsResponse({ ok: true, due: due.due, why: due.why });
  } catch (e) {
    return corsResponse({ error: String(e?.message || e).slice(0, 300) }, 500);
  }
}
