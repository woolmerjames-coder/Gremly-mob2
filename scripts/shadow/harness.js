/**
 * The shadow harness: what lets a pipeline job's own code run on a real
 * person's past day without changing anything live.
 *
 *   The clock      new Date() and Date.now() read the past moment chosen.
 *   The database   reads go through, cut to rows that existed at that moment.
 *                  Every write (insert, update, upsert, delete, and any
 *                  function not known to only read) is kept in the shadow
 *                  record and never sent. The key itself belongs to a role
 *                  that may only read, so the database would refuse it anyway.
 *   Side effects   the chat cache (a stand in KV), Inngest steps and events,
 *                  push notifications, the cortex worker and any other host
 *                  are stubbed and recorded. Usage rows the code would write
 *                  to ai_usage are kept as the shadow cost, apart from live
 *                  cost.
 *   Model calls    go out as they do in production, with the replay keys.
 *
 * Nothing here reads a person's words. It handles hosts, methods, paths,
 * dates and counts.
 */

import { readFileSync } from 'node:fs';

/** Postgres functions the jobs call that only read. Any other is a write. */
export const READ_ONLY_RPCS = new Set([
  'absence_snapshot',
  'find_items',
  'get_active_people',
  'get_users_for_dco',
  'ledger_users_due',
  'person_identity',
  'recall_life',
  'usage_rollup',
  'user_activity_days',
]);

/** Tables cut to rows made by the chosen moment, and the column that dates them. */
export const CUT_COLUMN = {
  chapters: 'created_at',
  daily_briefs: 'created_at',
  drop_chapter_links: 'created_at',
  drop_world_links: 'created_at',
  events: 'created_at',
  gremly_questions: 'created_at',
  habit_adaptations: 'created_at',
  habit_plans: 'created_at',
  habit_progress: 'occurred_at',
  habits: 'created_at',
  journal_pages: 'created_at',
  life_fact_changes: 'created_at',
  life_facts: 'created_at',
  notes: 'created_at',
  scope_chat_messages: 'created_at',
  scope_chats: 'created_at',
  space_milestones: 'created_at',
  story_items: 'created_at',
  synced_calendar_events: 'created_at',
  todos: 'created_at',
  user_temporal_anchors: 'created_at',
  weekly_reviews: 'created_at',
  worlds: 'created_at',
};

const MODEL_HOSTS = [
  'api.openai.com',
  'generativelanguage.googleapis.com',
  'api.anthropic.com',
  'api.tavily.com',
];

/** The clock reads `atIso` from now on, and moves on from there as real time passes. */
export function installClock(atIso) {
  const RealDate = globalThis.Date;
  const offset = RealDate.parse(atIso) - RealDate.now();
  class ShadowDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + offset);
      else super(...args);
    }
    static now() {
      return RealDate.now() + offset;
    }
  }
  globalThis.Date = ShadowDate;
  return { offset, restore: () => (globalThis.Date = RealDate) };
}

/** The table a PostgREST path names, and the function for rpc/<name>. */
export function restTarget(url, supabaseUrl) {
  const u = new URL(url);
  const base = new URL(supabaseUrl);
  if (u.host !== base.host || !u.pathname.startsWith('/rest/v1/')) return null;
  const rest = u.pathname.slice('/rest/v1/'.length);
  if (rest.startsWith('rpc/')) return { rpc: rest.slice(4) };
  return { table: rest.split('/')[0] };
}

/** A read cut to rows made by the chosen moment, for the tables that carry a date. */
export function cutRead(url, table, atIso) {
  const col = CUT_COLUMN[table];
  if (!col) return url;
  const u = new URL(url);
  u.searchParams.append(col, `lte.${atIso}`);
  return u.toString();
}

function parseBody(init) {
  if (!init || typeof init.body !== 'string') return null;
  try {
    return JSON.parse(init.body);
  } catch {
    return init.body;
  }
}

