/**
 * @jest-environment node
 *
 * People (workers/inngest-jobs/context/people.js): code turns what the model
 * said into records. It never matches names, never merges on its own, never
 * sets who someone is except from a fact that states it, and never writes over
 * what the person wrote. A merge the person said yes to can be undone.
 */
import {
  planPeople,
  peopleLines,
  writePeople,
  peopleAfterCorrection,
  mergePeople,
  undoMerge,
} from '../people.js';

let n = 0;
const newId = () => `new-${++n}`;
beforeEach(() => {
  n = 0;
});

const known = (list) => peopleLines(list).ref;
const SAM_WORK = {
  id: 'p-sam',
  name: 'Sam',
  names: ['Sam'],
  relationship: null,
  name_by: 'gremly',
  relationship_by: 'gremly',
  created_at: '2026-10-01',
};
const BROTHER = {
  id: 'p-bro',
  name: null,
  names: [],
  relationship: 'brother',
  relationship_fact_id: 'f-0',
  name_by: 'gremly',
  relationship_by: 'gremly',
  created_at: '2026-10-02',
};

describe('the known people a prompt is shown', () => {
  it('give each a ref, their names and who they are as the person said', () => {
    const { lines, ref } = peopleLines([{ ...SAM_WORK, names: ['Sam', 'Sam H'] }, BROTHER]);
    expect(lines).toEqual([
      'p1 | Sam | also called Sam H',
      'p2 | (no name given yet) | brother, as they said',
    ]);
    expect(ref.get('p2').id).toBe('p-bro');
  });
});

describe('planning what the model said', () => {
  it('makes a record for someone new, by the name the record uses', () => {
    const plan = planPeople({
      known: new Map(),
      facts: [{ factId: 'f-1', people: [{ ref: null, name: 'Priya', relationship: null }] }],
      userId: 'u',
      runId: 'r',
      newId,
    });
    expect(plan.creates).toEqual([
      expect.objectContaining({ id: 'new-1', name: 'Priya', relationship: null, run_id: 'r' }),
    ]);
    expect(plan.names).toEqual([
      expect.objectContaining({ person_id: 'new-1', name: 'Priya', fact_id: 'f-1' }),
    ]);
    expect(plan.ties).toEqual([expect.objectContaining({ fact_id: 'f-1', person_id: 'new-1' })]);
  });

  it('keeps two people who share a name apart unless the model gives a known ref', () => {
    const plan = planPeople({
      known: known([SAM_WORK]),
      facts: [{ factId: 'f-1', people: [{ ref: null, name: 'Sam', relationship: 'brother' }] }],
      userId: 'u',
      runId: 'r',
      newId,
    });
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0]).toMatchObject({
      name: 'Sam',
      relationship: 'brother',
      relationship_fact_id: 'f-1',
    });
    expect(plan.updates.size).toBe(0);
  });

  it('gives a name to someone known only by who they are, when the model says it is them', () => {
    const plan = planPeople({
      known: known([BROTHER]),
      facts: [{ factId: 'f-2', people: [{ ref: 'p1', name: 'Sam', relationship: null }] }],
      userId: 'u',
      runId: 'r',
      newId,
    });
    expect(plan.creates).toHaveLength(0);
    expect(plan.updates.get('p-bro')).toEqual({ name: 'Sam' });
    expect(plan.names).toEqual([
      expect.objectContaining({ person_id: 'p-bro', name: 'Sam', fact_id: 'f-2' }),
    ]);
  });

  it('sets who someone is only from the fact that states it, and keeps the fact', () => {
    const plan = planPeople({
      known: known([SAM_WORK]),
      facts: [{ factId: 'f-3', people: [{ ref: 'p1', name: null, relationship: 'manager' }] }],
      userId: 'u',
      runId: 'r',
      newId,
    });
    expect(plan.updates.get('p-sam')).toEqual({
      relationship: 'manager',
      relationship_fact_id: 'f-3',
    });
  });

  it('never writes over a name or who someone is that the person wrote', () => {
    const theirs = { ...BROTHER, name: 'Samuel', name_by: 'person', relationship_by: 'person' };
    const plan = planPeople({
      known: known([theirs]),
      facts: [{ factId: 'f-4', people: [{ ref: 'p1', name: 'Sam', relationship: 'cousin' }] }],
      userId: 'u',
      runId: 'r',
      newId,
    });
    expect(plan.updates.get('p-bro')).toBeUndefined();
    // the other name is still kept, with the fact it came from
    expect(plan.names).toEqual([expect.objectContaining({ person_id: 'p-bro', name: 'Sam' })]);
  });

  it('does not add a name the person already has, in any case', () => {
    const plan = planPeople({
      known: known([SAM_WORK]),
      facts: [{ factId: 'f-5', people: [{ ref: 'p1', name: 'SAM', relationship: null }] }],
      userId: 'u',
      runId: 'r',
      newId,
    });
    expect(plan.names).toHaveLength(0);
    expect(plan.ties).toHaveLength(1);
  });

  it('makes one record for someone new named twice in one read', () => {
    const plan = planPeople({
      known: new Map(),
      facts: [
        { factId: 'f-1', people: [{ ref: null, name: 'Jo', relationship: null }] },
        { factId: 'f-2', people: [{ ref: null, name: 'jo', relationship: 'partner' }] },
      ],
      userId: 'u',
      runId: 'r',
      newId,
    });
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0]).toMatchObject({
      name: 'Jo',
      relationship: 'partner',
      relationship_fact_id: 'f-2',
    });
    expect(plan.ties).toHaveLength(2);
  });

  it('turns two known people the model thinks are one into a proposal, keeping the older, and merges nothing', () => {
    const plan = planPeople({
      known: known([BROTHER, SAM_WORK]),
      facts: [],
      same: [{ ref_a: 'p1', ref_b: 'p2', why: 'both are Sam' }],
      userId: 'u',
      runId: 'r',
      newId,
    });
    expect(plan.merges).toEqual([
      expect.objectContaining({ kept_id: 'p-sam', merged_id: 'p-bro', status: 'proposed' }),
    ]);
    expect(plan.updates.size).toBe(0);
  });

  it('makes someone new who may be someone known into a proposal beside the new record', () => {
    const plan = planPeople({
      known: known([SAM_WORK]),
      facts: [
        {
          factId: 'f-6',
          people: [
            {
              ref: null,
              name: 'Sam H',
              relationship: null,
              maybe_ref: 'p1',
              maybe_why: 'Sam with an initial',
            },
          ],
        },
      ],
      userId: 'u',
      runId: 'r',
      newId,
    });
    expect(plan.creates).toEqual([expect.objectContaining({ id: 'new-1', name: 'Sam H' })]);
    expect(plan.merges).toEqual([
      expect.objectContaining({
        kept_id: 'p-sam',
        merged_id: 'new-1',
        status: 'proposed',
        reason: 'Sam with an initial',
      }),
    ]);
    expect(plan.ties).toEqual([expect.objectContaining({ fact_id: 'f-6', person_id: 'new-1' })]);
  });

  it('rejects a ref it never gave, an entry with nothing in it, and a proposal about one person', () => {
    const plan = planPeople({
      known: known([SAM_WORK]),
      facts: [
        {
          factId: 'f-1',
          people: [
            { ref: 'p9', name: null, relationship: null },
            { ref: null, name: null, relationship: null },
          ],
        },
      ],
      same: [{ ref_a: 'p1', ref_b: 'p1', why: 'same' }],
      userId: 'u',
      runId: 'r',
      newId,
    });
    expect(plan.rejected).toBe(3);
    expect(plan.ties).toHaveLength(0);
  });
});

