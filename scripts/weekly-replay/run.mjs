/**
 * The weekly replay (data fabric stage 5): the weekly pass that ships
 * (context/weekly.js) and the summary written from its plan
 * (summaryFromPass.ts), run over made up weeks (scenarios.mjs) with the real
 * models, before any change to their prompts or models is deployed.
 *
 *   scripts/weekly-replay/run.sh pass --model sonnet|luna|sol|sol61 [--repeat n] [--only a,b] [--label x]
 *   scripts/weekly-replay/run.sh judge --from <pass dir>
 *       the checks that need a model on another provider: each note on a
 *       person asked the check's words question, and a judge reading the
 *       plan's character and line for private and health matters
 *   scripts/weekly-replay/run.sh summary --from <pass dir> --writer sonnet|luna|sol [--label x]
 *       the summary from each plan: written, checked, written again once,
 *       finished. Claude and the check's model are not always reachable from
 *       one machine, so a run picks up where the last left off: it writes
 *       what has no deck yet when it can reach the writer, and checks what
 *       has not been checked when it can reach the check's model
 *   scripts/weekly-replay/run.sh summary-judge --from <summary dir>
 *   scripts/weekly-replay/run.sh prompt --from <pass dir> --file <run file>
 *   scripts/weekly-replay/run.sh answer --needs <needs.json> --replies <replies.json>
 *       Claude's answers for a shadow weekly-summary run (scripts/shadow)
 *       made where Claude cannot be reached
 *       the summary writer's input for one plan, as it is sent
 *
 * Checks on the pass, by code: every ref it cites is one it was given, of the
 * kind the field takes; its cards are as many as the week holds; each card
 * rests on something; no note on a person rests on a private fact or one about
 * health; and its result applies in shadow. On the summary: a deck stands for
 * every week, and what the check left out. The judge reads what code cannot.
 *
 * Keys come from .audit-keys.local or the environment (scripts/chat-audit/keys.mjs).
 * Output goes to scripts/weekly-replay/out/ (gitignored): made up data only.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keys } from '../chat-audit/keys.mjs';
import { fakeDb, LIFE_SUPABASE_URL } from '../life-replay/fakeDb.mjs';
import { callJudge } from '../week-replay/judge.mjs';
import { SCENARIOS, USER, at } from './scenarios.mjs';
import { aiContext, installAiUsageLogging } from '../../workers/shared/aiUsage.js';
import {
  applyWeekly,
  chapterEndPlan,
  weeklyRequestParams,
  weeklyShapeProblems,
  WEEKLY_PROMPT_VERSION,
} from '../../workers/inngest-jobs/context/weekly.js';
import { anthropicJsonResult, jsonCall } from '../../workers/inngest-jobs/context/llm.js';
import { wordsRequest } from '../../workers/shared/check/words.js';
import { loadFacts } from '../../workers/inngest-jobs/factsLoader.ts';
import { factsForPlan, planBrief } from '../../workers/inngest-jobs/summaryFromPass.ts';
import {
  buildPlanWriterPrompt,
  callPlanWriter,
  checkDeck,
  checkIsClean,
  finishDeck,
  heroOnly,
  rewriteDeck,
  withHero,
  writePlannedDeck,
  wrongCards,
} from '../../workers/inngest-jobs/summaryPlanWriter.ts';
import { sanitizeDeckProse } from '../../workers/inngest-jobs/summaryWriter.ts';
import { writeQuestionSet, PERSON_QUESTIONS_VERSION } from '../../workers/inngest-jobs/context/peopleQuestions.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const step = args[0];
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const MODELS = {
  sonnet: { provider: 'anthropic', model: 'claude-sonnet-5-5' },
  luna: { provider: 'openai', model: 'gpt-6-luna' },
  sol: { provider: 'openai', model: 'gpt-6-sol' },
  sol61: { provider: 'openai', model: 'gpt-6.1-sol' },
  flash: { provider: 'google', model: 'gemini-3.8-flash' },
};
const CHECK = { provider: 'openai', model: 'gpt-6-luna' };
const JUDGE = { provider: 'openai', model: 'gpt-6-sol', effort: 'low' };
const reach = {
  anthropic: !!keys.anthropic,
  openai: !!keys.openai,
  google: !!keys.gemini,
};

// ── the clock, the database and the cost ──────────────────────────────────

const RealDate = globalThis.Date;
let offset = 0;
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
const setClock = (iso) => {
  offset = RealDate.parse(iso) - RealDate.now();
};

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
  OPENAI_API_KEY: keys.openai,
  GEMINI_API_KEY: keys.gemini,
  GOOGLE_API_KEY: keys.gemini,
  ANTHROPIC_API_KEY: keys.anthropic,
  CONTEXT_PIPELINE: 'on',
  // as it ships: a Chapter forming is offered as a question (wrangler.toml)
  CHAPTER_QUESTIONS: 'on',
};

const cents = (rows) =>
  Math.round(rows.reduce((s, r) => s + (Number(r?.cost_usd) || 0), 0) * 100 * 1000) / 1000;
const tokens = (rows) =>
  rows.reduce(
    (s, r) => ({
      in: s.in + (Number(r?.input_tokens) || 0),
      out: s.out + (Number(r?.output_tokens) || 0),
    }),
    { in: 0, out: 0 },
  );

function dbFor(s) {
  return fakeDb(JSON.parse(JSON.stringify(s.tables)), s.rpc);
}
const within = async (fn, job) =>
  aiContext.run({ env, worker: 'replay', job, userId: USER, runId: `replay-${RealDate.now()}` }, fn);

const chosen = () => {
  const only = flag('--only');
  return only ? SCENARIOS.filter((s) => only.split(',').includes(s.id)) : SCENARIOS;
};
const outDir = (kind) => {
  const dir = join(HERE, 'out', `${kind}-${flag('--label') || new RealDate().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
// a directory named without a path is one under out/, so two machines can share runs by name
const dirArg = (name) => {
  const v = flag(name);
  return v && !isAbsolute(v) && !v.includes('/') ? join(HERE, 'out', v) : v;
};

// ── the pass ──────────────────────────────────────────────────────────────

/** The checks on one pass result that code can make. */
export function checkPass(s, output, refsSnapshot) {
  const refs = new Map(refsSnapshot);
  const keyOf = new Map([
    ...s.tables.life_facts.map((f) => [f.id, f.key]),
    ...s.tables.life_people.map((p) => [p.id, p.key]),
  ]);
  const checks = [];
  const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail });
  const shape = weeklyShapeProblems(output);
  add('the result is whole', !shape.length, shape.join('; '));
  const plan = output?.summary_plan;
  add('a plan', plan && typeof plan === 'object');
  add('the week has a character and a line', String(plan?.character || '').trim() && String(plan?.through_line || '').trim());
  const cards = Array.isArray(plan?.cards) ? plan.cards : [];
  const [lo, hi] = s.truth.cards;
  add(`${lo} to ${hi} cards`, cards.length >= lo && cards.length <= hi, `${cards.length}`);
  const bad = [];
  // what they added lately is what they added, like their list (18 Oct)
  const KINDS = ['fact', 'journal', 'person', 'count', 'item', 'lately'];
  for (const [i, c] of cards.entries())
    for (const r of c?.refs || []) if (!KINDS.includes(refs.get(r)?.type)) bad.push(`card ${i} ${r}`);
  add('every ref on a card is one it was given, of a kind a card rests on', !bad.length, bad.join('; '));
  const empty = cards.filter((c) => !(c?.refs || []).some((r) => KINDS.includes(refs.get(r)?.type)));
  add('every card rests on something', !empty.length, `${empty.length}`);
  const privateKeys = new Set([...s.truth.private, ...s.truth.health]);
  // the entries a private fact was read from are as private as the fact
  const privateEntries = new Set(
    s.tables.life_facts.filter((f) => privateKeys.has(f.key) && f.source_table === 'notes').map((f) => f.source_id),
  );
  const onPrivate = cards.filter((c) =>
    (c?.refs || []).some((r) => {
      const x = refs.get(r);
      return (
        (x?.type === 'fact' && privateKeys.has(keyOf.get(x.id))) ||
        (x?.type === 'journal' && privateEntries.has(x.id)) ||
        (['item', 'lately'].includes(x?.type) && (x.private || x.health))
      );
    }),
  );
  add('no card rests on anything private or about health', !onPrivate.length, onPrivate.map((c) => c.about).join('; '));
  const notes = Array.isArray(output?.people_notes) ? output.people_notes : [];
  const notePeople = notes.map((x) => refs.get(x.person_ref));
  add('every note is on a person it was given', notePeople.every((p) => p?.type === 'person'));
  const privateNotes = notes.filter((x) =>
    (x.refs || []).some((r) => privateKeys.has(keyOf.get(refs.get(r)?.id))),
  );
  // the person's own ref beside their note is no harm
  const badNoteRefs = notes.flatMap((x) =>
    (x.refs || []).filter((r) => !['fact', 'journal', 'person', 'item', 'lately'].includes(refs.get(r)?.type)),
  );
  add('every note rests on facts, entries and list items it was given', !badNoteRefs.length, badNoteRefs.join(' '));
  add('no note on a person rests on a private or health fact', !privateNotes.length, privateNotes.map((x) => x.note).join(' | '));
  // a week whose facts and journal speak of no one says so (truth.noted false)
  add('a note on each person the week is about', notes.length > 0 || !s.tables.life_people.length || s.truth.noted === false, `${notes.length}`);
  // what Gremly is not sure of yet, and who matters most (context/unsure.js)
  const unsure = Array.isArray(output?.not_sure) ? output.not_sure : [];
  const aboutBad = unsure.filter((x) => x.about_ref !== 'self' && refs.get(x.about_ref)?.type !== 'person');
  add('what Gremly is not sure of is about them or someone it was given', !aboutBad.length, aboutBad.map((x) => x.thinks).join(' | '));
  const restsPrivate = unsure.filter((x) =>
    (x.refs || []).some((r) => {
      const y = refs.get(r);
      return (
        (y?.type === 'fact' && privateKeys.has(keyOf.get(y.id))) ||
        (y?.type === 'journal' && privateEntries.has(y.id)) ||
        y?.private ||
        y?.health
      );
    }),
  );
  add('nothing Gremly is not sure of rests on anything private or about health', !restsPrivate.length, restsPrivate.map((x) => x.thinks).join(' | '));
  const recorded = unsure.filter((x) => x.kind === 'who' && refs.get(x.about_ref)?.relationship);
  add('no guess at who someone is once it is recorded', !recorded.length, recorded.map((x) => x.thinks).join(' | '));
  const matters = Array.isArray(output?.who_matters) ? output.who_matters : [];
  add('who matters names only people it was given', matters.every((r) => refs.get(r)?.type === 'person'), matters.join(' '));
  // the people on each Chapter, kept only through facts it cites that can be shown
  const onChapters = (output?.chapters || []).flatMap((c) => c?.people_refs || []);
  add('everyone on a Chapter is someone it was given', onChapters.every((r) => refs.get(r)?.type === 'person'), onChapters.join(' '));
  for (const [key, want] of Object.entries(s.truth.chapterPeople || {})) {
    const chapterId = s.tables.chapters.find((c) => c.key === key)?.id;
    const c = (output?.chapters || []).find((x) => refs.get(x.chapter_ref)?.id === chapterId);
    const got = new Set((c?.people_refs || []).map((r) => refs.get(r)?.id));
    for (const k of want) add(`${k} is on the ${key} Chapter`, got.has(s.tables.life_people.find((p) => p.key === k)?.id));
  }
  // a Chapter still under way is given no end
  for (const key of s.truth.chapterOpen || []) {
    const chapterId = s.tables.chapters.find((c) => c.key === key)?.id;
    const kept = chapterEndPlan({ output, refs }).find((x) => x.chapter_id === chapterId && !x.refused);
    add(`the ${key} Chapter is given no end`, !kept, kept ? `ends ${kept.end_date}` : '');
  }
  for (const [key, want] of Object.entries(s.truth.chapterEnds || {})) {
    const chapterId = s.tables.chapters.find((c) => c.key === key)?.id;
    const c = (output?.begun_for || []).find((x) => refs.get(x.chapter_ref)?.id === chapterId);
    const kept = chapterEndPlan({ output, refs }).find((x) => x.chapter_id === chapterId);
    add(`the ${key} Chapter ends on ${want}`, kept?.end_date === want && !kept.refused, `begun for ${c?.fact_ref || 'nothing'}: ${kept?.end_date || 'no day'}${kept?.refused ? `, refused: ${kept.refused}` : ''}`);
  }
  // a Chapter forming (18 Oct): offered when one is, resting only on what
  // belongs to it, in its World and on its own days; none when none is
  if (s.truth.forming) {
    const want = s.truth.forming;
    const rowKey = new Map(
      [...s.tables.todos, ...s.tables.notes, ...s.tables.worlds, ...s.tables.life_facts]
        .filter((r) => r.key)
        .map((r) => [r.id, r.key]),
    );
    const f = (output?.chapter_forming || [])[0];
    // what grows inside a Chapter they have may be noticed there instead: its
    // notes rest on it (want.noticedIn, the Chapter's key)
    const inChapter = want.noticedIn ? s.tables.chapters.find((c) => c.key === want.noticedIn)?.id : null;
    const notedThere = inChapter
      ? (output?.chapters || []).some(
          (c) => refs.get(c.chapter_ref)?.id === inChapter && (c.card_fact_refs || []).some((r) => (want.told || []).includes(rowKey.get(refs.get(r)?.id))),
        )
      : false;
    if (!want.offered) add('nothing offered as a Chapter forming', !f, f ? `offered "${f.title}"` : '');
    else if (!f && want.noticedIn) add(`noticed in the ${want.noticedIn} Chapter, or offered as its own`, notedThere, notedThere ? 'noticed in its notes' : 'neither');
    else {
      add('a Chapter forming is offered', !!f, f ? `"${f.title}"` : 'none');
      if (f) {
        const rests = (f.rests_on || []).map((r) => refs.get(r));
        const factKeys = rests.filter((x) => x?.type === 'fact').map((x) => rowKey.get(x.id));
        const itemKeys = rests.filter((x) => x && x.type !== 'fact').map((x) => rowKey.get(x.id));
        add(
          'it rests only on what belongs to it',
          rests.every(Boolean) && itemKeys.every((k) => want.from.includes(k)) && factKeys.every((k) => (want.told || []).includes(k)),
          [...factKeys, ...itemKeys].map((k) => k || 'something else').join(', '),
        );
        add('it rests on what they told Gremly, or on two or more things they added', factKeys.length > 0 || itemKeys.length >= 2, `${factKeys.length} told, ${itemKeys.length} added`);
        if (want.world) add(`it is in the ${want.world} World`, rowKey.get(refs.get(f.world_ref)?.id) === want.world, rowKey.get(refs.get(f.world_ref)?.id) || f.world_ref);
        const days = [f.start_date, f.end_date].filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x || '')));
        add('its dates are its own', days.every((x) => x >= want.within[0] && x <= want.within[1]), days.join(' to ') || 'none given');
      }
    }
  }
  if (s.truth.unsure) {
    for (const key of s.truth.unsure.who || []) {
      const id = s.tables.life_people.find((p) => p.key === key)?.id;
      add(`a guess at who ${key} is`, unsure.some((x) => x.kind === 'who' && refs.get(x.about_ref)?.id === id));
    }
    if (s.truth.unsure.life) add('something about their life it is not sure of', unsure.some((x) => x.kind === 'life'));
  }
  return checks;
}

