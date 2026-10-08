/**
 * @jest-environment node
 *
 * The catch up (context/reread.js, data fabric stage 4d): what was read under
 * older rules is read again under the current ones, shown as read before
 * beside the facts already taken from it. It adds what was missed, changes no
 * fact, and marks each record read. Made up records only.
 */
import { planReread, rereadWindow } from '../reread';
import { READER_PROMPT_VERSION, markRead } from '../reader';
import { completedRecord, todoRecord } from '../records';
import { db, personIdentity, userTimezone } from '../db';
import { jsonCall } from '../llm';
import { memoryDb } from './memoryDb';

jest.mock('../db', () => ({
  ...jest.requireActual('../db'),
  db: jest.fn(),
  personIdentity: jest.fn(async () => ({ first_name: 'Noor', identity: {} })),
  userTimezone: jest.fn(async () => 'America/New_York'),
}));
jest.mock('../llm', () => ({ jsonCall: jest.fn(), modelFor: () => 'model' }));
jest.mock('../../../shared/day.js', () => ({
  ...jest.requireActual('../../../shared/day.js'),
  personNow: async () => ({ today: '2026-11-12', dayEndHour: 3 }),
}));

const U = 'u-noor';

function tables() {
  return {
    ledger_cursor: [{ user_id: U, read_through: '2026-11-11T00:00:00Z' }],
    todos: [
      {
        id: 't-old',
        owner_id: U,
        title: 'Book the table',
        origin: null,
        created_at: '2026-10-01T09:00:00Z',
      },
      // read already under the current rules
      {
        id: 't-new',
        owner_id: U,
        title: 'Pay the deposit',
        origin: null,
        created_at: '2026-10-02T09:00:00Z',
      },
      // after the cursor: the regular read's, not the catch up's
      {
        id: 't-late',
        owner_id: U,
        title: 'Call the venue',
        origin: null,
        created_at: '2026-11-11T09:00:00Z',
      },
    ],
    scope_chat_messages: [
      {
        id: 'm-1',
        user_id: U,
        chat_id: 'c-1',
        role: 'user',
        content: 'Not until the 12th, it is our anniversary then.',
        created_at: '2026-10-03T20:00:00Z',
        metadata_json: null,
      },
    ],
    notes: [],
    habits: [],
    space_milestones: [],
    synced_calendar_events: [],
    user_profile_overrides: [],
    gremly_questions: [],
    // made and logged inside its window, as every save since the change log began
    item_changes: [
      {
        owner_id: U,
        table_name: 'todos',
        row_id: 't-old',
        op: 'insert',
        fields: [],
        dates: null,
        by: 'person',
        at: '2026-10-01T09:00:01Z',
      },
    ],
    ledger_reads: [
      {
        user_id: U,
        source_table: 'todos',
        source_id: 't-new',
        reader_version: READER_PROMPT_VERSION,
      },
      {
        user_id: U,
        source_table: 'todos',
        source_id: 't-old',
        reader_version: 'reader-2026-10-01a',
      },
    ],
    life_facts: [
      {
        id: 'f-wrong-day',
        user_id: U,
        statement: 'Noor and Eli have an anniversary on 3 October.',
        state: 'corrected',
        correction_text: 'It is on the 12th',
        about_date: '2026-10-03',
        last_confirmed_at: '2026-10-03T20:00:00Z',
      },
      {
        id: 'f-table',
        user_id: U,
        statement: 'Noor plans to book a table for dinner.',
        state: 'planned',
        about_date: null,
        last_confirmed_at: '2026-11-01T09:00:00Z',
      },
    ],
    life_fact_sources: [
      {
        fact_id: 'f-wrong-day',
        user_id: U,
        source_table: 'scope_chat_messages',
        source_id: 'm-1',
        'life_facts.state': 'corrected',
      },
      {
        fact_id: 'f-table',
        user_id: U,
        source_table: 'todos',
        source_id: 't-old',
        'life_facts.state': 'planned',
      },
    ],
    life_people: [],
    life_person_names: [],
    life_fact_people: [],
    person_merges: [],
    life_fact_changes: [],
  };
}

function wire(t) {
  const mem = memoryDb(t);
  const VIEWS = { life_facts_now: 'life_facts' };
  const at = (p) => {
    const [table, q] = p.split('?');
    return `${VIEWS[table] || table}?${q || ''}`;
  };
  db.mockReturnValue({
    select: (p) => mem.select(at(p)),
    insert: (table, rows) => mem.insert(table, rows),
    insertQuiet: (table, rows) => mem.insertQuiet(table, rows),
    insertIgnore: (table, rows, on) => mem.insertIgnore(table, rows, on),
    update: (p, patch) => mem.update(at(p), patch),
    remove: (p) => mem.remove(at(p)),
    upsert: async (table, rows, on) => {
      const keys = on.split(',');
      t[table] = t[table] || [];
      for (const r of rows) {
        const hit = t[table].find((x) => keys.every((k) => x[k] === r[k]));
        if (hit) Object.assign(hit, r);
        else t[table].push({ ...r });
      }
      return rows;
    },
  });
  return mem;
}

