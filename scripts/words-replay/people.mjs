/**
 * The words and memory replay's made up people (data fabric stage 4b).
 *
 * Alex is the filing replay's person (scripts/filing-replay/person.mjs): four
 * Worlds and three Chapters, with each drop filed where the blind labellers
 * put it (data/gold.json). The words replay writes the line under each World
 * and open Chapter from those; the memory replay writes the memory of the
 * closed one, the Leeds half marathon. Facts and people are added here, with
 * one about health, which the line must never rest on. A fourth Chapter is
 * one Gremly suggested and Alex has not taken up, the Manchester marathon,
 * with two drops filed in it, one of them the item the health fact is from.
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

/** A Chapter Gremly suggested, not yet taken up, and the drops filed in it. */
const SUGGESTED = {
  id: 'b0000000-0000-4000-8000-000000000009',
  title: 'Manchester marathon',
  phase: 'suggested',
  start_date: null,
  end_date: '2027-04-25',
  primary_world_id: WORLDS.find((w) => w.name === 'Running').id,
  drops: ['d33', 'd28'],
};

/** What is filed in a World or a Chapter of Alex's, as context/filed.js reads it. */
export function alexFiled(target) {
  const items =
    target.table === 'worlds'
      ? ALEX_ITEMS.filter((i) => i.world === target.name)
      : target.name === SUGGESTED.title
        ? SUGGESTED.drops.map(item)
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
  chapters: [...CHAPTERS, SUGGESTED].map((c) => ({
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

// ── one thing filed in many places: the words under each, as a set ─────

/**
 * Rosa: three Worlds and a Chapter, with the one habit she keeps filed in all
 * of them, and each holding much else of its own, some of it cleared from her
 * list in the Sweep without being marked done. The words are written one
 * after another as the worker writes them (Chapters first, each given the
 * words before it), and each should say what is particular to it.
 */
let r = 0;
const rid = (p) => `${p}0000000-0000-4000-8000-${hex(++r)}`;
const ritem = (type, title, body, date, done = null, cleared = false) => ({
  type,
  id: rid('a'),
  title,
  body,
  subtype: type === 'note' ? 'journal' : null,
  date,
  created_at: `${date}T09:00:00Z`,
  done,
  cleared,
  private: false,
  health: false,
});
const GRAN = { id: rid('e'), name: 'Gran', names: [], relationship: 'her grandmother' };
const PRITI = { id: rid('e'), name: 'Priti', names: [], relationship: 'a friend' };
const DEV = { id: rid('e'), name: 'Dev', names: [], relationship: 'a friend' };
const sundays = ritem('habit', 'Cycle over to see Gran every Sunday', null, '2026-07-01');
const ROSA_ITEMS = {
  party: [
    ritem('todo', 'Book the function room at the Crown for Gran’s 90th', null, '2026-09-20', '2026-09-22'),
    ritem('todo', 'Order the cake for Gran’s 90th', null, '2026-09-28'),
    ritem('todo', 'Make a photo board for the party', 'Old photos from the farm for Gran’s party', '2026-10-01'),
    ritem('todo', 'Call Uncle Joe about the party', null, '2026-10-03', '2026-10-03'),
  ],
  family: [
    ritem('todo', 'Fix Gran’s garden gate', null, '2026-08-10', '2026-08-16'),
    ritem('note', 'Sunday', 'Gran got the old farm photos out again, I could listen to her for hours', '2026-09-13'),
    ritem('todo', 'Help Mum clear the loft', null, '2026-09-05', '2026-09-06'),
    // cleared from her list in the Sweep without being marked done
    ritem('todo', 'Take Gran to the garden centre', null, '2026-09-09', null, true),
    ritem('todo', 'Take Gran to the garden centre', null, '2026-09-23', null, true),
    ritem('todo', 'Sort out Gran’s photo albums', null, '2026-09-26', null, true),
  ],
  fitness: [
    ritem('todo', 'Spin class', 'Tuesday spin class', '2026-09-01', '2026-09-01'),
    ritem('todo', 'Spin class', 'Tuesday spin class', '2026-09-08', '2026-09-08'),
    ritem('todo', 'Spin class', 'Tuesday spin class', '2026-09-15', '2026-09-15'),
    ritem('todo', 'Long ride to the coast', 'Ride out to the coast and back on Saturday', '2026-09-19', '2026-09-19'),
    ritem('note', 'Hundred', 'First 100k ride, legs gone but so happy', '2026-09-19'),
    ritem('todo', 'Service the bike', null, '2026-09-24'),
    ritem('todo', 'Spin class', 'Tuesday spin class', '2026-09-29', '2026-09-29'),
  ],
  friends: [
    ritem('todo', 'Quiz night at the Lamb', 'Quiz at the Lamb with Priti and Dev', '2026-09-03', '2026-09-03'),
    ritem('note', 'Priti', 'Long walk with Priti, she is nervous about the new job', '2026-09-12'),
    ritem('todo', 'Quiz night at the Lamb', 'Quiz at the Lamb with Priti and Dev', '2026-09-17', '2026-09-17'),
    ritem('todo', 'Dev’s birthday drinks', 'Drinks for Dev’s birthday on Friday', '2026-09-25', '2026-09-25'),
    ritem('todo', 'Quiz night at the Lamb', 'Quiz at the Lamb with Priti and Dev', '2026-10-01', '2026-10-01'),
    ritem('todo', 'Five a side', 'Five a side with the old school lot', '2026-09-10', null, true),
    ritem('todo', 'Five a side', 'Five a side with the old school lot', '2026-09-24', null, true),
  ],
};
const rfact = (statement, state, about_date, it, people = []) => ({
  id: rid('f'),
  statement,
  state,
  about_date,
  about_date_end: null,
  private: false,
  health: false,
  item_table: { note: 'notes', todo: 'todos', habit: 'habits' }[it.type],
  item_id: it.id,
  people,
});
const ROSA_FACTS = [
  rfact('Cycles over to see her Gran every Sunday', 'current', null, sundays, [GRAN]),
  rfact('Gran turns 90 in November, with a party at the Crown', 'planned', '2026-11-14', ROSA_ITEMS.party[0], [GRAN]),
  rfact('Rode 100k for the first time', 'happened', '2026-09-19', ROSA_ITEMS.fitness[4]),
  rfact('Goes to the quiz at the Lamb with Priti and Dev', 'current', null, ROSA_ITEMS.friends[0], [PRITI, DEV]),
  rfact('Priti is starting a new job', 'planned', null, ROSA_ITEMS.friends[1], [PRITI]),
];
const rosaWorld = (name) => ({ id: rid('b'), name, display_name: name, card_subtitle: null, card_subtitle_source: 'words' });
const FAMILY = rosaWorld('Family');
const FITNESS = rosaWorld('Fitness');
const FRIENDS = rosaWorld('Friends');
const PARTY = {
  id: rid('b'),
  title: 'Gran’s 90th',
  phase: 'upcoming',
  start_date: '2026-11-14',
  end_date: '2026-11-14',
  primary_world_id: FAMILY.id,
  card_subtitle: null,
  card_subtitle_source: 'words',
};
const rosaFiledOf = (list) => {
  const ids = new Set(list.map((i) => i.id));
  const facts = ROSA_FACTS.filter((x) => ids.has(x.item_id));
  return {
    items: [...list].sort((a, b) => b.date.localeCompare(a.date)),
    facts,
    peopleOf: new Map(facts.filter((x) => x.people.length).map((x) => [x.id, x.people])),
  };
};

export const ROSA = {
  person: { first_name: 'Rosa', pronouns: 'she/her' },
  // as context/words.js wordsTargets gives them: Chapters first
  targets: [
    { table: 'chapters', kind: 'chapter', name: PARTY.title, row: PARTY, world: FAMILY, filed: () => rosaFiledOf([sundays, ...ROSA_ITEMS.party]) },
    { table: 'worlds', kind: 'world', name: 'Family', row: FAMILY, filed: () => rosaFiledOf([sundays, ...ROSA_ITEMS.family, ...ROSA_ITEMS.party]) },
    { table: 'worlds', kind: 'world', name: 'Fitness', row: FITNESS, filed: () => rosaFiledOf([sundays, ...ROSA_ITEMS.fitness]) },
    { table: 'worlds', kind: 'world', name: 'Friends', row: FRIENDS, filed: () => rosaFiledOf([sundays, ...ROSA_ITEMS.friends]) },
  ],
};

/**
 * Gremly's read of each made up person's life, as the weekly pass writes the
 * Life Map (user_life_map.life_map), for --life-map: given to the writers as
 * background (context/lifeMap.js). Alex's holds the sore knee as the weekly
 * pass might, so the replay sees whether the words keep off it.
 */
const thread = (name, importance, attention, status, last_activity, summary, recent_update = null) => ({
  name,
  importance,
  attention,
  status,
  lifecycle: 'active',
  last_activity,
  summary,
  recent_update,
});
export const LIFE_MAPS = {
  Alex: {
    domains: [
      {
        name: 'Teaching',
        threads: [
          thread('Year 11 and the science department', 'high', 'front_of_mind', 'busy', '2026-10-06', 'Alex teaches science at a secondary school and is in the thick of Year 11 mocks this half term, setting and marking papers. A new head of science starts in January.', 'Alex has been setting the chemistry mock and marking physics papers.'),
        ],
      },
      {
        name: 'Home and family',
        threads: [
          thread('Life with Jo', 'high', 'front_of_mind', 'warm', '2026-10-05', 'Alex lives with their partner Jo. They are going to Lisbon together over half term, and Alex wants to plan a surprise for Jo’s 40th in the spring. Jo came to the finish of the Leeds half.'),
        ],
      },
      {
        name: 'Running',
        threads: [
          thread('Training for a marathon', 'medium', 'active', 'building', '2026-10-01', 'Running matters a lot to Alex: they run with the Tuesday run club, ran the Leeds half in a best time in September and want to run the Manchester marathon in April.'),
          thread('A sore knee', 'medium', 'background', 'ongoing', '2026-09-28', 'Alex’s knee has been sore after long runs.'),
        ],
      },
      {
        name: 'The allotment',
        threads: [
          thread('The plot at Moorside', 'medium', 'background', 'steady', '2026-10-03', 'Alex keeps a plot at the Moorside allotments next to Pat, who will water the greenhouse while they are away. It is a calm, practical part of their week.'),
        ],
      },
    ],
  },
  Ines: {
    domains: [
      {
        name: 'Health',
        threads: [thread('Getting her back right', 'high', 'active', 'improving', '2026-09-22', 'Ines spent late summer on physio for her back and is walking further without pain.')],
      },
      { name: 'Home', threads: [thread('Her neighbourhood', 'medium', 'background', 'steady', '2026-09-08', 'Ines likes walking to the market near her home.')] },
    ],
  },
  Maya: {
    domains: [
      {
        name: 'Biscuit',
        threads: [thread('Life with Biscuit', 'high', 'front_of_mind', 'settled', '2026-08-31', 'Maya adopted Biscuit from a rescue in July; her friend Tasha helped on the first night, and the summer was about settling Biscuit in.')],
      },
    ],
  },
};
