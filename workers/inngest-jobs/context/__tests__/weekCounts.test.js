/**
 * @jest-environment node
 *
 * The week counted by code for the weekly pass (data fabric stage 5). Made up
 * records only.
 */
import { countWeek, weekCountItems, weekCountLines } from '../weekCounts';
import { shownBefore } from '../weekly';

jest.mock('../db', () => ({ ...jest.requireActual('../db'), db: jest.fn() }));

const WEEK = { periodStart: '2026-11-02', periodEnd: '2026-11-08' };
const thread = (day, m = {}) => ({ metadata_json: { ritual_day: day, ...m } });

test('counts the days answered, planned and wrapped up, once a day', () => {
  const c = countWeek({
    ...WEEK,
    threads: [
      thread('2026-11-02', { answered_at: 'x', plan_locked_at: 'x' }),
      // the same day picked up again is the same day
      thread('2026-11-02', { answered_at: 'x' }),
      thread('2026-11-03', { answered_at: 'x' }),
      thread('2026-11-04', {
        sweep: {
          step: 'done',
          decisions: [{ out: 'kept' }, { out: 'let_go' }, { out: 'let_go' }],
        },
      }),
      // a day outside the week is not counted
      thread('2026-11-09', { answered_at: 'x', plan_locked_at: 'x' }),
    ],
  });
  expect(c).toMatchObject({
    days: 7,
    brief_answered: 2,
    plans_made: 1,
    wrap_ups: 1,
    wrap_up_decisions: { kept: 1, let_go: 2 },
  });
});

test('a move is a change to the day of something already on their list', () => {
  const c = countWeek({
    ...WEEK,
    changes: [
      { table_name: 'todos', row_id: 'a', op: 'update', fields: ['due_day'] },
      { table_name: 'todos', row_id: 'a', op: 'update', fields: ['scheduled_date', 'title'] },
      { table_name: 'todos', row_id: 'b', op: 'update', fields: ['due_date'] },
      // a new item given its day, and a change to something else, are not moves
      { table_name: 'todos', row_id: 'c', op: 'insert', fields: ['due_day'] },
      { table_name: 'todos', row_id: 'd', op: 'update', fields: ['completed_at'] },
    ],
  });
  expect(c.moves).toBe(3);
  expect(c.items_moved).toBe(2);
});

test('a move counts on the day it was made in their own zone', () => {
  const c = countWeek({
    ...WEEK,
    changes: [
      { table_name: 'todos', op: 'update', fields: ['due_day'], row_id: 'a', day: '2026-11-01' },
      { table_name: 'todos', op: 'update', fields: ['due_day'], row_id: 'b', day: '2026-11-02' },
    ],
  });
  expect(c.moves).toBe(1);
  expect(c.items_moved).toBe(1);
});

test('what was due against what got done, leaving out what was taken off the list', () => {
  const c = countWeek({
    ...WEEK,
    dueTodos: [
      { id: 'a', due_day: '2026-11-03', status: 'completed', completed_at: 'x' },
      { id: 'b', due_day: '2026-11-04', status: 'active', completed_at: null },
      { id: 'c', due_day: '2026-11-05', status: 'archived', completed_at: null },
      { id: 'd', due_day: '2026-11-10', status: 'active', completed_at: null },
    ],
  });
  expect(c).toMatchObject({ due: 2, due_done: 1 });
});

test('habits held against their target, and the days not held', () => {
  const c = countWeek({
    ...WEEK,
    habits: [
      { id: 'h1', name: 'Walk', cadence: 'daily' },
      { id: 'h2', title: 'Call home', cadence: 'weekly', target_per_period: 2 },
    ],
    progress: [
      { habit_id: 'h1', occurred_day: '2026-11-02' },
      { habit_id: 'h1', occurred_day: '2026-11-03' },
      { habit_id: 'h2', occurred_day: '2026-11-08' },
      { habit_id: 'h2', occurred_day: '2026-11-09' },
    ],
    notHeld: [{ habit_id: 'h1', day: '2026-11-04' }],
  });
  expect(c.habits).toEqual([
    { id: 'h1', name: 'Walk', held: 2, target: 7, not_held: 1 },
    { id: 'h2', name: 'Call home', held: 1, target: 2, not_held: 0 },
  ]);
});

