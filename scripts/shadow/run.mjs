/**
 * The shadow runner: a pipeline job's own code, run for one real person on a
 * past day, week or correction, with every write kept aside (harness.js).
 *
 *   scripts/shadow/run.sh morning    --user <uuid> --day YYYY-MM-DD [--at HH:MM]
 *   scripts/shadow/run.sh story-copy --user <uuid> [--at ISO]
 *   scripts/shadow/run.sh correction --correction <uuid> [--said "other words"]
 *   scripts/shadow/run.sh ... --code <dir>   run another tree's code (run.sh)
 *
 * Keys come from the environment: SHADOW_SUPABASE_KEY (a key for the
 * shadow_reader role, which may only read), OPENAI_API_KEY,
 * GEMINI_TEST_API_KEY and, for weekly jobs, ANTHROPIC_API_KEY. Results are
 * written under "Claude outputs/shadow" in this checkout (SHADOW_OUT to
 * change it), which git ignores: real data never goes into the repo.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fakeKV,
  installClock,
  installFetchGuard,
  shadowCost,
  workerVars,
} from './harness.js';
import { aiContext, installAiUsageLogging } from '../../workers/shared/aiUsage.js';
import { buildDcoV4, writeDco } from '../../workers/inngest-jobs/context/daily.js';
// a namespace import, so a tree without the story copy (main before stage 0) still bundles
import * as story from '../../workers/inngest-jobs/context/story.js';
import { applyCorrection } from '../../workers/inngest-jobs/context/corrections.js';
import { localStartIso } from '../../workers/shared/calendar.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const args = process.argv.slice(2);
const job = args[0];
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const SUPABASE_URL = process.env.SHADOW_SUPABASE_URL || 'https://pvfnnpcfmgczlcglvlzl.supabase.co';
const KEY = process.env.SHADOW_SUPABASE_KEY || '';
// the project's public key, which the gateway wants as apikey; the app's own anon key
const APIKEY = process.env.SHADOW_SUPABASE_APIKEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

/** The key must be the read only role's, never the service key. */
function keyRole(key) {
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
    return payload.role || null;
  } catch {
    return null;
  }
}
if (!KEY) fail('SHADOW_SUPABASE_KEY is not set. See scripts/shadow/README.md.');
if (keyRole(KEY) !== 'shadow_reader')
  fail(`SHADOW_SUPABASE_KEY is for the role "${keyRole(KEY)}", not shadow_reader. Nothing was run.`);
if (!APIKEY) fail('The project\'s public anon key is not set (SHADOW_SUPABASE_APIKEY or EXPO_PUBLIC_SUPABASE_ANON_KEY). See scripts/shadow/README.md.');
if (keyRole(APIKEY) !== 'anon' && !APIKEY.startsWith('sb_publishable_'))
  fail('The apikey must be the project\'s public anon key, never a secret one. Nothing was run.');

const record = { reads: [], writes: [], calls: [], usage: [], effects: [] };
const env = {
  ...workerVars(join(ROOT, 'workers/inngest-jobs/wrangler.toml')),
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY: KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_TEST_API_KEY || process.env.GEMINI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  CONTEXT_CACHE: fakeKV(record),
};

