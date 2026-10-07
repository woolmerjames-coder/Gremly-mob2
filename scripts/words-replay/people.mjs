/**
 * The words and memory replay's made up people (data fabric stage 4b).
 *
 * Alex is the filing replay's person (scripts/filing-replay/person.mjs): four
 * Worlds and three Chapters, with each drop filed where the blind labellers
 * put it (data/gold.json). The words replay writes the line under each World
 * and open Chapter from those; the memory replay writes the memory of the
 * closed one, the Leeds half marathon. Facts and people are added here, with
 * one about health, which the line must never rest on.
 *
 * Two more closed Chapters test the memory alone: Ines's physio for her back,
 * where something private and about health shapes the Chapter, and Maya's
 * first weeks with her rescue dog, where one step was never done.
 *
 * Every name, place and item is made up.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORLDS, CHAPTERS, DROPS, TODAY } from '../filing-replay/person.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export { TODAY };

const gold = new Map(
  JSON.parse(readFileSync(join(HERE, '..', 'filing-replay', 'data', 'gold.json'), 'utf8')).labels.map(
    (g) => [g.id, g],
  ),
);

const hex = (n) => n.toString(16).padStart(12, '0');
const idOf = (dropId) => `d0000000-0000-4000-8000-${hex(Number(dropId.slice(1)))}`;

/** Alex's drops as filed items, each with the World and Chapter gold puts it in. */
const ALEX_ITEMS = DROPS.map((dr) => ({
  type: dr.entity_type,
  id: idOf(dr.id),
  title: dr.title,
  body: dr.text,
  subtype: null,
  date: dr.date,
  created_at: `${dr.date}T09:00:00Z`,
  done: null,
  world: gold.get(dr.id)?.world || null,
  chapter: gold.get(dr.id)?.chapter || null,
}));
const item = (dropId) => ALEX_ITEMS.find((i) => i.id === idOf(dropId));

const P = {
  jo: { id: 'e0000000-0000-4000-8000-000000000001', name: 'Jo', names: [], relationship: 'their partner' },
  priya: { id: 'e0000000-0000-4000-8000-000000000002', name: 'Priya', names: [], relationship: 'a colleague' },
  pat: { id: 'e0000000-0000-4000-8000-000000000003', name: 'Pat', names: [], relationship: 'has the next plot' },
};

let f = 0;
const fact = (statement, state, about_date, dropId, people = [], extra = {}) => {
  f += 1;
  const it = item(dropId);
  return {
    id: `f0000000-0000-4000-8000-${hex(f)}`,
    statement,
    state,
    about_date,
    about_date_end: extra.end || null,
    private: !!extra.private,
    health: !!extra.health,
    item_table: { note: 'notes', todo: 'todos', habit: 'habits' }[it.type],
    item_id: it.id,
    people: people.map((k) => P[k]),
  };
};

const ALEX_FACTS = [
  fact('Teaches science at a secondary school', 'current', null, 'd07'),
  fact('Year 11 sit their science mocks this half term', 'planned', '2026-10-05', 'd01', [], { end: '2026-11-20' }),
  fact('A new head of science starts in January', 'planned', '2027-01-04', 'd09', ['priya']),
  fact('Lives with their partner Jo', 'current', null, 'd22', ['jo']),
  fact('Going to Lisbon with Jo over half term', 'planned', '2026-10-24', 'd15', ['jo'], { end: '2026-10-31' }),
  fact("Wants to plan a surprise for Jo's 40th", 'planned', '2027-03-01', 'd27', ['jo']),
  fact('Runs with the Tuesday run club', 'current', null, 'd30'),
  fact('Ran the Leeds half in 1:52, a best time', 'happened', '2026-09-20', 'd31'),
  fact('Jo was at the finish of the Leeds half', 'happened', '2026-09-20', 'd59', ['jo']),
  fact('Wants to run the Manchester marathon in April', 'planned', '2027-04-25', 'd33'),
  fact('Their knee has been sore after long runs', 'current', null, 'd28', [], { private: true, health: true }),
  fact('Has a plot at the Moorside allotments', 'current', null, 'd39'),
  fact('Pat on the next plot will water the greenhouse while they are away', 'planned', '2026-10-24', 'd58', ['pat']),
];