test('each line names the values it states, by their place in the counts', () => {
  const c = countWeek({
    ...WEEK,
    threads: [thread('2026-11-04', { sweep: { step: 'done', decisions: [{ out: 'kept' }] } })],
    habits: [{ id: 'h1', name: 'Walk', cadence: 'daily' }],
    notHeld: [{ habit_id: 'h1', day: '2026-11-04' }],
  });
  const items = weekCountItems(c);
  expect(items.map((x) => x.line)).toEqual(weekCountLines(c));
  const value = (path) => path.split('.').reduce((o, k) => o?.[k], { week_counts: c });
  for (const item of items) for (const path of item.paths) expect(value(path)).not.toBeUndefined();
  expect(items[1].line).toBe('wrap ups done on 1 of 7 days; what they decided there: 1 kept');
  expect(items[4]).toEqual({
    line: 'habit "Walk": held 0 of 7, not held 1',
    paths: [
      'week_counts.habits.0.held',
      'week_counts.habits.0.target',
      'week_counts.habits.0.not_held',
    ],
    private: false,
    health: false,
  });
  // a habit marked private or about health carries the mark; one with no name has no line
  const marked = { ...c, habits: [{ ...c.habits[0], health: true }, { ...c.habits[0], id: 'h2', name: null }] };
  expect(weekCountItems(marked).slice(4)).toEqual([{ ...items[4], health: true }]);
  expect(weekCountItems(null)).toEqual([]);
});

test('what the last summaries showed, from what they saved or their cards', () => {
  expect(
    shownBefore([
      {
        week_start_date: '2026-10-26',
        content: { through_line: 'A full week', shown: [{ about: 'The move' }, { about: '' }] },
      },
      {
        week_start_date: '2026-10-19',
        content: {
          through_line: 'Quiet',
          cards: [{ shape: 'hero' }, { shape: 'moment', anchor: { subject: 'The walk' } }],
        },
      },
      { week_start_date: '2026-10-12', content: {} },
    ]),
  ).toEqual([
    { week_start: '2026-10-26', line: 'A full week', shown: ['The move'] },
    { week_start: '2026-10-19', line: 'Quiet', shown: ['The walk'] },
  ]);
});

test('a journal entry a private fact was read from is marked as the fact is', () => {
  const { renderWeek } = jest.requireActual('../weekly');
  const fact = (id, statement, over = {}) => ({
    id,
    statement,
    state: 'happened',
    about_date: '2026-11-03',
    observed_at: '2026-11-03T20:00:00Z',
    private: false,
    health: false,
    ...over,
  });
  const g = {
    periodStart: '2026-11-02',
    periodEnd: '2026-11-08',
    tz: 'Europe/London',
    openFacts: [],
    recentHappened: [
      fact('a', 'Had a procedure.', { private: true, health: true, source_table: 'notes', source_id: 'n-1' }),
      fact('b', 'Went to the market.', { source_table: 'notes', source_id: 'n-2' }),
    ],
    journals: [
      { id: 'n-1', title: 'Tuesday', body: 'A long day.', created_at: '2026-11-03T20:00:00Z' },
      { id: 'n-2', title: 'Wednesday', body: 'Bought apples.', created_at: '2026-11-04T20:00:00Z' },
    ],
    created: [{ id: 'n-2', title: 'Buy apples', due_day: null, created_at: '2026-11-03T10:00:00Z' }],
    completed: [{ id: 't-9', title: 'Post the card', completed_at: '2026-11-05T10:00:00Z' }],
    links: [],
    progress: [],
    worlds: [],
    questions: [],
    chapters: [],
    story: [],
    changes: [],
    corrections: [],
    people: [],
    shown: [],
    chats: [],
    habits: [],
    counts: null,
  };
  const { text } = renderWeek(g, '2026-11-08');
  const lines = text.split('\n');
  expect(lines.find((l) => l.includes('A long day.'))).toContain('[private] [health]');
  expect(lines.find((l) => l.includes('Bought apples.'))).not.toContain('[private]');
  // what they added or did is a ref of its own, marked as what was read from it is
  expect(lines).toContain('t1 | added 2026-11-03 | Buy apples');
  expect(lines).toContain('t2 | added before this week, done 2026-11-05 | Post the card');
});

test('an entry is marked by any marked fact read from it or about it, not only its first source', async () => {
  const { sourceMarks } = jest.requireActual('../weekly');
  const d = {
    select: jest.fn(async (path) => {
      if (path.startsWith('life_facts?') && path.includes('source_id=in.'))
        return [{ source_id: 'n-1', private: true, health: false }];
      if (path.startsWith('life_fact_sources?'))
        return [
          { fact_id: 'f-2', source_id: 'n-2' },
          { fact_id: 'f-3', source_id: 't-1' },
          { fact_id: 'f-4', source_id: 'h-1' },
        ];
      if (path.startsWith('life_facts?') && path.includes('id=in.'))
        return [
          { id: 'f-2', private: false, health: true },
          { id: 'f-4', private: true, health: true },
        ];
      return [];
    }),
  };
  const marks = await sourceMarks(d, 'u', ['n-1', 'n-2', 'n-3', 't-1', 'h-1']);
  expect(Object.fromEntries(marks)).toEqual({
    'n-1': { private: true, health: false },
    'n-2': { private: false, health: true },
    'h-1': { private: true, health: true },
  });
  // only facts marked private or health are asked for
  expect(d.select.mock.calls.filter(([p]) => p.startsWith('life_facts?')).every(([p]) => p.includes('or=(private.is.true,health.is.true)'))).toBe(true);
});
