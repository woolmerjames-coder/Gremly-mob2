/**
 * @jest-environment node
 *
 * The shadow harness never lets a write leave: reads go through cut to the
 * chosen moment, writes and side effects are kept aside, usage rows become
 * the shadow cost, and model calls go out.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  cutRead,
  fakeKV,
  fakeStep,
  installClock,
  installFetchGuard,
  pendingRead,
  restTarget,
  shadowCost,
  workerVars,
} from '../harness';

const DB = 'https://example-project.supabase.co';
const AT = '2026-10-05T11:30:00.000Z';

describe('where a call goes', () => {
  it('names the table or the function of a database call, and nothing else', () => {
    expect(restTarget(`${DB}/rest/v1/todos?owner_id=eq.1`, DB)).toEqual({ table: 'todos' });
    expect(restTarget(`${DB}/rest/v1/rpc/get_active_people`, DB)).toEqual({ rpc: 'get_active_people' });
    expect(restTarget('https://api.openai.com/v1/responses', DB)).toBeNull();
  });

  it('cuts a read to rows made by the moment, for tables that carry a date', () => {
    const cut = new URL(cutRead(`${DB}/rest/v1/notes?owner_id=eq.1&select=id`, 'notes', AT));
    expect(cut.searchParams.getAll('created_at')).toEqual([`lte.${AT}`]);
    const progress = new URL(cutRead(`${DB}/rest/v1/habit_progress?select=id`, 'habit_progress', AT));
    expect(progress.searchParams.get('occurred_at')).toBe(`lte.${AT}`);
    expect(cutRead(`${DB}/rest/v1/user_daily_state?select=dco`, 'user_daily_state', AT)).toBe(
      `${DB}/rest/v1/user_daily_state?select=dco`,
    );
  });
});

describe('the fetch guard', () => {
  let sent;
  let restoreFetch;
  let record;
  beforeEach(() => {
    sent = [];
    globalThis.fetch = async (url, init = {}) => {
      sent.push({ url: String(url), method: init.method || 'GET', headers: new Headers(init.headers || {}) });
      return new Response(JSON.stringify([{ id: 'r1' }]), { status: 200 });
    };
    record = { reads: [], writes: [], calls: [], usage: [], effects: [] };
    restoreFetch = installFetchGuard({ supabaseUrl: DB, atIso: AT, record, apikey: 'public-key' });
  });
  afterEach(() => restoreFetch());

  it('sends reads, cut to the moment', async () => {
    const rows = await (await fetch(`${DB}/rest/v1/todos?owner_id=eq.1`)).json();
    expect(rows).toEqual([{ id: 'r1' }]);
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toContain('created_at=lte.');
  });

  it('keeps every write and sends none', async () => {
    const ins = await fetch(`${DB}/rest/v1/life_facts`, { method: 'POST', body: JSON.stringify([{ statement: 'made up' }]) });
    await fetch(`${DB}/rest/v1/worlds?id=eq.w1`, { method: 'PATCH', body: JSON.stringify({ summary: 'x' }) });
    await fetch(`${DB}/rest/v1/life_facts?run_id=eq.r`, { method: 'DELETE' });
    await fetch(`${DB}/rest/v1/rpc/set_chat_summary`, { method: 'POST', body: '{}' });
    expect(sent).toHaveLength(0);
    expect(record.writes.map((w) => [w.method, w.table || `rpc ${w.rpc}`])).toEqual([
      ['POST', 'life_facts'],
      ['PATCH', 'worlds'],
      ['DELETE', 'life_facts'],
      ['POST', 'rpc set_chat_summary'],
    ]);
    expect((await ins.json())[0]).toMatchObject({ statement: 'made up' });
  });

  it('gives the gateway the public key and keeps the read only token', async () => {
    await fetch(`${DB}/rest/v1/todos?owner_id=eq.1`, { headers: { apikey: 'reader', Authorization: 'Bearer reader' } });
    await fetch(`${DB}/rest/v1/rpc/get_active_people`, {
      method: 'POST',
      headers: { apikey: 'reader', Authorization: 'Bearer reader' },
      body: '{}',
    });
    for (const s of sent) {
      expect(s.headers.get('apikey')).toBe('public-key');
      expect(s.headers.get('authorization')).toBe('Bearer reader');
    }
    expect(sent).toHaveLength(2);
  });

  it('lets a function that only reads through', async () => {
    await fetch(`${DB}/rest/v1/rpc/get_active_people`, { method: 'POST', body: '{"active_days":7}' });
    expect(sent).toHaveLength(1);
    expect(record.writes).toHaveLength(0);
  });

  it('keeps the usage rows as the shadow cost, apart from live cost', async () => {
    await fetch(`${DB}/rest/v1/ai_usage`, { method: 'POST', body: JSON.stringify({ cost_usd: 0.002, ok: true }) });
    await fetch(`${DB}/rest/v1/ai_usage`, { method: 'POST', body: JSON.stringify({ cost_usd: null, ok: false }) });
    expect(sent).toHaveLength(0);
    expect(shadowCost(record.usage)).toEqual({ calls: 2, cents: 0.2, failed: 1 });
  });

  it('stubs every other host and sends model calls', async () => {
    await fetch('https://inn.gs/e/key', { method: 'POST', body: '{}' });
    await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', body: '{}' });
    await fetch('https://api.openai.com/v1/responses', { method: 'POST', body: '{}' });
    expect(sent.map((s) => new URL(s.url).host)).toEqual(['api.openai.com']);
    expect(record.effects.map((e) => e.host)).toEqual(['inn.gs', 'exp.host']);
    expect(record.calls).toHaveLength(1);
  });
});

describe('the rest of the harness', () => {
  it('sets the clock to the moment and lets it run on', () => {
    const { restore } = installClock(AT);
    try {
      expect(Math.abs(new Date().getTime() - Date.parse(AT))).toBeLessThan(1000);
      expect(new Date('2026-01-01T00:00:00Z').toISOString()).toBe('2026-01-01T00:00:00.000Z');
    } finally {
      restore();
    }
  });

  it('records cache deletes, events and invokes instead of making them', async () => {
    const record = { effects: [] };
    await fakeKV(record).delete('life-pack:u1');
    const step = fakeStep(record);
    expect(await step.run('x', () => 3)).toBe(3);
    await step.sendEvent('e', [{ name: 'app/x' }]);
    await step.invoke('i', { data: { user_id: 'u1' } });
    expect(record.effects.map((e) => e.kv || e.step)).toEqual(['delete', 'sendEvent', 'invoke']);
  });

  it("reads the worker's vars", () => {
    const dir = mkdtempSync(join(tmpdir(), 'shadow-'));
    const file = join(dir, 'wrangler.toml');
    writeFileSync(file, 'name = "w"\n[vars]\nCONTEXT_PIPELINE = "on"\n# a note\nX = "1"\n[triggers]\nY = "2"\n');
    expect(workerVars(file)).toEqual({ CONTEXT_PIPELINE: 'on', X: '1' });
  });
});

describe('SQL this tree needs that live does not have yet', () => {
  const pending = {
    columns: { life_facts_now: ['timing'], life_people: ['who_checked_at'] },
    tables: ['ledger_reads'],
  };

  it('takes a new column out of the select, and judges a filter on it against null', () => {
    const r = pendingRead(
      `${DB}/rest/v1/life_facts_now?user_id=eq.1&select=id,statement,timing&order=timing.asc,id.asc`,
      'life_facts_now',
      pending,
    );
    const u = new URL(r.url);
    expect(u.searchParams.get('select')).toBe('id,statement');
    expect(u.searchParams.get('order')).toBe('id.asc');
    expect(r.add).toEqual(['timing']);
    expect(r.empty).toBe(false);
    // is.null holds for every row; an or with it holds too
    const both = pendingRead(
      `${DB}/rest/v1/life_people?who_checked_at=is.null&or=(name.is.null,who_checked_at.is.null)`,
      'life_people',
      pending,
    );
    expect(new URL(both.url).searchParams.get('who_checked_at')).toBeNull();
    expect(new URL(both.url).searchParams.get('or')).toBeNull();
    // anything else holds for none
    expect(pendingRead(`${DB}/rest/v1/life_facts_now?timing=eq.yearly`, 'life_facts_now', pending).empty).toBe(true);
    expect(pendingRead(`${DB}/rest/v1/ledger_reads?user_id=eq.1`, 'ledger_reads', pending).empty).toBe(true);
    expect(pendingRead(`${DB}/rest/v1/todos?select=id`, 'todos', pending)).toEqual({
      url: `${DB}/rest/v1/todos?select=id`,
      empty: false,
      add: [],
    });
  });

  it('answers a new column as null and a new table with no rows', async () => {
    const sent = [];
    globalThis.fetch = async (url) => {
      sent.push(String(url));
      return new Response(JSON.stringify([{ id: 'f1', statement: 'x' }]), { status: 200 });
    };
    const record = { reads: [], writes: [], calls: [], usage: [], effects: [] };
    const restore = installFetchGuard({ supabaseUrl: DB, atIso: AT, record, apikey: 'k', pending });
    try {
      const rows = await (await fetch(`${DB}/rest/v1/life_facts_now?select=id,statement,timing`)).json();
      expect(rows).toEqual([{ timing: null, id: 'f1', statement: 'x' }]);
      expect(await (await fetch(`${DB}/rest/v1/ledger_reads?user_id=eq.1`)).json()).toEqual([]);
      expect(sent).toHaveLength(1);
      expect(record.reads.every((r) => r.pending)).toBe(true);
    } finally {
      restore();
    }
  });
});

describe('a function that writes', () => {
  it('is kept and never sent, and can be answered so the job carries on', async () => {
    const sent = [];
    globalThis.fetch = async (url) => {
      sent.push(String(url));
      return new Response('[]', { status: 200 });
    };
    const record = { reads: [], writes: [], calls: [], usage: [], effects: [] };
    const restore = installFetchGuard({
      supabaseUrl: DB,
      atIso: AT,
      record,
      apikey: 'k',
      rpcAnswer: (fn) => (fn === 'ensure_daily_thread' ? [{ id: 't1' }] : undefined),
    });
    try {
      const res = await fetch(`${DB}/rest/v1/rpc/ensure_daily_thread`, { method: 'POST', body: '{}' });
      expect(await res.json()).toEqual([{ id: 't1' }]);
      const other = await fetch(`${DB}/rest/v1/rpc/claim_send`, { method: 'POST', body: '{}' });
      expect(await other.json()).toEqual([]);
      expect(sent).toEqual([]);
      expect(record.writes.map((w) => w.rpc)).toEqual(['ensure_daily_thread', 'claim_send']);
    } finally {
      restore();
    }
  });
});
