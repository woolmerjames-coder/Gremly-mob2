/**
 * The story replay (workers/inngest-jobs/context/story.js): the monthly story
 * written for a made up person (people.mjs) by the model the job uses, before
 * and after a change to what the story is shown.
 *
 *   scripts/story-replay/run.sh [--label before|after] [--repeat n]
 *
 * It builds the request exactly as the job does (storyRequestParams, over an
 * in memory database), sends it, and turns the reply into rows the way the
 * job does (storyRows). Code then counts: items in each list, rows kept and
 * dropped, milestones linked to a Chapter, any item linked to a Chapter that
 * is not hers (one Gremly suggested and she never accepted), and any body
 * that repeats an old Chapter kind word. The story so far and every title go
 * in the report to be read.
 *
 * Keys come from .audit-keys.local or the environment (scripts/chat-audit/keys.mjs).
 * Output goes to scripts/story-replay/out/ (gitignored): made up data only.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keys } from '../chat-audit/keys.mjs';
import { fakeDb } from '../life-replay/fakeDb.mjs';
import {
  storyRequestParams,
  storyRows,
  STORY_PROMPT_VERSION,
} from '../../workers/inngest-jobs/context/story.js';
import { anthropicJsonResult } from '../../workers/inngest-jobs/context/llm.js';
import { USER, TODAY, TABLES, RPC, NOT_HERS, KIND_WORDS } from './people.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const label = flag('--label') || 'run';
const repeat = Math.max(1, Number(flag('--repeat') || 2));

const HOST = 'https://story-replay.invalid';
const realFetch = globalThis.fetch;
let dbFetch = null;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url || String(input);
  if (url.startsWith(HOST)) return dbFetch(url, init);
  return realFetch(input, init);
};

// The job reads today in the person's timezone; the replay holds it to TODAY
const RealDate = Date;
const fixed = new RealDate(`${TODAY}T10:00:00Z`).getTime();
globalThis.Date = class extends RealDate {
  constructor(...a) {
    super(...(a.length ? a : [fixed]));
  }
  static now() {
    return fixed;
  }
};

const env = { SUPABASE_URL: HOST, SUPABASE_SERVICE_KEY: 'replay', ANTHROPIC_API_KEY: keys.anthropic };

async function once(i) {
  const { handle } = fakeDb(structuredClone(TABLES), RPC);
  dbFetch = handle;
  const req = await storyRequestParams(env, USER);
  const started = RealDate.now();
  const res = await realFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': keys.anthropic,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(req.params),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${text.slice(0, 300)}`);
  const output = anthropicJsonResult(JSON.parse(text));
  const { rows = [], dropped = [] } =
    storyRows(USER, output, req.refsSnapshot, { runId: `replay-${i}`, model: req.params.model, today: req.today }) || {};
  const refs = new Map(req.refsSnapshot);
  const chapterOf = (r) => (r && refs.get(r)?.type === 'chapter' ? refs.get(r).id : null);
  const milestones = output.milestones || [];
  const linked = milestones.map((m) => chapterOf(m.chapter_ref)).filter(Boolean);
  const bodies = [
    output.story_for_them,
    ...['milestones', 'shifts', 'proud_moments', 'patterns', 'people'].flatMap((k) =>
      (output[k] || []).map((x) => `${x.title || x.name}: ${x.body}`),
    ),
  ];
  return {
    i,
    seconds: Math.round((RealDate.now() - started) / 1000),
    inputChars: req.inputChars,
    counts: Object.fromEntries(
      ['milestones', 'shifts', 'proud_moments', 'patterns', 'people'].map((k) => [k, (output[k] || []).length]),
    ),
    kept: Array.isArray(rows) ? rows.length : 0,
    dropped: Array.isArray(dropped) ? dropped.length : 0,
    milestonesLinked: `${linked.length} of ${milestones.length}`,
    linkedNotHers: linked.filter((id) => NOT_HERS.includes(id)),
    kindWords: bodies.filter((b) => KIND_WORDS.test(String(b || ''))),
    storyForThem: output.story_for_them,
    titles: Object.fromEntries(
      ['milestones', 'shifts', 'proud_moments', 'patterns', 'people'].map((k) => [
        k,
        (output[k] || []).map((x) => `${x.title || x.name}${x.chapter_ref ? ` [${chapterOf(x.chapter_ref)}]` : ''}`),
      ]),
    ),
  };
}

if (!keys.anthropic) throw new Error('No ANTHROPIC_API_KEY');
const results = [];
for (let i = 1; i <= repeat; i++) {
  try {
    results.push(await once(i));
    console.log(`run ${i}: done`);
  } catch (err) {
    results.push({ i, error: String(err?.message || err) });
    console.log(`run ${i}: ${err?.message || err}`);
  }
}

const stamp = new RealDate().toISOString().replace(/[:.]/g, '-');
const outDir = join(HERE, 'out');
mkdirSync(outDir, { recursive: true });
const base = join(outDir, `${label}-${stamp}`);
writeFileSync(`${base}.json`, JSON.stringify({ label, prompt: STORY_PROMPT_VERSION, results }, null, 2));
const md = [
  `# Story replay: ${label} (${STORY_PROMPT_VERSION})`,
  '',
  ...results.flatMap((r) =>
    r.error
      ? [`## Run ${r.i}: failed`, r.error, '']
      : [
          `## Run ${r.i} (${r.seconds}s, ${r.inputChars} chars in)`,
          `Counts: ${JSON.stringify(r.counts)}. Kept ${r.kept}, dropped ${r.dropped}.`,
          `Milestones linked to a Chapter: ${r.milestonesLinked}. Linked to one not hers: ${r.linkedNotHers.join(', ') || 'none'}.`,
          `Bodies with an old kind word: ${r.kindWords.length}`,
          '',
          `So far: ${r.storyForThem}`,
          '',
          ...Object.entries(r.titles).map(([k, v]) => `- ${k}: ${v.join('; ') || '(none)'}`),
          '',
        ],
  ),
].join('\n');
writeFileSync(`${base}.md`, md);
console.log(md);
