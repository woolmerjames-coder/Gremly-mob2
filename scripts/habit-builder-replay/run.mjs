/**
 * The habit builder's replay (workers/cortex/habitBuilderPrompt.js): habits
 * that overlap something Gremly already has, where the builder points the
 * person at it. It must name what the app has now, where it really is: the
 * evening wrap up is in Chat, Worlds took the place of Spaces, and Lock In
 * and the Sweep banner are gone.
 *
 *   scripts/habit-builder-replay/run.sh [--only id,id] [--repeat n] [--stage NEW|BUILDING|TRUSTED]
 *
 * The model is CHAT_MODEL (workers/cortex/wrangler.toml), as the habit builder
 * runs. Every name and message is made up.
 * GEMINI_TEST_API_KEY comes from the environment.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HABIT_BUILDER_PROMPT } from '../../workers/cortex/habitBuilderPrompt.js';
import { geminiGenerate } from '../../workers/cortex/geminiClient.js';
import { configureModels } from '../../workers/cortex/models.js';
import { getAgeGuidance } from '../../workers/cortex/context/gremlyAge.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const only = flag('--only');
const repeat = Math.max(1, Number(flag('--repeat') || 1));
const MODEL = flag('--model') || 'gemini-3-flash-preview';

// --stage NEW, BUILDING or TRUSTED adds Gremly's voice for how long it has known them, as the habit builder does
const STAGE_AT = { NEW: [3, 0], BUILDING: [30, 12], TRUSTED: [120, 40] };
const stage = flag('--stage');
const age = stage
  ? getAgeGuidance(new Date(Date.now() - STAGE_AT[stage][0] * 86400000).toISOString(), { message_count: STAGE_AT[stage][1] })
  : null;
const CONTEXT = `\n\n=== SESSION CONTEXT ===\nExisting habits: none yet.\nUSER PROFILE: Alex, works in client services, lives with their partner Jo.${age ? `\n${age.promptGuidance}\n` : ''}`;
// a pattern said as how they always are, or, while Gremly is new, any pattern claimed
const ABSOLUTE = /\byou (always|never)\b/i;
const NOTICED = /\bI(['’]ve| have) noticed\b|\byou tend to\b/i;

// What no reply may say: things the app no longer has
// (top priorities in general are fine; Lock In as a feature is checked below)
const GONE = /evening sweep|sweep banner|organi[sz]e button|daily planner|mind drop tab|chat tab/i;
// Lock In as the feature's name (locking in a habit they are shaping is fine)
const LOCK_IN = /\bLock[- ]In\b|\block[- ]ins?\b(?= (are|is|for|as) )/;
// Spaces as a feature they have (space as an everyday word is fine)
const SPACES = /\bSpaces\b|\b(your|a|the|its own) Space\b/;

const SCENARIOS = [
  {
    id: 'journal-at-night',
    look: 'Points to the evening wrap up in Chat for the journal, not a Sweep banner on Today.',
    messages: [
      { role: 'user', content: 'I want to start journaling every night before bed' },
      { role: 'assistant', content: "Love that. What's pulling you toward it right now?" },
      { role: 'user', content: 'My head is just full at night and I want to get things out of it before sleeping' },
    ],
    mentions: /wrap/i,
  },
  {
    id: 'reflect-and-mood',
    look: 'Reflecting on the day and tracking mood: the evening wrap up in Chat.',
    messages: [
      { role: 'user', content: 'I want to reflect on my day each evening and keep track of my mood' },
      { role: 'assistant', content: 'That sounds like a good way to close the day. What made you want to start?' },
      { role: 'user', content: "I've noticed my moods swing and I don't know why. Want to spot patterns" },
    ],
    mentions: /wrap/i,
  },
  {
    id: 'plan-mornings',
    look: 'Planning the day: no Organize button and no Lock In, which are gone.',
    messages: [
      { role: 'user', content: 'I want to plan my day every morning so I stop feeling scattered' },
      { role: 'assistant', content: "Scattered is a rough way to spend a day. What does a scattered day look like for you?" },
      { role: 'user', content: 'I just react to whatever comes up and the important stuff never happens' },
    ],
  },
  {
    id: 'quit-vaping',
    look: 'A habit being broken: checked in on in the evening wrap up, if the tracking is mentioned.',
    messages: [
      { role: 'user', content: 'I want to quit vaping' },
      { role: 'assistant', content: "That's a big one, and a good one. What's making now the time?" },
      { role: 'user', content: "My partner's been on at me and honestly I'm sick of feeling like I need it. Mostly I vape in the evenings after work" },
    ],
  },
  {
    id: 'running-area',
    look: 'A habit in an area of life they are building up: its World on the Worlds tab, never a Space.',
    messages: [
      { role: 'user', content: 'I want to get serious about my running this year' },
      { role: 'assistant', content: 'Love it. What does serious look like for you?' },
      { role: 'user', content: 'Training properly for a 10k in the spring, and keeping all my running stuff together in one place' },
    ],
    mentions: /World|Chapter/,
  },
  {
    id: 'allotment-project',
    look: 'A habit toward something with an end: a Chapter in its World, never a Space.',
    messages: [
      { role: 'user', content: 'I want to spend a bit of time on my allotment every weekend' },
      { role: 'assistant', content: "Nice. What's got you wanting to go back to it?" },
      { role: 'user', content: "I took it on last year and it's got away from me. I want it in shape before summer and to keep track of what needs doing" },
    ],
    mentions: /World|Chapter/,
  },
];

async function runOne(s) {
  const started = Date.now();
  try {
    const out = await geminiGenerate(
      `${HABIT_BUILDER_PROMPT}${CONTEXT}`,
      s.messages,
      { model: MODEL, temperature: 0.7, maxOutputTokens: 2048, thinkingLevel: 'low', label: 'habit_builder_replay' },
      process.env.GEMINI_TEST_API_KEY,
    );
    const reply = String(out.text || out.content || out.reply || '').trim();
    if (!reply) return { id: s.id, ok: false, ms: Date.now() - started, error: `no reply: ${JSON.stringify(out).slice(0, 300)}` };
    const checks = [
      { name: 'Names nothing the app no longer has', ok: !GONE.test(reply), detail: (reply.match(GONE) || [])[0] || '' },
      { name: 'Never names Lock In', ok: !LOCK_IN.test(reply), detail: (reply.match(LOCK_IN) || [])[0] || '' },
      { name: 'Never names Spaces', ok: !SPACES.test(reply), detail: (reply.match(SPACES) || [])[0] || '' },
      ...(age
        ? [
            { name: 'Never says how they always or never are', ok: !ABSOLUTE.test(reply), detail: (reply.match(ABSOLUTE) || [])[0] || '' },
            ...(age.stage === 'NEW' ? [{ name: 'Claims no pattern while new', ok: !NOTICED.test(reply), detail: (reply.match(NOTICED) || [])[0] || '' }] : []),
          ]
        : []),
    ];
    const warns = s.mentions ? [{ name: `Mentions ${s.mentions}`, ok: s.mentions.test(reply) }] : [];
    return { id: s.id, ok: checks.every((c) => c.ok), ms: Date.now() - started, checks, warns, reply };
  } catch (err) {
    return { id: s.id, ok: false, ms: Date.now() - started, error: String(err?.message || err) };
  }
}

configureModels({ GEMINI_API_KEY: process.env.GEMINI_TEST_API_KEY });
const scenarios = only ? SCENARIOS.filter((s) => only.split(',').includes(s.id)) : SCENARIOS;
const jobs = scenarios.flatMap((s) => Array.from({ length: repeat }, () => s));
console.log(`${jobs.length} habit builder replies on ${MODEL}`);
const results = await Promise.all(jobs.map(runOne));
for (const r of results) {
  const why = r.error || (r.checks || []).filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`).join('; ');
  const warn = (r.warns || []).filter((w) => !w.ok).map((w) => `warn: ${w.name}`).join('; ');
  console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.id} · ${r.ms}ms${why ? ` · ${why}` : ''}${warn ? ` · ${warn}` : ''}`);
  if (r.reply) console.log(`      ${r.reply.replace(/\s+/g, ' ').slice(0, 600)}`);
}
console.log(`\n${results.filter((r) => r.ok).length} of ${results.length} name only what the app has`);
const dir = join(HERE, 'out', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'results.json'), JSON.stringify(results, null, 2));
