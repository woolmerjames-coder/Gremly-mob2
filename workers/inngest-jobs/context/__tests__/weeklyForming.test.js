/**
 * @jest-environment node
 *
 * A Chapter forming, offered by the weekly pass (18 Oct, in place of the
 * daily suggester): the pass sees what they added lately and where each is
 * filed, and gives at most one Chapter forming; code writes it as a question
 * only when it rests on things it was given, and never starts a Chapter.
 * Made up records only.
 */
import { chapterEndPlan, formingRow, planForming, renderWeek, snapshotRefs } from '../weekly';
import { memoryDb } from './memoryDb.js';

const W = '11111111-1111-4111-8111-111111111111';
const C = '22222222-2222-4222-8222-222222222222';
const F = '33333333-3333-4333-8333-333333333333';
const N1 = '44444444-4444-4444-8444-444444444444';
const T1 = '55555555-5555-4555-8555-555555555555';
const T2 = '66666666-6666-4666-8666-666666666666';

const refs = new Map([
  ['w1', { type: 'world', id: W }],
  ['c1', { type: 'chapter', id: C }],
  ['f1', { type: 'fact', id: F }],
  ['a1', { type: 'lately', id: N1, kind: 'note' }],
  ['a2', { type: 'lately', id: T1, kind: 'todo' }],
  ['t1', { type: 'item', id: T2 }],
  ['p1', { type: 'person', id: 'pe-1' }],
]);

const forming = (over = {}) => ({
  chapter_forming: [
    {
      title: 'Opening the bakery',
      world_ref: 'w1',
      start_date: '',
      end_date: '2027-03-01',
      rests_on: ['f1', 'a1', 'a2'],
      unsure: false,
      question: 'Want a Chapter for opening the bakery?',
      choices: ['Yes', 'Not now', 'No'],
      why: 'they told Gremly and keep adding to it',
      ...over,
    },
  ],
});

describe('the row', () => {
  it('is a start question in the World given, resting on what it named, never a Chapter', () => {
    const { row } = formingRow({ output: forming(), refs, userId: 'u', runId: 'r' });
    expect(row).toMatchObject({
      kind: 'start_chapter',
      status: 'open',
      record_table: 'worlds',
      record_id: W,
      rests_on: [
        { table: 'life_facts', id: F },
        { table: 'notes', id: N1 },
        { table: 'todos', id: T1 },
      ],
      proposed_change: { type: 'start', title: 'Opening the bakery', world_id: W, start_date: null, end_date: '2027-03-01', unsure: false },
      choices: ['Yes', 'Not now', 'No'],
    });
  });

  it('may rest on two things they added and nothing they told Gremly, this week or before', () => {
    const { row } = formingRow({ output: forming({ rests_on: ['a2', 't1'] }), refs, userId: 'u', runId: 'r' });
    expect(row.rests_on).toEqual([
      { table: 'todos', id: T1 },
      { table: 'todos', id: T2 },
    ]);
  });

  it('is refused on one thing they added alone, on a ref it was never given, or one that is not a record', () => {
    expect(formingRow({ output: forming({ rests_on: ['a1'] }), refs }).refused).toBe('fewer than two things they added, and nothing they told Gremly');
    expect(formingRow({ output: forming({ rests_on: ['f1', 'x9'] }), refs }).refused).toBe('something it was never given');
    expect(formingRow({ output: forming({ rests_on: ['f1', 'p1'] }), refs }).refused).toBe('something it was never given');
  });

  it('is refused in a World it was never given, a Chapter in place of a World, or with dates out of order', () => {
    expect(formingRow({ output: forming({ world_ref: 'w9' }), refs }).refused).toBe('a World it was never given');
    expect(formingRow({ output: forming({ world_ref: 'c1' }), refs }).refused).toBe('a World it was never given');
    expect(formingRow({ output: forming({ start_date: '2027-04-01' }), refs }).refused).toBe('dates that are not dates, or out of order');
    expect(formingRow({ output: forming({ end_date: 'March' }), refs }).refused).toBe('dates that are not dates, or out of order');
  });

  it('is refused with no question or fewer than two answers, and when none is forming', () => {
    expect(formingRow({ output: forming({ question: '' }), refs }).refused).toBe('no title, no question or fewer than two answers');
    expect(formingRow({ output: forming({ choices: ['Yes', 'yes'] }), refs }).refused).toBe('no title, no question or fewer than two answers');
    expect(formingRow({ output: { chapter_forming: [] }, refs }).refused).toBe('none forming');
  });

  it('is refused when it rests mostly on what one offered before rested on', () => {
    const offered = [[{ table: 'life_facts', id: F }, { table: 'notes', id: N1 }]];
    expect(formingRow({ output: forming(), refs, offered }).refused).toBe('offered before');
    // a third in common is a different suggestion
    expect(formingRow({ output: forming(), refs, offered: [[{ table: 'notes', id: N1 }]] }).row).toBeTruthy();
  });
});

