/**
 * A database for the life replay (run.mjs): the PostgREST calls the worker
 * code makes are answered from tables held in memory, and what it writes is
 * kept there, so the reader's ledger is what the morning reads. Filters are
 * those of the unit tests' memory database (context/__tests__/memoryDb.js),
 * which refuses one it does not know rather than matching every row.
 */

import { memoryDb } from '../../workers/inngest-jobs/context/__tests__/memoryDb.js';

export const LIFE_SUPABASE_URL = 'https://life-replay.invalid';

// Views the code reads, answered from the table they show
const VIEWS = { life_facts_now: 'life_facts' };

const json = (v, status = 200) =>
  new Response(v === undefined || v === null ? '' : JSON.stringify(v), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/**
 * A fetch for one replay's database.
 * @param tables the starting rows, by table
 * @param rpc answers for database functions, by name: (args) => rows
 */
export function fakeDb(tables, rpc = {}) {
  const mem = memoryDb(tables);
  let ids = 0;
  const withIds = (rows) =>
    rows.map((r) => (r.id ? r : { id: `row-${++ids}`, created_at: new Date().toISOString(), ...r }));
  async function handle(url, init = {}) {
    const u = new URL(url);
    const rest = u.pathname.replace(/^\/rest\/v1\//, '');
    const method = String(init.method || 'GET').toUpperCase();
    let body = null;
    try {
      body = init.body ? JSON.parse(init.body) : null;
    } catch {
      body = null;
    }
    if (rest.startsWith('rpc/')) {
      const fn = rest.slice(4);
      return json(rpc[fn] ? await rpc[fn](body || {}, mem) : null);
    }
    const table = VIEWS[rest] || rest;
    const query = u.search.slice(1);
    const path = `${table}?${query}`;
    const prefer = String(init.headers?.Prefer || init.headers?.prefer || '');
    try {
      if (method === 'GET') return json(await mem.select(path));
      if (method === 'PATCH') return json(await mem.update(path, body));
      if (method === 'DELETE') return json(await mem.remove(path));
      if (method === 'POST') {
        const rows = withIds(Array.isArray(body) ? body : [body]);
        const onConflict = u.searchParams.get('on_conflict');
        if (onConflict && prefer.includes('merge-duplicates')) {
          const keys = onConflict.split(',');
          mem.tables[table] = mem.tables[table] || [];
          const out = [];
          for (const r of rows) {
            const hit = mem.tables[table].find((x) => keys.every((k) => x[k] === r[k]));
            if (hit) Object.assign(hit, r);
            else mem.tables[table].push({ ...r });
            out.push({ ...(hit || r) });
          }
          return json(out);
        }
        if (onConflict) {
          await mem.insertIgnore(table, rows, onConflict);
          return json(null);
        }
        return json(await mem.insert(table, rows));
      }
    } catch (err) {
      return json({ message: String(err?.message || err) }, 400);
    }
    return json({ message: `no ${method}` }, 405);
  }
  return { mem, handle };
}
