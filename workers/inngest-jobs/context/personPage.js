/**
 * The page Gremly keeps about someone in a person's life (Worlds rebuild,
 * stage 5): a label on each day about them that matters, and the things to
 * remember about them, written to the person as "you" from the facts the
 * ledger holds about that someone, through the shared check.
 *
 * The page shows their name, who they are to the person and the line about
 * them (personWords.js) from the record itself, and their Chapters, todos and
 * notes from the app's own data. This writer gives it what only words can:
 * what each day is, and what a thoughtful friend would keep in mind.
 *
 * It is written when the page is opened and what it rests on has changed:
 * the facts about them (one put right or changed counts), their name or who
 * they are, the version, or the week, so nothing it says goes stale for long.
 * Otherwise the page kept on the record is returned as it is. A page that
 * cannot be written leaves the one they had.
 *
 * Nothing private or about health is given to the writer, so the page is
 * safe wherever it is seen. The person sees those in their story and in chat.
 *
 * Cortex forwards the signed in person's page (type person-page) to
 * POST /api/person-page. Kept on life_people.page
 * (supabase/migrations/20261020100000_people_page.sql).
 *
 * The model writes the words; code finds the facts, says which days can have
 * a label, and keeps what the check lets stand. It never writes a sentence.
 */

import { CARE_RULES, WRITING_RULES, PRIVATE_RULES, personBlock } from '../careRules';
import { db, personIdentity, weekdayName } from './db';
import { jsonCall, modelFor, effortFor } from './llm';
import { personToday } from './filing';
import { whenTrue, nextYearly } from '../../shared/factTiming.js';
import { whoSaid } from '../../shared/whoSaid.js';
import {
  SENTENCE_SCHEMA,
  STATED_RULES,
  runCheck,
  checkRunRow,
  problemWords,
} from '../../shared/check/index.js';

export const PERSON_PAGE_VERSION = 'person-page-2026-10-20e';

/** When the page is read, for the check (at most 80 characters). */
export const PERSON_PAGE_MOMENT = 'kept on their page about someone, read when they open it';

/** At most this many things to remember. */
export const REMEMBER_MAX = 5;

/** At most this many facts about someone are given, newest first. */
const FACTS_MAX = 40;

/** The states of a fact that still stand. */
const OPEN = ['current', 'planned', 'unconfirmed', 'happened'];

const UUID = /^[0-9a-f-]{36}$/i;

const RULES = `THE PAGE
- You write the page Gremly keeps about someone in the person's life, which the person reads themselves. The someone's name, who they are to the person and a line about them are shown at the top of it, so never write any of those again as a line of their own.
- Write to the person, as you, about the someone, by their name when they have one. Every label and sentence speaks to the person as you, never of them by name or in the third person, however few the records are and even where a record names them. The facts are written about the person in the third person, often without naming them: what a fact says the person did, has or plans is theirs, so tell it to them as you.
- DAYS: some records hold a day about the someone that comes round every year or is still ahead, and are marked as able to take a label. For each occasion among them, write a label: a few words that name the occasion as the person would, to them as you. The day itself is shown beside the label, so the label never gives the day, the date or how far off it is. One label for each occasion, from the record that holds its day, and none for a record not marked.
- THINGS TO REMEMBER: up to five short sentences, each one thing a thoughtful friend would keep in mind about the someone: what they care about, what they like or do not, what is going on in their life, and what the two of them share or have planned. Each by its own particulars, never in general. Leave out who the someone is to the person, and every occasion that has a label: a thing to remember never speaks of an occasion with a label.
- Speak of the someone and of life with them, never of todos, habits, lists or records as such: say what a thing is about, not that it was written down.
- Speak of each thing as its record holds it: something done as done, something meant as something meant, never as under way now. Relate every date to today before you use it.
- The page stays as it is until it is next written, which may be days from now. Say nothing about today, tomorrow or this week, and nothing about how soon or how long ago. How often something comes round, such as every week or every year, is part of what it is and can be said.
- Never describe anyone's feelings for them, never judge how anyone is doing, and never give advice.
- Rest everything on the records given, and say nothing they do not hold. When they are too thin to say anything true and particular, give no things to remember.
- Nothing private or about health is given to you, and the page never speaks of any of it, in any words.`;

const DAY_SCHEMA = {
  type: 'object',
  properties: { day: { type: 'string' }, ...SENTENCE_SCHEMA.properties },
  required: ['day', ...SENTENCE_SCHEMA.required],
};

