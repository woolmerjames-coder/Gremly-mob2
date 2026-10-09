/**
 * The ledger review (data fabric stage 4f): Gremly reads everything it holds
 * about one person and puts to them what only they can settle. Nothing in the
 * ledger changes here; every proposal is a question, and only their answer
 * changes anything (context/corrections.js applyTidyAnswer).
 *
 * Two things are looked for, each a judgment the model makes:
 * - two facts that cannot both be true, such as an occasion on two days: a
 *   question (kind fact) that settles it, weighed by how much it matters.
 *   Never from their calendar, which keeps its own entries;
 * - plans whose days have passed with nothing to say what happened: a tidy up
 *   that asks whether they happened, each plan named to them in their words.
 *
 * It no longer offers to set aside facts as not about their life (8 Oct):
 * asking someone whether what they wrote down is part of their life told them
 * Gremly did not think so, and it could not tell building something from
 * trying the app out. A fact they want gone, they say so (corrections.js).
 *
 * Code only counts, caps and writes: no private or health fact is ever put in
 * a tidy up or a question here, a fact already put to them is never put again,
 * and a run adds at most a few questions, never a pile.
 */

import { addDays, db, personIdentity, userTimezone } from './db';
import { jsonCall, modelFor, effortFor } from './llm';
import { LIFE_MAP_RULES, lifeMapSection, loadLifeMapLines } from './lifeMap';
import { CARE_RULES, PRIVATE_RULES, WRITING_RULES, personBlock } from '../careRules';
import { personNow } from '../../shared/day.js';
import { questionWeight } from '../../shared/questionRules.js';
import { questionRoom } from './questionRoom';

export const REVIEW_PROMPT_VERSION = 'review-2026-10-18b';

/** Facts read for one review; a ledger with more says so, and the least lately confirmed are left out. */
export const REVIEW_FACTS = 800;
/** Questions a run may add, each kind at most. */
export const REVIEW_CAPS = Object.freeze({ conflicts: 2, passed: 1 });
/** Facts one tidy up may hold. */
export const TIDY_MOST = 8;
/** No new tidy up while this many are waiting. */
export const TIDY_WAITING_MOST = 2;
/** Days after its last day before a plan is asked whether it happened: the brief and the wrap up ask after what is recent. */
export const PASSED_AFTER_DAYS = 7;

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    conflicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fact_refs: { type: 'array', items: { type: 'string' } },
          question: { type: 'string' },
          choices: { type: 'array', items: { type: 'string' } },
          matters: { type: 'string', enum: ['needs', 'helps'] },
          topic: { type: 'string' },
          why: { type: 'string' },
        },
        required: ['fact_refs', 'question', 'choices', 'matters', 'topic', 'why'],
      },
    },
    passed: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fact_refs: { type: 'array', items: { type: 'string' } },
          // each plan named to them, in the order of fact_refs
          lines: { type: 'array', items: { type: 'string' } },
          question: { type: 'string' },
          yes: { type: 'string' },
          no: { type: 'string' },
          topic: { type: 'string' },
        },
        required: ['fact_refs', 'lines', 'question', 'yes', 'no', 'topic'],
      },
    },
  },
  required: ['conflicts', 'passed'],
};

function oneLine(text, n = 220) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

const FROM = {
  synced_calendar_events: 'their calendar',
  todos: 'a todo',
  notes: 'a note',
  habits: 'a habit',
  scope_chat_messages: 'a chat',
  weekly_reviews: 'a weekly review',
  gremly_questions: 'an answer to Gremly',
};

/** The item a fact is about, when it states the item itself. */
const ITEM = {
  synced_calendar_events: 'the calendar entry',
  todos: 'the todo',
  notes: 'the note',
  habits: 'the habit',
};

