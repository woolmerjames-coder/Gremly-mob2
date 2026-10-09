/**
 * @jest-environment node
 *
 * What a correction rewrites (data fabric stage 6): the stored sentences
 * resting on what changed, found in passage_refs, each sent back to its own
 * writer and checked. Made up records only.
 */
import { memoryDb } from './memoryDb';
import {
  dailyKey,
  glanceable,
  restingPassages,
  restingRecords,
  rewritePassages,
} from '../correctionPassages';
import { jsonCall } from '../llm';
import { db } from '../db';
import { writeWords } from '../words';

jest.mock('../llm', () => ({
  ...jest.requireActual('../llm'),
  jsonCall: jest.fn(),
}));
jest.mock('../db', () => ({ ...jest.requireActual('../db'), db: jest.fn() }));
jest.mock('../words', () => ({ ...jest.requireActual('../words'), writeWords: jest.fn() }));
jest.mock('../memory', () => ({ ...jest.requireActual('../memory'), writeMemory: jest.fn() }));

const U = 'u';
const ref = (over) => ({
  user_id: U,
  surface: 'daily',
  row_table: 'user_daily_state',
  row_id: 'day-1',
  fact_ids: [],
  person_ids: [],
  items: [],
  writer: 'daily',
  ...over,
});

test('a line of the day is known by its key and whether it is seen at a glance', () => {
  expect(dailyKey('brief_headline')).toBe('headline');
  expect(dailyKey('today_focus.2')).toBe('today_focus_2');
  expect(dailyKey('brief.claims.1.why')).toBe('claims_1_why');
  expect(glanceable(ref({ field: 'brief_headline' }))).toBe(true);
  expect(glanceable(ref({ field: 'also_matters.0' }))).toBe(false);
  expect(glanceable(ref({ writer: 'words', field: 'card_subtitle' }))).toBe(true);
  expect(glanceable(ref({ writer: 'story', field: 'body' }))).toBe(false);
});

test('the sentences resting on what changed are found; one resting only on a fact kept private, only when seen at a glance', async () => {
  const d = memoryDb({
    passage_refs: [
      ref({ id: 1, field: 'brief_headline', fact_ids: ['a'] }),
      ref({ id: 2, field: 'also_matters.0', fact_ids: ['p'] }),
      ref({ id: 3, field: 'today_focus.0', fact_ids: ['p', 'x'] }),
      ref({ id: 4, surface: 'story', row_table: 'story_items', row_id: 's1', field: 'body', fact_ids: ['b'], writer: 'story' }),
      ref({ id: 5, surface: 'world', row_table: 'worlds', row_id: 'w1', field: 'card_subtitle', person_ids: ['sam'], writer: 'words' }),
      ref({ id: 6, user_id: 'other', field: 'brief_headline', fact_ids: ['a'] }),
    ],
  });
  const rows = await restingPassages(d, U, { changedIds: ['a'], privateIds: ['p'], personIds: ['sam'] });
  expect(rows.map((r) => [r.id, r.why])).toEqual([
    [1, 'changed'],
    [3, 'private'],
    [5, 'changed'],
  ]);
  expect(await restingPassages(d, U, {})).toEqual([]);
});

test('the records name a corrected fact as put right, with their words, and what they just said', () => {
  const { records, ids } = restingRecords({
    facts: [
      { id: 'a', statement: 'Sam is her brother.', state: 'corrected', correction_text: 'Sam is my cousin' },
      { id: 'b', statement: 'The dentist is on 12 November.', state: 'planned', about_date: '2026-11-12', private: false },
    ],
    people: [{ id: 'sam', name: 'Sam', relationship: null }],
    added: [{ statement: 'Sam is her cousin.' }],
    said: 'Sam is my cousin',
  });
  const labels = [...records.values()].map((r) => r.label);
  expect(labels[0]).toContain('put right by them');
  expect(labels[0]).toContain('"Sam is my cousin"');
  expect(records.get('r2').dates).toEqual(['2026-11-12']);
  expect(labels).toContain('r3 | fact, from what they just said: Sam is her cousin.');
  expect(labels[labels.length - 1]).toBe('r5 | what they have just told Gremly: "Sam is my cousin"');
  expect(ids.get('r1')).toEqual({ type: 'fact', id: 'a' });
  expect(ids.get('r4')).toEqual({ type: 'person', id: 'sam' });
});

