/**
 * @jest-environment node
 *
 * Filing (workers/inngest-jobs/context/filing.js, data fabric stage 4a): the
 * AI says where a drop belongs and how sure it is; code applies the bar,
 * checks every ref, never touches what the person placed, and writes one World
 * and at most one Chapter.
 */
import {
  decideFiling,
  fileDrop,
  filingReply,
  filingRequest,
  FILING_CUT,
  loadGraph,
  dropFromRow,
} from '../filing.js';
import { db } from '../../../shared/db.js';
import { jsonCall } from '../llm.js';

jest.mock('../../../shared/db.js', () => ({
  ...jest.requireActual('../../../shared/db.js'),
  db: jest.fn(),
  userTimezone: async () => 'Europe/London',
}));
jest.mock('../llm.js', () => ({ jsonCall: jest.fn(), modelFor: (env, job) => ({ job }) }));

const W_WORK = '11111111-1111-4111-8111-111111111111';
const W_HOME = '22222222-2222-4222-8222-222222222222';
const C_TRIP = '33333333-3333-4333-8333-333333333333';
const X_COMMUTE = '44444444-4444-4444-8444-444444444444';
const DROP = '55555555-5555-4555-8555-555555555555';

const GRAPH = {
  worlds: [
    { id: W_WORK, name: 'Work', description: 'The job and the people in it' },
    { id: W_HOME, name: 'Home', description: 'The flat and family' },
  ],
  chapters: [
    {
      id: C_TRIP,
      title: 'Porto in November',
      description: 'A long weekend away',
      primary_world_id: W_HOME,
      phase: 'upcoming',
      start_date: '2026-11-01',
      end_date: '2026-11-04',
    },
  ],
  contexts: [{ id: X_COMMUTE, name: 'The commute', kind: 'constraint', description: null }],
};

const drop = {
  id: DROP,
  entity_type: 'todo',
  text: 'Book the airport taxi for the Porto weekend',
  title: 'Book airport taxi',
  date: '2026-10-07',
  tags: [],
  people: [],
};

const answer = (more = {}) => ({
  world_ref: 'w2',
  world_confidence: 0.9,
  chapter_ref: 'c1',
  chapter_confidence: 0.92,
  starts_something: false,
  contexts: [],
  reason: 'Getting ready for the trip.',
  ...more,
});

/** A database that answers each read by its table, and records every write. */
function fakeDb({ tables = {}, failOn = null } = {}) {
  const writes = [];
  const reads = [];
  db.mockReturnValue({
    select: async (path) => {
      reads.push(path);
      const table = path.split('?')[0];
      if (failOn === table) throw new Error(`${table} down`);
      const rows = tables[table];
      return typeof rows === 'function' ? rows(path) : rows || [];
    },
    remove: async (path) => {
      writes.push({ op: 'remove', path });
      return [];
    },
    upsert: async (table, rows, onConflict) => {
      writes.push({ op: 'upsert', table, rows, onConflict });
      return rows;
    },
  });
  return { writes, reads };
}

const graphTables = {
  worlds: GRAPH.worlds,
  chapters: GRAPH.chapters,
  life_contexts: GRAPH.contexts,
};

describe('the request', () => {
  it('shows each World, Chapter and context by a short ref, never by id', () => {
    const placed = { worlds: new Map([[W_WORK, ['Send the quarterly report']]]), chapters: new Map() };
    const { user, refs, system } = filingRequest({ drop, graph: GRAPH, placed, today: '2026-10-07' });
    expect(user).toContain('w1 | Work |');
    expect(user).toContain('c1 | Porto in November | in w2 | 2026-11-01 to 2026-11-04 | ahead |');
    expect(user).toContain('x1 | The commute |');
    expect(user).toContain('placed there by them: "Send the quarterly report"');
    for (const id of [W_WORK, W_HOME, C_TRIP, X_COMMUTE, DROP]) expect(user).not.toContain(id);
    expect(refs.get('c1')).toEqual({
      type: 'chapter',
      id: C_TRIP,
      title: 'Porto in November',
      world_id: W_HOME,
    });
    expect(system).toContain('A Chapter takes the drop only when');
  });
});

