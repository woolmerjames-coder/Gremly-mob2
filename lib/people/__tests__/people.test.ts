/**
 * The people page's rules (Worlds rebuild, stage 5, lib/people/people.ts):
 * how someone is named and who they are, the days beside Gremly's labels
 * (the twins of the workers' rules), what is going on with them, and the
 * people on a Chapter. Made up people only.
 */
import {
  chapterChips,
  findByName,
  labelDay,
  lastNoted,
  nextYearly,
  pageDays,
  pageRemember,
  personChapters,
  personTitle,
  personTodos,
  whoLine,
  yourRelation,
  type PersonFact,
  type PersonListEntry,
} from '../people';
// the workers' own rules, which these twin
import { nextYearly as workersNextYearly } from '../../../workers/shared/factTiming.js';
import { labelDay as workersLabelDay } from '../../../workers/inngest-jobs/context/personPage.js';

jest.mock('../../supabase/client', () => ({ supabase: {} }));

const fact = (id: string, more: Partial<PersonFact> = {}): PersonFact => ({
  id,
  statement: `Fact ${id}`,
  about_date: null,
  about_date_end: null,
  timing: 'standing',
  state: 'current',
  private: false,
  health: false,
  item_table: null,
  item_id: null,
  ...more,
});

test('how someone is named, and who they are to you', () => {
  expect(personTitle({ name: 'Sam', relationship: 'sister' })).toBe('Sam');
  expect(personTitle({ name: null, relationship: 'mum' })).toBe('Your mum');
  expect(personTitle({ name: '  ', relationship: 'my brother' })).toBe('Your brother');
  expect(personTitle({ name: null, relationship: "Sam's husband" })).toBe("Sam's husband");
  expect(yourRelation('friend from school')).toBe('Your friend from school');
  expect(whoLine({ name: 'Sam', relationship: 'sister', relationship_by: 'gremly' })).toBe(
    'Your sister',
  );
  expect(whoLine({ name: 'Priya', relationship: 'colleague', relationship_by: 'understood' })).toBe(
    'Your colleague, as Gremly understands it',
  );
  // the title already says it
  expect(whoLine({ name: null, relationship: 'mum', relationship_by: 'gremly' })).toBe('');
  // on a list, kept off when it came from something private
  expect(
    whoLine({ name: 'Sam', relationship: 'sister', relationship_by: 'gremly' }, { hide: true }),
  ).toBe('');
});

test('the days are worked out as the workers work them out', () => {
  const today = '2026-10-20';
  for (const [date, from] of [
    ['1991-03-14', today],
    ['1990-10-20', today],
    ['1990-10-19', today],
    ['1992-02-29', '2027-01-01'],
    ['1992-02-29', '2028-01-01'],
  ])
    expect(nextYearly(date, from)).toBe(workersNextYearly(date, from));
  const facts = [
    { about_date: '1991-03-14', about_date_end: null, timing: 'yearly' },
    { about_date: '2026-11-07', about_date_end: null, timing: 'day' },
    { about_date: '2026-10-18', about_date_end: '2026-10-22', timing: 'span' },
    { about_date: '2026-08-15', about_date_end: null, timing: 'day' },
    { about_date: null, about_date_end: null, timing: 'standing' },
  ];
  for (const f of facts) expect(labelDay(f, today)).toBe(workersLabelDay(f, today));
});