async function runPass() {
  const m = MODELS[flag('--model') || 'sonnet'];
  if (!m) throw new Error(`no model ${flag('--model')}`);
  if (!reach[m.provider]) throw new Error(`${m.provider} cannot be reached from here`);
  const repeat = Math.max(1, Number(flag('--repeat')) || 1);
  // runs started side by side number their files from --start
  const start = Math.max(1, Number(flag('--start')) || 1);
  const dir = outDir(`pass-${flag('--model') || 'sonnet'}`);
  const lines = [`# Weekly pass replay, ${m.model}, ${WEEKLY_PROMPT_VERSION}, ${repeat} runs each`, ''];
  for (const s of chosen())
    for (let i = start; i < start + repeat; i++) {
      current = dbFor(s);
      usage = [];
      setClock(at(s.periodEnd, '15:00'));
      const started = RealDate.now();
      let rec;
      try {
        rec = await within(async () => {
          const p = await weeklyRequestParams(env, USER, s.periodEnd);
          let output;
          if (m.provider === 'anthropic') {
            const res = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': keys.anthropic,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify(p.params),
            });
            const text = await res.text();
            if (!res.ok) throw new Error(`Anthropic ${res.status}: ${text.slice(0, 300)}`);
            output = anthropicJsonResult(JSON.parse(text));
          } else {
            output = (await jsonCall(env, { primary: m, ...p.jsonArgs, effort: 'medium' })).output;
          }
          // the pass's own cost, then its notes through the check (stage 7), counted apart
          const passUsage = usage.length;
          const applied = await applyWeekly(env, USER, output, p.refsSnapshot, {
            shadow: true,
            runId: `replay-${i}`,
            today: p.today,
          });
          const checkCents = cents(usage.slice(passUsage));
          return {
            input_chars: p.inputChars,
            refs: p.refsSnapshot,
            counts: p.g.counts,
            output,
            // the notes as the check left them, which is what would be kept
            checked: applied.output,
            // what Gremly is not sure of, as code would keep it (context/unsure.js)
            unsure_plan: applied.unsure || null,
            // the people on each Chapter, as code would keep them
            chapter_people: applied.chapterPeople || null,
            check: {
              counts: applied.check?.counts ?? null,
              left_out: applied.check?.left_out ?? [],
              cents: checkCents,
              details: (applied.check?.details || []).map((x) => ({
                key: x.key,
                outcome: x.outcome,
                first: (x.first || []).map((y) => y.say),
                ...(x.second ? { second: x.second.map((y) => y.say) } : {}),
                texts: x.texts,
              })),
            },
            applied: applied.applied,
          };
        }, 'replay-weekly');
      } catch (err) {
        rec = { error: String(err?.stack || err).slice(0, 1500) };
      }
      await new Promise((r) => setTimeout(r, 300));
      // the code checks read what would be kept; what the model wrote is kept beside it
      const checks = rec.error ? [] : checkPass(s, rec.checked || rec.output, rec.refs);
      const rawChecks = rec.error ? [] : checkPass(s, rec.output, rec.refs);
      rec = {
        scenario: s.id,
        i,
        model: m.model,
        ms: RealDate.now() - started,
        cents: cents(usage),
        tokens: tokens(usage),
        checks,
        raw_checks: rawChecks,
        ...rec,
      };
      writeFileSync(join(dir, `${s.id}-${i}.json`), JSON.stringify(rec, null, 2));
      const failed = checks.filter((c) => !c.ok);
      lines.push(`- ${rec.error ? 'ERROR' : failed.length ? 'FAIL ' : 'ok   '} ${s.id} ${i} | ${rec.cents} cents | ${rec.tokens.in} in, ${rec.tokens.out} out${rec.error ? ` | ${rec.error.split('\n')[0]}` : ''}`);
      for (const c of failed) lines.push(`    missed: ${c.name}${c.detail ? ` (${c.detail.slice(0, 200)})` : ''}`);
      if (!rec.error && rec.check) {
        const c = rec.check;
        lines.push(`    check: ${c.counts ? `${c.counts.checked} read, ${c.counts.sent_back} sent back, ${c.counts.left_out} left out, ${c.counts.held_by_second ?? 0} held by the second reader` : 'not run'} | ${c.cents} cents`);
        for (const x of c.details) lines.push(`    ${x.outcome}: ${x.key}: ${[...(x.first || []), ...(x.second || [])].join('; ').slice(0, 220)}`);
        for (const x of rawChecks.filter((y) => !y.ok)) lines.push(`    the model alone missed: ${x.name}`);
      }
      if (!rec.error) {
        const plan = (rec.checked || rec.output).summary_plan || {};
        lines.push(`    character: ${plan.character} | line: ${plan.through_line}`);
        for (const c of plan.cards || []) lines.push(`    card: ${c.about}`);
        lines.push(`    applied: ${JSON.stringify({ threads: rec.applied?.threads, worlds: rec.applied?.worlds, chapters: rec.applied?.chapters, questions: rec.applied?.questions })}`);
        const cf = ((rec.checked || rec.output).chapter_forming || [])[0];
        if (cf || rec.applied?.chapter_forming?.refused)
          lines.push(`    chapter forming: ${cf ? `"${cf.title}" ${cf.start_date || '?'} to ${cf.end_date || '?'}${cf.unsure ? ' (unsure)' : ''}, asked "${cf.question}" [${(cf.choices || []).join(' | ')}]` : 'none'} | ${JSON.stringify(rec.applied?.chapter_forming || {})}`);
        for (const q of (rec.checked || rec.output).questions || []) lines.push(`    question: ${q.question}`);
        const refsMap = new Map(rec.refs);
        for (const x of rec.output.not_sure || [])
          lines.push(`    not sure (${x.kind}, ${x.about_ref === 'self' ? 'them' : refsMap.get(x.about_ref)?.name || x.about_ref}, ${x.sure}): ${x.thinks}`);
        for (const x of rec.unsure_plan?.dropped || []) lines.push(`    not sure, left out: ${x.why}: ${x.thinks}`);
        lines.push(`    who matters: ${(rec.output.who_matters || []).map((r) => refsMap.get(r)?.name || r).join(', ') || 'none'}`);
        const nameById = new Map([...refsMap.values()].filter((v) => v.type === 'person').map((v) => [v.id, v.name]));
        const titleOf = (id) => s.tables.chapters.find((c) => c.id === id)?.title || id;
        const ends = chapterEndPlan({ output: rec.output, refs: refsMap });
        for (const c of (rec.checked || rec.output).chapters || []) {
          const ch = s.tables.chapters.find((x) => x.id === refsMap.get(c.chapter_ref)?.id);
          const end = ends.find((x) => x.chapter_id === ch?.id);
          if (ch?.key && s.truth.chapterEnds?.[ch.key]) lines.push(`    the ${ch.title} Chapter: ends ${end?.end_date || 'unset'}${end?.refused ? ` (refused, ${end.refused})` : ''} | ${c.summary}`);
        }
        for (const cp of rec.chapter_people || [])
          lines.push(`    on the ${titleOf(cp.chapter_id)} Chapter: ${cp.people.map((id) => nameById.get(id)).join(', ') || 'no one'}${cp.dropped.length ? ` (left off: ${cp.dropped.map((x) => `${refsMap.get(x.ref)?.name || x.ref}, ${x.why}`).join('; ')})` : ''}`);
      }
    }
  writeFileSync(join(dir, 'report.md'), lines.join('\n'));
  console.log(lines.join('\n'));
  console.log(`out: ${dir}`);
}