describe('when it may be asked', () => {
  const env = { CHAPTER_QUESTIONS: 'on' };
  const asked = (status, over = {}) => ({ id: `q-${status}`, user_id: 'u', kind: 'start_chapter', status, rests_on: [], run_id: 'earlier', ...over });

  it('is planned when none waits, and only read: the pass writes it when there is room', async () => {
    const d = memoryDb({ gremly_questions: [asked('answered')] });
    const { row, result } = await planForming(env, d, { output: forming(), refs, userId: 'u', runId: 'r' });
    expect(row).toMatchObject({ kind: 'start_chapter', run_id: 'r' });
    expect(result).toMatchObject({ written: false, title: 'Opening the bakery', rests_on: 3 });
    expect(d.tables.gremly_questions).toHaveLength(1);
  });

  it('is not asked while one waits, or while Chapter questions are off', async () => {
    for (const [e, rows, why] of [
      [env, [asked('asked')], 'one is waiting'],
      [{}, [], 'Chapter questions are off'],
    ]) {
      const { row, result } = await planForming(e, memoryDb({ gremly_questions: rows }), { output: forming(), refs, userId: 'u', runId: 'r' });
      expect(row).toBeNull();
      expect(result).toMatchObject({ written: false, why });
    }
  });

  it('is asked again on a retry of the same run, whose own question went first', async () => {
    const d = memoryDb({ gremly_questions: [asked('open', { run_id: 'r' })] });
    const { row } = await planForming(env, d, { output: forming(), refs, userId: 'u', runId: 'r' });
    expect(row).toBeTruthy();
  });
});

describe('what the pass is shown', () => {
  const g = {
    periodStart: '2026-11-02',
    periodEnd: '2026-11-08',
    tz: 'Europe/London',
    openFacts: [],
    recentHappened: [],
    journals: [],
    created: [],
    completed: [],
    links: [],
    progress: [],
    worlds: [{ id: W, name: 'Work', display_name: 'Work', phase: 'active' }],
    questions: [],
    chapters: [{ id: C, title: 'Busy season', chapter_type: 'open', phase: 'active' }],
    story: [],
    changes: [],
    corrections: [],
    people: [],
    shown: [],
    chats: [],
    habits: [],
    counts: null,
    lately: [
      { type: 'note', id: N1, title: 'Bakery', body: 'Looked at the shop on the corner again.', subtype: null, created_at: '2026-11-05T10:00:00Z', done: null, worlds: [W], chapters: [C], private: false, health: false },
      { type: 'todo', id: T1, title: 'Ask the bank about a loan', body: null, created_at: '2026-10-20T10:00:00Z', done: '2026-10-22', worlds: [], chapters: [], private: true, health: false },
    ],
    forming: { waiting: [], before: [{ title: 'Moving flat' }] },
  };

  it('shows what they added lately by its own refs, where each is filed, and what was offered before', () => {
    const { text, refs: shownRefs } = renderWeek(g, '2026-11-08');
    const lines = text.split('\n');
    expect(lines).toContain('a1 | note | added 2026-11-05 | filed in w1 Work; c1 Busy season | Bakery: Looked at the shop on the corner again.');
    expect(lines).toContain('a2 | on their list | added 2026-10-20, done 2026-10-22 [private] | filed in no World or Chapter | Ask the bank about a loan');
    expect(lines).toContain('- offered before: Moving flat');
    expect(shownRefs.get('a2')).toMatchObject({ type: 'lately', kind: 'todo', private: true });
  });
});

describe('the refs the pass is applied with', () => {
  it("keep a Chapter's first day, so no end is kept on or before it", () => {
    const shown = new Map([
      ['c1', { type: 'chapter', id: 'ch-job', start_date: '2026-10-01', label: 'x' }],
      ['f1', { type: 'fact', id: 'fa-start', about_date: '2026-10-01', timing: 'day' }],
    ]);
    const kept = new Map(snapshotRefs(shown));
    expect(kept.get('c1')).toMatchObject({ type: 'chapter', id: 'ch-job', start_date: '2026-10-01' });
    expect(chapterEndPlan({ output: { begun_for: [{ chapter_ref: 'c1', fact_ref: 'f1' }] }, refs: kept })).toEqual([
      { chapter_id: 'ch-job', end_date: '2026-10-01', fact_id: 'fa-start', refused: 'the day it began' },
    ]);
  });
});
