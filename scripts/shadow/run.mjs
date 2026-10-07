/**
 * The shadow runner: a pipeline job's own code, run for one real person on a
 * past day, week or correction, with every write kept aside (harness.js).
 *
 *   scripts/shadow/run.sh morning    --user <uuid> --day YYYY-MM-DD [--at HH:MM]
 *   scripts/shadow/run.sh story-copy --user <uuid> [--at ISO]
 *   scripts/shadow/run.sh correction --correction <uuid> [--said "other words"]
 *   scripts/shadow/run.sh ledger --user <uuid> [--from ISO] [--to ISO]
 *   scripts/shadow/run.sh weekly-input --user <uuid> [--at ISO]
 *   scripts/shadow/run.sh people-fill --user <uuid> [--at ISO]
 *   scripts/shadow/run.sh filing --user <uuid> [--limit n] [--at ISO]
 *   scripts/shadow/run.sh words --user <uuid>
 *   scripts/shadow/run.sh memories --user <uuid> [--chapter <uuid>] [--limit n]
 *   scripts/shadow/run.sh first-worlds --user <uuid>
 *   scripts/shadow/run.sh up-next --user <uuid>
 *   scripts/shadow/run.sh people-check --user <uuid> [--limit n]
 *   scripts/shadow/run.sh person-question --user <uuid>
 *   scripts/shadow/run.sh chapter-questions --user <uuid>
 *   scripts/shadow/run.sh ... --code <dir>   run another tree's code (run.sh)
 *
 * Keys come from the environment: SHADOW_SUPABASE_KEY (a key for the
 * shadow_reader role, which may only read), OPENAI_API_KEY,
 * GEMINI_TEST_API_KEY and, for weekly jobs, ANTHROPIC_API_KEY; any
 * CONTEXT_MODEL_<JOB> (provider:model) tries another model. Results are
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
import { readWindow } from '../../workers/inngest-jobs/context/reader.js';
// a namespace import, so a tree without weeklyRequestParams still bundles
import * as weekly from '../../workers/inngest-jobs/context/weekly.js';
import { userTimezone, personIdentity } from '../../workers/shared/db.js';
// a namespace import, so a tree without people records still bundles
import * as people from '../../workers/inngest-jobs/context/people.js';
import { localStartIso } from '../../workers/shared/calendar.js';
// a namespace import, so a tree without filing (before stage 4a) still bundles
import * as filing from '../../workers/inngest-jobs/context/filing.js';
import { db } from '../../workers/shared/db.js';
// namespace imports, as for filing above: a job checks its function is there
import * as stage4b from '../../workers/inngest-jobs/context/words.js';
import * as stage4bMemory from '../../workers/inngest-jobs/context/memory.js';
import * as stage4bFirst from '../../workers/inngest-jobs/context/firstWorlds.js';
import * as upNextMod from '../../workers/shared/upNext.js';
import * as stage4cPeople from '../../workers/inngest-jobs/context/peopleQuestions.js';
import * as stage4cChapters from '../../workers/inngest-jobs/context/chapterQuestions.js';

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
  // a model to try in place of the one that ships, as CONTEXT_MODEL_<JOB>=provider:model
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('CONTEXT_MODEL_'))),
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

  // The reader over a window of a past or recent day: what the reader of this
  // tree would make of it, new facts, updates, sources, questions and stamps
  async ledger() {
    const userId = flag('--user');
    if (!userId) fail('ledger needs --user');
    const to = flag('--to') || new Date().toISOString();
    const from = flag('--from') || new Date(Date.parse(to) - 864e5).toISOString();
    return {
      at: new Date(Date.parse(to) + 1000).toISOString(),
      userId,
      run: async () => {
        const tz = await userTimezone(env, userId);
        return readWindow(env, userId, tz, from, to, `shadow-ledger-${userId.slice(0, 8)}`, {
          runSince: from,
        });
      },
      summarise: (totals) => ({ from, to, totals, ...ledgerWrites(record) }),
    };
  },

  // The first people fill for one person, read only: the people Gremly would
  // find in their facts, who each is as the person said it, and the merges it
  // would propose, for a person to read before anything is written
  async 'people-fill'() {
    const userId = flag('--user');
    if (!userId) fail('people-fill needs --user');
    return {
      at: flag('--at') || new Date().toISOString(),
      userId,
      run: async () => {
        if (typeof people.fillPeople !== 'function') fail('This tree has no people records.');
        return people.fillPeople(env, userId, { person: await personIdentity(env, userId), shadow: true });
      },
      summarise: (out) => ({
        facts: out.facts,
        calls: out.calls,
        people_new: out.people_new,
        ties: out.people_ties,
        rejected: out.people_rejected,
        who_without_words: out.people_who_without_words,
        people: out.found,
        proposed_merges: out.proposed_merges,
      }),
    };
  },

  // Filing (data fabric stage 4a) over a person's latest real drops, read
  // only: where each would go by the one set of rules, beside where it is
  // filed now, for a person to read
  async filing() {
    const userId = flag('--user');
    if (!userId) fail('filing needs --user');
    const limit = Math.max(1, Number(flag('--limit') || 40));
    const at = flag('--at') || new Date().toISOString();
    return {
      at,
      userId,
      run: async () => {
        if (typeof filing.fileDrop !== 'function') fail('This tree has no filing.');
        const all = await filing.listDropsToFile(env, userId, { before: at, refile: true });
        const drops = all.slice(-limit);
        const graph = await filing.loadGraph(env, userId);
        const placed = await filing.loadPlaced(env, userId);
        const today = await filing.personToday(env, userId);
        // where each is filed now, by anyone
        const d = db(env);
        const ids = drops.map((x) => x.id).join(',');
        const [wl, cl, xl, worlds, chapters] = await Promise.all([
          d.select(`drop_world_links?drop_id=in.(${ids})&select=drop_id,drop_type,world_id,assigned_by`),
          d.select(`drop_chapter_links?drop_id=in.(${ids})&select=drop_id,drop_type,chapter_id,assigned_by`),
          d.select(`drop_context_links?drop_id=in.(${ids})&select=drop_id,drop_type,context_id`),
          d.select(`worlds?owner_id=eq.${userId}&select=id,name`),
          d.select(`chapters?owner_id=eq.${userId}&select=id,title`),
        ]);
        const wname = new Map((worlds || []).map((w) => [w.id, w.name]));
        const ctitle = new Map((chapters || []).map((c) => [c.id, c.title]));
        const nowOf = (x) => ({
          worlds: (wl || []).filter((l) => l.drop_id === x.id && l.drop_type === x.entity_type).map((l) => `${wname.get(l.world_id) || l.world_id}${l.assigned_by === 'user' ? ' (theirs)' : ''}`),
          chapters: (cl || []).filter((l) => l.drop_id === x.id && l.drop_type === x.entity_type).map((l) => `${ctitle.get(l.chapter_id) || l.chapter_id}${l.assigned_by === 'user' ? ' (theirs)' : ''}`),
          contexts: (xl || []).filter((l) => l.drop_id === x.id && l.drop_type === x.entity_type).length,
        });
        const results = new Array(drops.length);
        let next = 0;
        await Promise.all(
          Array.from({ length: Math.min(4, drops.length) }, async () => {
            while (next < drops.length) {
              const i = next++;
              results[i] = await filing.fileDrop(env, { userId, drop: drops[i], today, graph, placed });
            }
          }),
        );
        return {
          drops: drops.map((x, i) => ({
            id: x.id,
            type: x.entity_type,
            date: x.date,
            title: x.title,
            text: String(x.text || '').slice(0, 200),
            now: nowOf(x),
            filed: {
              by: results[i].by,
              world: results[i].world?.name || null,
              chapter: results[i].chapter?.title || null,
              starts_something: results[i].starts_something,
              confidence: results[i].confidence || null,
              // what it named, even below the bar
              choice: results[i].choice || null,
              contexts: (results[i].contexts || []).map((c) => c.name),
              skipped: results[i].skipped_reason || null,
            },
          })),
          worlds: graph.worlds.length,
          chapters: graph.chapters.length,
          contexts: graph.contexts.length,
          total_drops: all.length,
        };
      },
      summarise: (out) => {
        const rows = out?.drops || [];
        const plain = (n) => String(n || '').replace(/ \(theirs\)$/, '');
        return {
          worlds: out?.worlds,
          chapters: out?.chapters,
          contexts: out?.contexts,
          drops: rows.length,
          of: out?.total_drops,
          filed_chapter: rows.filter((r) => r.filed.chapter).length,
          filed_world_only: rows.filter((r) => r.filed.world && !r.filed.chapter).length,
          filed_nowhere: rows.filter((r) => !r.filed.world && !r.filed.chapter && !r.filed.skipped).length,
          person_placed: rows.filter((r) => r.filed.by === 'person').length,
          skipped: rows.filter((r) => r.filed.skipped).length,
          starts_something: rows.filter((r) => r.filed.starts_something).length,
          given_a_context: rows.filter((r) => (r.filed.contexts || []).length).length,
          in_a_context_now: rows.filter((r) => r.now.contexts).length,
          same_world_as_now: rows.filter((r) => r.filed.world && r.now.worlds.map(plain).includes(r.filed.world)).length,
          in_a_world_now: rows.filter((r) => r.now.worlds.length).length,
          worlds_now_per_drop: rows.length ? Math.round((rows.reduce((n, r) => n + r.now.worlds.length, 0) / rows.length) * 100) / 100 : 0,
          rows,
        };
      },
    };
  },

  // Data fabric stage 4b, read only: the words under each World and open
  // Chapter beside what is there now; the memory each closed Chapter would get;
  // the first Worlds a person with none would get; and Up next
  async words() {
    const userId = flag('--user');
    if (!userId) fail('words needs --user');
    return {
      at: flag('--at') || new Date().toISOString(),
      userId,
      run: () => {
        if (typeof stage4b.writeWords !== 'function') fail('This tree has no words writer.');
        return stage4b.writeWords(env, userId, { reason: 'shadow', dryRun: true });
      },
      summarise: (out) => ({
        written: out?.written,
        left_out: out?.left_out,
        empty: out?.empty,
        failed: out?.failed,
        lines: (out?.lines || []).map((l) => ({ table: l.table, id: l.id, outcome: l.outcome, now: l.was, words: l.text, problems: l.problems, error: l.error })),
      }),
    };
  },

  async memories() {
    const userId = flag('--user');
    if (!userId) fail('memories needs --user');
    return {
      at: flag('--at') || new Date().toISOString(),
      userId,
      run: async () => {
        if (typeof stage4bMemory.writeMemory !== 'function') fail('This tree has no memory writer.');
        const ids = flag('--chapter') ? [flag('--chapter')] : await stage4bMemory.chaptersWantingMemory(env, userId);
        const out = [];
        for (const id of ids.slice(0, Number(flag('--limit') || 20))) {
          const [c] = await db(env).select(`chapters?id=eq.${id}&select=title,epigraph`);
          try {
            const r = await stage4bMemory.writeMemory(env, userId, id, { dryRun: true });
            out.push({ id, title: c?.title, now: c?.epigraph || null, outcome: r.outcome, memory: r.memory, problems: r.problems });
          } catch (err) {
            out.push({ id, title: c?.title, error: String(err.message).slice(0, 300) });
          }
        }
        return out;
      },
      summarise: (out) => ({
        chapters: out?.length,
        written: (out || []).filter((x) => x.memory).length,
        left_out: (out || []).filter((x) => x.outcome === 'left_out').length,
        memories: out,
      }),
    };
  },

  async 'first-worlds'() {
    const userId = flag('--user');
    if (!userId) fail('first-worlds needs --user');
    return {
      at: flag('--at') || new Date().toISOString(),
      userId,
      run: () => {
        if (typeof stage4bFirst.makeFirstWorlds !== 'function') fail('This tree has no first Worlds.');
        return stage4bFirst.makeFirstWorlds(env, userId, { dryRun: true });
      },
      summarise: (out) => ({
        due: out?.stats ? stage4bFirst.firstWorldsDue(out.stats) : null,
        stats: out?.stats,
        model: out?.proposed?.model,
        problems: out?.proposed?.problems,
        worlds: (out?.proposed?.worlds || []).map((w) => ({ name: w.name, gremly: w.gremly, rests_on: w.rests_on.length, why: w.why })),
      }),
    };
  },

  async 'up-next'() {
    const userId = flag('--user');
    if (!userId) fail('up-next needs --user');
    return {
      at: flag('--at') || new Date().toISOString(),
      userId,
      run: async () => {
        if (typeof upNextMod.loadUpNext !== 'function') fail('This tree has no Up next.');
        const today = await filing.personToday(env, userId);
        return { today, up_next: await upNextMod.loadUpNext(db(env), userId, today) };
      },
      summarise: (out) => ({ ...out, words: out?.up_next ? upNextMod.upNextWords(out.up_next) : null }),
    };
  },

  // Data fabric stage 4c, read only: the check on who someone is over every
  // person record, and the question about someone that would be asked
  async 'people-check'() {
    const userId = flag('--user');
    if (!userId) fail('people-check needs --user');
    return {
      at: flag('--at') || new Date().toISOString(),
      userId,
      run: async () => {
        if (typeof people.recheckPeople !== 'function') fail('This tree has no check on who someone is.');
        return people.recheckPeople(env, userId, {
          person: await personIdentity(env, userId),
          shadow: true,
          onlyUnchecked: false,
          limit: Number(flag('--limit') || 150),
        });
      },
      summarise: (out) => out,
    };
  },

  async 'person-question'() {
    const userId = flag('--user');
    if (!userId) fail('person-question needs --user');
    return {
      at: flag('--at') || new Date().toISOString(),
      userId,
      run: async () => {
        if (typeof stage4cPeople.writePersonQuestion !== 'function') fail('This tree has no people questions.');
        const { candidates } = await stage4cPeople.loadPersonCandidates(env, userId);
        const out = await stage4cPeople.writePersonQuestion(env, userId, { dryRun: true });
        return {
          ...out,
          candidates: candidates.map((c) => ({
            type: c.type,
            weight: c.weight,
            who: c.type === 'same' ? [c.kept.name || c.kept.relationship, c.merged.name || c.merged.relationship] : c.person.name || c.person.relationship,
          })),
        };
      },
      summarise: (out) => ({
        written: out?.written,
        skipped: out?.skipped || null,
        why: out?.why || null,
        question: out?.row?.question || null,
        choices: out?.row?.choices || null,
        about: out?.row?.proposed_change || null,
        candidates: out?.candidates,
      }),
    };
  },

  // The day's Chapter questions, as they would be raised with the switch on:
  // the welcome back, the close questions due, and at most one suggestion
  async 'chapter-questions'() {
    const userId = flag('--user');
    if (!userId) fail('chapter-questions needs --user');
    return {
      at: flag('--at') || new Date().toISOString(),
      userId,
      run: async () => {
        if (typeof stage4cChapters.chapterQuestionsForDay !== 'function') fail('This tree has no Chapter questions.');
        return stage4cChapters.chapterQuestionsForDay(env, userId, { dryRun: true });
      },
      summarise: (out) => {
        const rowOf = (r) => ({
          kind: r.kind,
          question: r.question,
          choices: r.choices,
          about: r.proposed_change,
          rests_on: r.rests_on?.length ?? null,
        });
        return {
          today: out?.today,
          away: out?.away,
          welcome_back: out?.welcome_back,
          skipped: out?.skipped || null,
          welcome: out?.welcome ? { ...out.welcome, rows: (out.welcome.rows || []).map(rowOf) } : null,
          close: out?.close ? { ...out.close, rows: (out.close.rows || []).map(rowOf) } : null,
          suggest: out?.suggest ? { ...out.suggest, row: out.suggest.row ? rowOf(out.suggest.row) : null } : null,
        };
      },
    };
  },

  // What the weekly pass would be given, built without asking the model: how
  // long it is, and how many plans it shows as passed
  async 'weekly-input'() {
    const userId = flag('--user');
    if (!userId) fail('weekly-input needs --user');
    const at = flag('--at') || new Date().toISOString();
    return {
      at,
      userId,
      run: () => {
        if (typeof weekly.weeklyRequestParams !== 'function') fail('This tree has no weekly request.');
        return weekly.weeklyRequestParams(env, userId, at.slice(0, 10));
      },
      summarise: (out) => {
        const user = out?.params?.messages?.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n') || '';
        return {
          today: out?.today,
          input_chars: out?.inputChars,
          facts: (out?.refsSnapshot || []).filter(([, v]) => v.type === 'fact').length,
          passed_plans: (user.match(/planned, date passed/g) || []).length,
        };
      },
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

/** What a ledger read would have written, from the writes the guard kept aside. */
function ledgerWrites(rec) {
  const rows = (table, method) =>
    rec.writes
      .filter((w) => w.table === table && w.method === method)
      .flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
      .filter(Boolean);
  const sources = rows('life_fact_sources', 'POST');
  return {
    new_facts: rows('life_facts', 'POST').map((f) => ({
      statement: f.statement,
      date: f.about_date,
      state: f.state,
      private: f.private,
      from: f.source_table,
    })),
    fact_updates: rows('life_facts', 'PATCH')
      .filter((u) => u.state)
      .map((u) => ({ to: u.state, reason: u.state_reason })),
    sources: sources.length,
    about_items: sources.filter((x) => x.role === 'about').length,
    // records a fact was already said in, now judged the item it is about
    about_marked: rows('life_fact_sources', 'PATCH').length,
    questions: rows('gremly_questions', 'POST').map((q) => q.question),
    calendar: rows('synced_calendar_events', 'PATCH').map((x) => (x.cancelled_at ? 'cancelled' : 'on again')),
  };
}

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
    // what the check did (data fabric stage 3), with the words of each try
    check: built?.check || null,
    lines: built?.kept ? built.kept.map((k) => ({ field: k.key, text: k.text, refs: k.refs })) : null,
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