describe('writing', () => {
  it('guards every patch so a field the person wrote is never written over', async () => {
    const calls = [];
    const d = {
      insertQuiet: async (t, rows) => calls.push({ op: 'insert', t, rows }),
      update: async (path, patch) => calls.push({ op: 'update', path, patch }),
      insertIgnore: async (t, rows, on) => calls.push({ op: 'ignore', t, rows, on }),
    };
    const plan = planPeople({
      known: known([SAM_WORK]),
      facts: [{ factId: 'f-3', people: [{ ref: 'p1', name: 'Sam H', relationship: 'manager' }] }],
      userId: 'u',
      runId: 'r',
      newId,
    });
    const out = await writePeople(d, 'u', plan);
    const update = calls.find((c) => c.op === 'update');
    expect(update.path).toBe('life_people?id=eq.p-sam&user_id=eq.u&relationship_by=eq.gremly');
    expect(calls.find((c) => c.t === 'life_person_names').on).toBe('person_id,name');
    expect(calls.find((c) => c.t === 'life_fact_people').on).toBe('fact_id,person_id');
    expect(out).toMatchObject({
      people_new: 0,
      people_changed: 1,
      people_names: 1,
      people_ties: 1,
    });
  });

  it('clears who someone is when the fact it came from is corrected, and only then', async () => {
    const calls = [];
    const d = { update: async (path, patch) => (calls.push({ path, patch }), [{ id: 'p' }]) };
    expect(await peopleAfterCorrection(d, 'u', ['f-1', 'f-2'])).toBe(1);
    expect(calls[0].path).toBe(
      'life_people?user_id=eq.u&relationship_by=eq.gremly&relationship_fact_id=in.(f-1,f-2)',
    );
    expect(calls[0].patch).toMatchObject({ relationship: null, relationship_fact_id: null });
    expect(await peopleAfterCorrection(d, 'u', [])).toBe(0);
  });
});

