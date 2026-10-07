/**
 * The made up material for the people questions replay (data fabric stage
 * 4c). Every name, record and answer here is made up.
 *
 * CHECKS: what Gremly would record about someone, with the person's own words
 * it comes from, and whether those words state it (set when this was written,
 * from what each line says and nothing else).
 *
 * ASKS: people with records Gremly could ask about, as personCandidates
 * would give them, one of each kind, and a fact marked private on each that a
 * question must never name.
 *
 * ANSWERS: a question and an answer, with what the answer says: whether it
 * answers, yes, no or unsure to a question whether two are one person, and
 * the word who someone is or their name must hold.
 */

export const CHECKS = [
  { key: 'named', name: 'Priya', nameWords: 'Lunch with Priya on Friday, she found a new flat', who: null, holds: { name: true } },
  { key: 'sister', name: null, who: 'sister', whoWords: 'My sister is coming to stay next weekend', holds: { who: true } },
  { key: 'sad-day', name: null, who: 'friend', whoWords: 'It was a long, sad day', holds: { who: false } },
  { key: 'code', name: null, who: 'parent of n2', whoWords: 'Her parents came to stay for the week', holds: { who: false } },
  { key: 'gran', name: 'Gran', nameWords: 'Call Gran on Sunday', who: 'grandmother', whoWords: 'Call Gran on Sunday', holds: { name: false, who: true } },
  { key: 'activity', name: 'Tom', nameWords: 'Tom said the deadline moved to Thursday', who: 'boss', whoWords: 'Tom said the deadline moved to Thursday', holds: { name: true, who: false } },
  { key: 'in-law', name: 'Leo', nameWords: "My sister's husband Leo is cooking on Saturday", who: "sister's husband", whoWords: "My sister's husband Leo is cooking on Saturday", holds: { name: true, who: true } },
  { key: 'occasion', name: 'Sam', nameWords: 'Dinner with Sam for our anniversary', who: 'husband', whoWords: 'Dinner with Sam for our anniversary', holds: { name: true, who: false } },
  { key: 'coach', name: 'Coach', nameWords: 'Coach wants everyone at training early', who: 'coach', whoWords: 'Coach wants everyone at training early', holds: { name: false, who: true } },
  { key: 'mum', name: 'Mum', nameWords: 'Ring Mum every Saturday morning', who: 'mum', whoWords: 'Ring Mum every Saturday morning', holds: { name: false, who: true } },
  { key: 'work', name: 'Aisha', nameWords: 'Aisha from work sent over the slides', who: 'colleague', whoWords: 'Aisha from work sent over the slides', holds: { name: true, who: true } },
  { key: 'no-words', name: null, who: 'cousin', whoWords: null, holds: { who: false } },
  { key: 'partner', name: 'Jules', nameWords: 'Jules, my partner, booked the cabin', who: 'partner', whoWords: 'Jules, my partner, booked the cabin', holds: { name: true, who: true } },
  { key: 'own-name', name: 'Leo', nameWords: 'My sister and her husband Leo are coming for dinner', who: "husband of Robin's sister", whoWords: 'My sister and her husband Leo are coming for dinner', holds: { name: true, who: false } },
  { key: 'group', name: 'The book club', nameWords: 'The book club meets at mine on Tuesday', who: null, holds: { name: false } },
];

const f = (statement, extra = {}) => ({
  statement,
  about_date: null,
  state: 'current',
  private: false,
  health: false,
  last_confirmed_at: '2026-10-01',
  ...extra,
});