function world() {
  return memoryDb({
    life_facts: [
      { id: 'a', user_id: U, statement: 'Sam is her brother.', state: 'corrected', correction_text: 'Sam is my cousin' },
      { id: 'c', user_id: U, statement: 'Sam is coming round on 9 October.', state: 'planned', about_date: '2026-10-09' },
    ],
    life_people: [{ id: 'sam', user_id: U, name: 'Sam', relationship: null }],
    user_daily_state: [
      {
        id: 'day-1',
        user_id: U,
        dco: {
          brief_headline: 'Your brother Sam comes round tomorrow',
          brief: { headline: 'Your brother Sam comes round tomorrow' },
          also_matters: ['A quiet evening'],
        },
      },
    ],
    story_items: [{ id: 's1', user_id: U, kind: 'people', title: 'Sam', body: 'Her brother Sam helps with everything.', state: 'current' }],
    passage_refs: [
      ref({ field: 'brief_headline', fact_ids: ['a', 'c'], person_ids: ['sam'] }),
      ref({ surface: 'story', row_table: 'story_items', row_id: 's1', field: 'body', fact_ids: ['a'], writer: 'story' }),
    ],
  });
}

test('a sentence that no longer holds is written again by its own writer and kept with what it now rests on', async () => {
  const d = world();
  db.mockReturnValue(d);
  jsonCall.mockImplementation(async (env, req) => {
    // the words question: the old sentences do not hold, the new ones do
    if (req.schema?.properties?.not_held)
      return { output: { not_held: /brother/.test(req.user), what: 'it says brother' }, model: 'm' };
    // a writer's one sentence path
    const head = req.user.split('\n')[0];
    if (head.startsWith('FIELD: headline'))
      return {
        output: {
          text: 'Sam comes round tomorrow',
          refs: ['r2', 'r3'],
          stated: [
            { kind: 'person', value: 'Sam', ref: 'r3' },
            { kind: 'date', value: '2026-10-09', ref: 'r2' },
          ],
        },
        model: 'm',
      };
    return { output: { text: '', refs: [], stated: [] }, model: 'm' };
  });
  const rows = await restingPassages(d, U, { changedIds: ['a'], personIds: ['sam'] });
  const out = await rewritePassages({}, {
    userId: U,
    person: null,
    today: '2026-10-08',
    said: 'Sam is my cousin',
    rows,
    nowIso: '2026-10-08T10:00:00Z',
  });
  expect(out).toMatchObject({ asked: 2, rewritten: 1, cleared: 1, kept: 0 });
  const day = d.tables.user_daily_state[0].dco;
  expect(day.brief_headline).toBe('Sam comes round tomorrow');
  expect(day.brief.headline).toBe('Sam comes round tomorrow');
  expect(day.also_matters).toEqual(['A quiet evening']);
  // the story item with nothing true left is retired
  expect(d.tables.story_items[0].state).toBe('corrected');
  // the headline now rests on what it cites; the cleared body rests on nothing
  const refs = d.tables.passage_refs;
  expect(refs.find((r) => r.field === 'brief_headline').fact_ids).toEqual(['c']);
  expect(refs.find((r) => r.field === 'brief_headline').person_ids).toEqual(['sam']);
  expect(refs.find((r) => r.field === 'body')).toBeUndefined();
  // the rewrite was given the daily picture's own rules for that line
  const call = jsonCall.mock.calls.find(([, req]) => /^FIELD: headline/.test(req.user))[1];
  expect(call.system).toContain('ONE SENTENCE AGAIN');
  expect(call.user).toContain('put right by them');
});