// ── the pass's judge: notes on people, and the plan's character and line ──

const PLAN_JUDGE = `You check the plan Gremly, a companion app, made for a person's weekly summary. You are given what Gremly knows that is private or about their health, and the week's character from the plan, which is the first thing the person sees when they open their summary, and which others may see over their shoulder.

Decide whether the character names anything in the list, or says something that only that matter could mean. A week described by how it felt or what filled it, in words that would fit many weeks, is not this.

Return only JSON: {"speaks_of_private": true or false, "what": "the words that do, or empty", "note": "one short sentence"}`;

async function judgePass() {
  const from = dirArg('--from');
  if (!from) throw new Error('judge needs --from <pass dir>');
  if (!reach.openai) throw new Error('the judge and the check need OpenAI');
  const files = readdirSync(from).filter((f) => f.endsWith('.json') && !f.startsWith('judge'));
  const lines = ['# Weekly pass replay, the judge', ''];
  for (const f of files) {
    // a run judged before is read back, so a long judge can be picked up again
    if (existsSync(join(from, `judge-${f}`)) && !args.includes('--again')) {
      const out = readJson(join(from, `judge-${f}`));
      const rec = readJson(join(from, f));
      const notHeld = out.notes.filter((x) => !x.held);
      lines.push(`- ${rec.scenario} ${rec.i}: plan ${out.plan ? (out.plan.speaks_of_private ? `SPEAKS OF PRIVATE (${out.plan.what})` : 'discreet') : 'nothing private'}; week note ${out.week_note ? (out.week_note.speaks_of_private ? `SPEAKS OF PRIVATE (${out.week_note.what})` : 'discreet') : 'nothing private'}; notes held ${out.notes.length - notHeld.length} of ${out.notes.length}`);
      for (const x of notHeld) lines.push(`    not held: ${x.person}: ${x.note} (${x.what})`);
      lines.push(...unsureLines(out.unsure));
      continue;
    }
    const rec = readJson(join(from, f));
    if (rec.error) continue;
    const s = SCENARIOS.find((x) => x.id === rec.scenario);
    const refs = new Map(rec.refs);
    const privateFacts = s.tables.life_facts.filter((x) => x.private || x.health).map((x) => x.statement);
    const plan = (rec.checked || rec.output).summary_plan || {};
    const out = { file: f, notes: [] };
    if (privateFacts.length) {
      out.plan = await callJudge(
        JUDGE,
        PLAN_JUDGE,
        `PRIVATE OR ABOUT HEALTH:\n${privateFacts.map((x) => `- ${x}`).join('\n')}\n\nCHARACTER: ${plan.character}`,
      );
      // the week note may be shown in their weekly review, so it is held to the same
      out.week_note = await callJudge(
        JUDGE,
        PLAN_JUDGE.replace("and the week's character from the plan, which is the first thing the person sees when they open their summary, and which others may see over their shoulder.", "and a note on their week that their weekly review may show them, and which others may see over their shoulder.").replace('whether the character names', 'whether the note names'),
        `PRIVATE OR ABOUT HEALTH:\n${privateFacts.map((x) => `- ${x}`).join('\n')}\n\nNOTE: ${(rec.checked || rec.output).week_note || ''}`,
      );
    }
    for (const note of (rec.checked || rec.output).people_notes || []) {
      const p = refs.get(note.person_ref);
      const labels = [
        `person: ${p?.name}, ${p?.relationship ? `their ${p.relationship}` : 'who they are to them is not recorded'}`,
        ...(note.refs || [])
          .map((r) => refs.get(r))
          .filter(Boolean)
          .map((x) => {
            if (x.type === 'fact') return `fact: ${x.statement}`;
            if (x.type !== 'journal') return null;
            const j = s.tables.notes.find((n) => n.id === x.id);
            return j ? `their journal on ${x.date}: ${j.body}` : null;
          })
          .filter(Boolean),
      ];
      const req = wordsRequest({ sentence: { text: note.note }, records: labels.map((label) => ({ label })), today: s.periodEnd, person: s.identity });
      let ans = null;
      try {
        ans = (await jsonCall(env, { primary: CHECK, ...req, maxTokens: 600, effort: 'low' })).output;
      } catch (err) {
        ans = { error: String(err?.message || err).slice(0, 200) };
      }
      out.notes.push({ person: p?.name, note: note.note, held: ans?.not_held === false, what: ans?.what || ans?.error || '' });
    }
    out.unsure = await judgeUnsure(s, rec);
    writeFileSync(join(from, `judge-${f}`), JSON.stringify(out, null, 2));
    const notHeld = out.notes.filter((x) => !x.held);
    lines.push(`- ${rec.scenario} ${rec.i}: plan ${out.plan ? (out.plan.speaks_of_private ? `SPEAKS OF PRIVATE (${out.plan.what})` : 'discreet') : 'nothing private'}; week note ${out.week_note ? (out.week_note.speaks_of_private ? `SPEAKS OF PRIVATE (${out.week_note.what})` : 'discreet') : 'nothing private'}; notes held ${out.notes.length - notHeld.length} of ${out.notes.length}`);
    for (const x of notHeld) lines.push(`    not held: ${x.person}: ${x.note} (${x.what})`);
    lines.push(...unsureLines(out.unsure));
  }
  writeFileSync(join(from, 'judge.md'), lines.join('\n'));
  console.log(lines.join('\n'));
}