/** What is filed in a World or a Chapter of Alex's, as context/filed.js reads it. */
export function alexFiled(target) {
  const items =
    target.table === 'worlds'
      ? ALEX_ITEMS.filter((i) => i.world === target.name)
      : ALEX_ITEMS.filter((i) => i.chapter === target.name);
  const ids = new Set(items.map((i) => i.id));
  const facts = ALEX_FACTS.filter((x) => ids.has(x.item_id));
  // an item is private when a fact from it is (context/filed.js markItems)
  const marked = items
    .map((i) => {
      const from = facts.filter((x) => x.item_id === i.id);
      return { ...i, private: from.some((x) => x.private), health: from.some((x) => x.health) };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  return {
    items: marked,
    facts,
    peopleOf: new Map(facts.filter((x) => x.people.length).map((x) => [x.id, x.people])),
  };
}

export const ALEX = {
  person: { first_name: 'Alex', pronouns: 'they/them' },
  worlds: WORLDS.map((w) => ({ table: 'worlds', kind: 'world', name: w.name, row: { id: w.id, name: w.name } })),
  chapters: CHAPTERS.map((c) => ({
    table: 'chapters',
    kind: 'chapter',
    name: c.title,
    row: { id: c.id, title: c.title, phase: c.phase, start_date: c.start_date, end_date: c.end_date, primary_world_id: c.primary_world_id },
    world: WORLDS.find((w) => w.id === c.primary_world_id),
  })),
};

// ── two more closed Chapters, for the memory alone ─────────────────────

let n = 0;
const it = (type, title, body, date, extra = {}) => {
  n += 1;
  return {
    type,
    id: `c0000000-0000-4000-8000-${hex(n)}`,
    title,
    body,
    subtype: extra.subtype || null,
    date,
    created_at: `${date}T09:00:00Z`,
    done: extra.done || null,
  };
};

const inesItems = [
  it('todo', 'First physio', 'First physio appointment for my back on Tuesday', '2026-08-04', { done: '2026-08-04' }),
  it('habit', 'Back stretches', 'Morning stretches the physio gave me', '2026-08-05'),
  it('note', 'Back', 'Back still bad after a long day at the desk', '2026-08-12', { subtype: 'journal' }),
  it('todo', 'Standing desk', 'Order a standing desk riser', '2026-08-15', { done: '2026-08-16' }),
  it('note', 'Better', 'Walked all the way to the market with no pain, first time in months', '2026-09-08', { subtype: 'journal' }),
  it('todo', 'Last physio', 'Last physio session, ask about swimming', '2026-09-22', { done: '2026-09-22' }),
];
const inesFacts = [
  { id: 'f1000000-0000-4000-8000-000000000001', statement: 'Has a herniated disc in her lower back', state: 'current', about_date: null, private: true, health: true, item_table: 'notes', item_id: inesItems[2].id },
  { id: 'f1000000-0000-4000-8000-000000000002', statement: 'Took naproxen for the back pain over the summer', state: 'happened', about_date: '2026-08-10', private: true, health: true, item_table: 'notes', item_id: inesItems[2].id },
  { id: 'f1000000-0000-4000-8000-000000000003', statement: 'Walked to the market without pain', state: 'happened', about_date: '2026-09-08', private: false, health: false, item_table: 'notes', item_id: inesItems[4].id },
];

const MAYA_FRIEND = { id: 'e1000000-0000-4000-8000-000000000001', name: 'Tasha', names: [], relationship: 'her friend' };
const mayaItems = [
  it('todo', 'Pick up Biscuit', 'Pick up Biscuit from the rescue on Saturday', '2026-07-04', { done: '2026-07-04' }),
  it('note', 'First night', 'Biscuit cried most of the first night, Tasha came round with a blanket that smelled of her dog', '2026-07-05', { subtype: 'journal' }),
  it('todo', 'Puppy class', 'First puppy class on Wednesday evening', '2026-07-15', { done: '2026-07-15' }),
  it('todo', 'Crate training', 'Start crate training properly', '2026-07-20'),
  it('note', 'Slept through', 'Biscuit slept right through the night for the first time, I nearly cried', '2026-08-02', { subtype: 'journal' }),
  it('todo', 'Recall', 'Practise recall in the park every morning', '2026-08-10', { done: '2026-08-30' }),
];
const mayaFacts = [
  { id: 'f2000000-0000-4000-8000-000000000001', statement: 'Adopted Biscuit from a rescue in July', state: 'happened', about_date: '2026-07-04', private: false, health: false, item_table: 'todos', item_id: mayaItems[0].id },
  { id: 'f2000000-0000-4000-8000-000000000002', statement: 'Tasha helped on the first night', state: 'happened', about_date: '2026-07-05', private: false, health: false, item_table: 'notes', item_id: mayaItems[1].id },
];

const sorted = (xs) => [...xs].sort((a, b) => b.date.localeCompare(a.date));

export const MEMORIES = [
  {
    key: 'alex-leeds',
    person: ALEX.person,
    chapter: ALEX.chapters.find((c) => c.row.phase === 'closed').row,
    world: WORLDS[2],
    got: () => alexFiled({ table: 'chapters', name: 'Leeds half marathon' }),
  },
  {
    key: 'ines-physio',
    person: { first_name: 'Ines', pronouns: 'she/her' },
    chapter: { id: 'c9000000-0000-4000-8000-000000000001', title: 'Physio for my back', phase: 'closed', start_date: '2026-08-04', end_date: '2026-09-22' },
    world: { name: 'Health' },
    // the items a fact about health came from are marked so
    got: () => ({
      items: sorted(inesItems).map((i) => ({ ...i, private: i.id === inesItems[2].id, health: i.id === inesItems[2].id })),
      facts: inesFacts,
      peopleOf: new Map(),
    }),
    privateWords: true,
  },
  {
    key: 'maya-biscuit',
    person: { first_name: 'Maya', pronouns: 'she/her' },
    chapter: { id: 'c9000000-0000-4000-8000-000000000002', title: 'Settling Biscuit in', phase: 'closed', start_date: '2026-07-04', end_date: '2026-08-31' },
    world: { name: 'Biscuit' },
    got: () => ({
      items: sorted(mayaItems).map((i) => ({ ...i, private: false, health: false })),
      facts: mayaFacts,
      peopleOf: new Map([[mayaFacts[1].id, [MAYA_FRIEND]]]),
    }),
  },
];