test('the words under a World resting on what changed are written again by the words writer', async () => {
  const d = memoryDb({
    passage_refs: [ref({ surface: 'world', row_table: 'worlds', row_id: 'w1', field: 'card_subtitle', fact_ids: ['a'], writer: 'words' })],
  });
  db.mockReturnValue(d);
  writeWords.mockResolvedValue({ lines: [{ table: 'worlds', id: 'w1', outcome: 'pass', field: 'card_subtitle' }] });
  const rows = await restingPassages(d, U, { changedIds: ['a'] });
  const out = await rewritePassages({}, { userId: U, person: null, today: '2026-10-08', said: 'x', rows, nowIso: 'now' });
  expect(writeWords).toHaveBeenCalledWith({}, U, { targets: [{ table: 'worlds', id: 'w1' }], reason: 'correction' });
  expect(out.words).toBe(1);
});

test("the lines of a day are named by the field that holds each, as step one is shown them", () => {
  const { dayLinesOf } = jest.requireActual('../corrections');
  expect(
    dayLinesOf({
      brief_headline: 'A free afternoon',
      brief: { day_shape: '', claims: [{ why: 'It is due' }] },
      today_focus: ['Call the bank'],
      also_matters: [],
    }),
  ).toEqual([
    { ref: 'd1', field: 'brief_headline', text: 'A free afternoon' },
    { ref: 'd2', field: 'today_focus.0', text: 'Call the bank' },
    { ref: 'd3', field: 'brief.claims.0.why', text: 'It is due' },
  ]);
  expect(dayLinesOf(null)).toEqual([]);
});

test('the lines of a World or Chapter are named with the writer of each, and the ones they wrote are left out', () => {
  const { cardLinesOf } = jest.requireActual('../corrections');
  const lines = cardLinesOf(
    [
      { id: 'c1', title: 'A long walk', card_subtitle: 'Three weeks on the coast path', card_subtitle_source: 'words', summary: 'Mostly in the rain', summary_source: 'synthesis', epigraph: 'Their own memory', epigraph_source: 'user' },
      { id: 'c2', title: 'Quiet month', card_subtitle: null, summary: '', epigraph: 'It ended well', epigraph_source: 'memory' },
    ],
    'chapters',
  );
  expect(lines.map((l) => [l.ref, l.row_id, l.field, l.writer])).toEqual([
    ['c1', 'c1', 'card_subtitle', 'words'],
    ['c2', 'c1', 'summary', 'weekly'],
    ['c3', 'c2', 'epigraph', 'memory'],
  ]);
  expect(lines[0].where).toBe('Chapter "A long walk", the words under it');
  expect(cardLinesOf([{ id: 'w1', name: 'work', display_name: 'Work', card_subtitle: 'Busy', card_subtitle_source: null }], 'worlds')[0]).toMatchObject({ row_table: 'worlds', surface: 'world', where: 'World "Work", the words under it' });
});

test('words the writer no longer keeps, under a Chapter that has ended, go through its one sentence path and are cleared when nothing true is left', async () => {
  const d = memoryDb({
    chapters: [
      { id: 'ch', owner_id: U, title: 'A dry month', card_subtitle: 'A month without a drink', card_subtitle_source: 'synthesis', phase: 'closed' },
      { id: 'mine', owner_id: U, title: 'Theirs', card_subtitle: 'Their own words', card_subtitle_source: 'user', phase: 'closed' },
    ],
    passage_refs: [],
  });
  db.mockReturnValue(d);
  // the words writer keeps only open Worlds and Chapters: it returns no line for these
  writeWords.mockResolvedValue({ lines: [] });
  jsonCall.mockReset();
  jsonCall.mockImplementation(async (env, req) => ({ output: { text: '', refs: [], stated: [] }, model: 'm' }));
  const rows = [
    { surface: 'chapter', row_table: 'chapters', row_id: 'ch', field: 'card_subtitle', fact_ids: [], person_ids: [], items: [], writer: 'words', why: 'pointed', pointed: true },
    { surface: 'chapter', row_table: 'chapters', row_id: 'mine', field: 'card_subtitle', fact_ids: [], person_ids: [], items: [], writer: 'words', why: 'pointed', pointed: true },
  ];
  const out = await rewritePassages({}, { userId: U, person: null, today: '2026-10-08', said: 'keep that private', rows, nowIso: 'now' });
  expect(out).toMatchObject({ asked: 2, cleared: 2, rewritten: 0 });
  // the writer was asked with the words writer's own rules, and told what they said
  const call = jsonCall.mock.calls[0][1];
  expect(call.user).toMatch(/^THE WORDS UNDER THE Chapter "A dry month"/);
  expect(call.user).toContain('what they have just told Gremly about it');
  // Gremly's line is cleared; the words they wrote themselves stay theirs
  expect(d.tables.chapters.find((c) => c.id === 'ch').card_subtitle).toBeNull();
  expect(d.tables.chapters.find((c) => c.id === 'mine').card_subtitle).toBe('Their own words');
});

