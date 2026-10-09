/**
 * The corrections replay (data fabric stage 6): a made up person puts four
 * things right, and the correction path in this tree
 * (workers/inngest-jobs/context/corrections.js applyCorrection) applies each
 * to a ledger and the sentences Gremly stored from it, held in memory. Every
 * name and fact here is made up.
 *
 *   scripts/corrections-replay/run.sh [--repeat n] [--only id,id] [--label name]
 *
 * The five: a person's label is corrected, a date is corrected, something is
 * said never to have happened, a line of the day is said not to be so from the
 * brief though nothing in the ledger changes, and something is marked private.
 * And two answers to a question about something Gremly thought but was not
 * sure of (context/unsure.js): a yes, which makes it a fact in their words and
 * confirms it, and a no, which makes no fact of it and closes it.
 *
 * Checked by code: the facts each correction leaves; only the sentences
 * resting on the changed record change, and every one of them does; a private
 * mark takes the fact off every line seen at a glance and leaves the rest as
 * they were; and what each correction costs. Checked by a judge on another
 * model: no sentence written again still says what they put right.
 *
 * The bar, set before the runs: every check on every run, and 1.5 cents or
 * less a correction. Run it on a tree before stage 6 to compare (run.sh
 * --code). OPENAI_API_KEY and GEMINI_TEST_API_KEY come from the environment;
 * the judge is Sol.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeDb, LIFE_SUPABASE_URL } from '../life-replay/fakeDb.mjs';
import { applyCorrection } from '../../workers/inngest-jobs/context/corrections.js';
import { jsonCall } from '../../workers/inngest-jobs/context/llm.js';
import { aiContext, installAiUsageLogging } from '../../workers/shared/aiUsage.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const repeat = Math.max(1, Number(flag('--repeat') || 3));
const only = flag('--only')?.split(',') || null;
const label = flag('--label') || 'corrections';
const USER = '00000000-0000-4000-8000-0000000000bb';
const TZ = 'America/New_York';
const TODAY = '2026-10-08';

// the clock: Thursday 8 October 2026, mid morning in New York
const RealDate = globalThis.Date;
const offset = RealDate.parse('2026-10-08T14:00:00Z') - RealDate.now();
class ReplayDate extends RealDate {
  constructor(...a) {
    if (a.length) super(...a);
    else super(RealDate.now() + offset);
  }
  static now() {
    return RealDate.now() + offset;
  }
}
globalThis.Date = ReplayDate;

const MODEL_HOSTS = ['api.openai.com', 'generativelanguage.googleapis.com', 'api.anthropic.com'];
const realFetch = globalThis.fetch.bind(globalThis);
let current = null;
let usage = [];
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url || String(input);
  if (url.startsWith(LIFE_SUPABASE_URL)) {
    if (new URL(url).pathname.endsWith('/ai_usage')) {
      try {
        const rows = JSON.parse(init.body);
        usage.push(...(Array.isArray(rows) ? rows : [rows]));
      } catch {
        // a row that cannot be read is not counted
      }
      return new Response('', { status: 201 });
    }
    return current.handle(url, init);
  }
  if (MODEL_HOSTS.includes(new URL(url).host)) return realFetch(input, init);
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
installAiUsageLogging();

const env = {
  SUPABASE_URL: LIFE_SUPABASE_URL,
  SUPABASE_SERVICE_KEY: 'replay',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_TEST_API_KEY,
  GOOGLE_API_KEY: process.env.GEMINI_TEST_API_KEY,
};
const cents = (rows) => Math.round(rows.reduce((s, r) => s + (Number(r?.cost_usd) || 0), 0) * 100 * 1000) / 1000;

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const fact = (key, statement, over = {}) => ({
  id: uuid(),
  key,
  user_id: USER,
  statement,
  subject: null,
  kind: 'event',
  timing: 'day',
  state: 'current',
  about_date: null,
  about_date_end: null,
  private: false,
  health: false,
  source_table: 'scope_chat_messages',
  observed_at: '2026-09-01T09:00:00Z',
  last_confirmed_at: '2026-09-01T09:00:00Z',
  ...over,
});

/**
 * A scenario: the facts, the people, and the stored sentences, each with the
 * facts and people it rests on and whether the correction should change it
 * ('change') or leave it ('same').
 */
