/**
 * @jest-environment node
 *
 * The people on each Chapter (weekly.js chapterPeoplePlan, applyChapterPeople):
 * the weekly pass names them, code keeps only those a fact the Chapter cites,
 * that can be shown, is about, and never touches a row the person wrote.
 */
import { chapterPeoplePlan, applyChapterPeople } from '../weekly.js';
import { memoryDb } from './memoryDb.js';

const refs = new Map([
  ['c1', { type: 'chapter', id: 'ch-1' }],
  ['c2', { type: 'chapter', id: 'ch-2' }],
  ['f1', { type: 'fact', id: 'fa-1' }],
  ['f2', { type: 'fact', id: 'fa-2', private: true }],
  ['f3', { type: 'fact', id: 'fa-3' }],
  ['p1', { type: 'person', id: 'pe-eli', name: 'Eli' }],
  ['p2', { type: 'person', id: 'pe-mira', name: 'Mira' }],
  ['p3', { type: 'person', id: 'pe-sam', name: 'Sam' }],
]);
const ties = [
  { fact_id: 'fa-1', person_id: 'pe-eli' },
  // Mira is in this Chapter's facts only through something private
  { fact_id: 'fa-2', person_id: 'pe-mira' },
  { fact_id: 'fa-3', person_id: 'pe-sam' },
];

describe('the people on a Chapter', () => {
  it('are those the pass names whom a fact it cites, that can be shown, is about', () => {
    const plan = chapterPeoplePlan({
      output: {
        chapters: [
          { chapter_ref: 'c1', card_fact_refs: ['f1', 'f2'], people_refs: ['p1', 'p2', 'p3', 'p1', 'x9'] },
          { chapter_ref: 'c2', card_fact_refs: ['f3'], people_refs: [] },
          // a reply without the field says nothing about who is on it
          { chapter_ref: 'c2', card_fact_refs: ['f3'] },
          { chapter_ref: 'w9', card_fact_refs: ['f3'], people_refs: ['p3'] },
        ],
      },
      refs,
      ties,
    });
    expect(plan).toEqual([
      {
        chapter_id: 'ch-1',
        people: ['pe-eli'],
        dropped: [
          { ref: 'p2', why: 'in no fact it cites that can be shown' },
          { ref: 'p3', why: 'in no fact it cites that can be shown' },
          { ref: 'x9', why: 'not someone it was given' },
        ],
      },
      { chapter_id: 'ch-2', people: [], dropped: [] },
    ]);
  });

  it("are kept as Gremly's, taking away only Gremly's, never a row the person wrote", async () => {
    const mem = memoryDb({
      chapter_people: [
        { chapter_id: 'ch-1', person_id: 'pe-old', user_id: 'u', written_by: 'gremly' },
        { chapter_id: 'ch-1', person_id: 'pe-theirs', user_id: 'u', written_by: 'person' },
        { chapter_id: 'ch-2', person_id: 'pe-eli', user_id: 'u', written_by: 'person' },
      ],
    });
    const out = await applyChapterPeople(
      mem,
      'u',
      [
        { chapter_id: 'ch-1', people: ['pe-eli'], dropped: [] },
        { chapter_id: 'ch-2', people: ['pe-eli'], dropped: [] },
      ],
      '2026-10-18T12:00:00Z',
    );
    expect(out).toEqual({ added: 1, removed: 1 });
    const rows = mem.tables.chapter_people.map((r) => `${r.chapter_id} ${r.person_id} ${r.written_by}`).sort();
    expect(rows).toEqual(['ch-1 pe-eli gremly', 'ch-1 pe-theirs person', 'ch-2 pe-eli person']);
  });
});