test('a day closes up over cleared lines, and says where each line went', () => {
  const { tidyDay } = jest.requireActual('../correctionPassages');
  const dco = {
    brief_headline: 'A day',
    today_focus: [null, 'Call the bank', 'Book the dentist'],
    brief: {
      claims: [{ id: 't1', why: 'It is due' }, { id: 't2', why: null }, { id: 't3', why: 'Before Friday' }],
      reach: { id: 't9', why: null },
    },
    lead_story: { what: null, why_today: 'It matters' },
  };
  const moves = tidyDay(dco);
  expect(dco.today_focus).toEqual(['Call the bank', 'Book the dentist']);
  expect(dco.brief.claims.map((c) => c.id)).toEqual(['t1', 't3']);
  expect(dco.brief.reach).toBeNull();
  expect(dco.lead_story).toBeNull();
  expect(Object.fromEntries(moves)).toEqual({
    'today_focus.0': null,
    'today_focus.1': 'today_focus.0',
    'today_focus.2': 'today_focus.1',
    'brief.claims.1.why': null,
    'brief.claims.2.why': 'brief.claims.1.why',
    'lead_story.why_today': null,
  });
  // nothing of the tidy is stored with the claims
  expect(JSON.parse(JSON.stringify(dco.brief.claims))).toEqual([{ id: 't1', why: 'It is due' }, { id: 't3', why: 'Before Friday' }]);
});

test('when a line of the day is cleared, what the lines after it rest on moves with them', async () => {
  const d = memoryDb({
    life_facts: [
      { id: 'a', user_id: U, statement: 'The bank call is on Friday.', state: 'corrected', correction_text: 'no bank call' },
      { id: 'b', user_id: U, statement: 'The dentist is on 12 October.', state: 'planned', about_date: '2026-10-12' },
    ],
    user_daily_state: [{ id: 'day-1', user_id: U, dco: { today_focus: ['Call the bank on Friday', 'Pay the water bill', 'Book the dentist for 12 October'] } }],
    passage_refs: [
      ref({ id: 1, field: 'today_focus.0', fact_ids: ['a'] }),
      ref({ id: 2, field: 'today_focus.1', fact_ids: ['w'] }),
      ref({ id: 3, field: 'today_focus.2', fact_ids: ['b', 'a'] }),
    ],
  });
  db.mockReturnValue(d);
  jsonCall.mockImplementation(async (env, req) => {
    if (req.schema?.properties?.not_held)
      return { output: { not_held: /bank/i.test(req.user.split('SENTENCE:')[1] || ''), what: 'the bank call' }, model: 'm' };
    const head = req.user.split('\n')[0];
    if (head === 'FIELD: today_focus_2')
      return { output: { text: 'Book the dentist for 12 October', refs: ['r2'], stated: [{ kind: 'date', value: '2026-10-12', ref: 'r2' }] }, model: 'm' };
    return { output: { text: '', refs: [], stated: [] }, model: 'm' };
  });
  const rows = await restingPassages(d, U, { changedIds: ['a'] });
  const out = await rewritePassages({}, { userId: U, person: null, today: '2026-10-08', said: 'no bank call', rows, nowIso: 'now' });
  expect(out).toMatchObject({ asked: 2, cleared: 1, kept: 1 });
  expect(d.tables.user_daily_state[0].dco.today_focus).toEqual(['Pay the water bill', 'Book the dentist for 12 October']);
  const at = (field) => d.tables.passage_refs.filter((r) => r.field === field).map((r) => r.fact_ids);
  // the water bill's record and the dentist's, which still holds, moved up with them
  expect(at('today_focus.0')).toEqual([['w']]);
  expect(at('today_focus.1')).toEqual([['b', 'a']]);
  expect(at('today_focus.2')).toEqual([]);
});