function scenarios() {
  const book = () => fact('book', 'Noor finished reading a long novel in September.', { state: 'happened', about_date: '2026-09-20' });
  const flat = () => fact('flat', 'Noor is getting her new flat ready to move into in November.', { state: 'planned', about_date: '2026-11-15' });
  return [
    {
      id: 'label',
      look: "A person's label is corrected: Sam is her cousin, not her brother.",
      said: 'Sam is my cousin, not my brother.',
      facts: [
        fact('sam', "Sam is Noor's brother."),
        fact('visit', 'Sam is coming round for dinner on 9 October.', { state: 'planned', about_date: '2026-10-09' }),
        flat(),
        book(),
      ],
      people: [{ key: 'sam', name: 'Sam', relationship: 'brother', fact: 'sam', facts: ['sam', 'visit'] }],
      sentences: [
        { at: 'daily', field: 'lead_story.what', text: 'Your brother Sam comes round for dinner tomorrow', facts: ['sam', 'visit'], people: ['sam'], expect: 'change' },
        { at: 'daily', field: 'brief_headline', text: 'A slow Thursday to start a new book', facts: ['book'], expect: 'same' },
        { at: 'story', kind: 'people', title: 'Sam', body: "Noor's brother Sam is one of the people she sees most.", facts: ['sam'], expect: 'change' },
        { at: 'story', kind: 'milestones', title: 'A long novel finished', body: 'In September Noor finished the long novel she had been reading.', facts: ['book'], expect: 'same' },
        { at: 'chapter', text: 'Getting the new flat ready for November, with her brother Sam helping at weekends.', facts: ['sam', 'flat'], expect: 'change' },
        { at: 'thread', text: 'Reading again, with a long novel finished in September.', facts: ['book'], expect: 'same' },
      ],
      put: { sam: ['corrected', 'changed'] },
      judge: 'that Sam is her brother',
    },
    {
      id: 'date',
      look: 'A date is corrected: the dentist is on the 14th, not the 12th.',
      said: 'The dentist is on the 14th, not the 12th.',
      facts: [fact('dentist', 'Noor has a dentist appointment on 12 October.', { state: 'planned', about_date: '2026-10-12' }), book()],
      people: [],
      sentences: [
        { at: 'daily', field: 'today_focus.0', text: 'Keep 12 October free for the dentist', facts: ['dentist'], expect: 'change' },
        { at: 'daily', field: 'brief_headline', text: 'A slow Thursday to start a new book', facts: ['book'], expect: 'same' },
        { at: 'thread', field: 'recent_update', text: 'A dentist appointment is set for 12 October.', facts: ['dentist'], expect: 'change' },
        { at: 'thread', text: 'Reading again, with a long novel finished in September.', facts: ['book'], expect: 'same' },
      ],
      put: { dentist: ['corrected', 'changed'] },
      added: (f) => f.some((x) => String(x.about_date || '').slice(0, 10) === '2026-10-14'),
      judge: 'that the dentist appointment is on 12 October',
    },
    {
      id: 'never',
      look: 'Something is said never to have happened: the Lisbon trip was cancelled.',
      said: 'I never went to Lisbon, that trip got cancelled.',
      facts: [
        fact('lisbon', 'Noor went to Lisbon for a work trip in September.', { state: 'happened', about_date: '2026-09-14' }),
        fact('work', 'Noor leads the Hartley project at work.', { kind: 'state', timing: 'standing' }),
        book(),
      ],
      people: [],
      sentences: [
        { at: 'story', kind: 'milestones', title: 'Lisbon', body: 'In September Noor went to Lisbon for a work trip.', facts: ['lisbon'], expect: 'change' },
        { at: 'chapter', text: 'A busy season at work, leading the Hartley project, with a work trip to Lisbon in September.', facts: ['lisbon', 'work'], expect: 'change' },
        { at: 'daily', field: 'also_matters.0', text: 'The photos from the Lisbon trip are still waiting to be sorted', facts: ['lisbon'], expect: 'change' },
        { at: 'thread', text: 'Reading again, with a long novel finished in September.', facts: ['book'], expect: 'same' },
      ],
      put: { lisbon: ['corrected'] },
      judge: 'that Noor went to Lisbon',
    },
    {
      id: 'pointed',
      look: 'They say a line of today is not so, from the brief, though nothing in the ledger changes under it.',
      said: 'I already did the food shopping last night.',
      surface: 'brief',
      facts: [book()],
      people: [],
      todos: [
        { key: 'shop', title: 'Do the food shopping' },
        { key: 'pack', title: "Pack for Saturday's trip" },
      ],
      sentences: [
        { at: 'daily', field: 'brief_headline', text: 'A free afternoon once the food shopping is done', facts: [], items: ['shop'], expect: 'change' },
        { at: 'daily', field: 'also_matters.0', text: "Packing for Saturday's trip is still on the list", facts: [], items: ['pack'], expect: 'same' },
      ],
      judge: 'that the food shopping is still to be done',
    },
    {
      id: 'guess-yes',
      look: 'A yes to what Gremly thought but was not sure of: it becomes a fact in her words, and is confirmed.',
      said: 'Yes, a half marathon in March',
      facts: [
        fact('run1', 'Noor ran 14 kilometres on 4 October.', { state: 'happened', about_date: '2026-10-04' }),
        fact('shoes', 'Noor bought new running shoes on 2 October.', { state: 'happened', about_date: '2026-10-02' }),
        book(),
      ],
      people: [],
      sentences: [],
      question: {
        text: 'Are you training for a race at the moment?',
        thought: 'Noor may be training for a race',
        rests: ['run1', 'shoes'],
      },
      expectGuess: 'confirmed',
      factSays: 'that Noor is training for a half marathon in March',
    },
    {
      id: 'guess-no',
      look: 'A no to what Gremly thought but was not sure of: no fact is made of it, and it is closed.',
      said: 'No, I just like running',
      facts: [
        fact('run1', 'Noor ran 14 kilometres on 4 October.', { state: 'happened', about_date: '2026-10-04' }),
        fact('shoes', 'Noor bought new running shoes on 2 October.', { state: 'happened', about_date: '2026-10-02' }),
        book(),
      ],
      people: [],
      sentences: [],
      question: {
        text: 'Are you training for a race at the moment?',
        thought: 'Noor may be training for a race',
        rests: ['run1', 'shoes'],
      },
      expectGuess: 'said_no',
      factNot: 'that Noor is training for a race',
    },
    {
      id: 'private',
      look: 'Something is marked private: her therapy is kept off every card.',
      said: 'Please keep my therapy private.',
      facts: [fact('therapy', 'Noor has therapy on Wednesday evenings.', { kind: 'routine', timing: 'standing' }), book()],
      people: [],
      sentences: [
        { at: 'daily', field: 'brief_headline', text: 'Therapy this evening, then a quiet night in', facts: ['therapy'], expect: 'off' },
        { at: 'daily', field: 'also_matters.0', text: 'Therapy at six, as every Wednesday', facts: ['therapy'], expect: 'same' },
        { at: 'daily', field: 'today_focus.0', text: 'Start the next book tonight', facts: ['book'], expect: 'same' },
        { at: 'chapter', text: 'A steadier autumn, with therapy every Wednesday evening.', facts: ['therapy'], expect: 'same' },
      ],
      privateKeys: ['therapy'],
    },
  ];
}