/** A small in-memory database, enough for a merge and its undo. */
function memoryDb(tables) {
  const parse = (path) => {
    const [table, q = ''] = path.split('?');
    const filters = q
      .split('&')
      .filter((p) => p && !p.startsWith('select='))
      .map((p) => {
        const [col, rest] = p.split('=');
        const op = rest.slice(0, rest.indexOf('.'));
        const val = decodeURIComponent(rest.slice(rest.indexOf('.') + 1));
        return { col, op, val };
      });
    const match = (row) =>
      filters.every(({ col, op, val }) => {
        if (op === 'eq') return String(row[col]) === val;
        if (op === 'in')
          return val
            .replace(/^\(|\)$/g, '')
            .split(',')
            .includes(String(row[col]));
        if (op === 'is') return val === 'null' ? row[col] == null : true;
        return true;
      });
    return { table, match };
  };
  return {
    tables,
    select: async (path) => {
      const { table, match } = parse(path);
      return (tables[table] || []).filter(match).map((r) => ({ ...r }));
    },
    update: async (path, patch) => {
      const { table, match } = parse(path);
      const rows = (tables[table] || []).filter(match);
      rows.forEach((r) => Object.assign(r, patch));
      return rows;
    },
    remove: async (path) => {
      const { table, match } = parse(path);
      const gone = (tables[table] || []).filter(match);
      tables[table] = (tables[table] || []).filter((r) => !match(r));
      return gone;
    },
    insertIgnore: async (table, rows, on) => {
      const keys = on.split(',');
      tables[table] = tables[table] || [];
      for (const r of rows)
        if (!tables[table].some((x) => keys.every((k) => x[k] === r[k])))
          tables[table].push({ ...r });
    },
  };
}

describe('a merge the person said yes to', () => {
  const start = () =>
    memoryDb({
      life_people: [
        {
          id: 'p-a',
          user_id: 'u',
          name: 'Lizzie',
          name_by: 'gremly',
          relationship: null,
          relationship_by: 'gremly',
          relationship_fact_id: null,
          merged_into: null,
        },
        {
          id: 'p-b',
          user_id: 'u',
          name: 'Elizabeth',
          name_by: 'gremly',
          relationship: 'friend from school',
          relationship_by: 'gremly',
          relationship_fact_id: 'f-9',
          merged_into: null,
        },
      ],
      life_person_names: [
        { person_id: 'p-a', user_id: 'u', name: 'Lizzie', fact_id: 'f-1', by: 'gremly' },
        { person_id: 'p-b', user_id: 'u', name: 'Elizabeth', fact_id: 'f-2', by: 'gremly' },
      ],
      life_fact_people: [
        { fact_id: 'f-1', person_id: 'p-a', user_id: 'u' },
        { fact_id: 'f-2', person_id: 'p-b', user_id: 'u' },
        { fact_id: 'f-9', person_id: 'p-b', user_id: 'u' },
      ],
      person_merges: [
        {
          id: 'm-1',
          user_id: 'u',
          kept_id: 'p-a',
          merged_id: 'p-b',
          status: 'proposed',
          moved: null,
        },
      ],
    });

  it('moves the names and facts to the kept record and points the other at it', async () => {
    const d = start();
    expect(await mergePeople(d, 'u', 'm-1')).toMatchObject({ merged: true, names: 1, facts: 2 });
    const a = d.tables.life_people.find((p) => p.id === 'p-a');
    expect(a.relationship).toBe('friend from school');
    expect(d.tables.life_people.find((p) => p.id === 'p-b').merged_into).toBe('p-a');
    expect(
      d.tables.life_fact_people
        .filter((t) => t.person_id === 'p-a')
        .map((t) => t.fact_id)
        .sort(),
    ).toEqual(['f-1', 'f-2', 'f-9']);
    expect(d.tables.person_merges[0].status).toBe('merged');
  });

  it('can be undone, leaving both records as they were', async () => {
    const d = start();
    const before = JSON.parse(JSON.stringify(d.tables));
    await mergePeople(d, 'u', 'm-1');
    expect(await undoMerge(d, 'u', 'm-1')).toEqual({ undone: true });
    const strip = (rows) => rows.map(({ updated_at, ...r }) => r);
    expect(strip(d.tables.life_people)).toEqual(before.life_people);
    expect(d.tables.life_person_names).toEqual(before.life_person_names);
    expect(
      d.tables.life_fact_people.sort((x, y) =>
        (x.fact_id + x.person_id).localeCompare(y.fact_id + y.person_id),
      ),
    ).toEqual(
      before.life_fact_people.sort((x, y) =>
        (x.fact_id + x.person_id).localeCompare(y.fact_id + y.person_id),
      ),
    );
    expect(d.tables.person_merges[0].status).toBe('undone');
  });

  it('happens once', async () => {
    const d = start();
    await mergePeople(d, 'u', 'm-1');
    expect(await mergePeople(d, 'u', 'm-1')).toMatchObject({ merged: false });
  });
});
