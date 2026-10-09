/**
 * @jest-environment node
 *
 * The line about a person (data fabric stage 6, context/personWords.js): from
 * the weekly pass's note on each person it noted, held to the facts the note
 * rests on, never given anything private or about health, and kept with the
 * person with what it rests on. Made up records only.
 */
import { memoryDb } from './memoryDb';
import {
  renderPersonWords,
  notedPeople,
  writePersonWords,
  personWordsOn,
} from '../personWords';
import { jsonCall } from '../llm';
import { db } from '../db';
import { loadLifePack, lifePackText } from '../../../shared/lifePack.js';

jest.mock('../llm', () => ({ ...jest.requireActual('../llm'), jsonCall: jest.fn() }));
jest.mock('../db', () => ({
  ...jest.requireActual('../db'),
  db: jest.fn(),
  personIdentity: jest.fn(async () => null),
}));
jest.mock('../filing', () => ({ ...jest.requireActual('../filing'), personToday: jest.fn(async () => '2026-10-12') }));
jest.mock('../cache', () => ({ invalidateChatCache: jest.fn(async () => ({})) }));

const { personToday } = jest.requireMock('../filing');
beforeEach(() => personToday.mockResolvedValue('2026-10-12'));

const U = 'u';
const fact = (id, statement, over = {}) => ({
  id,
  user_id: U,
  statement,
  about_date: null,
  state: 'current',
  private: false,
  health: false,
  observed_at: '2026-10-05T10:00:00Z',
  ...over,
});

function world() {
  return memoryDb({
    synthesis_runs: [
      {
        id: 'run-1',
        user_id: U,
        kind: 'weekly',
        status: 'applied',
        created_at: '2026-10-11T10:00:00Z',
        people_notes: [
          { person_ref: 'p1', note: 'Robin, their brother, is moving to Leeds and they helped him pack.', refs: ['f1', 'f2', 'f3'] },
          { person_ref: 'p2', note: 'Ash came round.', refs: ['f4'] },
          { person_ref: 'p3', note: 'Someone merged away.', refs: ['f1'] },
        ],
        refs: [
          ['p1', { type: 'person', id: 'robin' }],
          ['p2', { type: 'person', id: 'ash' }],
          ['p3', { type: 'person', id: 'gone' }],
          ['f1', { type: 'fact', id: 'a' }],
          ['f2', { type: 'fact', id: 'b' }],
          ['f3', { type: 'fact', id: 'c' }],
          ['f4', { type: 'fact', id: 'd' }],
        ],
      },
    ],
    life_people: [
      { id: 'robin', user_id: U, name: 'Robin', relationship: 'brother', merged_into: null, hidden_at: null },
      { id: 'ash', user_id: U, name: 'Ash', relationship: null, merged_into: null, hidden_at: null },
      { id: 'gone', user_id: U, name: 'Old', relationship: null, merged_into: 'robin', hidden_at: null },
    ],
    life_facts_now: [
      fact('a', 'Robin is moving to Leeds.', { state: 'planned', about_date: '2026-11-01' }),
      fact('b', 'They helped Robin pack on Saturday.', { state: 'happened', about_date: '2026-10-10' }),
      fact('c', 'Robin has been unwell.', { health: true }),
      fact('d', 'Ash came round for dinner.', { private: true, state: 'happened' }),
      fact('e', 'They go climbing with Robin on Sundays.'),
      fact('g', 'Robin said he was wrong about the date.', { state: 'corrected' }),
    ],
    life_fact_people: [
      { user_id: U, person_id: 'robin', fact_id: 'e', created_at: '2026-09-01T10:00:00Z' },
      { user_id: U, person_id: 'robin', fact_id: 'g', created_at: '2026-09-02T10:00:00Z' },
      { user_id: U, person_id: 'robin', fact_id: 'a', created_at: '2026-10-05T10:00:00Z' },
    ],
    passage_refs: [],
    check_runs: [],
  });
}

test('the line is written and read only when PERSON_WORDS is on', async () => {
  expect(personWordsOn({})).toBe(false);
  expect(personWordsOn({ PERSON_WORDS: 'on' })).toBe(true);
  expect(await writePersonWords({}, U)).toEqual({ skipped: 'PERSON_WORDS is off' });
});