/** The tables for one run: the ledger, the people, and each stored sentence with its passage record. */
function build(s) {
  const factId = new Map(s.facts.map((f) => [f.key, f.id]));
  const todos = (s.todos || []).map((t) => ({ ...t, id: uuid() }));
  const todoId = new Map(todos.map((t) => [t.key, t.id]));
  const people = s.people.map((p) => ({ ...p, id: uuid() }));
  const personId = new Map(people.map((p) => [p.key, p.id]));
  const dayId = uuid();
  const lmId = uuid();
  const chapterId = uuid();
  const dco = { brief: {}, today_focus: [], also_matters: [], lead_story: null };
  const lifeMap = { domains: [{ name: 'Home', threads: [{ name: 'Reading', summary: '', recent_update: '', evidence: [] }] }] };
  const story = [];
  const chapter = { id: chapterId, owner_id: USER, title: 'The autumn', summary: null, summary_source: 'synthesis', phase: 'active' };
  const refs = [];
  const where = [];
  for (const x of s.sentences) {
    let table;
    let rowId;
    let field;
    let writer;
    let surface;
    if (x.at === 'daily') {
      [table, rowId, field, writer, surface] = ['user_daily_state', dayId, x.field, 'daily', 'daily'];
      const keys = field.split('.');
      if (keys[0] === 'lead_story') dco.lead_story = { ...(dco.lead_story || {}), [keys[1]]: x.text };
      else if (keys.length === 2) dco[keys[0]][Number(keys[1])] = x.text;
      else dco[field] = x.text;
      if (field === 'brief_headline') dco.brief.headline = x.text;
    } else if (x.at === 'story') {
      const id = uuid();
      story.push({ id, user_id: USER, kind: x.kind, title: x.title, body: x.body, state: 'current', private: false, fact_ids: x.facts.map((k) => factId.get(k)) });
      [table, rowId, field, writer, surface] = ['story_items', id, 'body', 'story', 'story'];
      refs.push({ user_id: USER, surface, row_table: table, row_id: id, field: 'title', fact_ids: x.facts.map((k) => factId.get(k)), person_ids: [], items: [], writer });
    } else if (x.at === 'chapter') {
      chapter.summary = x.text;
      [table, rowId, field, writer, surface] = ['chapters', chapterId, 'summary', 'weekly', 'chapter'];
    } else {
      const f = x.field || 'summary';
      lifeMap.domains[0].threads[0][f] = x.text;
      [table, rowId, field, writer, surface] = ['user_life_map', lmId, `domains.0.threads.0.${f}`, 'weekly', 'life_map'];
    }
    refs.push({
      user_id: USER,
      surface,
      row_table: table,
      row_id: rowId,
      field,
      fact_ids: x.facts.map((k) => factId.get(k)),
      person_ids: (x.people || []).map((k) => personId.get(k)),
      items: (x.items || []).map((k) => ({ table: 'todos', id: todoId.get(k) })),
      writer,
    });
    where.push({ x, table, rowId, field });
  }
  const tables = {
    life_facts: s.facts.map(({ key, ...f }) => ({ ...f })),
    life_fact_changes: [],
    life_people: people.map((p) => ({
      id: p.id,
      user_id: USER,
      name: p.name,
      relationship: p.relationship,
      relationship_by: 'gremly',
      relationship_fact_id: factId.get(p.fact) || null,
      merged_into: null,
      hidden_at: null,
    })),
    life_fact_people: people.flatMap((p) => (p.facts || []).map((k) => ({ user_id: USER, fact_id: factId.get(k), person_id: p.id }))),
    passage_refs: refs.map((r, i) => ({ id: i + 1, ...r })),
    user_daily_state: [{ id: dayId, user_id: USER, date: TODAY, dco }],
    user_life_map: [{ id: lmId, user_id: USER, life_map: lifeMap }],
    story_items: story,
    chapters: [chapter],
    worlds: [],
    user_profiles: [
      {
        user_id: USER,
        timezone: TZ,
        identity: { name: 'Noor' },
        profile_text: `Noor lives in Brooklyn and works in design, leading the Hartley project. ${s.facts.map((f) => f.statement).join(' ')} She loves long novels and sings in a choir.`,
      },
    ],
    user_temporal_anchors: [],
    todos: todos.map((t) => ({ id: t.id, owner_id: USER, title: t.title, status: 'active' })),
    gremly_questions: [],
    cortex_preferences: [{ owner_id: USER, day_boundary_hour: 3 }],
    notification_preferences: [{ user_id: USER, timezone: TZ }],
    user_corrections: [],
    scope_chat_messages: [],
  };
  return { tables, where, factId };
}