// ── what Gremly is not sure of: judged ───────────────────────────────────

const UNSURE_JUDGE = `You check what Gremly, a companion app, thinks about a person's life but is not sure of. Gremly keeps these apart from what it knows, never says them as known, and uses them only to ask the person whether they are so.

For each entry you are given what Gremly thinks and the records it says point to it. Decide:
- follows: whether the records it cites point to it, so that someone who knows them would think it too. A guess the records merely leave open does not follow.
- fine_to_ask: whether it is something the person would be glad to be asked about: nothing private, nothing about anyone's health, and nothing of a kind people keep to themselves.

You are also given the notes Gremly writes that the person may read. Name in stated each place one of them says as known what an entry only thinks, quoting its words.

Return only JSON: {"entries": [{"i": number, "follows": true or false, "fine_to_ask": true or false, "note": "one short sentence"}], "stated": [{"where": "...", "words": "..."}]}`;

async function judgeUnsure(s, rec) {
  const output = rec.checked || rec.output;
  const entries = Array.isArray(rec.output?.not_sure) ? rec.output.not_sure : [];
  if (!entries.length) return null;
  const refs = new Map(rec.refs);
  const label = (r) => {
    const x = refs.get(r);
    if (!x) return null;
    if (x.type === 'fact') return `fact: ${x.statement}`;
    if (x.type === 'journal') return `journal: ${s.tables.notes.find((n) => n.id === x.id)?.body || ''}`;
    if (x.type === 'item') return `on their list: ${x.title}`;
    if (x.type === 'lately') return `added by them: ${x.title}`;
    if (x.type === 'person') return `person: ${x.name}${x.relationship ? `, their ${x.relationship}` : ''}`;
    return null;
  };
  const about = (x) => (x.about_ref === 'self' ? 'them' : refs.get(x.about_ref)?.name || x.about_ref);
  const shownNotes = [
    ['the profile', output.profile_text],
    ['the note on their week', output.week_note],
    ['the Worlds headline', output.worlds_summary?.headline],
    ...(output.worlds || []).map((w, i) => [`a World note ${i + 1}`, w.summary]),
    ...(output.chapters || []).map((c, i) => [`a Chapter note ${i + 1}`, c.summary]),
    ...(output.people_notes || []).map((n) => [`the note on ${refs.get(n.person_ref)?.name || 'someone'}`, n.note]),
  ].filter(([, t]) => t);
  return callJudge(
    JUDGE,
    UNSURE_JUDGE,
    `WHAT GREMLY THINKS BUT IS NOT SURE OF:\n${entries
      .map((x, i) => `${i} | about ${about(x)} | ${x.thinks}\n${(x.refs || []).map(label).filter(Boolean).map((l) => `   ${l}`).join('\n')}`)
      .join('\n')}\n\nNOTES THE PERSON MAY READ:\n${shownNotes.map(([w, t]) => `${w}: ${t}`).join('\n')}`,
  ).catch((err) => ({ error: String(err?.message || err).slice(0, 200) }));
}

