/**
 * @jest-environment node
 *
 * The ledger review (data fabric stage 4f, context/review.js): what only the
 * person can settle becomes a question, and code keeps it few, never about
 * anything private or about health, and never about a fact already put to
 * them. Nothing in the ledger changes. Made up records only.
 */
import {
  reviewLedger,
  reviewRequest,
  reviewRows,
  REVIEW_CAPS,
  TIDY_MOST,
  PASSED_AFTER_DAYS,
} from '../review';
import { db } from '../db';
import { jsonCall } from '../llm';
import { memoryDb } from './memoryDb';

jest.mock('../db', () => ({
  ...jest.requireActual('../db'),
  db: jest.fn(),
  personIdentity: jest.fn(async () => ({ first_name: 'Noor', identity: {} })),
  userTimezone: jest.fn(async () => 'America/New_York'),
}));
jest.mock('../llm', () => ({ ...jest.requireActual('../llm'),
  jsonCall: jest.fn(),
  modelFor: () => ({ provider: 'openai', model: 'm' }),
}));
jest.mock('../../../shared/day.js', () => ({
  ...jest.requireActual('../../../shared/day.js'),
  personNow: async () => ({ today: '2026-11-12', dayEndHour: 3 }),
}));

const U = 'u-noor';
const fact = (id, statement, over = {}) => ({
  id,
  user_id: U,
  statement,
  kind: 'event',
  timing: 'day',
  state: 'current',
  about_date: null,
  about_date_end: null,
  private: false,
  health: false,
  source_table: 'scope_chat_messages',
  last_confirmed_at: '2026-11-01T09:00:00Z',
  ...over,
});

const FACTS = [
  fact('b1', "Noor's birthday is on 25 April.", {
    kind: 'event',
    timing: 'yearly',
    about_date: '2026-04-25',
  }),
  fact('b2', 'Noor turned 35 on 30 April.', { state: 'happened', about_date: '2026-04-30' }),
  fact('m1', 'Noor has a weekly team sync.', {
    kind: 'routine',
    timing: 'standing',
    source_table: 'synced_calendar_events',
  }),
  fact('m2', 'Noor has a status call on 2 October.', {
    state: 'planned',
    about_date: '2026-10-02',
    source_table: 'synced_calendar_events',
  }),
  fact('p1', 'Noor plans to call the bank on 1 October.', {
    state: 'planned',
    about_date: '2026-10-01',
  }),
  fact('s1', 'Noor has a check up for her knee.', {
    health: true,
    state: 'planned',
    about_date: '2026-09-20',
  }),
  fact('t1', 'Noor plans to return the jacket by 25 September.', {
    state: 'planned',
    about_date: '2026-09-25',
    source_table: 'todos',
    item_table: 'todos',
  }),
];

function refsFor(facts) {
  const { ref } = reviewRequest({ today: '2026-11-12', person: { first_name: 'Noor' }, facts });
  const byId = new Map([...ref].map(([r, f]) => [f.id, r]));
  return { ref, r: (id) => byId.get(id) };
}

describe('the request', () => {
  it('shows each fact with its kind, when it is true, its state and where it came from, marks private, and the questions waiting', () => {
    const { user } = reviewRequest({
      today: '2026-11-12',
      person: { first_name: 'Noor' },
      facts: FACTS,
      waiting: [{ question: 'Who is Sam to you?' }],
    });
    expect(user).toContain('| event | every year on 04-25 | current | from a chat | Noor');
    expect(user).toContain('| routine | standing | current | from their calendar |');
    expect(user).toContain('planned [private] |');
    expect(user).toContain(
      '| from a todo, about the todo itself | Noor plans to return the jacket',
    );
    expect(user).toContain('- Who is Sam to you?');
  });
});