export const PAGE_SCHEMA = {
  type: 'object',
  properties: {
    days: { type: 'array', items: DAY_SCHEMA },
    remember: { type: 'array', items: SENTENCE_SCHEMA },
  },
  required: ['days', 'remember'],
};

/** The writer's rules. */
export function personPagePrompt(person) {
  return {
    fixed: `You write the page Gremly keeps about someone in a person's life, for Gremly, a warm, shame-free companion app.

${CARE_RULES}

${RULES}

${PRIVATE_RULES}

${WRITING_RULES}

${STATED_RULES}

DAYS IN THE OUTPUT
- For each label, give in day the ref of the record that holds its day, and give that ref in its refs as well.`,
    varying: personBlock(person),
  };
}

/** The same rules, for one label or one sentence again, as the check sends it back. */
export function personPageRewritePrompt(person) {
  return {
    fixed: `${personPagePrompt(person).fixed}

ONCE AGAIN
You are given one label or one sentence you wrote for the page, what was wrong with it, and only the records it rests on. Write it again, so that it says only what those records hold, with its refs and what it states. Cite only the records given here. When nothing true can be said from them, return empty text.`,
    varying: personBlock(person),
  };
}

function trim(text, n) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

const day10 = (v) => (v ? String(v).slice(0, 10) : null);

/**
 * Whether a fact's day can take a label: one that comes round every year, or
 * one still ahead of today. Pure.
 */
export function labelDay(fact, today) {
  const start = day10(fact?.about_date);
  if (!start || fact?.timing === 'standing') return null;
  if (fact.timing === 'yearly') return nextYearly(start, today);
  const end = day10(fact.about_date_end) || start;
  return end >= today ? start : null;
}

/**
 * The writer's input and the records the check holds it to: the someone,
 * and the facts about them, newest first. Pure.
 * @returns {{ text, records: Map, ids: Map, days: Map }} days: the ref of each
 *   fact whose day can take a label, with that day
 */
export function renderPersonPage({ someone, names = [], facts, today }) {
  const records = new Map();
  const ids = new Map();
  const days = new Map();
  const add = (prefix, record, id) => {
    const ref = `${prefix}${[...records.keys()].filter((k) => k.startsWith(prefix)).length + 1}`;
    records.set(ref, { ref, exact: [], ...record, label: `${ref} | ${record.label}` });
    ids.set(ref, id);
    return ref;
  };
  const others = names.filter(
    (n) => n && n.toLowerCase() !== String(someone.name || '').toLowerCase(),
  );
  add(
    'p',
    {
      label: `the someone: ${trim(someone.name, 60) || '(no name given yet)'}${others.length ? `, also called ${others.map((n) => trim(n, 40)).join(', ')}` : ''}${someone.relationship ? `, their ${whoSaid({ ...someone, relationship: trim(someone.relationship, 60) })}` : ', who they are to them is not recorded'}`,
      names: [someone.name, ...others].filter(Boolean),
      exact: ['person'],
    },
    { type: 'person', id: someone.id },
  );
  for (const f of facts) {
    const start = day10(f.about_date);
    const end = day10(f.about_date_end);
    const labelled = labelDay(f, today);
    const ref = add(
      'f',
      {
        label: `fact about the person (${f.state}; ${whenTrue(f, today)}; recorded ${day10(f.observed_at) || 'unknown'})${labelled ? ' [can take a label]' : ''}: ${trim(f.statement, 300)}`,
        dates: [start, end, labelled].filter(Boolean),
        ...(start && end && end !== start ? { spans: [[start, end]] } : {}),
      },
      { type: 'fact', id: f.id },
    );
    if (labelled) days.set(ref, labelled);
  }
  const text = `TODAY: ${weekdayName(today)} ${today}.

WHO READS THE PAGE: the person, so every line speaks to them as you, however little there is to say.

RECORDS:
${[...records.values()].map((r) => r.label).join('\n')}`;
  return { text, records, ids, days };
}

/**
 * What the page rests on, as one short string: the facts given (each with its
 * state and when it last changed), the someone's name and who they are, the
 * version and the week. The page is written again when it differs. Pure.
 */