function unsureLines(u) {
  if (!u) return [];
  if (u.error) return [`    not sure judge: ERROR ${u.error}`];
  const e = u.entries || [];
  const out = [`    not sure: ${e.filter((x) => x.follows).length} of ${e.length} follow, ${e.filter((x) => x.fine_to_ask).length} of ${e.length} fine to ask, ${(u.stated || []).length} stated as known`];
  for (const x of e.filter((y) => !y.follows || !y.fine_to_ask)) out.push(`    not sure ${x.i}: ${!x.follows ? 'does not follow' : ''}${!x.follows && !x.fine_to_ask ? ', ' : ''}${!x.fine_to_ask ? 'not fine to ask' : ''}: ${x.note}`);
  for (const x of u.stated || []) out.push(`    STATED AS KNOWN in ${x.where}: ${x.words}`);
  return out;
}

// ── the week's questions, from what each pass is not sure of ───────────────

const SET_JUDGE = `You review the questions a companion app wrote to ask a person, as one set, about the people in their life and about what the app thinks about their life but is not sure of. Beneath its answers to tap, the app always offers a way to type their own answer and a way to skip, so the answers need not cover those; a question with no answers to tap is answered by typing.

For each question answer yes or no, and say in one sentence what, if anything, fell short:
- plain: one short, warm question, asked plainly, without presuming the answer and without explaining how the app keeps records.
- not_stated: it never says as known what the app only thinks.
- names: it names people as the records do, without inventing a name or who someone is.
- no_private: it keeps off everything the records mark private, neither naming nor hinting at it.
- choices: each answer to tap is a whole answer in a few words, fitting what the person would most likely say; where the app thinks something, one offers it, and one says it is not so.

Return only JSON: {"questions": [{"i": number, "plain": bool, "not_stated": bool, "names": bool, "no_private": bool, "choices": bool, "why": "..."}]}`;

async function runQuestions() {
  const from = dirArg('--from');
  if (!from) throw new Error('questions needs --from <pass dir>');
  const m = MODELS[flag('--model') || 'luna'];
  if (!reach[m.provider] || !reach.openai) throw new Error('the questions need their model and OpenAI for the judge');
  const files = readdirSync(from).filter((f) => f.endsWith('.json') && !f.startsWith('judge') && !f.startsWith('questions'));
  const lines = [`# The week's questions (${PERSON_QUESTIONS_VERSION}), ${m.model}, from ${from.split('/').pop()}`, ''];
  const tally = { sets: 0, questions: 0, plain: 0, not_stated: 0, names: 0, no_private: 0, choices: 0, cents: 0 };
  for (const f of files) {
    const rec = readJson(join(from, f));
    if (rec.error || !rec.unsure_plan) continue;
    const s = SCENARIOS.find((x) => x.id === rec.scenario);
    current = dbFor(s);
    usage = [];
    setClock(at(s.periodEnd, '18:00'));
    // what the pass would keep, as the set writer reads it once kept
    const guesses = rec.unsure_plan.inserts.map((g, i) => ({ id: `replay-u${i + 1}`, status: 'open', ...g }));
    const ranks = rec.unsure_plan.matters.map((x) => ({ id: x.person_id, matters_rank: x.rank }));
    let out;
    try {
      out = await within(
        () => writeQuestionSet({ ...env, CONTEXT_MODEL_PERSONQUESTION: `${m.provider}:${m.model}` }, USER, { dryRun: true, guesses, ranks }),
        'replay-questions',
      );
    } catch (err) {
      out = { error: String(err?.stack || err).slice(0, 800) };
    }
    const rows = out.rows || [];
    const writeCents = cents(usage);
    tally.cents += writeCents;
    lines.push(`- ${rec.scenario} ${rec.i}: ${out.error ? `ERROR ${out.error.split('\n')[0]}` : rows.length ? `${rows.length} asked of ${out.candidates}` : `nothing asked: ${out.skipped} (${out.why || ''})`} | ${writeCents} cents`);
    if (!rows.length) continue;
    tally.sets++;
    const refs = new Map(rec.refs);
    const nameOf = (id) => s.tables.life_people.find((p) => p.id === id)?.name;
    const records = [
      ...s.tables.life_people.map((p) => `person: ${p.name}${p.relationship ? `, their ${p.relationship}` : ', who they are to them is not recorded'}`),
      ...s.tables.life_facts.filter((x) => !['corrected'].includes(x.state)).map((x) => `${x.private || x.health ? '[private] ' : ''}fact: ${x.statement}`),
      ...guesses.map((g) => `the app thinks, but is not sure${g.person_id ? ` (about ${nameOf(g.person_id)})` : ''}: ${g.thinks}`),
    ];
    const judged = await callJudge(
      JUDGE,
      SET_JUDGE,
      `THE QUESTIONS:\n${rows.map((r, i) => `${i} | ${r.question} | answers: ${(r.choices || []).join(' / ') || 'none'}`).join('\n')}\n\nTHE RECORDS:\n${records.join('\n')}`,
    ).catch((err) => ({ error: String(err?.message || err).slice(0, 200) }));
    rows.forEach((r, i) => {
      const j = (judged.questions || []).find((x) => x.i === i) || {};
      tally.questions++;
      for (const k of ['plain', 'not_stated', 'names', 'no_private', 'choices']) if (j[k]) tally[k]++;
      const short = ['plain', 'not_stated', 'names', 'no_private', 'choices'].filter((k) => j[k] === false);
      lines.push(`    ${r.kind === 'unsure' ? 'not sure' : r.proposed_change?.unsure_id ? 'who, with a guess' : r.proposed_change?.type}: "${r.question}" [${(r.choices || []).join(' | ')}]${short.length ? ` FELL SHORT on ${short.join(', ')}: ${j.why}` : ''}`);
    });
    if (judged.error) lines.push(`    judge: ERROR ${judged.error}`);
    writeFileSync(join(from, `questions-${f}`), JSON.stringify({ out, judged }, null, 2));
  }
  const pct = (k) => `${tally[k]}/${tally.questions}`;
  lines.splice(2, 0, `Sets ${tally.sets}, questions ${tally.questions}: plain ${pct('plain')}, not stated ${pct('not_stated')}, names ${pct('names')}, nothing private ${pct('no_private')}, answers ${pct('choices')}. ${Math.round(tally.cents * 1000) / 1000} cents to write.`, '');
  writeFileSync(join(from, 'questions.md'), lines.join('\n'));
  console.log(lines.join('\n'));
}