function reviewSystemPrompt(today, person, { lifeMap = false } = {}) {
  return `You look over the ledger of facts Gremly, a companion app, keeps about one person, and find what only they can settle. You change nothing: everything you find is put to them as a question, and only their answer changes anything.

TODAY'S DATE: ${today}

${personBlock(person)}

${CARE_RULES}
${lifeMap ? `\n${LIFE_MAP_RULES}\n` : ''}
WHAT YOU ARE SHOWN
- Every fact the ledger holds about them, each with its kind, when it is true, its state, its date and where it came from. A standing fact holds with no date of its own; a yearly one comes round on its day each year.
- The questions already put to them. Never find again what one of them already asks.

FACTS THAT CANNOT BOTH BE TRUE (conflicts)
- Two or more facts that cannot all be true at once. A plan made around an occasion and the occasion's own day are not a conflict; nor are plans on different days, nor something that was true and has since changed, as the dates show.
- For each, one short, friendly question that settles it, in plain words, naming what the ledger holds without saying where it came from, and two to four short answers they could tap, each settling it one way. Then, shown to them under the question, where each version came from in one short sentence: where and roughly when they said it, in words about their own days, never about the ledger, its records or how the app works, and without quoting them.
- Say how much the answer matters. needs: until it is answered Gremly holds two versions of something still ahead, or would soon say something wrong. helps: it would let Gremly know them better, and nothing is wrong without it. An occasion that comes every year always bears on what is ahead.
- Only what bears on their life now or ahead; a difference about something long past stays as it is.
- Never a fact from their calendar: their calendar keeps its own entries, and two of them are never Gremly's to question.
- The question asks about their life as a friend would, never about what Gremly has written down or holds.

PLANS WHOSE DAYS HAVE PASSED (passed)
- Plans still marked planned whose last day is at least ${PASSED_AFTER_DAYS} days before today, with nothing in the ledger to say what happened. A plan about one of their own items itself, or one from their calendar, is never asked about here: the item or the calendar already says whether it was done or went ahead. Group them, a few to a group and never more than ${TIDY_MOST}. For each group, one short question that asks whether they happened, a yes and a no of at most four words each, and the facts in it. Leave out a plan whose outcome they would rather not be asked about.
- In lines, name each plan in the group, in the order of its refs, in a few words to them as they would say it: never in the third person, never as the ledger words it.

EVERY QUESTION
- Written to them as Gremly, in the first person, short and warm.
- A topic for each: what it is about in two to four words, as they would name it, shown in the list of what is still to come and beside their answer.
- Within each list, put first what is most worth their time.
- In a group of plans, the yes does what is asked to every one and the no leaves every one of them as it is, so group only plans the same answer fits.
- A fact goes in one question at most.

Fewer is better than many: only what is worth their time. Cite facts only by their refs.

${PRIVATE_RULES}

${WRITING_RULES}

Return only the structured result.`;
}

/** The request for one person's review, and the refs that name the facts. */
export function reviewRequest({ today, person, facts, waiting = [], lifeMap = [] }) {
  const ref = new Map();
  const lines = facts.map((f, i) => {
    const r = `f${i + 1}`;
    ref.set(r, f);
    const when =
      f.timing === 'standing'
        ? 'standing'
        : f.timing === 'yearly'
          ? `every year on ${String(f.about_date || '').slice(5, 10) || 'an unknown day'}`
          : f.about_date
            ? `${String(f.about_date).slice(0, 10)}${f.about_date_end ? ` to ${String(f.about_date_end).slice(0, 10)}` : ''}`
            : 'no date';
    const from = `${FROM[f.source_table] || 'what they said'}${f.item_table ? `, about ${ITEM[f.item_table] || 'an item they keep'} itself` : ''}`;
    return `${r} | ${f.kind || 'no kind'} | ${when} | ${f.state}${f.private || f.health ? ' [private]' : ''} | from ${from} | ${oneLine(f.statement)}`;
  });
  return {
    system: reviewSystemPrompt(today, person, { lifeMap: lifeMap.length > 0 }),
    user: `FACTS (ref | kind | when it is true | state | where it came from | statement):
${lines.join('\n') || '(none)'}

QUESTIONS ALREADY PUT TO THEM:
${waiting.length ? waiting.map((q) => `- ${oneLine(q.question, 200)}`).join('\n') : '(none)'}${lifeMap.length ? `\n\n${lifeMapSection(lifeMap)}` : ''}`,
    ref,
  };
}

/** A stable key for a set of facts, so the same set is never put to them twice. */
export function factsKey(kind, ids) {
  return `${kind}:${[...ids].sort().join(',')}`.slice(0, 500);
}

/** Whether a plan's last day is far enough behind today to ask whether it happened. */
function longPast(f, today) {
  const last = String(f.about_date_end || f.about_date || '').slice(0, 10);
  return !!last && !!today && last <= addDays(today, -PASSED_AFTER_DAYS);
}

/** The facts a question already put to them rests on, by id. */
function askedFacts(questions) {
  const ids = new Set();
  for (const q of questions || []) {
    for (const r of Array.isArray(q.rests_on) ? q.rests_on : [])
      if (r && r.table === 'life_facts' && r.id) ids.add(r.id);
    if (q.about_fact_id) ids.add(q.about_fact_id);
  }
  return ids;
}

/**
 * The rows a model's review becomes: capped, only facts that exist, never a
 * private or health fact, never one already put to them. Pure.
 */
