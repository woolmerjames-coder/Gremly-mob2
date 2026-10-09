/**
 * @jest-environment node
 *
 * The memory writer (workers/inngest-jobs/context/memory.js, data fabric stage
 * 4b): a Chapter that has ended, as a memory to the person, through the check,
 * kept in epigraph, or beside a memory the person wrote themselves.
 */
import {
  writeMemory,
  chaptersWantingMemory,
  handleChapterMemoryApi,
  MEMORY_SOURCE,
} from '../memory.js';
import { db } from '../../../shared/db.js';
import { jsonCall } from '../llm.js';
import { WORDS_SCHEMA } from '../../../shared/check/index.js';

jest.mock('../../../shared/db.js', () => ({
  ...jest.requireActual('../../../shared/db.js'),
  db: jest.fn(),
  userTimezone: async () => 'Europe/London',
  personIdentity: async () => ({ first_name: 'Alex', pronouns: null, identity: {} }),
}));
jest.mock('../llm.js', () => ({ ...jest.requireActual('../llm.js'), jsonCall: jest.fn(), modelFor: (env, job) => ({ model: job }) }));
jest.mock('../filing.js', () => ({ personToday: async () => '2026-10-07' }));

const C = '22222222-2222-4222-8222-222222222222';
const W = '11111111-1111-4111-8111-111111111111';
const T1 = '33333333-3333-4333-8333-333333333333';
const J1 = '44444444-4444-4444-8444-444444444444';
const F1 = '55555555-5555-4555-8555-555555555555';

function fakeDb(chapter) {
  const calls = [];
  db.mockReturnValue({
    select: async (path) => {
      calls.push({ op: 'select', path });
      if (path.startsWith('chapters?id=')) return chapter ? [chapter] : [];
      if (path.startsWith('worlds?id=')) return [{ id: W, name: 'Running' }];
      if (path.startsWith('drop_chapter_links'))
        return [{ drop_id: T1, drop_type: 'todo', assigned_by: 'classifier' }];
      if (path.startsWith('todos?owner_id'))
        return [
          {
            id: T1,
            name: 'Run the half',
            created_at: '2026-10-01T09:00:00Z',
            completed_at: '2026-10-04T12:00:00Z',
          },
        ];
      if (path.startsWith('notes?owner_id') && path.includes('subtype=eq.journal'))
        return [
          {
            id: J1,
            title: 'Race day',
            body: 'Finished with Sam cheering at the end',
            subtype: 'journal',
            created_at: '2026-10-04T19:00:00Z',
          },
        ];
      if (path.startsWith('life_facts_now') && path.includes('about_date=gte'))
        return [
          {
            id: F1,
            statement: 'Ran the half',
            about_date: '2026-10-04',
            state: 'happened',
            private: false,
            health: false,
            item_table: 'todos',
            item_id: T1,
          },
        ];
      return [];
    },
    update: async (path, patch) => {
      calls.push({ op: 'update', path, patch });
      return [{ id: C }];
    },
    remove: async (path) => calls.push({ op: 'remove', path }),
    upsert: async (table, rows) => calls.push({ op: 'upsert', table, rows }),
    insertQuiet: async (table, rows) => calls.push({ op: 'insert', table, rows }),
  });
  return calls;
}

const CHAPTER = {
  id: C,
  title: 'The half',
  phase: 'closed',
  start_date: '2026-09-01',
  end_date: '2026-10-04',
  closed_at: '2026-10-05T10:00:00Z',
  primary_world_id: W,
  epigraph: 'Alex is building towards race day.',
  epigraph_source: 'synthesis',
};

function answers(memory) {
  const asked = [];
  jsonCall.mockImplementation(async (env, req) => {
    asked.push(req);
    if (req.schema === WORDS_SCHEMA)
      return { output: { not_held: false, what: null }, model: 'check' };
    return { output: memory, model: 'memory' };
  });
  return asked;
}

const MEMORY = {
  text: 'You ran the half, with Sam there at the finish. It was the end of a long build.',
  refs: ['i2', 'f1'],
  stated: [],
};