describe('the day a Chapter ends', () => {
  const { chapterEndPlan, applyChapterEnds } = jest.requireActual('../weekly.js');
  const dated = new Map([
    ['c1', { type: 'chapter', id: 'ch-1', start_date: '2026-01-01' }],
    ['c2', { type: 'chapter', id: 'ch-2', start_date: null }],
    ['c3', { type: 'chapter', id: 'ch-3', start_date: '2026-08-01' }],
    ['f1', { type: 'fact', id: 'fa-1', about_date: '2026-05-17' }],
    ['f2', { type: 'fact', id: 'fa-2', about_date: '2026-09-01', about_date_end: '2026-09-05' }],
    ['f3', { type: 'fact', id: 'fa-3', about_date: null }],
    // a stretch with no last day, and a day that comes every year
    ['f4', { type: 'fact', id: 'fa-4', timing: 'span', about_date: '2026-10-02', about_date_end: null }],
    ['f5', { type: 'fact', id: 'fa-5', timing: 'yearly', about_date: '2025-10-07' }],
    ['p1', { type: 'person', id: 'pe-1' }],
  ]);

  it('is the day of the fact the pass says it was begun for, the last day of its span', () => {
    expect(
      chapterEndPlan({
        output: {
          begun_for: [
            { chapter_ref: 'c1', fact_ref: 'f1' },
            { chapter_ref: 'c2', fact_ref: 'f2' },
            // nothing it was begun for, a fact with no day, or no fact at all
            { chapter_ref: 'c2', fact_ref: '' },
            { chapter_ref: 'c1', fact_ref: 'f3' },
            { chapter_ref: 'c1', fact_ref: 'p1' },
            { chapter_ref: 'c1', fact_ref: 'f4' },
            { chapter_ref: 'c1', fact_ref: 'f5' },
            { chapter_ref: 'x9', fact_ref: 'f1' },
          ],
        },
        refs: dated,
      }),
    ).toEqual([
      { chapter_id: 'ch-1', end_date: '2026-05-17', fact_id: 'fa-1' },
      { chapter_id: 'ch-2', end_date: '2026-09-05', fact_id: 'fa-2' },
    ]);
  });

  it('is refused, and says so, when it falls on the day the Chapter began', () => {
    const begun = new Map([...dated, ['c4', { type: 'chapter', id: 'ch-4', start_date: '2026-05-17' }]]);
    expect(chapterEndPlan({ output: { begun_for: [{ chapter_ref: 'c4', fact_ref: 'f1' }] }, refs: begun })).toEqual([
      { chapter_id: 'ch-4', end_date: '2026-05-17', fact_id: 'fa-1', refused: 'the day it began' },
    ]);
  });

  it('is refused, and says so, when it falls before the Chapter began', () => {
    expect(chapterEndPlan({ output: { begun_for: [{ chapter_ref: 'c3', fact_ref: 'f1' }] }, refs: dated })).toEqual([
      { chapter_id: 'ch-3', end_date: '2026-05-17', fact_id: 'fa-1', refused: 'before it began' },
    ]);
  });

  it("is set on an open Chapter as Gremly's, never over the person's date or on a closed one", async () => {
    const mem = memoryDb({
      chapters: [
        { id: 'ch-1', owner_id: 'u', phase: 'active', closed_at: null, end_date: null, end_date_source: null },
        { id: 'ch-2', owner_id: 'u', phase: 'active', closed_at: null, end_date: '2026-09-10', end_date_source: 'user' },
        { id: 'ch-3', owner_id: 'u', phase: 'closed', closed_at: '2026-09-01', end_date: null, end_date_source: null },
      ],
    });
    const out = await applyChapterEnds(
      mem,
      'u',
      [
        { chapter_id: 'ch-1', end_date: '2026-05-17' },
        { chapter_id: 'ch-2', end_date: '2026-09-05' },
        { chapter_id: 'ch-3', end_date: '2026-08-01' },
      ],
      '2026-10-18T12:00:00Z',
    );
    expect(out.set).toEqual([{ chapter_id: 'ch-1', end_date: '2026-05-17', was: null }]);
    expect(mem.tables.chapters.map((c) => [c.id, c.end_date, c.end_date_source])).toEqual([
      ['ch-1', '2026-05-17', 'synthesis'],
      ['ch-2', '2026-09-10', 'user'],
      ['ch-3', null, null],
    ]);
  });
});