/** The words a stored sentence has now, from the tables. */
function textNow(mem, w) {
  if (w.table === 'user_daily_state') {
    const dco = mem.tables.user_daily_state[0].dco;
    return w.field.split('.').reduce((o, k) => (o == null ? o : o[/^\d+$/.test(k) ? Number(k) : k]), dco) ?? null;
  }
  if (w.table === 'user_life_map')
    return w.field.split('.').reduce((o, k) => (o == null ? o : o[/^\d+$/.test(k) ? Number(k) : k]), mem.tables.user_life_map[0].life_map) ?? null;
  if (w.table === 'story_items') {
    const it = mem.tables.story_items.find((r) => r.id === w.rowId);
    return it && it.state === 'current' ? it.body : null;
  }
  if (w.table === 'chapters') return mem.tables.chapters[0].summary ?? null;
  return null;
}

const JUDGE = { provider: 'openai', model: 'gpt-6-sol', effort: 'low' };
const JUDGE_SCHEMA = {
  type: 'object',
  properties: { still_says: { type: 'boolean' }, what: { type: 'string' } },
  required: ['still_says', 'what'],
};

async function stillSays(text, claim, said) {
  const { output } = await jsonCall(env, {
    primary: JUDGE,
    system: `You check one sentence a companion app wrote about a person after they corrected something. Decide whether the sentence still says, or plainly implies, the claim they corrected. A sentence that says what is now true, or says nothing about it, does not.\n\nReturn only JSON: {"still_says": true or false, "what": "the words that do, or empty"}`,
    user: `WHAT THEY SAID: "${said}"\nTHE CLAIM THEY CORRECTED: ${claim}\n\nTHE SENTENCE: ${text}`,
    schema: JUDGE_SCHEMA,
    maxTokens: 800,
  });
  return output;
}