export function pageSignature({ someone, facts, today }) {
  const monday = (() => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  })();
  const parts = [
    PERSON_PAGE_VERSION,
    monday,
    someone.name || '',
    someone.relationship || '',
    ...facts.map((f) => `${f.id}:${f.state}:${f.updated_at || ''}`).sort(),
  ].join('|');
  // FNV-1a, enough to tell one page's footing from another's
  let h = 0x811c9dc5;
  for (let i = 0; i < parts.length; i++) {
    h ^= parts.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16)}-${facts.length}`;
}

/**
 * The page's words, through the check, from records already read. Writes
 * nothing; the replay calls it as the worker does.
 * @returns {{ days: {fact_id, label}[], remember: {text, fact_ids}[], model, check, problems }}
 */
export async function personPageWords(env, { person, someone, names = [], facts, today }) {
  if (!facts.length) return { days: [], remember: [], model: null, check: null, problems: [] };
  const { text, records, ids, days } = renderPersonPage({ someone, names, facts, today });
  const [primary, fallback] = [modelFor(env, 'personPage'), modelFor(env, 'personPageFallback')];
  const { output, model } = await jsonCall(env, {
    primary,
    fallback,
    system: personPagePrompt(person),
    user: text,
    schema: PAGE_SCHEMA,
    maxTokens: 4000,
    ...effortFor(env, 'person_page'),
  });
  const [wrote, other] = model === fallback.model ? [fallback, primary] : [primary, fallback];
  // a label only on a day that can take one, and one label for each
  const seen = new Set();
  const dayItems = (Array.isArray(output?.days) ? output.days : [])
    .filter((x) => days.has(x?.day) && !seen.has(x.day) && seen.add(x.day))
    .map((x) => ({
      key: `day:${x.day}`,
      day: x.day,
      sentence: {
        text: x.text,
        refs: [...new Set([x.day, ...(Array.isArray(x.refs) ? x.refs : [])])],
        stated: x.stated,
      },
      glanceable: true,
    }));
  const lineItems = (Array.isArray(output?.remember) ? output.remember : [])
    .slice(0, REMEMBER_MAX)
    .map((s, i) => ({ key: `remember:${i}`, sentence: s, glanceable: true }));
  const items = [...dayItems, ...lineItems];
  if (!items.length) return { days: [], remember: [], model, check: null, problems: [] };
  const check = await runCheck({
    items,
    records,
    today,
    moment: PERSON_PAGE_MOMENT,
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
    rewrite: async ({ sentence, records: own, problems }) =>
      (
        await jsonCall(env, {
          primary: wrote,
          fallback: other,
          system: personPageRewritePrompt(person),
          user: `TODAY: ${weekdayName(today)} ${today}.\n\nRECORDS:\n${own.map((r) => r.label).join('\n') || '(none)'}\n\nWHAT YOU WROTE: ${sentence.text}\n\nWHAT WAS WRONG:\n${problems.map((p) => `- ${p}`).join('\n')}`,
          schema: SENTENCE_SCHEMA,
          maxTokens: 1500,
          thinking: 'low',
          effort: 'low',
        })
      ).output,
  });
  const kept = (key) => {
    const r = check.results.get(key);
    const said = r?.sentence?.text ? trim(r.sentence.text, 240) : null;
    if (!said) return null;
    const factIds = r.refs
      .map((x) => ids.get(x))
      .filter((x) => x?.type === 'fact')
      .map((x) => x.id);
    return { text: said, fact_ids: [...new Set(factIds)] };
  };
  // a thing to remember rests on at least one fact, so it goes when that fact does
  const resting = (k) => (k && k.fact_ids.length ? k : null);
  return {
    days: dayItems
      .map((it) => {
        const k = kept(it.key);
        return k ? { fact_id: ids.get(it.day).id, label: k.text } : null;
      })
      .filter(Boolean),
    remember: lineItems.map((it) => resting(kept(it.key))).filter(Boolean),
    model,
    check: { counts: check.counts, details: check.details },
    problems: check.details.map((x) => problemWords(x)),
  };
}

/**
 * The someone a page is for, following a merge to the record that was kept,
 * with the records merged into it. Null when they are not this person's.
 */
export async function loadSomeone(d, userId, personId, { withPage = true } = {}) {
  let id = personId;
  for (let i = 0; i < 4; i++) {
    const [p] =
      (await d.select(
        `life_people?id=eq.${id}&user_id=eq.${userId}&select=id,name,relationship,relationship_by,relationship_fact_id,merged_into,hidden_at${withPage ? ',page' : ''}`,
      )) || [];
    if (!p) return null;
    if (!p.merged_into) {
      const into =
        (await d.select(`life_people?user_id=eq.${userId}&merged_into=eq.${p.id}&select=id`)) || [];
      return { someone: p, ids: [p.id, ...into.map((x) => x.id)] };
    }
    id = p.merged_into;
  }
  return null;
}

/** The someone as the page is written from: without who they are when that came from something private or about health. */
export async function withoutPrivateWho(d, userId, someone) {
  if (!someone?.relationship || !someone.relationship_fact_id) return someone;
  const [f] =
    (await d.select(
      `life_facts?id=eq.${someone.relationship_fact_id}&user_id=eq.${userId}&select=id,private,health`,
    )) || [];
  return f && (f.private || f.health !== false) ? { ...someone, relationship: null } : someone;
}

/** Of the facts about someone, those the page is written from: still standing, neither private nor about health, newest first. Pure. */
export function pageFacts(facts) {
  return (facts || [])
    // about health only when the kinds pass has said it is not
    .filter((f) => OPEN.includes(f.state) && !f.private && f.health === false)
    .sort((a, b) => String(b.observed_at || '').localeCompare(String(a.observed_at || '')))
    .slice(0, FACTS_MAX);
}

/** The facts about them that still stand, neither private nor about health, newest first. */
export async function loadPageFacts(d, userId, ids) {
  const ties =
    (await d.select(
      `life_fact_people?user_id=eq.${userId}&person_id=in.(${ids.join(',')})&select=fact_id&order=created_at.desc&limit=200`,
    )) || [];
  const factIds = [...new Set(ties.map((t) => t.fact_id))];
  if (!factIds.length) return [];
  const facts =
    (await d.select(
      `life_facts_now?user_id=eq.${userId}&id=in.(${factIds.join(',')})&state=in.(${OPEN.join(',')})&select=id,statement,about_date,about_date_end,timing,state,private,health,observed_at,updated_at`,
    )) || [];
  return pageFacts(facts);
}

/**
 * The page for one someone: the one kept when nothing it rests on has
 * changed, otherwise written again and kept. Throws when a model cannot be
 * reached; the page they had stays.
 * @returns {{ person_id, page, fresh, outcome? }}
 */
export async function personPage(env, userId, personId, { dryRun = false } = {}) {
  const d = db(env);
  const found = await loadSomeone(d, userId, personId);
  if (!found) throw new Error('no such person for this person');
  const { ids } = found;
  // who they are, when it came from something private or about health, is never given
  const someone = await withoutPrivateWho(d, userId, found.someone);
  const [today, facts, names] = await Promise.all([
    personToday(env, userId),
    loadPageFacts(d, userId, ids),
    d.select(
      `life_person_names?user_id=eq.${userId}&person_id=in.(${ids.join(',')})&select=name&order=created_at.asc`,
    ),
  ]);
  const sig = pageSignature({ someone, facts, today });
  if (someone.page?.sig === sig) return { person_id: someone.id, page: someone.page, fresh: true };
  const person = await personIdentity(env, userId);
  const words = await personPageWords(env, {
    person,
    someone,
    names: (names || []).map((n) => n.name),
    facts,
    today,
  });
  const at = new Date().toISOString();
  const page = {
    version: PERSON_PAGE_VERSION,
    sig,
    at,
    days: words.days,
    remember: words.remember,
  };
  if (dryRun) return { person_id: someone.id, page, fresh: false, problems: words.problems };
  await d.update(`life_people?id=eq.${someone.id}&user_id=eq.${userId}`, { page });
  if (words.check && (words.check.counts.checked || words.check.counts.left_out))
    await d
      .insertQuiet('check_runs', [
        checkRunRow({
          userId,
          job: 'person_page',
          day: today,
          counts: words.check.counts,
          details: words.check.details,
          model: words.model,
        }),
      ])
      .catch((err) => console.warn(`[PersonPage] could not log the check: ${err.message}`));
  return { person_id: someone.id, page, fresh: false };
}

/**
 * POST /api/person-page { user_id, person_id } (admin key checked upstream;
 * cortex sends it for the signed in person). Only while the pipeline is live
 * for them; otherwise it writes nothing and says why (409).
 * @param deps.mode the pipeline mode for a person (context/functions.js contextMode)
 */
export async function handlePersonPageApi(request, env, corsResponse, { mode = null } = {}) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId =
      typeof body.user_id === 'string' && UUID.test(body.user_id) ? body.user_id : null;
    if (!userId || !UUID.test(String(body.person_id || '')))
      return corsResponse({ error: 'user_id and person_id are required' }, 400);
    if (!mode || mode(env, userId) !== 'on')
      return corsResponse({ error: 'the pipeline is not live for them' }, 409);
    const r = await personPage(env, userId, body.person_id);
    return corsResponse({ ok: true, ...r });
  } catch (e) {
    const msg = String(e?.message || e).slice(0, 300);
    return corsResponse({ error: msg }, msg.startsWith('no such person') ? 404 : 500);
  }
}
