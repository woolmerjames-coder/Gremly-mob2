/**
 * The first Worlds replay's five made up people (data fabric stage 4b). Each
 * has no Worlds yet; first Worlds reads what they have and names their Worlds.
 * Every name, place and item is made up.
 *
 *   jun    brand new: one drop, on their third day
 *   maya   new: five drops on their first day, across two parts of life
 *   alex   returning with none: the filing replay's sixty drops, whose World
 *          the blind labellers set (scripts/filing-replay/data/gold.json)
 *   ines   a part of life that is about their health, kept private, beside
 *          two others
 *   kai    a part of life that is one person, and a house move with an end
 *
 * Each item says which part of life it belongs to (part), or null when it
 * belongs to none. These were set when the people were written, from the
 * parts each was written to have; alex's come from the filing replay's gold
 * set. parts names each person's parts of life: a must one is plainly there,
 * a may one is thin enough that leaving it out is fair.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DROPS as ALEX_DROPS } from '../filing-replay/person.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

let n = 0;
const uuid = (p) => {
  n += 1;
  return `${p}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
};

/** item: [type, title, body, date, part, subtype?] */
const items = (prefix, rows) =>
  rows.map(([type, title, body, date, part, subtype]) => ({
    id: uuid(prefix),
    type,
    title,
    body,
    subtype: subtype || null,
    date,
    created_at: `${date}T09:00:00Z`,
    done: null,
    part,
  }));

// ── jun: one drop, day 3 ────────────────────────────────────────────────
const JUN = {
  key: 'jun',
  person: { first_name: 'Jun', pronouns: null },
  today: '2026-10-07',
  firstDropDay: '2026-10-05',
  items: items('e', [
    ['note', 'Pottery', 'First evening of the Thursday pottery class, made a wonky bowl and loved it', '2026-10-05', 'pottery', 'journal'],
  ]),
  facts: [],
  parts: [{ key: 'pottery', must: true, about: 'making pottery at an evening class' }],
};

// ── maya: five drops, day 1 ─────────────────────────────────────────────
const MAYA = {
  key: 'maya',
  person: { first_name: 'Maya', pronouns: 'she/her' },
  today: '2026-10-07',
  firstDropDay: '2026-10-07',
  items: items('f', [
    ['todo', "Biscuit's jab", "Book the vet for Biscuit's booster jab", '2026-10-07', 'dog'],
    ['note', 'Sofa', 'Biscuit chewed the corner of the sofa again while I was out', '2026-10-07', 'dog'],
    ['todo', 'New lead', 'Buy a longer lead for Biscuit for the park', '2026-10-07', 'dog'],
    ['todo', 'Saturday shift', 'Ask Priya to swap my Saturday shift at the cafe', '2026-10-07', 'work'],
    ['note', 'Rota', 'Cafe rota next week: lates on Monday, Wednesday and Friday', '2026-10-07', 'work'],
  ]),
  facts: [],
  parts: [
    { key: 'dog', must: true, about: 'looking after her dog Biscuit' },
    { key: 'work', must: true, about: 'her shifts at the cafe' },
  ],
};

// ── alex: the filing replay's person, with no Worlds ────────────────────
const ALEX_PART = {
  Teaching: 'teaching',
  'Home and family': 'home',
  Running: 'running',
  'The allotment': 'allotment',
};
const alexGold = new Map(
  JSON.parse(readFileSync(join(HERE, '..', 'filing-replay', 'data', 'gold.json'), 'utf8')).labels.map(
    (g) => [g.id, g],
  ),
);
const ALEX = {
  key: 'alex',
  person: { first_name: 'Alex', pronouns: 'they/them' },
  today: '2026-10-07',
  firstDropDay: '2026-09-21',
  items: ALEX_DROPS.map((dr) => ({
    id: uuid('a'),
    type: dr.entity_type,
    title: dr.title,
    body: dr.text,
    subtype: null,
    date: dr.date,
    created_at: `${dr.date}T09:00:00Z`,
    done: null,
    part: ALEX_PART[alexGold.get(dr.id)?.world] || null,
    // where the labellers also found another World fair
    fair: (alexGold.get(dr.id)?.also_fair || []).map((w) => ALEX_PART[w]).filter(Boolean),
  })),
  facts: [],
  // people in their life by the names the records use; a World named for one
  // of them is theirs (run.mjs)
  personNames: ['Jo'],
  parts: [
    { key: 'teaching', must: true, about: 'teaching science at a secondary school' },
    { key: 'home', must: true, about: 'home and family with their partner Jo' },
    { key: 'running', must: true, about: 'running and races' },
    { key: 'allotment', must: true, about: 'growing vegetables on an allotment' },
  ],
};