describe('the rows', () => {
  const output = (r) => ({
    conflicts: [
      {
        fact_refs: [r('b1'), r('b2')],
        question: 'Is your birthday on 25 or 30 April?',
        choices: ['30 April', '25 April'],
        matters: 'needs',
        topic: 'Your birthday',
        why: 'One from a todo, one from a chat in April.',
      },
    ],
    // a reply from before set aside was taken out: never written
    set_aside: [
      {
        fact_refs: [r('m1'), r('m2')],
        question: 'These look like work meetings. Forget them?',
        yes: 'Forget them',
        no: 'Keep them',
        topic: 'two work meetings',
      },
    ],
    passed: [
      {
        fact_refs: [r('p1'), r('m1'), r('t1')],
        lines: ['Calling the bank', 'Your team sync', 'Returning the jacket'],
        question: 'Did these happen?',
        yes: 'They did',
        no: 'Leave them',
        topic: 'a call to the bank',
      },
    ],
  });

  it('turns a conflict into a weighed question and passed plans into a tidy up, all with the same columns, and never offers to set anything aside', () => {
    const { ref, r } = refsFor(FACTS);
    const { rows } = reviewRows({
      output: output(r),
      ref,
      userId: U,
      runId: 'run',
      today: '2026-11-12',
    });
    const conflict = rows.find((x) => x.kind === 'fact');
    expect(conflict).toMatchObject({
      weight: 'needs',
      topic: 'Your birthday',
      why: 'One from a todo, one from a chat in April.',
      about_fact_id: 'b1',
      choices: ['30 April', '25 April'],
      rests_on: [
        { table: 'life_facts', id: 'b1' },
        { table: 'life_facts', id: 'b2' },
      ],
    });
    expect(rows.some((x) => x.proposed_change?.type === 'set_aside')).toBe(false);
    expect(REVIEW_CAPS).not.toHaveProperty('set_aside');
    // a bulk insert needs every row to carry the same columns
    const keys = rows.map((x) => Object.keys(x).sort().join(','));
    expect(new Set(keys).size).toBe(1);
  });

  it('never questions their calendar: two of its entries are never a conflict', () => {
    const { ref, r } = refsFor(FACTS);
    const { rows, skipped } = reviewRows({
      output: {
        conflicts: [
          { fact_refs: [r('m1'), r('m2')], question: 'Which is right?', choices: ['a', 'b'], matters: 'needs' },
        ],
        passed: [],
      },
      ref,
      userId: U,
      runId: 'run',
      today: '2026-11-12',
    });
    expect(rows).toHaveLength(0);
    expect(skipped.calendar).toBe(1);
  });

  it('puts only plans in a tidy up of plans whose days passed, never an item they keep or a calendar entry, each named to them in its own words', () => {
    const { ref, r } = refsFor(FACTS);
    const { rows } = reviewRows({
      output: output(r),
      ref,
      userId: U,
      runId: 'run',
      today: '2026-11-12',
    });
    const passed = rows.find((x) => x.proposed_change?.type === 'happened');
    // the team sync is from their calendar, and the todo says itself whether it was done
    expect(passed.proposed_change.fact_ids).toEqual(['p1']);
    expect(passed.proposed_change.statements).toEqual(['Calling the bank']);
  });

  it('puts no plan to them that it has not named in their words', () => {
    const { ref, r } = refsFor(FACTS);
    const { rows, skipped } = reviewRows({
      output: { conflicts: [], passed: [{ fact_refs: [r('p1')], lines: [''], question: 'Did it?', yes: 'Yes', no: 'No' }] },
      ref,
      userId: U,
      runId: 'run',
      today: '2026-11-12',
    });
    expect(rows).toHaveLength(0);
    expect(skipped.unnamed).toBe(1);
  });

  it('asks whether a plan happened only once its last day is well behind them', () => {
    const recent = [
      fact('r1', 'Noor plans to post the forms on 8 November.', {
        state: 'planned',
        about_date: '2026-11-08',
      }),
      fact('r2', 'Noor plans a weekend in Hudson from 30 October to 6 November.', {
        state: 'planned',
        timing: 'span',
        about_date: '2026-10-30',
        about_date_end: '2026-11-06',
      }),
      fact('r3', 'Noor plans to sort the garage some time.', { state: 'planned' }),
    ];
    const { ref, r } = refsFor(recent);
    const out = {
      conflicts: [],
      passed: [
        {
          fact_refs: recent.map((f) => r(f.id)),
          lines: ['Posting the forms', 'Your weekend in Hudson', 'Sorting the garage'],
          question: 'Did these happen?',
          yes: 'They did',
          no: 'Leave them',
        },
      ],
    };
    const { rows } = reviewRows({ output: out, ref, userId: U, runId: 'run', today: '2026-11-12' });
    // four days ago, a span that ended six days ago though it began earlier, and no day at all: none is asked yet
    expect(rows).toHaveLength(0);
    expect(PASSED_AFTER_DAYS).toBe(7);
    const later = reviewRows({
      output: out,
      ref,
      userId: U,
      runId: 'run',
      today: '2026-11-15',
    }).rows;
    expect(later[0].proposed_change.fact_ids).toEqual(['r1', 'r2']);
    expect(later[0].proposed_change.statements).toEqual(['Posting the forms', 'Your weekend in Hudson']);
  });

  it('puts a fact in one question of a run at most', () => {
    const plans = [
      fact('p1', 'Noor plans to call the bank on 1 October.', { state: 'planned', about_date: '2026-10-01' }),
      fact('p2', 'Noor plans to book the dentist on 2 October.', { state: 'planned', about_date: '2026-10-02' }),
    ];
    const { ref, r } = refsFor([...FACTS.filter((f) => f.id !== 'p1'), ...plans]);
    const out = {
      conflicts: [
        {
          fact_refs: [r('b1'), r('b2')],
          question: 'Is your birthday on 25 or 30 April?',
          choices: ['30 April', '25 April'],
          matters: 'needs',
        },
      ],
      passed: [
        { fact_refs: [r('p1'), r('b2')], lines: ['The bank', 'Your birthday'], question: 'Did it happen?', yes: 'It did', no: 'Leave it' },
        { fact_refs: [r('p2')], lines: ['The dentist'], question: 'Did you book the dentist?', yes: 'I did', no: 'Leave it' },
      ],
    };
    const { rows } = reviewRows({
      output: out,
      ref,
      userId: U,
      runId: 'run',
      today: '2026-11-12',
    });
    expect(rows.map((x) => x.proposed_change?.type || 'conflict')).toEqual(['conflict', 'happened']);
    // b2 is not a plan, so the first is the bank alone
    expect(rows[1].proposed_change.fact_ids).toEqual(['p1']);
  });

  it('never puts a private or health fact, or one already put to them, in anything', () => {
    const { ref, r } = refsFor(FACTS);
    const out = {
      conflicts: [
        { fact_refs: [r('b1'), r('s1')], question: 'Q?', choices: ['a', 'b'], matters: 'needs' },
      ],
      passed: [{ fact_refs: [r('p1')], lines: ['The bank'], question: 'Did it?', yes: 'Yes', no: 'No' }],
    };
    const { rows, skipped } = reviewRows({
      output: out,
      ref,
      userId: U,
      runId: 'run',
      today: '2026-11-12',
      already: new Set(['p1']),
    });
    expect(rows).toHaveLength(0);
    expect(skipped.private_or_asked).toBe(2);
  });

  it('asks a set already put to them never again, and keeps a run to a few', () => {
    const { ref, r } = refsFor(FACTS);
    const first = reviewRows({
      output: output(r),
      ref,
      userId: U,
      runId: 'run',
      today: '2026-11-12',
    }).rows;
    const keys = new Set(first.map((x) => x.no_key));
    const again = reviewRows({
      output: output(r),
      ref,
      userId: U,
      runId: 'run',
      today: '2026-11-12',
      keys,
    });
    expect(again.rows).toHaveLength(0);
    expect(again.skipped.repeated).toBe(2);
    const many = {
      conflicts: Array.from({ length: 5 }, () => ({
        fact_refs: [r('b1'), r('b2')],
        question: 'Q?',
        choices: ['a', 'b'],
        matters: 'helps',
      })),
      passed: [],
    };
    // the same pair five times is one question: the rest repeat it
    expect(
      reviewRows({ output: many, ref, userId: U, runId: 'run', today: '2026-11-12' }).rows,
    ).toHaveLength(1);
    expect(REVIEW_CAPS.conflicts).toBeLessThanOrEqual(2);
  });

  it('writes no tidy up while enough are waiting, and none that holds too many facts', () => {
    const { ref, r } = refsFor(FACTS);
    expect(
      reviewRows({
        output: output(r),
        ref,
        userId: U,
        runId: 'run',
        today: '2026-11-12',
        tidyWaiting: 2,
      }).rows.filter((x) => x.kind === 'tidy'),
    ).toHaveLength(0);
    const big = Array.from({ length: TIDY_MOST + 1 }, (_, i) =>
      fact(`x${i}`, `A plan ${i}.`, { state: 'planned', about_date: '2026-10-01' }),
    );
    const b = refsFor(big);
    const out = {
      conflicts: [],
      passed: [
        { fact_refs: big.map((f) => b.r(f.id)), lines: big.map((_, i) => `Plan ${i}`), question: 'Q?', yes: 'Yes', no: 'No' },
      ],
    };
    expect(
      reviewRows({ output: out, ref: b.ref, userId: U, runId: 'run', today: '2026-11-12' }).rows,
    ).toHaveLength(0);
  });
});