/** One candidate of each kind for each made up person, as personCandidates gives them. */
export const ASKS = [
  {
    key: 'robin-same',
    person: { first_name: 'Robin', pronouns: null },
    candidates: [
      {
        type: 'same',
        merge_id: 'm-1',
        kept: { id: 'p-jules', name: 'Jules', relationship: null },
        merged: { id: 'p-husband', name: null, relationship: 'husband' },
        facts: {
          kept: [f('Jules booked the cabin for the anniversary weekend'), f('Jules is learning to make pasta'), f('Jules takes the dog out every morning')],
          merged: [f('Is planning a surprise for their husband in March'), f('Their husband had an operation on his knee', { private: true, health: true })],
        },
        weight: 4,
      },
    ],
  },
  {
    key: 'kai-who',
    person: { first_name: 'Kai', pronouns: 'he/him' },
    candidates: [
      {
        type: 'who',
        person: { id: 'p-maya', name: 'Maya', relationship: null },
        facts: [f('Maya is coming to the climbing wall on Thursday'), f('Maya lent him her tent for the trip'), f('Maya and Kai are going to the food market on Saturday'), f('Maya is going through a hard time with money', { private: true })],
        weight: 3,
      },
    ],
  },
  {
    key: 'ines-name',
    person: { first_name: 'Ines', pronouns: 'she/her' },
    candidates: [
      {
        type: 'name',
        person: { id: 'p-brother', name: null, relationship: 'brother' },
        facts: [f('Her brother is moving to Lisbon in the spring'), f('Her brother is getting married next summer'), f('Calls her brother on Sunday evenings'), f('Her brother is seeing a therapist', { private: true, health: true })],
        weight: 3,
      },
    ],
  },
  {
    key: 'three',
    person: { first_name: 'Alex', pronouns: 'they/them' },
    candidates: [
      {
        type: 'who',
        person: { id: 'p-dee', name: 'Dee', relationship: null },
        facts: [f('Dee is running the half marathon with them in May'), f('Dee sent them a training plan'), f('Dee and Alex do a long run on Sundays')],
        weight: 3,
      },
      {
        type: 'name',
        person: { id: 'p-neighbour', name: null, relationship: 'neighbour' },
        facts: [f('Their neighbour is watering the plants while they are away'), f('Their neighbour has a new puppy'), f('Their neighbour is building a shed')],
        weight: 3,
      },
    ],
  },
];

/** The questions the answers below reply to. */
const SAME = {
  id: 'q-same',
  question: 'Is Jules the husband you have mentioned?',
  proposed_change: { type: 'same', merge_id: 'm-1', kept_id: 'p-jules', merged_id: 'p-husband' },
};
const WHO = { id: 'q-who', question: 'Who is Maya to you?', proposed_change: { type: 'who', person_id: 'p-maya' } };
const NAME = { id: 'q-name', question: "What is your brother's name?", proposed_change: { type: 'name', person_id: 'p-brother' } };

export const ANSWER_PEOPLE = new Map([
  ['p-jules', { id: 'p-jules', name: 'Jules', relationship: null }],
  ['p-husband', { id: 'p-husband', name: null, relationship: 'husband' }],
  ['p-maya', { id: 'p-maya', name: 'Maya', relationship: null }],
  ['p-brother', { id: 'p-brother', name: null, relationship: 'brother' }],
]);

export const ANSWERS = [
  { key: 'same-tap-yes', question: SAME, said: 'Yes', want: { answers: true, same: 'yes' } },
  { key: 'same-typed-yes', question: SAME, said: 'Yes, Jules is my husband', want: { answers: true, same: 'yes' } },
  { key: 'same-no', question: SAME, said: 'No, Jules is my cousin', want: { answers: true, same: 'no' } },
  { key: 'same-tap-no', question: SAME, said: 'No, someone else', want: { answers: true, same: 'no' } },
  { key: 'same-unsure', question: SAME, said: 'Not sure what you mean by that', want: { answers: false } },
  { key: 'same-back', question: SAME, said: 'Why do you want to know?', want: { answers: false } },
  { key: 'who-typed', question: WHO, said: 'She is my cousin', want: { answers: true, who: 'cousin' } },
  { key: 'who-tap', question: WHO, said: 'A friend', want: { answers: true, who: 'friend' } },
  { key: 'who-long', question: WHO, said: 'My old flatmate from university, we still climb together', want: { answers: true, who: 'flatmate' } },
  { key: 'who-decline', question: WHO, said: "I'd rather not say", want: { answers: true, who: null } },
  { key: 'who-back', question: WHO, said: 'What do you mean?', want: { answers: false } },
  { key: 'name-typed', question: NAME, said: 'His name is Rui', want: { answers: true, name: 'Rui' } },
  { key: 'name-bare', question: NAME, said: 'Tomás', want: { answers: true, name: 'Tomás' } },
  { key: 'name-skip', question: NAME, said: 'You do not need to know that', want: { answers: true, name: null } },
];