export function reviewRows({
  output,
  ref,
  userId,
  runId,
  today = null,
  already = new Set(),
  keys = new Set(),
  tidyWaiting = 0,
}) {
  const open = (refs) => {
    const facts = [...new Set(refs || [])].map((r) => ref.get(r)).filter(Boolean);
    return facts;
  };
  const clean = (facts) => facts.every((f) => !f.private && !f.health && !already.has(f.id));
  // a set asked before, or already asked in this run, is never asked again
  const seen = new Set(keys);
  // a fact goes in one question of a run at most
  const used = new Set();
  const overlaps = (facts) => facts.some((f) => used.has(f.id));
  const rows = [];
  const skipped = { private_or_asked: 0, capped: 0, repeated: 0, overlap: 0, calendar: 0, unnamed: 0 };
  const fromCalendar = (f) =>
    f.source_table === 'synced_calendar_events' || f.item_table === 'synced_calendar_events';
  // conflicts
  for (const c of output?.conflicts || []) {
    const facts = open(c.fact_refs);
    if (facts.length < 2 || !String(c.question || '').trim()) continue;
    // their calendar keeps its own entries: never Gremly's to question
    if (facts.some(fromCalendar)) {
      skipped.calendar++;
      continue;
    }
    if (!clean(facts)) {
      skipped.private_or_asked++;
      continue;
    }
    const key = factsKey(
      'conflict',
      facts.map((f) => f.id),
    );
    if (seen.has(key)) {
      skipped.repeated++;
      continue;
    }
    if (overlaps(facts)) {
      skipped.overlap++;
      continue;
    }
    if (rows.filter((r) => r.kind === 'fact').length >= REVIEW_CAPS.conflicts) {
      skipped.capped++;
      continue;
    }
    rows.push({
      user_id: userId,
      kind: 'fact',
      question: oneLine(c.question, 300),
      choices: (c.choices || [])
        .map((x) => oneLine(x, 40))
        .filter(Boolean)
        .slice(0, 4),
      weight: questionWeight(c.matters),
      topic: oneLine(c.topic, 60) || null,
      why: oneLine(c.why, 200) || null,
      status: 'open',
      about_fact_id: facts[0].id,
      rests_on: facts.map((f) => ({ table: 'life_facts', id: f.id })),
      proposed_change: null,
      no_key: key,
      run_id: runId,
      prompt_version: REVIEW_PROMPT_VERSION,
    });
    seen.add(key);
    for (const f of facts) used.add(f.id);
  }
  // tidy ups: at most a few waiting at once
  let tidyRoom = Math.max(0, TIDY_WAITING_MOST - tidyWaiting);
  {
    const type = 'happened';
    let made = 0;
    const cap = REVIEW_CAPS.passed;
    for (const g of output?.passed || []) {
      // each plan with the words that name it to them, in the order given;
      // only plans whose days are well past, never one about an item they
      // keep or from their calendar: the item or the calendar says how it stands
      const named = new Map();
      (g.fact_refs || []).forEach((r, k) => {
        const line = oneLine(Array.isArray(g.lines) ? g.lines[k] : '', 160);
        if (!named.has(r)) named.set(r, line);
      });
      const facts = open(g.fact_refs).filter(
        (f) => f.state === 'planned' && !f.item_table && !fromCalendar(f) && longPast(f, today),
      );
      if (!facts.length || !String(g.question || '').trim()) continue;
      const lineOf = new Map(
        [...named].map(([r, line]) => [ref.get(r)?.id, line]).filter(([id]) => id),
      );
      // a plan never named to them in their words is not put to them in the ledger's
      if (facts.some((f) => !lineOf.get(f.id))) {
        skipped.unnamed++;
        continue;
      }
      if (!clean(facts)) {
        skipped.private_or_asked++;
        continue;
      }
      if (facts.length > TIDY_MOST || made >= cap || tidyRoom <= 0) {
        skipped.capped++;
        continue;
      }
      const key = factsKey(
        type,
        facts.map((f) => f.id),
      );
      if (seen.has(key)) {
        skipped.repeated++;
        continue;
      }
      if (overlaps(facts)) {
        skipped.overlap++;
        continue;
      }
      const yes = oneLine(g.yes, 40);
      const no = oneLine(g.no, 40);
      if (!yes || !no) continue;
      rows.push({
        user_id: userId,
        kind: 'tidy',
        question: oneLine(g.question, 300),
        choices: [yes, no],
        weight: 'helps',
        topic: oneLine(g.topic, 60) || null,
        why: null,
        status: 'open',
        about_fact_id: null,
        rests_on: facts.map((f) => ({ table: 'life_facts', id: f.id })),
        proposed_change: {
          type,
          fact_ids: facts.map((f) => f.id),
          yes,
          no,
          // what they are asked about, named to them, for the screen that asks
          statements: facts.map((f) => lineOf.get(f.id)),
          // every one came from their calendar, which keeps them whatever they answer
          from_calendar: facts.every(
            (f) =>
              f.source_table === 'synced_calendar_events' ||
              f.item_table === 'synced_calendar_events',
          ),
        },
        no_key: key,
        run_id: runId,
        prompt_version: REVIEW_PROMPT_VERSION,
      });
      seen.add(key);
      for (const f of facts) used.add(f.id);
      made++;
      tidyRoom--;
    }
  }
  return { rows, skipped };
}