describe('the bar', () => {
  const { refs } = filingRequest({ drop, graph: GRAPH, today: '2026-10-07' });

  it('files a sure Chapter, with its own World whatever World was named', () => {
    const out = decideFiling(answer({ world_ref: 'w1' }), refs);
    expect(out.chapter).toEqual({ id: C_TRIP, title: 'Porto in November' });
    expect(out.world).toEqual({ id: W_HOME, name: 'Home' });
    expect(out.problems).toEqual([]);
  });

  it('below the Chapter cut, files the World when it clears its own', () => {
    const out = decideFiling(answer({ chapter_confidence: FILING_CUT.chapter - 0.01 }), refs);
    expect(out.chapter).toBeNull();
    expect(out.world).toEqual({ id: W_HOME, name: 'Home' });
  });

  it('below both cuts, files nowhere', () => {
    const out = decideFiling(
      answer({ chapter_confidence: 0.2, world_confidence: FILING_CUT.world - 0.01 }),
      refs,
    );
    expect(out.world).toBeNull();
    expect(out.chapter).toBeNull();
  });

  it('never files to a ref it never gave, and says so', () => {
    const out = decideFiling(answer({ chapter_ref: 'c9', world_ref: 'x1' }), refs);
    expect(out.chapter).toBeNull();
    expect(out.world).toBeNull();
    expect(out.problems).toEqual(['world ref x1 was never given', 'chapter ref c9 was never given']);
  });

  it('marks the start of something only when no Chapter took it', () => {
    expect(decideFiling(answer({ starts_something: true }), refs).starts_something).toBe(false);
    expect(
      decideFiling(answer({ starts_something: true, chapter_ref: null, chapter_confidence: 0 }), refs)
        .starts_something,
    ).toBe(true);
  });

  it('keeps contexts above their cut, once each, and clamps what it is told', () => {
    const out = decideFiling(
      answer({
        contexts: [
          { ref: 'x1', relevance: 7 },
          { ref: 'x1', relevance: 0.9 },
          { ref: 'w1', relevance: 0.9 },
        ],
      }),
      refs,
    );
    expect(out.contexts).toEqual([{ id: X_COMMUTE, name: 'The commute', relevance: 1 }]);
    const low = decideFiling(answer({ contexts: [{ ref: 'x1', relevance: 0.1 }] }), refs);
    expect(low.contexts).toEqual([]);
  });
});