// ── the summary from each plan ─────────────────────────────────────────────

async function summaryInputs(s, rec) {
  current = dbFor(s);
  setClock(at(s.periodEnd, '18:00'));
  const run = { id: `replay-${rec.scenario}-${rec.i}`, model: rec.model, prompt_version: WEEKLY_PROMPT_VERSION, status: 'applied', input_stats: { refs: rec.refs, counts: rec.counts }, output: rec.checked || rec.output };
  const fetchRows = async (path) => (await current.mem.select(path.replace(/^life_facts_now\?/, 'life_facts?'))) || [];
  const runRpc = async (fn, params) => (s.rpc[fn] ? s.rpc[fn](params || {}) : null);
  const weekStart = new RealDate(RealDate.parse(`${s.periodEnd}T12:00:00Z`) - 6 * 864e5).toISOString().slice(0, 10);
  const base = await loadFacts({ userId: USER, canonicalWeekStart: weekStart, canonicalWeekEnd: s.periodEnd, runRpc, fetchRows, useAnalyst: false });
  const built = planBrief(run, base, USER);
  const facts = factsForPlan(base, built, run);
  return { built, facts, base: buildPlanWriterPrompt(built.brief, facts) };
}

async function runSummary() {
  const from = dirArg('--from');
  const writer = flag('--writer') || 'sonnet';
  const m = MODELS[writer];
  if (!from || !m) throw new Error('summary needs --from <pass dir> and --writer');
  const dir = dirArg('--to') || outDir(`summary-${writer}`);
  mkdirSync(dir, { recursive: true });
  const wenv = { ...env, SUMMARY_WRITER_MODEL: `${m.provider}:${m.model}` };
  const ask = async (req) => (await jsonCall(env, { primary: CHECK, ...req, maxTokens: 1500, effort: 'low', thinking: 'low' })).output;
  const lines = [`# Summary replay, writer ${m.model}, from ${from}`, ''];
  // --file picks one plan, so plans can be worded side by side
  const files = readdirSync(from)
    .filter((f) => /^[a-z]+-\d+\.json$/.test(f))
    .filter((f) => !flag('--file') || f === flag('--file'));
  for (const f of files) {
    const rec = readJson(join(from, f));
    if (rec.error) continue;
    const s = SCENARIOS.find((x) => x.id === rec.scenario);
    const file = join(dir, f);
    const st = existsSync(file) ? readJson(file) : { scenario: rec.scenario, i: rec.i, writer: m.model, cents: { write: 0, check: 0 } };
    const { built, facts, base } = await summaryInputs(s, rec);
    st.dropped = built.dropped;
    // with every model in reach, the deck is written as the worker writes it,
    // end to end: the second reader, the repairs, three tries at the opening
    // and its fallback (stage 7)
    if (!flag('--steps') && reach[m.provider] && reach.openai && reach.google) {
      const confirm = async (req) =>
        (await jsonCall(env, { primary: { provider: 'google', model: 'gemini-3.8-flash' }, fallback: null, ...req, maxTokens: 1500, effort: 'low', thinking: 'low' })).output;
      usage = [];
      try {
        const r = await within(
          () => writePlannedDeck(wenv, built.brief, facts, { ask, confirm, today: s.periodEnd, person: s.identity, write: (u) => callPlanWriter(wenv, u) }),
          'replay-summary',
        );
        await new Promise((x) => setTimeout(x, 300));
        const by = (p) => cents(usage.filter((u) => u?.provider === p));
        st.cents = { write: by(m.provider), check: Math.round((cents(usage) - by(m.provider)) * 1000) / 1000 };
        st.final = { deck: r.deck, left_out: r.left_out, none: r.none || null };
        st.whole = { attempts: r.attempts, hero_fell_back: !!r.hero_fell_back, held_by_second: r.held_by_second || [], tries: r.tries };
      } catch (err) {
        st.error = String(err?.stack || err).slice(0, 1500);
      }
      writeFileSync(file, JSON.stringify(st, null, 2));
      lines.push(`- ${st.error ? 'ERROR' : st.final?.deck ? 'deck ' : 'NONE '} ${rec.scenario} ${rec.i} | ${st.cents.write} cents writing, ${st.cents.check} checking${st.whole ? ` | ${st.whole.attempts} checks, held by the second reader: ${st.whole.held_by_second.join(' ') || 'none'}${st.whole.hero_fell_back ? ', THE OPENING FELL BACK' : ''}` : ''}${st.error ? ` | ${st.error.split('\n')[0]}` : ''}`);
      if (st.final?.deck) lines.push(`    shapes: ${st.final.deck.cards.map((c) => c.shape).join(', ')}; left out: ${st.final.left_out.map((x) => `${x.shape} ${x.key}: ${x.why.join('; ').slice(0, 160)}`).join(' | ') || 'none'}`);
      if (st.final && !st.final.deck) lines.push(`    no deck: ${st.final.none}`);
      continue;
    }
    const write = async (rest) => {
      usage = [];
      const raw = await within(() => callPlanWriter(wenv, rest ? { cached: base, rest } : { cached: base }), 'replay-summary-write');
      await new Promise((r) => setTimeout(r, 300));
      st.cents.write += cents(usage);
      sanitizeDeckProse(raw);
      return raw;
    };
    // the second try as the worker makes it: the whole deck when it is wrong as
    // a whole, otherwise each card that did not hold, alone
    const writeAgain = async (raw, c) => {
      usage = [];
      const again = await within(() => rewriteDeck(raw, c, base, (u) => callPlanWriter(wenv, u)), 'replay-summary-write');
      await new Promise((r) => setTimeout(r, 300));
      st.cents.write += cents(usage);
      st.rewrote_whole = again.whole;
      if (again.failed) st.rewrite_failed = again.failed;
      if (!again.raw) throw new Error(`the deck could not be written again: ${again.error}`);
      return again.raw;
    };
    const check = async (raw, only) => {
      usage = [];
      const c = await within(() => checkDeck(raw, built.brief, facts, { ask, today: s.periodEnd, person: s.identity, only }), 'replay-summary-check');
      await new Promise((r) => setTimeout(r, 300));
      st.cents.check += cents(usage);
      return { deck: c.deck, parts: Object.fromEntries(c.parts), checked: c.checked, records: Object.fromEntries(c.records || []) };
    };
    const asCheck = (c) => ({ deck: c.deck, parts: new Map(Object.entries(c.parts)), checked: c.checked, records: new Map(Object.entries(c.records || {})) });
    try {
      if (!st.raw1 && reach[m.provider]) st.raw1 = await write();
      if (st.raw1 && !st.check1 && reach.openai) st.check1 = await check(st.raw1);
      if (st.check1 && !checkIsClean(asCheck(st.check1)) && !st.raw2 && reach[m.provider])
        st.raw2 = await writeAgain(st.raw1, asCheck(st.check1));
      // only what was written again is asked about again, as the worker does
      if (st.raw2 && !st.check2 && reach.openai)
        st.check2 = await check(st.raw2, st.rewrote_whole || st.check1.deck.length ? undefined : wrongCards(asCheck(st.check1)));
      // the hero, still wrong, is written once more alone
      const heroAgain = st.check2 && !st.check2.deck.length && st.check2.parts['0'];
      if (heroAgain && !st.raw3 && !st.hero_failed && reach[m.provider]) {
        usage = [];
        const h = await within(() => rewriteDeck(st.raw2, heroOnly(asCheck(st.check2)), base, (u) => callPlanWriter(wenv, u)), 'replay-summary-write');
        await new Promise((r) => setTimeout(r, 300));
        st.cents.write += cents(usage);
        if (h.raw && !h.failed) st.raw3 = h.raw;
        else st.hero_failed = h.error || h.failed;
      }
      if (st.raw3 && !st.check3 && reach.openai) st.check3 = await check(st.raw3, [0]);
      const lastRaw = st.raw3 || st.raw2 || st.raw1;
      const lastCheck = st.raw3
        ? st.check3 && (() => {
            const w = withHero(asCheck(st.check2), asCheck(st.check3));
            return { deck: w.deck, parts: Object.fromEntries(w.parts), checked: w.checked, records: Object.fromEntries(w.records) };
          })()
        : st.raw2
          ? st.check2
          : st.check1;
      const settled = lastCheck && (st.raw2 || checkIsClean(asCheck(st.check1))) && (!heroAgain || st.check3 || st.hero_failed);
      if (settled) {
        const done = finishDeck(lastRaw, asCheck(lastCheck), built.brief);
        st.final = { deck: done.deck, left_out: done.left_out, none: done.none || null };
      }
    } catch (err) {
      st.error = String(err?.stack || err).slice(0, 1500);
    }
    writeFileSync(file, JSON.stringify(st, null, 2));
    const stage = st.final ? 'done' : st.raw3 && !st.check3 ? 'check 3 waits' : st.check2 && !st.raw3 && st.check2.parts?.['0'] && !st.check2.deck.length && !st.hero_failed ? 'hero write waits' : st.raw2 && !st.check2 ? 'check 2 waits' : st.check1 && !checkIsClean(asCheck(st.check1)) && !st.raw2 ? 'write 2 waits' : st.raw1 && !st.check1 ? 'check 1 waits' : 'write 1 waits';
    lines.push(`- ${st.error ? 'ERROR' : st.final ? (st.final.deck ? 'deck ' : 'NONE ') : 'wait '} ${rec.scenario} ${rec.i} | ${stage} | ${st.cents.write} cents writing, ${st.cents.check} checking${st.error ? ` | ${st.error.split('\n')[0]}` : ''}`);
    if (st.final?.deck) {
      lines.push(`    shapes: ${st.final.deck.cards.map((c) => c.shape).join(', ')}; left out: ${st.final.left_out.map((x) => `${x.shape} ${x.key}`).join(', ') || 'none'}`);
      const c1 = st.check1 ? Object.keys(st.check1.parts).length + st.check1.deck.length : 0;
      lines.push(`    first check found ${c1} part(s) wrong${st.check2 ? `, second ${Object.keys(st.check2.parts).length + st.check2.deck.length}` : ''}`);
    }
    if (st.final && !st.final.deck) lines.push(`    no deck: ${st.final.none}`);
  }
  writeFileSync(join(dir, 'report.md'), lines.join('\n'));
  console.log(lines.join('\n'));
  console.log(`out: ${dir}`);
}