/** A model's review with each ref given as the fact it names. */
function proposedWords(output, ref) {
  const words = (refs) =>
    (refs || []).map((r) => {
      const f = ref.get(r);
      return f
        ? `${f.id.slice(0, 8)} ${f.state}${f.item_table ? ' item' : ''} ${f.about_date || ''} ${oneLine(f.statement, 160)}`
        : `${r} unknown`;
    });
  const out = {};
  for (const k of ['conflicts', 'passed'])
    out[k] = (output?.[k] || []).map((g) => ({ question: g.question, facts: words(g.fact_refs) }));
  return out;
}

/**
 * Review one person's ledger. In shadow the rows it would write are returned
 * and nothing is written.
 */
export async function reviewLedger(env, userId, { shadow = false, runId = null } = {}) {
  const d = db(env);
  const tz = await userTimezone(env, userId);
  const { today } = await personNow(env, userId, tz);
  const [facts, questions, person, lifeMap] = await Promise.all([
    d.select(
      `life_facts_now?user_id=eq.${userId}&state=in.(current,planned,unconfirmed,happened)&select=id,statement,kind,timing,state,about_date,about_date_end,private,health,source_table,item_table,last_confirmed_at&order=last_confirmed_at.desc&limit=${REVIEW_FACTS}`,
    ),
    d.select(
      `gremly_questions?user_id=eq.${userId}&select=id,kind,question,status,about_fact_id,rests_on,no_key&order=created_at.desc&limit=500`,
    ),
    personIdentity(env, userId),
    loadLifeMapLines(env, d, userId, 'review'),
  ]);
  if (facts.length >= REVIEW_FACTS)
    console.warn(
      `[ALERT][Review] ${userId} has more facts than one review reads (${REVIEW_FACTS}): the least lately confirmed are left out`,
    );
  const waiting = questions.filter((q) => ['open', 'asked'].includes(q.status));
  const { system, user, ref } = reviewRequest({ today, person, facts, waiting, lifeMap });
  const { output, model } = await jsonCall(env, {
    primary: modelFor(env, 'review'),
    fallback: modelFor(env, 'reviewFallback'),
    system,
    user,
    schema: REVIEW_SCHEMA,
    // the whole ledger is weighed before a word is written: at 8000 the
    // reasoning on 400 facts ran out before the answer (shadow, 8 October)
    maxTokens: 24000,
    ...effortFor(env, 'review', { effort: 'medium', thinking: 'medium' }),
  });
  const run = runId || `review-${userId.slice(0, 8)}-${Date.now()}`;
  const { rows, skipped } = reviewRows({
    output,
    ref,
    userId,
    runId: run,
    today,
    already: askedFacts(questions),
    keys: new Set(questions.map((q) => q.no_key).filter(Boolean)),
    tidyWaiting: waiting.filter((q) => q.kind === 'tidy').length,
  });
  const out = {
    model,
    facts: facts.length,
    found: {
      conflicts: (output?.conflicts || []).length,
      passed: (output?.passed || []).length,
    },
    written: shadow ? 0 : rows.length,
    skipped,
    shadow,
  };
  // in shadow, what the model proposed, in the ledger's words, to judge the review by
  // only as many as there is room for, the most pressing first: the
  // conflicts that need an answer, then those that help, then the tidy ups
  const order = { needs: 0, helps: 1 };
  rows.sort((a, b) => (a.kind === 'tidy') - (b.kind === 'tidy') || (order[a.weight] ?? 2) - (order[b.weight] ?? 2));
  const room = await questionRoom(d, userId);
  out.room = room;
  if (shadow) return { ...out, rows, proposed: proposedWords(output, ref) };
  const kept = rows.slice(0, room);
  out.written = kept.length;
  out.no_room = rows.length - kept.length;
  if (kept.length) await d.insertQuiet('gremly_questions', kept);
  return out;
}
