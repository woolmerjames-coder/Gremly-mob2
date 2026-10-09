/**
 * Mind Drop's enrichment and the chat helpers, replayed (18 Oct): each prompt
 * in workers/cortex/minddropPrompts.js beside the prompt it replaced, called
 * as the worker calls it (aiClassify on the mini tier, helperFetch for the
 * running summary, the agent's model with its web search tool), on made up
 * items only.
 *
 *   scripts/minddrop-prompt-replay/run.sh <part> --old <module> [--repeat n]
 *     title       the title and reaction for a drop (the old prompt also wrote a card note)
 *     title --real  the same on real drops (real/drops.json), with the details call,
 *                 resumable into out/real-title.jsonl; report.mjs draws the page
 *     reclassify  the same after the person clarifies a drop
 *     details     a drop's dates, times, effort, state, mood, habit days, people
 *     time        a todo's time estimate, held to a span, through the whole details prompt
 *     summary     the running summary of a long chat
 *     search      whether the agent's web search tool is used when it should be
 *
 * --old names a module exporting the replaced prompts under the same names
 * (made from the tree before the rewrite). Code checks what can be checked
 * exactly (lengths, the kind chosen, every date and time); a judge reads the
 * writing (Sonnet, the prompts' rules as questions) for title, reclassify and
 * summary. OPENAI_API_KEY, GEMINI_TEST_API_KEY and ANTHROPIC_API_KEY come from
 * the environment.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as PROMPTS from '../../workers/cortex/minddropPrompts.js';
import { WEB_SEARCH_DESCRIPTION } from '../../workers/cortex/agent/tools/webSearch.js';

const NEW = { ...PROMPTS, WEB_SEARCH_DESCRIPTION };
import { aiClassify, getProviders } from '../../workers/cortex/aiProvider.js';
import { configureModels } from '../../workers/cortex/models.js';
import { helperFetch } from '../../workers/cortex/helperClient.js';
import { jsonCall } from '../../workers/inngest-jobs/context/llm.js';
import { sentenceCase, fallbackTitle } from '../../workers/cortex/titles.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const part = args[0];
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const repeat = Math.max(1, Number(flag('--repeat') || 2));
const OLD = flag('--old') ? await import(flag('--old')) : null;
if (!['title', 'reclassify', 'details', 'time', 'summary', 'search'].includes(part)) {
  console.error('which part: title, reclassify, details, time, summary or search');
  process.exit(1);
}

const env = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_TEST_API_KEY,
  GOOGLE_API_KEY: process.env.GEMINI_TEST_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  // as cortex's wrangler.toml runs them
  HELPER_MODEL: 'gpt-6-luna',
};
configureModels(env);
const TODAY = '2026-10-08';
const WEEKDAY = 'Thursday';
const TZ = 'America/Los_Angeles';
const sides = [['new', NEW], ...(OLD ? [['old', OLD]] : [])];

const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

async function mini(system, user, { temperature, maxOutputTokens }) {
  const r = await aiClassify({ mode: 'realtime', ...getProviders('mini', env), env, systemPrompt: system, messages: [{ role: 'user', content: user }], temperature, maxOutputTokens, endpoint: 'replay' });
  return r.parsed;
}

const JUDGE_SCHEMA = (keys) => ({
  type: 'object',
  properties: Object.fromEntries([...keys.map((k) => [k, { type: 'boolean' }]), ['why', { type: 'string' }]]),
  required: [...keys, 'why'],
});

async function judge(questions, text) {
  const keys = Object.keys(questions);
  const { output, model } = await jsonCall(env, {
    primary: { provider: 'anthropic', model: 'claude-sonnet-5-5' },
    fallback: { provider: 'openai', model: 'gpt-6-sol' },
    system: `You check what a companion app wrote against its rules. Answer each question true or false about the writing given, judging only from what you are shown, then say in one sentence what falls short, if anything. Answer in JSON only.\n\nQUESTIONS:\n${keys.map((k) => `${k}: ${questions[k]}`).join('\n')}`,
    user: text,
    schema: JUDGE_SCHEMA(keys),
    maxTokens: 4000,
    effort: 'low',
    thinking: 'low',
  });
  return { ...output, judge_model: model };
}

// ── title: the title, card note and reaction for a drop ───────────────────

const DROPS = [
  ['pick up dry cleaning before friday', 'todo', null],
  ['call Gran about Sunday lunch', 'todo', null],
  ['book flights to Porto for half term', 'todo', null],
  ['email the landlord about the boiler', 'todo', null],
  ['run 5k three times a week', 'habit', 'start_habit'],
  ['stop scrolling in bed', 'habit', 'break_habit'],
  ['stretch every morning', 'habit', 'start_habit'],
  ['Really low today. The pitch went badly and I keep replaying it.', 'log', 'journal'],
  ['Great dinner with Priya, we laughed so much about the wedding plans', 'log', 'journal'],
  ['what if the bakery did a Sunday supper club?', 'log', 'idea'],
  ['app that tells you which plants need water from a photo', 'log', 'idea'],
  ['Kit’s housewarming Saturday at 7', 'log', 'event'],
  ['dentist Tuesday 2pm', 'log', 'event'],
  ['the new café on Mill Lane does great cardamom buns', 'log', 'general'],
  ['Pepper ate a whole sock again', 'log', 'general'],
  ['renew passport', 'todo', null],
];

const TITLE_Q = {
  title_faithful: 'Is the title made from what they wrote, adding no detail, place, person, reason or context they did not give?',
  title_clean: 'Does the title leave out dates, times, days, how often, how long it takes and how they feel, and is it the thing itself rather than the act of noting, remembering or tracking it?',
  title_own_words: 'Does the title keep their own words, rewritten only where what they wrote was long, rambling or messy?',
  reaction_specific: 'Is the reaction about this drop in particular, so that it would not fit another drop as well?',
  reaction_voice: 'Does the reaction read as a friend texting back: never speaking of the drop as kept, noted, saved, scheduled or on a list, never saying what kind of item it became, never therapy language, never restating the title, never ending on a filler word or tag question?',
  reaction_no_ask: 'Is the reaction free of any question to them and of any invitation to reply?',
};

// The old prompt is given the kind, as the Worker gave it after the classifier;
// the new one runs at the tap and is given none (Mind Drop rethink stage 2).
async function titleOne(mod, [text, bucket, subtype], recent, giveKind) {
  const user = mod.titleReactionUser({ text, ...(giveKind ? { bucket, subtype } : {}), recentReactions: recent });
  const out = await mini(mod.titleReactionPrompt({ currentDate: TODAY, dayOfWeek: WEEKDAY }), user, { temperature: 0.7, maxOutputTokens: 150 });
  if (!out) return { text, failed: true };
  const t = out.smart_title || '';
  const n = out.card_note || '';
  const r = out.confirmation_message || '';
  const fits = words(t) >= 1 && words(t) <= 8 && words(r) >= 4 && words(r) <= 13 && r.length <= 75 && !/!!/.test(r);
  const j = await judge(TITLE_Q, `WHAT THEY DROPPED (${bucket}${subtype ? `, ${subtype}` : ''}): "${text}"\n\nTITLE: ${t}\nREACTION: ${r}`).catch((e) => ({ error: e.message }));
  return { text, title: t, note: n, reaction: r, fits, judged: j };
}

// ── reclassify: after they clarify ─────────────────────────────────────────

const CLARIFIED = [
  { text: 'mum birthday', label: 'A reminder for an event', bucket: 'log', subtype: 'event', target: null },
  { text: 'gym', label: 'Something I want to do regularly', bucket: 'habit', subtype: null, target: null },
  { text: 'portugal trip idea', label: 'An idea to explore', bucket: 'log', subtype: 'idea', target: null },
  { text: 'report due friday', label: 'A task to do', bucket: 'todo', subtype: null, target: '2026-10-09' },
  { text: 'call the bank tomorrow', label: 'A task to do', bucket: 'todo', subtype: null, scheduled: '2026-10-09' },
  { text: 'feeling stuck with the novel', label: 'A journal entry', bucket: 'log', subtype: 'journal', target: null },
];

const RECLASS_Q = {
  title_faithful: TITLE_Q.title_faithful,
  title_clean: TITLE_Q.title_clean,
  title_own_words: TITLE_Q.title_own_words,
  reaction_specific: TITLE_Q.reaction_specific,
  reaction_voice: TITLE_Q.reaction_voice,
  reaction_no_ask: TITLE_Q.reaction_no_ask,
};

async function reclassOne(mod, c) {
  const ctx = `=== CONTEXT ===\nORIGINAL INPUT: "${c.text}"\nUSER SELECTED: "${c.label}"\nSELECTED BUCKET: ${c.bucket}\nSELECTED SUBTYPE: ${c.subtype || 'not specified'}\nCURRENT DATE: ${TODAY}`;
  const out = await mini(mod.reclassifyPrompt(), ctx, { temperature: 0.3, maxOutputTokens: 250 });
  if (!out) return { text: c.text, failed: true };
  const datesRight = (out.target_date || null) === (c.target || null) && (out.scheduled_date || null) === (c.scheduled || null);
  const kindRight = out.bucket === c.bucket && (!c.subtype || out.subtype === c.subtype);
  const r = out.confirmation_message || '';
  const fits = words(out.smart_title) >= 1 && words(out.smart_title) <= 8 && words(r) >= 3 && words(r) <= 11 && r.length <= 55 && !/!/.test(r);
  const j = await judge(RECLASS_Q, `WHAT THEY DROPPED: "${c.text}", then chose "${c.label}"\n\nTITLE: ${out.smart_title}\nREACTION: ${r}`).catch((e) => ({ error: e.message }));
  return { text: c.text, title: out.smart_title, reaction: r, kindRight, datesRight, fits, got: { target: out.target_date, scheduled: out.scheduled_date }, judged: j };
}

// ── details: dates, times, effort, state, mood, habit days, people ────────

// today is Thursday 8 October 2026; want lists the fields that must match
const DETAILS = [
  { text: 'call mum tomorrow', bucket: 'todo', want: { scheduled_date: '2026-10-09', target_date: null } },
  { text: 'taxes due 15 December', bucket: 'todo', want: { target_date: '2026-12-15', scheduled_date: null } },
  { text: 'book flights before the end of the week', bucket: 'todo', want: { target_date: '2026-10-09', scheduled_date: null } },
  { text: 'finish the deck by Monday', bucket: 'todo', want: { target_date: '2026-10-12', scheduled_date: null } },
  { text: 'go to the gym Thursday', bucket: 'todo', want: { scheduled_date: '2026-10-15', target_date: null } },
  { text: 'haircut is Tuesday, book it tomorrow', bucket: 'todo', want: { target_date: '2026-10-13', scheduled_date: '2026-10-09' } },
  { text: 'submit the expenses by the end of the month', bucket: 'todo', want: { target_date: '2026-10-31' } },
  { text: 'waiting on Priya to send the contract before I can sign', bucket: 'todo', want: { priority_kind: 'blocker' } },
  { text: 'decide between the two flats', bucket: 'todo', want: { priority_kind: 'decision' } },
  { text: 'feel so stuck on the essay, need to write the intro', bucket: 'todo', want: { priority_kind: 'action' } },
  { text: 'pay the water bill online', bucket: 'todo', want: { energy_type: ['administrative', 'quick'] } },
  { text: 'coffee with Sam on Saturday morning', bucket: 'todo', want: { energy_type: ['social'], time_window: 'morning', scheduled_date: '2026-10-10' } },
  { text: 'run three times a week, Mondays Wednesdays and Fridays', bucket: 'habit', subtype: 'start_habit', want: { extracted_days: [1, 3, 5] } },
  { text: 'meditate daily starting next Monday', bucket: 'habit', subtype: 'start_habit', want: { extracted_frequency: 'daily', extracted_start_date: '2026-10-12' } },
  { text: 'Kit’s housewarming Saturday at 7', bucket: 'log', subtype: 'event', want: { target_date: '2026-10-10', event_time: '19:00' } },
  { text: 'dentist Tuesday 2pm', bucket: 'log', subtype: 'event', want: { target_date: '2026-10-13', event_time: '14:00' } },
  { text: 'company offsite 20 to 22 October', bucket: 'log', subtype: 'event', want: { target_date: '2026-10-20', end_date: '2026-10-22' } },
  { text: 'lunch with the design team at noon on the 15th', bucket: 'log', subtype: 'event', want: { target_date: '2026-10-15', event_time: '12:00' } },
  { text: 'meeting moved to Monday at 10', bucket: 'log', subtype: 'general', want: { target_date: '2026-10-12', event_time: '10:00' } },
  { text: 'Gran’s 90th is on 4 November', bucket: 'log', subtype: 'general', want: { target_date: '2026-11-04' } },
  { text: 'tired and a bit anxious after the long week', bucket: 'log', subtype: 'journal', want: { mood: ['tired', 'anxious'] } },
  { text: 'the new café on Mill Lane does great cardamom buns', bucket: 'log', subtype: 'general', want: { target_date: null } },
];

function detailsRight(got, want) {
  const off = [];
  for (const [k, v] of Object.entries(want)) {
    const g = got?.[k];
    if (k === 'energy_type') {
      if (!v.includes(g)) off.push(`${k} ${g}`);
    } else if (Array.isArray(v)) {
      const gs = Array.isArray(g) ? [...g].map(String).sort() : [];
      if (k === 'mood' ? !v.every((x) => gs.includes(x)) : JSON.stringify(gs) !== JSON.stringify(v.map(String).sort())) off.push(`${k} ${JSON.stringify(g)}`);
    } else if ((g ?? null) !== v) off.push(`${k} ${g ?? null}`);
  }
  return off;
}

async function detailsOne(mod, d) {
  const out = await mini(mod.detailsPrompt({ currentDate: TODAY, dayOfWeek: WEEKDAY, timezone: TZ, userSelectedDate: null, bucket: d.bucket, subtype: d.subtype || null }), d.text, { temperature: 0.2, maxOutputTokens: 300 });
  if (!out) return { text: d.text, failed: true, off: ['no answer'] };
  return { text: d.text, off: detailsRight(out, d.want), got: out };
}

// ── time: a todo's time estimate through the whole details prompt ─────────

// [text, bucket, subtype, lowest right, highest right]; null and null: only null is right
const TIMES = [
  ['Text Sam the address', 'todo', null, 5, 10],
  ['Pay the water bill online', 'todo', null, 5, 15],
  ['Book a table for Friday', 'todo', null, 5, 20],
  ['Email the landlord about the boiler', 'todo', null, 5, 20],
  ['Phone Gran', 'todo', null, 15, 60],
  ['Plan next week’s meals', 'todo', null, 20, 60],
  ['Fill in the passport form', 'todo', null, 20, 60],
  ['30 minute run', 'todo', null, 30, 30],
  ['Walk the dog', 'todo', null, 30, 60],
  ['Pick up a parcel from the post office', 'todo', null, 30, 60],
  ['Coffee with Priya', 'todo', null, 45, 120],
  ['Buy groceries for the week', 'todo', null, 45, 90],
  ['Dentist appointment', 'todo', null, 60, 120],
  ['Write the quarterly report', 'todo', null, 60, 180],
  ['Clear out the garage', 'todo', null, 90, 240],
  ['Stretch for ten minutes every morning', 'habit', 'start_habit', 10, 15],
  ['Stop snacking after dinner', 'habit', 'break_habit', null, null],
];

async function timeOne(mod, [text, bucket, subtype, lo, hi]) {
  const out = await mini(mod.detailsPrompt({ currentDate: TODAY, dayOfWeek: WEEKDAY, timezone: TZ, userSelectedDate: null, bucket, subtype }), text, { temperature: 0.2, maxOutputTokens: 300 });
  const v = out?.time_estimate_minutes ?? null;
  const ok = lo == null ? v === null : typeof v === 'number' && v >= lo && v <= hi && v % 5 === 0;
  return { text, off: ok ? [] : [`time ${v} not ${lo} to ${hi}`] };
}

// ── summary: the running summary of a long chat ───────────────────────────

const CHATS = [
  {
    id: 'trip-and-work',
    prior: null,
    turns: [
      ['User', 'I need to plan the Porto trip for half term, we fly on the 24th and back on the 31st.'],
      ['Gremly', 'Lovely. Where are you staying?'],
      ['User', 'Not booked yet. Jo wants somewhere near the river, budget about 120 a night.'],
      ['Gremly', 'That should be doable in Ribeira.'],
      ['User', 'Also stressed about the Hartley pitch on the 20th, the deck is half done and Sam has not sent the numbers.'],
      ['Gremly', 'Do you want to set a time to chase Sam?'],
      ['User', 'Yes, I will message him tomorrow morning. And I decided to drop the extra slide on pricing.'],
    ],
    last: 'Good call on the pricing slide. Message Sam first thing and you can finish the deck by Friday.',
    must: 'the Porto trip from the 24th to the 31st, the stay near the river at about 120 a night not yet booked, the Hartley pitch on the 20th, the deck half done, Sam owing the numbers, messaging Sam tomorrow morning, and dropping the pricing slide',
  },
  {
    id: 'builds-on-prior',
    prior: 'Alex is choosing between two flats: one in Leith with a garden for 1,150 a month and one in Marchmont near work for 1,250. Jo prefers Leith. They need to decide by the 14th.',
    turns: [
      ['User', 'Viewed the Marchmont one again today, the second bedroom is tiny.'],
      ['Gremly', 'Does that change things for you?'],
      ['User', 'A bit. I work from home two days a week so I need that room as an office.'],
      ['Gremly', 'That makes the Leith garden flat look stronger.'],
      ['User', 'Yeah. I think we are going with Leith, I will tell the agent on Monday.'],
    ],
    last: 'Sounds like a good decision. Telling the agent Monday gives you time before the 14th.',
    must: 'both flats with their prices and places, Jo preferring Leith, the deadline of the 14th, the small second bedroom in Marchmont, needing an office for two days a week at home, deciding on Leith, and telling the agent on Monday',
  },
  {
    id: 'feelings',
    prior: null,
    turns: [
      ['User', 'Honestly I am exhausted. Gran has been in hospital since Sunday.'],
      ['Gremly', 'I am sorry. How is she doing?'],
      ['User', 'Better, they might let her home on Friday. Mum is driving down to stay with her.'],
      ['Gremly', 'That must be a relief.'],
      ['User', 'It is. I still need to finish the quarterly report by Wednesday though and I have barely started.'],
    ],
    last: 'Maybe block two hours tomorrow for the report.',
    must: 'that they said they are exhausted, Gran in hospital since Sunday and doing better, possibly home on Friday, Mum driving down to stay with her, and the quarterly report due Wednesday barely started',
  },
];

const SUMMARY_Q = {
  covers: 'Does the summary keep everything the case says it must hold?',
  nothing_invented: 'Does everything it says come from the conversation or the summary so far, with every name, date and number right?',
  feelings_their_own: 'Where it speaks of how they feel, is it only what they said themselves, never feelings it describes for them?',
  length: 'Is it three to six sentences?',
};

async function summaryOne(mod, c) {
  const turns = [...c.turns.map(([who, t]) => `${who}: ${t}`), `Gremly: ${c.last}`].join('\n');
  const prompt = mod.runningSummaryPrompt({ today: TODAY, spaceName: null, previousSummary: c.prior, turns });
  const res = await helperFetch('running_summary', { messages: [{ role: 'user', content: prompt }], max_tokens: 350, temperature: 0.3 });
  const data = await res.json();
  const summary = (data.choices?.[0]?.message?.content || '').trim();
  const j = await judge(SUMMARY_Q, `${c.prior ? `THE SUMMARY SO FAR:\n${c.prior}\n\n` : ''}THE CONVERSATION:\n${turns}\n\nWHAT THE SUMMARY MUST HOLD: ${c.must}\n\nTHE SUMMARY:\n${summary}`).catch((e) => ({ error: e.message }));
  return { text: c.id, summary, judged: j };
}

// ── search: whether the agent searches ────────────────────────────────────

const ASKS = [
  ['What are the best running shoes for flat feet right now?', true],
  ['Is magnesium good for sleep?', true],
  ['What time does the Porto old town food market open on Sundays?', true],
  ['Any good things on in Edinburgh this weekend?', true],
  ['How do I fix a dripping kitchen tap?', true],
  ['What do I have on tomorrow?', false],
  ['I just feel really flat today.', false],
  ['Morning!', false],
  ['What is 15 percent of 240?', false],
  ['Can you move the dentist todo to Friday?', false],
];

async function searchOne(mod, [msg, should]) {
  const tool = { type: 'function', function: { name: 'web_search', description: mod.WEB_SEARCH_DESCRIPTION, parameters: { type: 'object', properties: { query: { type: 'string', description: 'what to search for, as a search engine query' } }, required: ['query'] } } };
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-6-luna',
      // tools on chat completions take no reasoning on Luna; the agent itself reasons on the Responses API
      reasoning_effort: 'none',
      max_completion_tokens: 2000,
      tools: [tool],
      tool_choice: 'auto',
      messages: [
        { role: 'system', content: 'You are Gremly, a warm companion in a productivity app, talking with Alex. Their own tasks, habits and notes are already given to you in the app, so you never need to look them up.' },
        { role: 'user', content: msg },
      ],
    }),
  });
  const j = await res.json();
  const searched = Boolean(j.choices?.[0]?.message?.tool_calls?.some((t) => t.function?.name === 'web_search'));
  return { text: msg, searched, ok: searched === should };
}

// ── title --real: the title call on real drops ────────────────────────────
// Recent drops from James's account and the main tester's, plus their older
// events (real/drops.json, gitignored, exported with the Supabase MCP). The
// old prompt gets the kind each drop was saved as, as the Worker gave it after
// the classifier; the new one gets none, as it runs at the tap. "Today" is the
// day of each drop in its person's timezone. The details call runs on each drop
// with its kind, and a judge lists every when, how often, how long or feeling
// the new title leaves out that the details do not hold. No recent reactions
// are passed here: the made up set above checks variety. Resumable: one line
// per drop in out/real-title.jsonl; a run starts no drop after --budget seconds.

const ZONE = { J: 'America/Los_Angeles', T: 'Europe/London' };

function kindOf(d) {
  if (d.table === 'todo') return { bucket: 'todo', subtype: null };
  if (d.table === 'habit') return { bucket: 'habit', subtype: d.subtype || 'start_habit' };
  return { bucket: 'log', subtype: d.subtype && d.subtype !== 'catchall' ? d.subtype : 'general' };
}

function dayOf(at, tz) {
  const when = new Date(at);
  return {
    currentDate: new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(when),
    dayOfWeek: new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: tz }).format(when),
  };
}

// How the Worker showed the old prompt's words before this build, copied from
// cortex-index.js for this page only: Title Case lowered every letter after
// the first, an out of range title became the drop cut at 50 characters, and
// a fixed opener was added to the reaction at random.
function oldTitleCase(s) {
  const small = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
  return String(s || '').trim().split(/\s+/).map((w, i) => (!w ? w : i === 0 || !small.has(w.toLowerCase()) ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join(' ');
}
const OLD_OPENERS = {
  todo: ['Got it.', 'On it.', "I've got this.", "I'm on it.", "Won't forget.", "It's on my list."],
  habit: ['Got it.', "I'll be watching.", "I'm on it.", 'Tracking.', "I've got this."],
  log_journal: ['Safe with me.', 'I hear you.', 'Got it.', 'Yours is safe.', "I've got this.", "That's between us."],
  log_idea: ['Got it.', 'Stored away.', 'Holding onto this.', "I've got this.", 'Tucked away.'],
  log_event: ['Got it.', "Won't miss it.", "I'm on it.", "I've got this."],
  general: ['Got it.', 'Safe with me.', "I've got this.", 'On it.'],
};
function oldShown(out, text, { bucket, subtype }) {
  let t = String(out?.smart_title || '').trim();
  if (t.length < 3 || t.length > 60) t = text.substring(0, 50).trim();
  let r = String(out?.confirmation_message || '').trim();
  const pool = OLD_OPENERS[bucket === 'log' ? `log_${subtype}` : bucket] || OLD_OPENERS.general;
  const opener = pool[Math.floor(Math.random() * pool.length)];
  let speech = r ? (Math.random() < 0.45 ? `${r} ${opener}` : `${opener} ${r}`) : '';
  if (speech.length > 70) speech = speech.substring(0, 67) + '...';
  return { title: oldTitleCase(t), speech };
}

const CAUGHT_SCHEMA = {
  type: 'object',
  properties: {
    left_out: { type: 'array', items: { type: 'string' } },
    not_caught: { type: 'array', items: { type: 'string' } },
    why: { type: 'string' },
  },
  required: ['left_out', 'not_caught', 'why'],
};

async function caughtJudge({ raw, today, title, details }) {
  const { output, model } = await jsonCall(env, {
    primary: { provider: 'anthropic', model: 'claude-sonnet-5-5' },
    fallback: { provider: 'openai', model: 'gpt-6-sol' },
    system: `You check whether what a companion app left out of an item's title was kept in the item's details. First list each part of what they dropped that says when it happens, how often, how long it takes or how they feel, and that the title leaves out, quoting their words. Then list the ones the details do not hold: a day, date, time or part of the day is held when a date, time or part of the day field gives it; how often is held when the frequency or days fields give it; how long is held when the time estimate gives it; a feeling is held when the mood gives it. Judge only from what you are shown. Answer in JSON only.`,
    user: `WHAT THEY DROPPED: "${raw}"\nTODAY: ${today}\nTITLE: ${title}\nDETAILS: ${JSON.stringify(details)}`,
    schema: CAUGHT_SCHEMA,
    maxTokens: 4000,
    effort: 'low',
    thinking: 'low',
  });
  return { ...output, judge_model: model };
}

async function realOne(i, d) {
  const kind = kindOf(d);
  const tz = ZONE[d.who] || 'UTC';
  const day = dayOf(d.at, tz);
  const [oldOut, newOut, details] = await Promise.all([
    OLD ? mini(OLD.titleReactionPrompt(day), OLD.titleReactionUser({ text: d.raw, ...kind }), { temperature: 0.7, maxOutputTokens: 150 }) : null,
    mini(NEW.titleReactionPrompt(day), NEW.titleReactionUser({ text: d.raw }), { temperature: 0.7, maxOutputTokens: 150 }),
    mini(NEW.detailsPrompt({ ...day, timezone: tz, userSelectedDate: null, ...kind }), d.raw.substring(0, 1500), { temperature: 0.2, maxOutputTokens: 300 }),
  ]);
  if (!newOut) throw new Error('no answer from the new title call');
  const modelTitle = String(newOut.smart_title || '').trim();
  const fresh = {
    title_model: modelTitle,
    title: modelTitle ? sentenceCase(modelTitle) : fallbackTitle(d.raw, 'replay'),
    fallback: !modelTitle,
    reaction: String(newOut.confirmation_message || '').trim(),
  };
  const old = oldOut
    ? { title_model: String(oldOut.smart_title || '').trim(), reaction: String(oldOut.confirmation_message || '').trim(), card_note: oldOut.card_note || null, shown: oldShown(oldOut, d.raw, kind) }
    : null;
  const show = (t, r) => `WHAT THEY DROPPED: "${d.raw}"\n\nTITLE: ${t}\nREACTION: ${r}`;
  const [jNew, jOld, caught] = await Promise.all([
    judge(TITLE_Q, show(fresh.title, fresh.reaction)).catch((e) => ({ error: e.message })),
    old ? judge(TITLE_Q, show(old.shown.title, old.reaction)).catch((e) => ({ error: e.message })) : null,
    caughtJudge({ raw: d.raw, today: `${day.currentDate} (${day.dayOfWeek})`, title: fresh.title, details }).catch((e) => ({ error: e.message })),
  ]);
  return { i, ok: true, who: d.who, at: d.at, today: day.currentDate, kind, raw: d.raw, title_today: d.title_today, reaction_today: d.reaction_today, old, new: fresh, details, judged: { new: jNew, old: jOld }, caught };
}

async function realTitle() {
  const drops = JSON.parse(readFileSync(join(HERE, 'real', 'drops.json'), 'utf8'));
  mkdirSync(join(HERE, 'out'), { recursive: true });
  const file = join(HERE, 'out', 'real-title.jsonl');
  const okNow = () => new Set((existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : []).map((l) => JSON.parse(l)).filter((o) => o.ok).map((o) => o.i));
  const done = okNow();
  const todo = drops.map((_, i) => i).filter((i) => !done.has(i));
  const budget = Number(flag('--budget') || 140) * 1000;
  const conc = Number(flag('--conc') || 6);
  const started = Date.now();
  let next = 0;
  async function worker() {
    while (next < todo.length && Date.now() - started < budget) {
      const i = todo[next++];
      const row = await realOne(i, drops[i]).catch((e) => ({ i, ok: false, error: String(e).slice(0, 200) }));
      appendFileSync(file, JSON.stringify(row) + '\n');
    }
  }
  await Promise.all(Array.from({ length: conc }, worker));
  console.log(`[words-replay] ${okNow().size} of ${drops.length} drops done`);
}

if (part === 'title' && args.includes('--real')) {
  await realTitle();
  process.exit(0);
}

// ── the run ──────────────────────────────────────────────────────────────

const rows = [];
for (let r = 0; r < repeat; r += 1)
  for (const [side, mod] of sides) {
    if (part === 'title') {
      const recent = [];
      for (const d of DROPS) {
        const x = await titleOne(mod, d, recent.slice(-5), side === 'old');
        if (x.reaction) recent.push(x.reaction);
        rows.push({ side, ...x });
      }
    } else if (part === 'reclassify') for (const c of CLARIFIED) rows.push({ side, ...(await reclassOne(mod, c)) });
    else if (part === 'details') rows.push(...(await Promise.all(DETAILS.map((d) => detailsOne(mod, d)))).map((x) => ({ side, ...x })));
    else if (part === 'time') rows.push(...(await Promise.all(TIMES.map((t) => timeOne(mod, t)))).map((x) => ({ side, ...x })));
    else if (part === 'summary') rows.push(...(await Promise.all(CHATS.map((c) => summaryOne(mod, c)))).map((x) => ({ side, ...x })));
    else rows.push(...(await Promise.all(ASKS.map((a) => searchOne(mod, a)))).map((x) => ({ side, ...x })));
  }

const L = [];
for (const [side] of sides) {
  const mine = rows.filter((x) => x.side === side);
  const failed = mine.filter((x) => x.failed).length;
  if (part === 'details' || part === 'time') {
    const right = mine.filter((x) => !x.off.length).length;
    L.push(`${side}: ${right} of ${mine.length} items with every field right${failed ? `, ${failed} no answer` : ''}`);
  } else if (part === 'search') {
    L.push(`${side}: ${mine.filter((x) => x.ok).length} of ${mine.length} right about searching`);
  } else {
    const q = part === 'title' ? TITLE_Q : part === 'reclassify' ? RECLASS_Q : SUMMARY_Q;
    const judged = mine.filter((x) => x.judged && !x.judged.error);
    const held = Object.keys(q).map((k) => `${k} ${judged.filter((x) => x.judged[k]).length}/${judged.length}`);
    const extra =
      part === 'title'
        ? `, lengths ${mine.filter((x) => x.fits).length}/${mine.length}`
        : part === 'reclassify'
          ? `, kind ${mine.filter((x) => x.kindRight).length}/${mine.length}, dates ${mine.filter((x) => x.datesRight).length}/${mine.length}, lengths ${mine.filter((x) => x.fits).length}/${mine.length}`
          : '';
    L.push(`${side}: ${held.join(', ')}${extra}${failed ? `, ${failed} no answer` : ''}`);
  }
}
for (const x of rows) {
  if (part === 'details' || part === 'time') {
    if (x.off.length) console.log(`  ${x.side} off: ${x.text} | ${x.off.join('; ')}`);
  } else if (part === 'search') {
    if (!x.ok) console.log(`  ${x.side} off: ${x.text} | searched ${x.searched}`);
  } else {
    const q = part === 'title' ? TITLE_Q : part === 'reclassify' ? RECLASS_Q : SUMMARY_Q;
    const short = x.judged && !x.judged.error ? Object.keys(q).filter((k) => !x.judged[k]) : [];
    console.log(`  ${x.side} | ${x.text.slice(0, 50)} | ${x.title ? `${x.title} | ${x.note ?? ''} | ${x.reaction}` : (x.summary || '').slice(0, 200)}${short.length ? ` | SHORT ${short.join(',')}: ${x.judged.why}` : ''}${x.fits === false ? ' | LENGTH' : ''}${x.kindRight === false ? ' | KIND' : ''}${x.datesRight === false ? ` | DATES ${JSON.stringify(x.got)}` : ''}`);
  }
}
console.log(`\n${part}, ${repeat} runs\n${L.join('\n')}`);
const out = join(HERE, 'out');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, `${part}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify({ part, repeat, rows, summary: L }, null, 2));
