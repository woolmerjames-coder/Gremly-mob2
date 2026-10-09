/**
 * Mind Drop's enrichment and the chat helpers, replayed (18 Oct): each prompt
 * in workers/cortex/minddropPrompts.js beside the prompt it replaced, called
 * as the worker calls it (aiClassify on the mini tier, helperFetch for the
 * running summary, the agent's model with its web search tool), on made up
 * items only.
 *
 *   scripts/minddrop-prompt-replay/run.sh <part> --old <module> [--repeat n]
 *     title       the title, card note and reaction for a drop
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

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as PROMPTS from '../../workers/cortex/minddropPrompts.js';
import { WEB_SEARCH_DESCRIPTION } from '../../workers/cortex/agent/tools/webSearch.js';

const NEW = { ...PROMPTS, WEB_SEARCH_DESCRIPTION };
import { aiClassify, getProviders } from '../../workers/cortex/aiProvider.js';
import { configureModels } from '../../workers/cortex/models.js';
import { helperFetch } from '../../workers/cortex/helperClient.js';
import { jsonCall } from '../../workers/inngest-jobs/context/llm.js';

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
  const { output } = await jsonCall(env, {
    primary: { provider: 'anthropic', model: 'claude-sonnet-5-5' },
    fallback: { provider: 'openai', model: 'gpt-6-sol' },
    system: `You check what a companion app wrote against its rules. Answer each question true or false about the writing given, judging only from what you are shown, then say in one sentence what falls short, if anything. Answer in JSON only.\n\nQUESTIONS:\n${keys.map((k) => `${k}: ${questions[k]}`).join('\n')}`,
    user: text,
    schema: JUDGE_SCHEMA(keys),
    maxTokens: 4000,
    effort: 'low',
    thinking: 'low',
  });
  return output;
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
  title_clean: 'Does the title leave out dates, times, days, how often, and how they feel, and is it the thing itself rather than the act of noting, remembering or tracking it?',
  note_specific: 'Does the card note name something specific from what they wrote, and differ from both the title and the reaction?',
  reaction_specific: 'Is the reaction about this drop in particular, so that it would not fit another drop as well?',
  reaction_voice: 'Does the reaction read as a friend texting back: never speaking of the drop as kept, noted, saved, scheduled or on a list, never therapy language, never restating the title, never ending on a filler word or tag question?',
};

async function titleOne(mod, [text, bucket, subtype], recent) {
  const out = await mini(mod.titleReactionPrompt({ currentDate: TODAY, dayOfWeek: WEEKDAY }), mod.titleReactionUser({ text, bucket, subtype, recentReactions: recent }), { temperature: 0.7, maxOutputTokens: 150 });
  if (!out) return { text, failed: true };
  const t = out.smart_title || '';
  const n = out.card_note || '';
  const r = out.confirmation_message || '';
  const fits = words(t) >= 2 && words(t) <= 8 && words(n) >= 3 && words(n) <= 9 && words(r) >= 4 && words(r) <= 13 && r.length <= 75 && !/!!/.test(r);
  const j = await judge(TITLE_Q, `WHAT THEY DROPPED (${bucket}${subtype ? `, ${subtype}` : ''}): "${text}"\n\nTITLE: ${t}\nCARD NOTE: ${n}\nREACTION: ${r}`).catch((e) => ({ error: e.message }));
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
  reaction_specific: TITLE_Q.reaction_specific,
  reaction_voice: TITLE_Q.reaction_voice,
};

async function reclassOne(mod, c) {
  const ctx = `=== CONTEXT ===\nORIGINAL INPUT: "${c.text}"\nUSER SELECTED: "${c.label}"\nSELECTED BUCKET: ${c.bucket}\nSELECTED SUBTYPE: ${c.subtype || 'not specified'}\nCURRENT DATE: ${TODAY}`;
  const out = await mini(mod.reclassifyPrompt(), ctx, { temperature: 0.3, maxOutputTokens: 250 });
  if (!out) return { text: c.text, failed: true };
  const datesRight = (out.target_date || null) === (c.target || null) && (out.scheduled_date || null) === (c.scheduled || null);
  const kindRight = out.bucket === c.bucket && (!c.subtype || out.subtype === c.subtype);
  const r = out.confirmation_message || '';
  const fits = words(out.smart_title) >= 2 && words(out.smart_title) <= 8 && words(r) >= 3 && words(r) <= 11 && r.length <= 55 && !/!/.test(r);
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

// ── the run ──────────────────────────────────────────────────────────────

const rows = [];
for (let r = 0; r < repeat; r += 1)
  for (const [side, mod] of sides) {
    if (part === 'title') {
      const recent = [];
      for (const d of DROPS) {
        const x = await titleOne(mod, d, recent.slice(-5));
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