/** A real read through the guard, outside any job: what live holds. */
async function liveRead(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: APIKEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) fail(`Read failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function timezoneOf(userId) {
  const [p] = await liveRead(`notification_preferences?user_id=eq.${userId}&select=timezone`);
  const [u] = await liveRead(`user_profiles?user_id=eq.${userId}&select=timezone`);
  return p?.timezone || (u?.timezone && u.timezone !== 'UTC' ? u.timezone : null) || 'America/Los_Angeles';
}

/** The moment a job runs at: the given time on the day, in the person's own zone. */
function momentOn(day, hhmm, tz) {
  const [h, m] = (hhmm || '04:30').split(':').map(Number);
  return new Date(Date.parse(localStartIso(tz, day)) + (h * 60 + m) * 60000).toISOString();
}

const JOBS = {
  async morning() {
    const userId = flag('--user');
    const day = flag('--day');
    if (!userId || !day) fail('morning needs --user and --day');
    const tz = await timezoneOf(userId);
    const at = momentOn(day, flag('--at'), tz);
    const [live] = await liveRead(`user_daily_state?user_id=eq.${userId}&date=eq.${day}&select=dco,extraction_raw`);
    return {
      at,
      userId,
      run: async () => {
        const built = await buildDcoV4(env, userId, { tz });
        await writeDco(env, userId, built, { shadow: false });
        return built;
      },
      summarise: (built) => ({
        day,
        shadow: pickMorning(built?.dco, built),
        // live keeps only the count of failed checks, and its row may have been changed since the morning
        live: live
          ? pickMorning(live.dco, {
              attempts: live.extraction_raw?.attempts,
              inputChars: live.extraction_raw?.input_chars,
              failed: live.extraction_raw?.review_flags,
            })
          : null,
      }),
    };
  },

  async 'story-copy'() {
    const userId = flag('--user');
    if (!userId) fail('story-copy needs --user');
    return {
      at: flag('--at') || new Date().toISOString(),
      userId,
      run: () => {
        if (typeof story.copyStoryIntoLifeMap !== 'function') fail('This tree has no story copy.');
        return story.copyStoryIntoLifeMap(env, userId);
      },
      summarise: (out) => ({
        result: out,
        life_map_writes: record.writes
          .filter((w) => w.table === 'user_life_map')
          .map((w) => ({
            method: w.method,
            story_passages: Boolean(w.body?.life_map?.story?.story_so_far && w.body?.life_map?.story?.story_for_them),
            story_items: Object.fromEntries(
              ['milestones', 'shifts', 'proud_moments', 'patterns', 'people'].map((k) => [k, w.body?.life_map?.story?.[k]?.length || 0]),
            ),
          })),
      }),
    };
  },

  async correction() {
    const id = flag('--correction');
    if (!id) fail('correction needs --correction');
    const [c] = await liveRead(`user_corrections?id=eq.${id}&select=id,user_id,created_at,status`);
    if (!c) fail('No such correction');
    const at = new Date(Date.parse(c.created_at) + 60000).toISOString();
    return {
      at,
      userId: c.user_id,
      // replayed as if it had not been applied yet; --said tries other words in its place
      rewrite: ({ table, body }) => {
        if (table !== 'user_corrections') return null;
        const rows = JSON.parse(body);
        const said = flag('--said');
        return Array.isArray(rows)
          ? rows.map((r) => (r.id === id ? { ...r, status: 'pending', ...(said ? { said } : {}) } : r))
          : null;
      },
      run: () => applyCorrection(env, id, `shadow-${Date.now()}`),
      summarise: (out) => ({
        said_replaced: !!flag('--said'),
        result: out,
        world_and_chapter_writes: record.writes
          .filter((w) => w.table === 'worlds' || w.table === 'chapters')
          .map((w) => ({
            table: w.table,
            fields: Object.keys(w.body || {}),
            marks_as_theirs: Object.entries(w.body || {}).some(([k, v]) => k.endsWith('_source') && v === 'user'),
          })),
      }),
    };
  },
};

function pickMorning(dco, built) {
  if (!dco) return null;
  return {
    headline: dco.brief?.headline ?? null,
    day_shape: dco.brief?.day_shape ?? null,
    lead: dco.lead_story?.what ?? null,
    claims: (dco.brief?.claims || []).length,
    focus: (dco.today_focus || []).filter(Boolean).length,
    attempts: built?.attempts ?? null,
    input_chars: built?.inputChars ?? null,
    failed: built?.problems ? built.problems.length : (built?.failed ?? null),
    problems: built?.problems ? built.problems.map((p) => p.field) : null,
  };
}

const make = JOBS[job];
if (!make) fail(`Unknown job "${job}". Jobs: ${Object.keys(JOBS).join(', ')}`);
const plan = await make();
installClock(plan.at);
installFetchGuard({ supabaseUrl: SUPABASE_URL, atIso: plan.at, record, rewrite: plan.rewrite, apikey: APIKEY });
installAiUsageLogging();
const started = Date.now();
let out;
let error = null;
try {
  out = await aiContext.run(
    { env, worker: 'shadow', job: `shadow-${job}`, userId: plan.userId, runId: `shadow-${started}` },
    plan.run,
  );
} catch (err) {
  error = String(err?.stack || err).slice(0, 2000);
}
await new Promise((r) => setTimeout(r, 300)); // usage rows land after the calls answer
const summary = {
  job,
  at: plan.at,
  code: process.env.SHADOW_CODE_LABEL || 'working tree',
  ms: Date.now() - started,
  error,
  cost: shadowCost(record.usage),
  writes_kept: record.writes.length,
  writes_by_table: record.writes.reduce((m, w) => ({ ...m, [w.table || `rpc ${w.rpc}`]: (m[w.table || `rpc ${w.rpc}`] || 0) + 1 }), {}),
  side_effects: record.effects.length,
  ...(error ? {} : plan.summarise(out)),
};
const dir = join(process.env.SHADOW_OUT || join(ROOT, 'Claude outputs', 'shadow'), `${new Date(started).toISOString().replace(/[:.]/g, '-')}-${job}-${String(plan.userId).slice(0, 8)}`);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
writeFileSync(join(dir, 'record.json'), JSON.stringify({ ...record, output: out ?? null }, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log(`Saved to ${dir}`);