describe('a review', () => {
  function wire(t) {
    const mem = memoryDb(t);
    const VIEWS = { life_facts_now: 'life_facts' };
    const at = (p) => {
      const [table, q] = p.split('?');
      return `${VIEWS[table] || table}?${q || ''}`;
    };
    db.mockReturnValue({
      select: (p) => mem.select(at(p)),
      insertQuiet: (table, rows) => mem.insertQuiet(table, rows),
    });
    return mem;
  }

  it('writes its questions and changes no fact; in shadow it writes nothing', async () => {
    const t = { life_facts: FACTS.map((f) => ({ ...f })), gremly_questions: [] };
    const mem = wire(t);
    jsonCall.mockImplementation(async (_env, { user }) => {
      const refOf = (statement) =>
        user
          .split('\n')
          .find((l) => l.includes(statement))
          .split(' | ')[0];
      return {
        model: 'm',
        output: {
          conflicts: [
            {
              fact_refs: [refOf('25 April'), refOf('30 April')],
              question: 'Is your birthday on 25 or 30 April?',
              choices: ['30 April', '25 April'],
              matters: 'needs',
            },
          ],
          passed: [],
        },
      };
    });
    const shadow = await reviewLedger({}, U, { shadow: true });
    expect(shadow.rows).toHaveLength(1);
    expect(mem.tables.gremly_questions).toHaveLength(0);
    const live = await reviewLedger({}, U);
    expect(live.written).toBe(1);
    expect(mem.tables.gremly_questions[0]).toMatchObject({
      kind: 'fact',
      weight: 'needs',
      status: 'open',
    });
    expect(mem.tables.life_facts.map((f) => f.state)).toEqual(FACTS.map((f) => f.state));
  });

  it('writes none while enough questions are waiting already, of any kind but the welcome back', async () => {
    const waiting = Array.from({ length: 6 }, (_, i) => ({
      id: `w${i}`,
      user_id: U,
      kind: i ? 'person' : null,
      status: 'open',
      question: `Q${i}?`,
    }));
    const t = { life_facts: FACTS.map((f) => ({ ...f })), gremly_questions: waiting };
    const mem = wire(t);
    jsonCall.mockImplementation(async (_env, { user }) => {
      const refOf = (statement) => user.split('\n').find((l) => l.includes(statement)).split(' | ')[0];
      return {
        model: 'm',
        output: {
          conflicts: [
            { fact_refs: [refOf('25 April'), refOf('30 April')], question: 'Is your birthday on 25 or 30 April?', choices: ['30 April', '25 April'], matters: 'needs' },
          ],
          passed: [],
        },
      };
    });
    const out = await reviewLedger({}, U);
    expect(out).toMatchObject({ written: 0, no_room: 1, room: 0 });
    expect(mem.tables.gremly_questions).toHaveLength(6);
    // a welcome back waiting leaves room
    mem.tables.gremly_questions[0].kind = 'while_away';
    expect(await reviewLedger({}, U)).toMatchObject({ written: 1 });
  });
});