async function runOne(s, i) {
  const { tables, where, factId } = build(s);
  const cid = uuid();
  // a correction from the brief names the message they marked, as the app sends it
  const brief = s.surface === 'brief';
  // an answer to a question about what Gremly thought arrives as a correction about that question
  const qid = s.question ? `7a7a7a7a-7a7a-4a7a-8a7a-${String(++n).padStart(12, '0')}` : null;
  const uid = s.question ? uuid() : null;
  if (s.question) {
    tables.life_unsure = [{ id: uid, user_id: USER, person_id: null, kind: 'life', thinks: s.question.thought, status: 'open', rests_on: s.question.rests.map((k) => ({ table: 'life_facts', id: factId.get(k) })) }];
    tables.gremly_questions.push({
      id: qid,
      user_id: USER,
      kind: 'unsure',
      question: s.question.text,
      status: 'asked',
      record_table: 'life_unsure',
      record_id: uid,
      proposed_change: { type: 'unsure', unsure_id: uid },
      rests_on: s.question.rests.map((k) => ({ table: 'life_facts', id: factId.get(k) })),
    });
  }
  tables.user_corrections.push({
    id: cid,
    user_id: USER,
    said: s.said,
    surface: s.question ? 'question' : brief ? 'brief' : 'chat',
    target_kind: brief ? 'chat' : null,
    target_ref: s.question ? { id: qid } : brief ? { id: uuid(), kind: 'chat', text: where.map((w) => w.x.text).join('. ') } : null,
    status: 'received',
    created_at: '2026-10-08T13:55:00Z',
  });
  current = fakeDb(tables, { person_identity: () => [{ first_name: 'Noor', pronouns: 'she/her', identity: { name: 'Noor' } }] });
  const before = where.map((w) => textNow(current.mem, w));
  usage = [];
  const started = RealDate.now();
  const runId = `corrections-replay-${s.id}-${i}`;
  let result;
  try {
    result = await aiContext.run({ env, worker: 'replay', job: 'correction', userId: USER, runId }, () => applyCorrection(env, cid, runId));
  } catch (err) {
    return { id: s.id, i, ok: false, error: String(err?.stack || err).slice(0, 600), checks: [] };
  }
  await new Promise((r) => setTimeout(r, 400));
  const spent = cents(usage);
  const facts = current.mem.tables.life_facts;
  const stateOf = (k) => facts.find((f) => f.id === factId.get(k));
  const after = where.map((w) => textNow(current.mem, w));
  const checks = [];
  for (const [k, states] of Object.entries(s.put || {}))
    checks.push({ name: `${k} put right`, ok: states.includes(stateOf(k)?.state), detail: stateOf(k)?.state });
  for (const k of s.privateKeys || []) checks.push({ name: `${k} kept private`, ok: stateOf(k)?.private === true });
  if (s.added) checks.push({ name: 'what is true kept with its day', ok: s.added(facts.filter((f) => f.source_table === 'user_corrections')) });
  const moved = [];
  where.forEach((w, j) => {
    const changed = after[j] !== before[j];
    if (w.x.expect === 'same') {
      if (changed) moved.push(`${w.table} ${w.field} changed though it does not rest on what changed`);
    } else if (!changed) moved.push(`${w.table} ${w.field} stayed as it was`);
    if (w.x.expect === 'off' && after[j]) {
      const r = current.mem.tables.passage_refs.find((p) => p.row_table === w.table && p.field === w.field);
      if (r && r.fact_ids.includes(factId.get('therapy'))) moved.push(`${w.table} ${w.field} still rests on the private fact`);
    }
  });
  checks.push({ name: 'only the sentences resting on what changed change, and every one does', ok: !moved.length, detail: moved.join('; ') });
  if (s.question) {
    const u = current.mem.tables.life_unsure[0];
    checks.push({ name: `what Gremly thought is ${s.expectGuess}`, ok: u.status === s.expectGuess, detail: u.status });
    checks.push({ name: 'the question is answered', ok: current.mem.tables.gremly_questions.find((q) => q.id === qid)?.status === 'answered' });
    const made = facts.filter((f) => f.source_table === 'user_corrections');
    if (s.factSays) {
      const says = [];
      for (const f of made) says.push((await stillSays(f.statement, s.factSays, s.said)).still_says);
      checks.push({ name: 'their yes is kept as a fact', ok: says.some(Boolean), detail: made.map((f) => f.statement).join(' | ') || 'no fact' });
    }
    if (s.factNot) {
      const says = [];
      for (const f of made) says.push((await stillSays(f.statement, s.factNot, s.said)).still_says);
      checks.push({ name: 'no fact says what they said is not so', ok: !says.some(Boolean), detail: made.map((f) => f.statement).join(' | ') });
    }
  }
  if (s.privateKeys) {
    const storyPrivate = current.mem.tables.story_items.every((it) => it.private || !it.fact_ids.some((id) => s.privateKeys.map((k) => factId.get(k)).includes(id)));
    checks.push({ name: 'a story item resting on it is kept private too', ok: storyPrivate });
  }
  const judged = [];
  if (s.judge)
    for (const [j, w] of where.entries())
      if (w.x.expect === 'change' && after[j]) {
        const v = await stillSays(after[j], s.judge, s.said);
        judged.push({ field: `${w.table} ${w.field}`, text: after[j], ...v });
      }
  const still = judged.filter((v) => v.still_says);
  checks.push({ name: 'no sentence written again still says what they put right', ok: !still.length, detail: still.map((v) => `${v.field}: ${v.what}`).join('; ') });
  checks.push({ name: '1.5 cents or less', ok: spent <= 1.5, detail: `${spent}` });
  return {
    id: s.id,
    i,
    ms: RealDate.now() - started,
    cents: spent,
    ok: checks.every((c) => c.ok),
    checks,
    result,
    texts: where.map((w, j) => ({ where: `${w.table} ${w.field}`, expect: w.x.expect, before: before[j], after: after[j] })),
  };
}