describe('a Chapter’s memory', () => {
  beforeEach(() => jsonCall.mockReset());

  it('is written from what is filed in it and its journal, and kept as the memory writer’s', async () => {
    const calls = fakeDb(CHAPTER);
    const asked = answers(MEMORY);
    const r = await writeMemory({}, 'u-1', C);
    expect(r).toMatchObject({ outcome: 'pass', field: 'epigraph', memory: MEMORY.text });
    const input = asked[0].user;
    expect(input).toContain(
      'THE CHAPTER THAT HAS ENDED (k1): The half | 2026-09-01 to 2026-10-04 | in the World Running',
    );
    expect(input).toMatch(/a journal entry of theirs \| 2026-10-04 \| Race day: Finished with Sam/);
    expect(input).toMatch(/happened \| 2026-10-04 \| Ran the half/);
    // Gremly's earlier words are not a source
    expect(input).not.toContain('building towards race day');
    const up = calls.find((c) => c.op === 'update');
    expect(up.path).toBe(
      `chapters?id=eq.${C}&owner_id=eq.u-1&or=(epigraph_source.is.null,epigraph_source.neq.user)`,
    );
    expect(up.patch).toMatchObject({ epigraph: MEMORY.text, epigraph_source: MEMORY_SOURCE });
    expect(calls.find((c) => c.op === 'upsert').rows[0]).toMatchObject({
      field: 'epigraph',
      writer: 'memory',
      fact_ids: [F1],
    });
    expect(calls.find((c) => c.op === 'insert' && c.table === 'check_runs').rows[0]).toMatchObject({
      job: 'memory',
    });
  });

  it('is offered beside a memory the person wrote', async () => {
    const calls = fakeDb({ ...CHAPTER, epigraph: 'My first half.', epigraph_source: 'user' });
    answers(MEMORY);
    const r = await writeMemory({}, 'u-1', C);
    expect(r.field).toBe('epigraph_offered');
    expect(calls.find((c) => c.op === 'update').patch).toMatchObject({
      epigraph_offered: MEMORY.text,
    });
    expect(calls.find((c) => c.op === 'update').patch).not.toHaveProperty('epigraph');
  });

  it('leaves the memory blank when nothing true could be said, never an older line', async () => {
    const calls = fakeDb(CHAPTER);
    answers({ text: '', refs: [], stated: [] });
    const r = await writeMemory({}, 'u-1', C);
    expect(r.memory).toBeNull();
    expect(calls.find((c) => c.op === 'update').patch).toMatchObject({
      epigraph: null,
      epigraph_source: MEMORY_SOURCE,
    });
  });

  it('writes nothing in a dry run', async () => {
    const calls = fakeDb(CHAPTER);
    answers(MEMORY);
    const r = await writeMemory({}, 'u-1', C, { dryRun: true });
    expect(r.memory).toBe(MEMORY.text);
    expect(calls.some((c) => c.op !== 'select')).toBe(false);
  });

  it('is never written for someone else’s Chapter', async () => {
    fakeDb(null);
    await expect(writeMemory({}, 'u-1', C)).rejects.toThrow('no such chapter');
    await expect(writeMemory({}, 'u-1', 'nope')).rejects.toThrow('a chapter id is required');
  });

  it('is asked for closed Chapters with none from this writer that the person did not write', async () => {
    const calls = fakeDb(CHAPTER);
    await chaptersWantingMemory({}, 'u-1');
    expect(calls[0].path).toBe(
      'chapters?owner_id=eq.u-1&phase=eq.closed&or=(epigraph_source.is.null,epigraph_source.not.in.(memory,user))&select=id&order=closed_at.desc.nullslast&limit=40',
    );
  });

  it('answers the route with the memory, and a missing Chapter as not found', async () => {
    fakeDb(CHAPTER);
    answers(MEMORY);
    const reply = (body, status = 200) => ({ body, status });
    const req = (body) => ({ json: async () => body });
    expect(await handleChapterMemoryApi(req({ user_id: 'u-1' }), {}, reply)).toMatchObject({
      status: 400,
    });
    const live = { mode: () => 'on' };
    const ok = await handleChapterMemoryApi(
      req({ user_id: '99999999-9999-4999-8999-999999999999', chapter_id: C }),
      {},
      reply,
      live,
    );
    expect(ok.body).toMatchObject({ ok: true, memory: MEMORY.text, field: 'epigraph' });
    fakeDb(null);
    const missing = await handleChapterMemoryApi(
      req({ user_id: '99999999-9999-4999-8999-999999999999', chapter_id: C }),
      {},
      reply,
      live,
    );
    expect(missing.status).toBe(404);
  });

  it('writes nothing from the route while the pipeline is not live for them, or for a Chapter still open', async () => {
    const reply = (body, status = 200) => ({ body, status });
    const req = (body) => ({ json: async () => body });
    const who = { user_id: '99999999-9999-4999-8999-999999999999', chapter_id: C };
    let calls = fakeDb(CHAPTER);
    answers(MEMORY);
    for (const deps of [undefined, { mode: () => 'shadow' }]) {
      const r = await handleChapterMemoryApi(req(who), {}, reply, deps);
      expect(r).toMatchObject({
        status: 409,
        body: { error: 'the pipeline is not live for them' },
      });
    }
    expect(calls).toEqual([]);
    expect(jsonCall).not.toHaveBeenCalled();
    calls = fakeDb({ ...CHAPTER, phase: 'active', closed_at: null });
    const open = await handleChapterMemoryApi(req(who), {}, reply, { mode: () => 'on' });
    expect(open).toMatchObject({ status: 409, body: { error: 'the chapter has not ended' } });
    expect(calls.some((c) => c.op !== 'select')).toBe(false);
    expect(jsonCall).not.toHaveBeenCalled();
  });
});