describe('filing a drop', () => {
  it('leaves a drop the person placed alone: no call and no write', async () => {
    const { writes } = fakeDb({
      tables: {
        drop_world_links: (p) =>
          p.includes('assigned_by=eq.user') && p.includes(`drop_id=eq.${DROP}`)
            ? [{ world_id: W_WORK, world: { id: W_WORK, name: 'Work' } }]
            : [],
      },
    });
    const f = await fileDrop({}, { userId: 'u1', drop });
    expect(f).toMatchObject({ by: 'person', world: { id: W_WORK, name: 'Work' }, chapter: null });
    expect(jsonCall).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it('with nothing to file into, asks nothing', async () => {
    fakeDb();
    const f = await fileDrop({}, { userId: 'u1', drop });
    expect(f).toMatchObject({ skipped: true, skipped_reason: 'empty_graph' });
    expect(jsonCall).not.toHaveBeenCalled();
  });

  it('when no model can be asked, comes back skipped with why, and writes nothing', async () => {
    const { writes } = fakeDb({ tables: graphTables });
    jsonCall.mockRejectedValue(new Error('both down'));
    const f = await fileDrop({}, { userId: 'u1', drop, today: '2026-10-07' });
    expect(f).toMatchObject({ skipped: true, skipped_reason: 'model_failed' });
    expect(writes).toEqual([]);
  });

  it('writes one World and one Chapter, replacing only its own earlier filing', async () => {
    const { writes } = fakeDb({ tables: graphTables });
    jsonCall.mockResolvedValue({ output: answer({ contexts: [{ ref: 'x1', relevance: 0.8 }] }), model: 'gpt-6-luna' });
    const f = await fileDrop({}, { userId: 'u1', drop, today: '2026-10-07' });
    expect(jsonCall.mock.calls[0][1].primary).toEqual({ job: 'filing' });
    expect(f).toMatchObject({
      by: 'gremly',
      world: { id: W_HOME, name: 'Home' },
      chapter: { id: C_TRIP, title: 'Porto in November' },
      counts: { world_links: 1, chapter_links: 1, context_links: 1 },
    });
    // the new filing first, then Gremly's own old filing of this drop is cleared, only in their rows
    expect(writes.map((w) => w.op)).toEqual(['upsert', 'upsert', 'remove', 'remove', 'upsert']);
    const removes = writes.filter((w) => w.op === 'remove').map((w) => w.path);
    expect(removes).toEqual([
      `drop_world_links?owner_id=eq.u1&drop_id=eq.${DROP}&drop_type=eq.todo&assigned_by=eq.classifier&world_id=neq.${W_HOME}`,
      `drop_chapter_links?owner_id=eq.u1&drop_id=eq.${DROP}&drop_type=eq.todo&assigned_by=eq.classifier&chapter_id=neq.${C_TRIP}`,
    ]);
    const upserts = writes.filter((w) => w.op === 'upsert');
    expect(upserts.map((u) => u.table)).toEqual([
      'drop_world_links',
      'drop_chapter_links',
      'drop_context_links',
    ]);
    expect(upserts[0].rows[0]).toMatchObject({
      drop_id: DROP,
      drop_type: 'todo',
      world_id: W_HOME,
      owner_id: 'u1',
      assigned_by: 'classifier',
      reason: 'Getting ready for the trip.',
    });
  });

  it('a write that fails is no filing: it says so, and the old filing is not cleared', async () => {
    const { writes } = fakeDb({ tables: graphTables });
    db.mockReturnValue({
      ...db(),
      upsert: async () => {
        throw new Error('Supabase POST drop_world_links failed: 503');
      },
    });
    jsonCall.mockResolvedValue({ output: answer(), model: 'gpt-6-luna' });
    const f = await fileDrop({}, { userId: 'u1', drop, today: '2026-10-07' });
    expect(f).toMatchObject({ skipped: true, skipped_reason: 'write_failed', by: null, world: null, chapter: null });
    expect(writes.filter((w) => w.op === 'remove')).toEqual([]);
    expect(filingReply(f)).toMatchObject({ skipped: true, skipped_reason: 'write_failed' });
  });

  it("reads only the person's own rows for where they placed a drop", async () => {
    const { reads } = fakeDb({ tables: graphTables });
    jsonCall.mockResolvedValue({ output: answer(), model: 'm' });
    await fileDrop({}, { userId: 'u1', drop, today: '2026-10-07' });
    const placedReads = reads.filter((r) => r.includes(`drop_id=eq.${DROP}`));
    expect(placedReads).toHaveLength(2);
    for (const r of placedReads) expect(r).toContain('owner_id=eq.u1&');
  });

  it('once the old fields stop, reads no suggested rows or contexts and writes no context', async () => {
    const { writes, reads } = fakeDb({ tables: graphTables });
    jsonCall.mockResolvedValue({ output: answer({ contexts: [{ ref: 'x1', relevance: 0.8 }] }), model: 'm' });
    await fileDrop({ WORLDS_OLD_FIELDS: 'stop' }, { userId: 'u1', drop, today: '2026-10-07' });
    expect(reads.some((r) => r.startsWith('life_contexts'))).toBe(false);
    expect(reads.find((r) => r.startsWith('worlds?'))).toContain('phase=in.(active)');
    expect(reads.find((r) => r.startsWith('chapters?'))).toContain('phase=in.(upcoming,active,closed)');
    expect(writes.some((w) => w.table === 'drop_context_links')).toBe(false);
  });

  it('a graph that cannot be read comes back skipped with why', async () => {
    fakeDb({ tables: graphTables, failOn: 'chapters' });
    const f = await fileDrop({}, { userId: 'u1', drop, today: '2026-10-07' });
    expect(f).toMatchObject({ skipped: true, skipped_reason: 'graph_load_failed' });
  });
});

describe('the reply', () => {
  it('names where the drop went and keeps the old counts', () => {
    expect(
      filingReply({
        skipped: false,
        skipped_reason: null,
        by: 'gremly',
        world: { id: W_HOME, name: 'Home' },
        chapter: null,
        starts_something: true,
        reason: 'r',
        counts: { world_links: 1, chapter_links: 0, context_links: 0 },
      }),
    ).toEqual({
      world_links: 1,
      chapter_links: 0,
      context_links: 0,
      reason: 'r',
      skipped: false,
      filed: { by: 'gremly', world: { id: W_HOME, name: 'Home' }, chapter: null, starts_something: true },
    });
  });
});

describe('the backfill reads saved rows as drops', () => {
  it('takes each kind of item by its own fields', () => {
    expect(dropFromRow('note', { id: 'n', title: 'T', body: 'B', date: '2026-01-02', created_at: '2026-01-05T00:00:00Z', tags: ['a', 1] })).toMatchObject({
      entity_type: 'note',
      text: 'B',
      title: 'T',
      date: '2026-01-02',
      tags: ['a'],
    });
    expect(dropFromRow('todo', { id: 't', name: 'N', notes: 'X', created_at: '2026-01-05T00:00:00Z' })).toMatchObject({
      text: 'X',
      title: 'N',
      date: '2026-01-05',
    });
    expect(dropFromRow('habit', { id: 'h', title: 'Run', created_at: '2026-01-05T00:00:00Z' }).text).toBe('Run');
  });
});

describe('the graph', () => {
  it('kept, reads what the old screens show', async () => {
    const { reads } = fakeDb({ tables: graphTables });
    await loadGraph({}, 'u1');
    expect(reads[0]).toContain('phase=in.(candidate,active,evolving)');
    expect(reads[1]).toContain('phase=in.(suggested,upcoming,active,closed)');
    expect(reads[2]).toMatch(/^life_contexts/);
  });
});