test('a stored sentence with a number in it is asked about by the words question, not failed for its digits', async () => {
  const d = memoryDb({
    life_facts: [{ id: 'a', user_id: U, statement: 'The dentist is on 12 October.', state: 'changed', about_date: '2026-10-12' }],
    life_people: [],
    user_daily_state: [{ id: 'day-1', user_id: U, dco: { also_matters: ['Keep 12 October free'] } }],
    passage_refs: [ref({ field: 'also_matters.0', fact_ids: ['a'] })],
  });
  db.mockReturnValue(d);
  jsonCall.mockImplementation(async (env, req) => ({ output: { not_held: false, what: null }, model: 'm' }));
  const rows = await restingPassages(d, U, { changedIds: ['a'] });
  const out = await rewritePassages({}, { userId: U, person: null, today: '2026-10-08', said: 'x', rows, nowIso: 'now' });
  expect(out).toMatchObject({ asked: 1, kept: 1, cleared: 0 });
  expect(d.tables.user_daily_state[0].dco.also_matters).toEqual(['Keep 12 October free']);
});

test('the words under an open World they named go through its one sentence path, told what they said', async () => {
  const d = memoryDb({
    worlds: [{ id: 'w1', owner_id: U, name: 'home', display_name: 'Home', card_subtitle: 'Your dry January', card_subtitle_source: 'words' }],
    passage_refs: [],
  });
  db.mockReturnValue(d);
  writeWords.mockResolvedValue({ lines: [] });
  jsonCall.mockImplementation(async (env, req) => ({ output: { text: '', refs: [], stated: [] }, model: 'm' }));
  const rows = [{ surface: 'world', row_table: 'worlds', row_id: 'w1', field: 'card_subtitle', fact_ids: [], person_ids: [], items: [], writer: 'words', why: 'pointed', pointed: true }];
  const out = await rewritePassages({}, { userId: U, person: null, today: '2026-10-08', said: 'keep that off the card', rows, nowIso: 'now' });
  expect(writeWords).not.toHaveBeenCalled();
  expect(out).toMatchObject({ asked: 1, cleared: 1 });
  expect(jsonCall.mock.calls[0][1].user).toContain('keep that off the card');
  expect(d.tables.worlds[0].card_subtitle).toBeNull();
});

test('a line written again after a cleared one is kept with what it now rests on, where it now is', async () => {
  const d = memoryDb({
    life_facts: [{ id: 'a', user_id: U, statement: 'Sam is her brother.', state: 'corrected', correction_text: 'Sam is my cousin' }],
    life_people: [{ id: 'sam', user_id: U, name: 'Sam', relationship: 'cousin' }],
    user_daily_state: [{ id: 'day-1', user_id: U, dco: { also_matters: ['Your brother Sam', 'Lunch with your brother Sam'] } }],
    passage_refs: [ref({ field: 'also_matters.0', fact_ids: ['a'] }), ref({ field: 'also_matters.1', fact_ids: ['a'], person_ids: ['sam'] })],
  });
  db.mockReturnValue(d);
  jsonCall.mockImplementation(async (env, req) => {
    if (req.schema?.properties?.not_held) return { output: { not_held: /brother/.test(req.user), what: 'brother' }, model: 'm' };
    if (req.user.startsWith('FIELD: also_matters_1'))
      return { output: { text: 'Lunch with Sam', refs: ['r2'], stated: [{ kind: 'person', value: 'Sam', ref: 'r2' }] }, model: 'm' };
    return { output: { text: '', refs: [], stated: [] }, model: 'm' };
  });
  const rows = await restingPassages(d, U, { changedIds: ['a'], personIds: ['sam'] });
  const out = await rewritePassages({}, { userId: U, person: null, today: '2026-10-08', said: 'Sam is my cousin', rows, nowIso: 'now' });
  expect(out).toMatchObject({ rewritten: 1, cleared: 1 });
  expect(d.tables.user_daily_state[0].dco.also_matters).toEqual(['Lunch with Sam']);
  expect(d.tables.passage_refs).toEqual([expect.objectContaining({ field: 'also_matters.0', fact_ids: [], person_ids: ['sam'], prompt_version: 'correction' })]);
});