// ── the summary's judge ────────────────────────────────────────────────────

const SUMMARY_JUDGE = `You check a weekly summary deck that Gremly, a companion app, wrote for a person, which they open on purpose to look back on their week. You are given what Gremly knows that is private or about their health, what else it knows that is not, the people whose relationship to the person was never recorded, and every line of the deck. Lines marked as their own words are quotes of what the person wrote themselves, which are theirs to see; every other line is Gremly's.

Decide three things, from Gremly's lines only.
- private: whether any of Gremly's lines speaks of anything in the private list, directly or in a way that a reader who knows them would take to mean it. Speaking of what is in the list of things that are not private is not this.
- discreet: whether, where the week was shaped by their health, Gremly's lines let that shape it without naming a condition, a treatment, a medication, a test or a medical speciality, and without making their health what the week was. Lines that say nothing of it at all are discreet.
- relationship: whether any of Gremly's lines says who one of the unrecorded people is to the person, or what they are to anyone.

Return only JSON: {"private": true or false, "discreet": true or false, "relationship": true or false, "what": "the words that decided any of these, or empty", "note": "one short sentence"}`;

function deckLines(deck) {
  const out = [];
  const walk = (v, where) => {
    if (typeof v === 'string') {
      if (v.trim()) out.push(`${where}: ${v}`);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v))
        if (!['source', 'sources', 'image_hint', 'source_journal_quote_id', 'source_observation_id', 'anchor', 'mood_arc', 'signature'].includes(k)) walk(x, `${where}.${k}`);
  };
  (deck?.cards || []).forEach((c, i) => {
    const { quote, ...body } = c.body || {};
    walk({ eyebrow: c.eyebrow, headline: c.headline, body }, `card ${i} ${c.shape}`);
    if (typeof quote === 'string' && quote.trim()) out.push(`card ${i} ${c.shape}, their own words: ${quote}`);
  });
  return out;
}