test('the people the weekly pass noted come with their note and only the facts it cites that are open', async () => {
  const d = world();
  db.mockReturnValue(d);
  const { run, people } = await notedPeople({}, U);
  expect(run).toBe('run-1');
  // someone merged away is not among them
  expect(people.map((p) => p.someone.id)).toEqual(['robin', 'ash']);
  // what is about health or private is never given; what else the ledger
  // holds about them comes after what the note cites, a fact put right never
  expect(people[0].facts.map((f) => f.id)).toEqual(['a', 'b', 'e']);
  expect(people[1].facts).toEqual([]);
});

test('the writer is shown the someone, the note as its own reading, and the facts as records', () => {
  const { text, records, ids } = renderPersonWords({
    someone: { id: 'robin', name: 'Robin', relationship: 'brother' },
    note: 'Robin is moving to Leeds.',
    facts: [fact('a', 'Robin is moving to Leeds.', { state: 'planned', about_date: '2026-11-01' })],
    today: '2026-10-12',
  });
  expect(text).toContain("GREMLY'S NOTE ON THEM FROM THE WEEK, ITS OWN READING AND NEVER EVIDENCE");
  expect(records.get('p1')).toMatchObject({ names: ['Robin'], exact: ['person'] });
  expect(records.get('p1').label).toBe('p1 | the someone: Robin, their brother, as they said');
  expect(records.get('f1').dates).toEqual(['2026-11-01']);
  expect(ids.get('f1')).toEqual({ type: 'fact', id: 'a' });
});

test('a line the check lets stand is kept with the person and what it rests on; someone with nothing open is left as they are', async () => {
  const d = world();
  db.mockReturnValue(d);
  jsonCall.mockImplementation(async (env, req) => {
    if (req.schema?.properties?.not_held) return { output: { not_held: false, what: null }, model: 'm' };
    return {
      output: { text: 'Your brother, who is moving to Leeds.', refs: ['p1', 'f1'], stated: [{ kind: 'person', value: 'Robin', ref: 'p1' }] },
      model: 'm',
    };
  });
  const out = await writePersonWords({ PERSON_WORDS: 'on' }, U);
  expect(out).toMatchObject({ noted: 2, written: 1, empty: 1, failed: 0 });
  const robin = d.tables.life_people.find((p) => p.id === 'robin');
  expect(robin.words).toBe('Your brother, who is moving to Leeds.');
  expect(d.tables.life_people.find((p) => p.id === 'ash').words).toBeUndefined();
  expect(d.tables.passage_refs).toEqual([
    expect.objectContaining({ surface: 'person', row_table: 'life_people', row_id: 'robin', field: 'words', fact_ids: ['a'], person_ids: ['robin'], writer: 'words' }),
  ]);
  // only the person's own records went to the writer: nothing about health
  const asked = jsonCall.mock.calls.map(([, req]) => req.user).join('\n');
  expect(asked).not.toContain('unwell');
});

test('the life pack carries the line about a person only when it is on', async () => {
  const d = memoryDb({
    life_facts_now: [],
    life_people: [{ id: 'robin', user_id: U, name: 'Robin', relationship: 'brother', words: 'Your brother, who is moving to Leeds.', merged_into: null, hidden_at: null }],
    life_fact_people: [{ user_id: U, person_id: 'robin' }],
    synced_calendar_events: [],
    notes: [],
    quick_events: [],
  });
  const asked = [];
  const select = d.select.bind(d);
  d.select = (path) => (asked.push(path), select(path));
  const on = lifePackText(await loadLifePack(d, U, { today: '2026-10-12', tz: 'UTC', personWords: true }));
  expect(on).toContain('- Robin, brother: Your brother, who is moving to Leeds.');
  expect(asked.find((p) => p.startsWith('life_people?'))).toContain(',words');
  // off, the field is never asked for, so a database without it yet answers as ever
  asked.length = 0;
  await loadLifePack(d, U, { today: '2026-10-12', tz: 'UTC' });
  expect(asked.find((p) => p.startsWith('life_people?'))).not.toContain('words');
});