const all = scenarios();
const chosen = only ? all.filter((s) => only.includes(s.id)) : all;
const runs = [];
// one at a time: every run has the clock and the fetch to itself
for (const s of chosen) for (let i = 1; i <= repeat; i++) runs.push(await runOne(s, i));

const L = [`# Corrections replay (${label}), ${repeat} runs each`, ''];
for (const r of runs) {
  L.push(`- ${r.ok ? 'ok  ' : 'FAIL'} ${r.id} ${r.i}${r.cents != null ? ` | ${r.cents} cents | ${Math.round((r.ms || 0) / 1000)}s` : ''}${r.error ? `: ERROR ${r.error.split('\n')[0]}` : ''}`);
  for (const c of r.checks) if (!c.ok) L.push(`    missed: ${c.name}${c.detail ? ` (${String(c.detail).slice(0, 300)})` : ''}`);
  for (const t of r.texts || []) if (t.before !== t.after) L.push(`    ${t.where} [${t.expect}]: ${t.after == null ? '(cleared)' : t.after}`);
}
const ok = runs.filter((r) => r.ok).length;
const spent = runs.filter((r) => r.cents != null).map((r) => r.cents);
L.push('', `${ok} of ${runs.length} pass every check; ${spent.length ? `${Math.round((spent.reduce((a, b) => a + b, 0) / spent.length) * 1000) / 1000} cents a correction on average, at most ${Math.max(...spent)}` : ''}`);
const dir = join(HERE, 'out', label);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'runs.json'), JSON.stringify(runs, null, 2));
writeFileSync(join(dir, 'report.md'), L.join('\n'));
console.log(L.join('\n'));
console.log(`out: ${dir}`);
