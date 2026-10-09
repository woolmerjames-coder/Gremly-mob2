/**
 * Made up lines for Gremly's guesses when a Chapter is started by hand
 * (workers/cortex/context/chapterGuess.js). Alex is made up; no real person's
 * data is here. Today is Thursday 8 October 2026.
 */

export const TODAY = '2026-10-08';

export const WORLDS = [
  { id: 'wHome', name: 'Home', card_subtitle: 'The house, the garden and the jobs that keep it running' },
  { id: 'wWork', name: 'Work', card_subtitle: 'Client services, the team and the pitches' },
  { id: 'wHealth', name: 'Health and fitness', card_subtitle: 'Running and the gym' },
  { id: 'wTravel', name: 'Travel', card_subtitle: 'Trips away and the planning for them' },
  { id: 'wFriends', name: 'Friends', card_subtitle: 'Nights out, birthdays and keeping in touch' },
  { id: 'wSide', name: 'Side project', card_subtitle: 'Building an app in the evenings' },
  { id: 'wBand', name: 'Old band', phase: 'archived' },
];

export const CHAPTERS = [
  { id: 'cLisbon', title: 'Lisbon trip', primary_world_id: 'wTravel', phase: 'upcoming' },
  { id: 'cFence', title: 'Garden fence', primary_world_id: 'wHome', phase: 'active' },
];

export const ITEMS = [
  { id: 't1', type: 'todo', title: 'Book flights to Porto' },
  { id: 't2', type: 'todo', title: 'Buy running shoes' },
  { id: 't3', type: 'todo', title: 'Sign up for the Oakland half marathon' },
  { id: 't4', type: 'todo', title: 'Get quotes for the kitchen worktop' },
  { id: 't5', type: 'todo', title: 'Send Sam the Harlow pitch deck', due: '2026-10-20' },
  { id: 't6', type: 'todo', title: 'Renew passport' },
  { id: 't7', type: 'todo', title: 'Call the dentist' },
  { id: 't8', type: 'todo', title: 'Paint the fence panels', chapter: 'cFence' },
  { id: 'n1', type: 'idea', title: 'Porto: try the francesinha' },
  { id: 'n2', type: 'note', title: 'Kitchen colours: sage or cream' },
  { id: 'h1', type: 'habit', title: 'Run 3 times a week' },
];

// world: the World it belongs in (or a list of fits); newWorld: none fits, so
// a new one; dates: [start, end] where any of a list passes; items: must have,
// mayHave, and anything else is wrong
export const SCENARIOS = [
  {
    id: 'porto',
    line: 'Porto trip in March',
    world: 'wTravel',
    dates: [[null], [null]],
    items: ['t1', 'n1'],
    mayHave: ['t6'],
  },
  {
    id: 'half',
    line: 'Oakland half marathon on 15 November',
    world: 'wHealth',
    dates: [[null], ['2026-11-15']],
    items: ['t3'],
    mayHave: ['t2', 'h1'],
  },
  {
    id: 'kitchen',
    line: 'Redo the kitchen before Christmas',
    world: 'wHome',
    dates: [[null], ['2026-12-24', '2026-12-25']],
    items: ['t4', 'n2'],
    mayHave: [],
  },
  {
    id: 'spanish',
    line: 'Learn Spanish before June',
    newWorld: true,
    dates: [[null], ['2027-05-31', '2027-06-01']],
    items: [],
    mayHave: [],
  },
  {
    id: 'pitch',
    line: 'The Harlow pitch, 22 Oct',
    world: 'wWork',
    dates: [[null], ['2026-10-22']],
    items: ['t5'],
    mayHave: [],
  },
  {
    id: 'party',
    line: "Dad's 70th, a weekend away 4 to 6 December",
    world: ['wFriends', 'wTravel', 'new'],
    dates: [['2026-12-04'], ['2026-12-06']],
    items: [],
    mayHave: [],
  },
  {
    id: 'vague',
    line: 'Something for the garden',
    world: 'wHome',
    dates: [[null], [null]],
    items: [],
    // the fence's own step is in the Garden fence Chapter, so never offered
    mayHave: [],
  },
];