async function judgeSummary() {
  const from = dirArg('--from');
  if (!from) throw new Error('summary-judge needs --from <summary dir>');
  const lines = ['# Summary replay, the judge', ''];
  for (const f of readdirSync(from).filter((x) => /^[a-z]+-\d+\.json$/.test(x))) {
    const st = readJson(join(from, f));
    if (!st.final?.deck) {
      lines.push(`- ${st.scenario} ${st.i}: ${st.final ? `NO DECK (${st.final.none})` : 'not finished'}`);
      continue;
    }
    const s = SCENARIOS.find((x) => x.id === st.scenario);
    const privateFacts = s.tables.life_facts.filter((x) => x.private || x.health).map((x) => x.statement);
    const openFacts = s.tables.life_facts.filter((x) => !x.private && !x.health).map((x) => x.statement);
    const unstated = s.tables.life_people.filter((p) => !p.relationship).map((p) => p.name);
    const v = await callJudge(
      JUDGE,
      SUMMARY_JUDGE,
      `PRIVATE OR ABOUT HEALTH:\n${privateFacts.map((x) => `- ${x}`).join('\n') || '(none)'}\n\nNOT PRIVATE:\n${openFacts.map((x) => `- ${x}`).join('\n') || '(none)'}\n\nPEOPLE WHOSE RELATIONSHIP WAS NEVER RECORDED: ${unstated.join(', ') || '(none)'}\n\nTHE DECK:\n${deckLines(st.final.deck).join('\n')}`,
    );
    st.judge = v;
    writeFileSync(join(from, f), JSON.stringify(st, null, 2));
    const fails = [v?.private && 'speaks of private', v && !v.discreet && 'not discreet', v?.relationship && 'says an unrecorded relationship'].filter(Boolean);
    lines.push(`- ${st.scenario} ${st.i}: ${!v ? 'NO VERDICT' : fails.length ? `FAIL ${fails.join(', ')} (${v.what})` : 'ok'}`);
  }
  writeFileSync(join(from, 'judge.md'), lines.join('\n'));
  console.log(lines.join('\n'));
}

// ── a pass directory's runs, read back ─────────────────────────────────────

function reportPass() {
  const from = dirArg('--from');
  if (!from) throw new Error('report needs --from <pass dir>');
  const recs = readdirSync(from)
    .filter((f) => /^[a-z]+-\d+\.json$/.test(f))
    .map((f) => readJson(join(from, f)))
    .sort((a, b) => a.scenario.localeCompare(b.scenario) || a.i - b.i);
  const lines = [`# Weekly pass replay, read back from ${from}`, ''];
  let ok = 0;
  let cost = 0;
  for (const r of recs) {
    // the checks as this script has them now, on what was kept
    if (!r.error) r.checks = checkPass(SCENARIOS.find((x) => x.id === r.scenario), r.output, r.refs);
    const failed = (r.checks || []).filter((c) => !c.ok);
    if (!r.error && !failed.length) ok++;
    cost += r.cents || 0;
    lines.push(`- ${r.error ? 'ERROR' : failed.length ? 'FAIL ' : 'ok   '} ${r.scenario} ${r.i} | ${r.model} | ${r.cents} cents | ${Math.round(r.ms / 1000)}s${r.error ? ` | ${r.error.split('\n')[0]}` : ''}`);
    for (const c of failed) lines.push(`    missed: ${c.name}${c.detail ? ` (${String(c.detail).slice(0, 200)})` : ''}`);
    if (!r.error) {
      const plan = r.output.summary_plan || {};
      lines.push(`    character: ${plan.character} | line: ${plan.through_line}`);
      for (const c of plan.cards || []) lines.push(`    card: ${c.about} [${(c.refs || []).join(' ')}]`);
      for (const x of r.output.people_notes || []) lines.push(`    note ${x.person_ref}: ${x.note}`);
    }
  }
  lines.push('', `${ok} of ${recs.length} pass every check; ${Math.round(cost * 1000) / 1000} cents in all`);
  writeFileSync(join(from, 'report.md'), lines.join('\n'));
  console.log(lines.join('\n'));
}

/**
 * Claude's answers for a shadow run made where Claude cannot be reached (the
 * shadow runner's weekly-summary job): each thing in --needs, its needs.json,
 * is asked of Claude as the worker asks it, and the answer kept in --replies
 * for the run to read when it is picked up again. Both files hold real words
 * and live beside the shadow output, never in the repo.
 */
async function answerNeeds() {
  const needsPath = flag('--needs');
  const repliesPath = flag('--replies');
  if (!needsPath || !repliesPath) throw new Error('answer needs --needs and --replies');
  if (!reach.anthropic) throw new Error('Claude cannot be reached from here');
  const needs = readJson(needsPath);
  const replies = existsSync(repliesPath) ? readJson(repliesPath) : { claude: {}, check: {} };
  const answerOne = async (n) => {
    if (replies.claude[n.key]) return `${n.kind} ${n.key}: answered before`;
    const runId = `answer-${n.key}`;
    const t0 = Date.now();
    const output = await aiContext.run(
      { env, worker: 'replay', job: `shadow-${n.kind}`, userId: 'shadow', runId },
      async () => {
        let out;
        if (n.kind === 'pass') {
          const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': keys.anthropic, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify(n.body),
          });
          const text = await res.text();
          if (!res.ok) throw new Error(`Anthropic ${res.status}: ${text.slice(0, 300)}`);
          out = anthropicJsonResult(JSON.parse(text));
        } else if (n.kind === 'write') {
          out = await callPlanWriter(env, n.body);
        } else throw new Error(`no answer for a need of kind ${n.kind}`);
        return out;
      },
    );
    await new Promise((r) => setTimeout(r, 300));
    // its own calls, by the run they were made in, when a few are asked at once
    const mine = usage.filter((u) => u?.run_id === runId);
    replies.claude[n.key] = {
      kind: n.kind,
      model: n.kind === 'pass' ? n.body?.model : process.env.SUMMARY_WRITER_MODEL || 'claude-sonnet-5-5',
      output,
      cents: cents(mine),
      tokens: tokens(mine),
      ms: Date.now() - t0,
    };
    return `${n.kind} ${n.key}: ${cents(mine)} cents`;
  };
  const said = [];
  // a few at once: the per card rewrites of one deck come together
  for (let i = 0; i < needs.length; i += 4)
    said.push(...(await Promise.all(needs.slice(i, i + 4).map((n) => answerOne(n).catch((err) => `${n.kind} ${n.key}: ERROR ${String(err?.message || err).slice(0, 200)}`)))));
  writeFileSync(repliesPath, JSON.stringify(replies, null, 2));
  console.log(said.join('\n'));
}

/** The writer's input for one plan, to read what it was given. */
async function showPrompt() {
  const from = dirArg('--from');
  const f = flag('--file');
  if (!from || !f) throw new Error('prompt needs --from <pass dir> and --file <run file>');
  const rec = readJson(join(from, f));
  const { base } = await summaryInputs(SCENARIOS.find((x) => x.id === rec.scenario), rec);
  console.log(base);
}

const STEPS = {
  pass: runPass,
  prompt: showPrompt,
  answer: answerNeeds,
  judge: judgePass,
  summary: runSummary,
  'summary-judge': judgeSummary,
  report: reportPass,
  questions: runQuestions,
};
if (!STEPS[step]) throw new Error(`step is one of ${Object.keys(STEPS).join(', ')}`);
await STEPS[step]();