// ── ines: health kept private, work, learning Italian ───────────────────
const inesItems = items('b', [
  ['todo', 'Physio', 'Physio appointment on Tuesday for my back', '2026-09-29', 'health'],
  ['note', 'Back', 'Back was bad again after sitting all day, did the stretches', '2026-10-01', 'health', 'journal'],
  ['todo', 'Prescription', 'Collect the repeat prescription from the pharmacy', '2026-10-03', 'health'],
  ['habit', 'Back stretches', 'Morning stretches the physio gave me', '2026-09-20', 'health'],
  ['todo', 'Invoice the agency', 'Send the agency my invoice for the September translations', '2026-10-01', 'work'],
  ['todo', 'Contract deadline', 'Finish translating the supplier contract by Friday', '2026-10-02', 'work'],
  ['note', 'New client', 'A publisher asked whether I take on literary translation, I said yes', '2026-10-04', 'work'],
  ['todo', 'Glossary', 'Update my legal glossary with the new contract terms', '2026-10-05', 'work'],
  ['habit', 'Italian', 'Twenty minutes of Italian every evening', '2026-09-15', 'italian'],
  ['todo', 'Italian class', 'Sign up for the Wednesday Italian conversation group', '2026-10-03', 'italian'],
  ['note', 'Italian progress', 'Read a whole page of the Italian novel without the dictionary', '2026-10-06', 'italian', 'journal'],
  ['todo', 'Bin day', 'Put the recycling out on Thursday', '2026-10-06', null],
]);
const INES = {
  key: 'ines',
  person: { first_name: 'Ines', pronouns: 'she/her' },
  today: '2026-10-07',
  firstDropDay: '2026-09-15',
  items: inesItems,
  facts: [
    { id: uuid('c'), statement: 'Has a herniated disc in her lower back', state: 'current', about_date: null, private: true, health: true, item: inesItems[1] },
    { id: uuid('c'), statement: 'Takes naproxen for the back pain', state: 'current', about_date: null, private: true, health: true, item: inesItems[2] },
    { id: uuid('c'), statement: 'Works as a freelance translator, mostly legal contracts', state: 'current', about_date: null, private: false, health: false, item: inesItems[5] },
    { id: uuid('c'), statement: 'Is learning Italian', state: 'current', about_date: null, private: false, health: false, item: inesItems[8] },
  ],
  parts: [
    { key: 'health', must: true, about: 'looking after her back, which she keeps private' },
    { key: 'work', must: true, about: 'her freelance translation work' },
    { key: 'italian', must: true, about: 'learning Italian' },
  ],
  // a World's name here must not name the condition, a treatment or a medication
  privateWords: true,
};

// ── kai: a partner, climbing, a house move, volunteering ────────────────
const LENA = '90000000-0000-4000-8000-000000000001';
const kaiItems = items('d', [
  ['todo', 'Anniversary', 'Book the cabin for our anniversary weekend with Lena', '2026-10-01', 'lena'],
  ['note', 'Lena', 'Lena had a rough week at the hospital, made her favourite soup', '2026-10-03', 'lena', 'journal'],
  ['todo', "Lena's birthday", "Order the print Lena wanted for her birthday", '2026-10-05', 'lena'],
  ['note', 'Date night', 'Lena and I tried the new Thai place, she wants to go back', '2026-09-27', 'lena'],
  ['habit', 'Climbing', 'Bouldering at the wall on Mondays and Thursdays', '2026-09-01', 'climbing'],
  ['note', 'Project', 'Finally sent the blue route on the overhang', '2026-10-02', 'climbing', 'journal'],
  ['todo', 'Shoes', 'Get my climbing shoes resoled', '2026-10-04', 'climbing'],
  ['todo', 'Boxes', 'Get packing boxes for the move', '2026-10-02', 'home'],
  ['todo', 'Removals', 'Get three quotes from removal firms for the 31st', '2026-10-03', 'home'],
  ['todo', 'Broadband', 'Set up broadband at the new flat', '2026-10-05', 'home'],
  ['note', 'New flat', 'Measured the new living room, the sofa will just fit', '2026-10-06', 'home'],
  ['todo', 'Food bank', 'Saturday morning shift sorting at the food bank', '2026-10-04', 'volunteering'],
  ['note', 'Food bank', 'Food bank is short of volunteers on weekdays, asked work about volunteering days', '2026-10-06', 'volunteering'],
  ['todo', 'Dentist', 'Book a dentist check up', '2026-10-06', null],
]);
const KAI = {
  key: 'kai',
  person: { first_name: 'Kai', pronouns: 'he/him' },
  today: '2026-10-07',
  firstDropDay: '2026-09-01',
  items: kaiItems,
  facts: [
    { id: uuid('c'), statement: 'Lena is his partner', state: 'current', about_date: null, private: false, health: false, item: kaiItems[0], people: [LENA] },
    { id: uuid('c'), statement: 'Is moving to a new flat at the end of October', state: 'planned', about_date: '2026-10-31', private: false, health: false, item: kaiItems[8] },
  ],
  people: [{ id: LENA, name: 'Lena', names: [], relationship: 'his partner' }],
  personNames: ['Lena'],
  parts: [
    { key: 'lena', must: true, about: 'his partner Lena', person: 'Lena' },
    { key: 'climbing', must: true, about: 'climbing at the bouldering wall' },
    { key: 'home', must: true, about: 'home, and the move to a new flat' },
    { key: 'volunteering', must: false, about: 'volunteering at the food bank' },
  ],
};

export const PEOPLE = [JUN, MAYA, ALEX, INES, KAI];