beforeEach(() => jest.clearAllMocks());

describe('the catch up', () => {
  it('plans only what was read under older rules, up to the cursor', async () => {
    wire(tables());
    const plan = await planReread({}, U);
    expect(plan.until).toBe('2026-11-11T00:00:00Z');
    expect(plan.total).toBe(2);
    expect(plan.version).toBe(READER_PROMPT_VERSION);
  });

  it('shows each record as read before with its facts, adds what was missed, changes nothing, and marks it read', async () => {
    const t = tables();
    wire(t);
    jsonCall.mockResolvedValue({
      model: 'model',
      output: {
        new_facts: [
          {
            statement: 'Noor and their partner have an anniversary on 12 November.',
            source_ref: 'r2',
            quote: 'it is our anniversary then',
            about_date: '2026-11-12',
            date_confidence: 'exact',
            state: 'current',
            kind: 'event',
            timing: 'yearly',
            people: [],
          },
        ],
        fact_updates: [{ fact_ref: 'f1', new_state: 'happened', reason: 'old', source_ref: 'r1' }],
        confirmations: [{ fact_ref: 'f1', source_ref: 'r1' }],
        questions: [{ question: 'Did you book it?', choices: ['Yes', 'No'] }],
        calendar: [],
      },
    });
    const plan = await planReread({}, U);
    let totals = {};
    for (const w of plan.windows) {
      const c = await rereadWindow({}, U, plan.tz, w.from, w.to, 'reread-test');
      for (const k of Object.keys(c)) totals[k] = (totals[k] || 0) + c[k];
    }

    const { user } = jsonCall.mock.calls[0][1];
    expect(user).toMatch(
      /\[read before\] Added a todo: "Book the table".*ledger facts from it: f\d/,
    );
    // each record once, though the change log holds it too
    expect(user.match(/Book the table/g)).toHaveLength(1);
    // what the person put right is shown beside the record it came from, so it never comes back
    expect(user).toMatch(/put right by them: "It is on the 12th"/);
    expect(user).toMatch(/our anniversary then\." \| ledger facts from it: f\d/);
    expect(user).not.toContain('Pay the deposit');
    expect(user).not.toContain('Call the venue');

    const added = t.life_facts.find((f) => f.timing === 'yearly');
    expect(added).toMatchObject({ about_date: '2026-11-12', observed_at: '2026-10-03T20:00:00Z' });
    // the fact it would have changed stands, and no question was asked
    expect(t.life_facts.find((f) => f.id === 'f-table').state).toBe('planned');
    expect(t.gremly_questions).toHaveLength(0);
    // a confirmation from an older record never moves the date back
    expect(t.life_facts.find((f) => f.id === 'f-table').last_confirmed_at).toBe(
      '2026-11-01T09:00:00Z',
    );
    expect(totals).toMatchObject({ facts_added: 1, held_updates: 1, held_questions: 1, marked: 2 });
    const marks = t.ledger_reads.filter((m) => m.reader_version === READER_PROMPT_VERSION);
    expect(marks.map((m) => `${m.source_table}:${m.source_id}`).sort()).toEqual([
      'scope_chat_messages:m-1',
      'todos:t-new',
      'todos:t-old',
    ]);

    // read again, there is nothing left to catch up
    const again = await planReread({}, U);
    expect(again.total).toBe(0);
  });
});

describe('the marks', () => {
  it('mark a todo made and the same todo done apart, and never a change', async () => {
    const rows = [];
    const d = { upsert: async (_t, r) => rows.push(...r) };
    const made = todoRecord({
      id: 't-1',
      title: 'Call the venue',
      created_at: '2026-06-01T09:00:00Z',
    });
    const done = completedRecord({
      id: 't-1',
      title: 'Call the venue',
      completed_at: '2026-10-01T09:00:00Z',
    });
    const changed = {
      table: 'todos',
      id: 't-2',
      at: '2026-10-01T09:00:00Z',
      kind: 'changed',
      text: 'x',
    };
    expect(await markRead(d, U, [made, done, changed])).toBe(2);
    expect(rows.map((r) => `${r.source_table}:${r.source_id}`)).toEqual([
      'todos:t-1',
      'todos:completed:t-1',
    ]);
  });
});