function json(value, status = 200) {
  return new Response(value === undefined ? null : JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * The project's gateway only takes its own public key as the apikey header. The
 * Authorization header, which decides the database role, stays the read only one.
 */
function withGatewayKey(init, apikey) {
  if (!apikey) return init;
  const headers = new Headers(init?.headers || {});
  headers.set('apikey', apikey);
  return { ...init, headers };
}

/**
 * Wraps the global fetch. `record` collects every write, side effect, model
 * call and usage row. `rewrite` may change a read's answer, for a replay
 * (a correction read as not yet applied, say). `apikey` is the project's public
 * key, which the gateway wants beside the read only role's token.
 */
export function installFetchGuard({ supabaseUrl, atIso, record, rewrite, apikey }) {
  const realFetch = globalThis.fetch.bind(globalThis);
  let n = 0;
  globalThis.fetch = async function shadowFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    const method = String(init.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
    const target = restTarget(url, supabaseUrl);
    if (target) {
      if (target.table === 'ai_usage' && method === 'POST') {
        record.usage.push(parseBody(init));
        return json(null, 201);
      }
      const isRead = method === 'GET' || method === 'HEAD';
      if (isRead && target.table) {
        const res = await realFetch(cutRead(url, target.table, atIso), withGatewayKey(init, apikey));
        record.reads.push({ table: target.table, status: res.status });
        if (!rewrite) return res;
        const body = await res.clone().text();
        const changed = rewrite({ table: target.table, url, body });
        return changed == null ? res : json(changed, res.status);
      }
      if (target.rpc && READ_ONLY_RPCS.has(target.rpc)) {
        const res = await realFetch(url, withGatewayKey(init, apikey));
        record.reads.push({ rpc: target.rpc, status: res.status });
        return res;
      }
      // a write: kept, never sent
      n += 1;
      const body = parseBody(init);
      record.writes.push({ n, method, ...target, path: new URL(url).pathname + new URL(url).search, body });
      if (method === 'POST' && target.table) {
        const rows = (Array.isArray(body) ? body : [body]).map((r, i) =>
          r && typeof r === 'object' ? { id: `shadow-${n}-${i}`, ...r } : r,
        );
        return json(rows, 201);
      }
      if (method === 'PATCH') return json(body && typeof body === 'object' ? [body] : []);
      return json([]);
    }
    const host = (() => {
      try {
        return new URL(url).host;
      } catch {
        return '';
      }
    })();
    if (MODEL_HOSTS.includes(host)) {
      const started = Date.now();
      const res = await realFetch(input, init);
      record.calls.push({ host, status: res.status, ms: Date.now() - started });
      return res;
    }
    // any other host: Inngest, push, cortex, the calendar worker. Stubbed.
    record.effects.push({ host, method, path: (() => { try { return new URL(url).pathname; } catch { return url; } })() });
    return json({ ok: true, shadow: true });
  };
  return () => (globalThis.fetch = realFetch);
}

/** A stand in for the chat cache's KV namespace: deletes are recorded. */
export function fakeKV(record) {
  return {
    async get() {
      return null;
    },
    async put(key) {
      record.effects.push({ kv: 'put', key });
    },
    async delete(key) {
      record.effects.push({ kv: 'delete', key });
    },
  };
}

/** A stand in for Inngest's step: runs inline, and records events and invokes. */
export function fakeStep(record) {
  return {
    run: async (_name, fn) => fn(),
    sleep: async (name) => record.effects.push({ step: 'sleep', name }),
    sleepUntil: async (name) => record.effects.push({ step: 'sleepUntil', name }),
    sendEvent: async (name, events) => record.effects.push({ step: 'sendEvent', name, events }),
    invoke: async (name, opts) => {
      record.effects.push({ step: 'invoke', name, data: opts?.data || null });
      return { shadow: true };
    },
  };
}

/** The deployed worker's [vars], so models and switches match production. */
export function workerVars(tomlPath) {
  const vars = {};
  let inVars = false;
  for (const raw of readFileSync(tomlPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('[')) {
      inVars = line === '[vars]';
      continue;
    }
    if (!inVars || !line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*"([^"]*)"/);
    if (m) vars[m[1]] = m[2];
  }
  return vars;
}

/** Shadow cost from the usage rows the code would have written. */
export function shadowCost(usage) {
  const rows = usage.filter(Boolean);
  const cents = rows.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0) * 100;
  return { calls: rows.length, cents: Math.round(cents * 1000) / 1000, failed: rows.filter((r) => r.ok === false).length };
}
