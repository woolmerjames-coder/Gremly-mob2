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