test('the page shows a label beside its fact as it stands now, soonest first, and a thing to remember while its facts stand', () => {
  const facts = [
    fact('bday', { about_date: '1991-03-14', timing: 'yearly' }),
    fact('party', { about_date: '2026-11-07', timing: 'day', state: 'planned' }),
    fact('veg'),
    fact('gone', { state: 'corrected', about_date: '2026-12-01', timing: 'day' }),
  ];
  const page = {
    days: [
      { fact_id: 'bday', label: 'Sam’s birthday' },
      { fact_id: 'party', label: 'Sam’s housewarming' },
      // put right since: its label goes with it
      { fact_id: 'gone', label: 'Old plan' },
      { fact_id: 'unknown', label: 'Not a fact any more' },
    ],
    remember: [
      { text: 'Sam is vegetarian.', fact_ids: ['veg'] },
      { text: 'Rests on something put right.', fact_ids: ['veg', 'gone'] },
    ],
  };
  expect(pageDays(page, facts, '2026-10-20')).toEqual([
    { id: 'party', label: 'Sam’s housewarming', day: '2026-11-07', yearly: false },
    { id: 'bday', label: 'Sam’s birthday', day: '2027-03-14', yearly: true },
  ]);
  expect(pageRemember(page, facts)).toEqual(['Sam is vegetarian.']);
  expect(pageDays(null, facts, '2026-10-20')).toEqual([]);
});

test('what is going on with them: their todos, the last thing noted and their Chapters', () => {
  const facts = [
    fact('f1', { item_table: 'todos', item_id: 't1' }),
    fact('f2', { item_table: 'notes', item_id: 'n1' }),
  ];
  const todos = [
    { id: 't1', name: 'Book the train to see Sam', due_day: '2026-11-01', completed_at: null },
    {
      id: 't2',
      name: 'Call about the flat',
      due_day: '2026-10-25',
      views: { people: ['Sam'] },
      completed_at: null,
    },
    { id: 't3', name: 'Done already', views: { people: ['Sam'] }, completed_at: '2026-10-01' },
    { id: 't4', name: 'Nothing to do with them', completed_at: null },
  ] as any[];
  expect(personTodos(todos, ['Sam'], facts).map((t) => t.id)).toEqual(['t2', 't1']);
  const notes = [
    { id: 'n1', title: 'Gift ideas for Sam', created_at: '2026-09-01T10:00:00Z' },
    {
      id: 'n2',
      title: 'Sam’s new address',
      created_at: '2026-10-01T10:00:00Z',
      views: { people: [{ name: 'sam' }] },
    },
    { id: 'n3', title: 'Someone else', created_at: '2026-10-10T10:00:00Z' },
  ] as any[];
  expect(lastNoted(notes, ['Sam'], facts)?.id).toBe('n2');
  expect(lastNoted(notes, ['Dan'], [])).toBeNull();
  const chapters = [
    {
      id: 'c1',
      title: 'Moving house',
      phase: 'closed',
      closed_at: '2026-08-30',
      with_you: [{ name: 'Sam', confidence: 1 }],
    },
    { id: 'c2', title: 'Lisbon', phase: 'active', closed_at: null, with_you: [] },
    { id: 'c3', title: 'Other', phase: 'active', closed_at: null, with_you: null },
  ] as any[];
  expect(personChapters(chapters, ['c2'], ['Sam']).map((c) => c.id)).toEqual(['c2', 'c1']);
});

test('a name on a screen finds their record by any name they go by', () => {
  const people = [
    { id: 'p1', name: 'Sam', names: ['Sammy'] },
    { id: 'p2', name: null, relationship: 'mum', names: ['Mum'] },
  ] as unknown as PersonListEntry[];
  expect(findByName(people, 'sam')?.id).toBe('p1');
  expect(findByName(people, 'Sammy')?.id).toBe('p1');
  expect(findByName(people, 'Mum')?.id).toBe('p2');
  expect(findByName(people, 'Dan')).toBeNull();
});

test('the people on a Chapter: those Gremly linked, then any other name it was with', () => {
  expect(
    chapterChips(
      [{ id: 'p1', title: 'Sam', names: ['Sammy'] }],
      [
        { name: 'sammy', confidence: 1 },
        { name: 'Dan', confidence: 1 },
        { name: 'Dan', confidence: 1 },
      ],
    ),
  ).toEqual([{ name: 'Sam', id: 'p1' }, { name: 'Dan' }]);
});
