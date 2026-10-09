/**
 * The made up material for the people page replay (Worlds rebuild, stage 5).
 * Every name, fact and answer here is made up.
 *
 * PAGES: someone in a made up person's life, with the facts the ledger would
 * hold about them, written as the reader writes them (about the person, in
 * the third person). Some are private or about health, which the page is
 * never written from; some are put right or have passed.
 *
 * CORRECTIONS: what someone types on a person's page when it is not right,
 * with the name and who they are that their words give, if any.
 */

export const TODAY = '2026-10-20';
export const PERSON = { first_name: 'Robin', pronouns: null };

let n = 0;
const f = (statement, more = {}) => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  statement,
  about_date: null,
  about_date_end: null,
  timing: 'standing',
  state: 'current',
  private: false,
  health: false,
  observed_at: `2026-09-${String(10 + (n % 18)).padStart(2, '0')}T10:00:00Z`,
  updated_at: '2026-09-30T10:00:00Z',
  ...more,
});
const someone = (id, name, relationship, by = 'gremly') => ({
  id: `00000000-0000-4000-8000-0000000a${String(id).padStart(4, '0')}`,
  name,
  relationship,
  relationship_by: by,
});

export const PAGES = [
  {
    key: 'sister',
    someone: someone(1, 'Sam', 'sister'),
    names: ['Sam', 'Sammy'],
    facts: [
      f("Sam's birthday is on 14 March", { about_date: '1991-03-14', timing: 'yearly', kind: 'event' }),
      f('Sam is vegetarian', { kind: 'preference' }),
      f('Sam is planning to move to Bristol in the spring', { about_date: '2027-03-01', about_date_end: '2027-05-31', timing: 'span', state: 'planned', kind: 'situation' }),
      f('Is going to Sam’s housewarming on 7 November', { about_date: '2026-11-07', timing: 'day', state: 'planned', kind: 'event' }),
      f('Helped Sam paint her new flat in August', { about_date: '2026-08-15', timing: 'day', state: 'happened', kind: 'event' }),
      f('Sam is training for the Bath half marathon', { kind: 'goal' }),
      f('Sam is seeing a counsellor every week', { private: true, health: true, kind: 'situation' }),
      f('Sam lives in Leeds', { state: 'corrected', kind: 'situation' }),
    ],
  },
  {
    key: 'colleague',
    someone: someone(2, 'Priya', 'colleague', 'understood'),
    names: ['Priya'],
    facts: [
      f('Priya is leading the Harlow pitch with Robin', { kind: 'situation' }),
      f('Priya prefers meetings early in the day', { kind: 'preference' }),
      f('Has a call with Priya on 23 October about the pitch deck', { about_date: '2026-10-23', timing: 'day', state: 'planned', kind: 'event' }),
      f('Priya’s leaving drinks are on 30 October', { about_date: '2026-10-30', timing: 'day', state: 'planned', kind: 'event' }),
      f('Priya is moving to the Singapore office in the new year', { about_date: '2027-01-04', timing: 'day', state: 'planned', kind: 'situation' }),
    ],
  },
  {
    key: 'mum',
    someone: someone(3, null, 'mum'),
    names: [],
    facts: [
      f("Their mum's birthday is on 2 December", { about_date: '1958-12-02', timing: 'yearly', kind: 'event' }),
      f('Calls their mum every Sunday morning', { kind: 'routine' }),
      f('Their mum is learning Spanish', { kind: 'goal' }),
      f('Their mum is visiting from 12 to 15 November', { about_date: '2026-11-12', about_date_end: '2026-11-15', timing: 'span', state: 'planned', kind: 'event' }),
      f('Their mum had a hip operation in September', { about_date: '2026-09-08', timing: 'day', state: 'happened', private: true, health: true, kind: 'event' }),
    ],
  },
  {
    key: 'thin',
    someone: someone(4, 'Dan', null),
    names: ['Dan'],
    facts: [f('Had coffee with Dan on 2 October', { about_date: '2026-10-02', timing: 'day', state: 'happened', kind: 'event' })],
  },
  {
    key: 'partner',
    someone: someone(5, 'Jules', 'partner'),
    names: ['Jules', 'J'],
    facts: [
      f('Robin and Jules’s anniversary is on 20 June', { about_date: '2019-06-20', timing: 'yearly', kind: 'event' }),
      f('Jules is allergic to peanuts', { kind: 'situation' }),
      f('Jules is learning to make fresh pasta', { kind: 'goal' }),
      f('Is planning a surprise weekend in Lisbon for Jules in November', { about_date: '2026-11-20', about_date_end: '2026-11-22', timing: 'span', state: 'planned', kind: 'event' }),
      f('Jules started a new job at a bakery in September', { about_date: '2026-09-01', timing: 'day', state: 'happened', kind: 'event' }),
      f('Jules takes the dog out every morning', { kind: 'routine' }),
      f('Jules and Robin argued about money last week', { private: true, kind: 'situation' }),
    ],
  },
  {
    key: 'friend-wedding',
    someone: someone(6, 'Leo', 'friend from school'),
    names: ['Leo'],
    facts: [
      f('Leo is getting married to Maya on 17 April', { about_date: '2027-04-17', timing: 'day', state: 'planned', kind: 'event' }),
      f('Is Leo’s best man', { kind: 'relationship' }),
      f('Leo and Maya got engaged in July', { about_date: '2026-07-12', timing: 'day', state: 'happened', kind: 'event' }),
      f('Leo plays five a side football on Thursdays', { kind: 'routine' }),
      f('Leo’s stag weekend might be in Edinburgh', { state: 'unconfirmed', kind: 'event' }),
    ],
  },
];

/**
 * A made up page as the person sees it, and what they type when it is not
 * right. want: the name and who they are that their words give (null when
 * their words do not give one), as the reader must read them.
 */
export const CORRECTIONS = [
  { key: 'who-cousin', someone: someone(11, 'Sam', 'sister'), said: 'Sam is my cousin, not my sister', want: { name: null, who: 'cousin' } },
  { key: 'name-full', someone: someone(12, 'J', 'partner', 'person'), said: 'His name is Jules, J is just what I call him', want: { name: 'Jules', who: null } },
  { key: 'name-for-mum', someone: someone(13, null, 'mum'), said: 'Mum is called Ann', want: { name: 'Ann', who: null } },
  { key: 'both', someone: someone(14, 'Pri', 'colleague', 'understood'), said: "It's Priya, and she's my manager, not just a colleague", want: { name: 'Priya', who: 'manager' } },
  { key: 'fact-only', someone: someone(15, 'Leo', 'friend from school'), said: 'The wedding moved to June', want: { name: null, who: null } },
  { key: 'not-friend', someone: someone(16, 'Dan', 'friend'), said: "Dan isn't a friend, he's my landlord", want: { name: null, who: 'landlord' } },
  { key: 'spelling', someone: someone(17, 'Kathryn', 'aunt'), said: 'It is spelt Catherine', want: { name: 'Catherine', who: null } },
  { key: 'unsure', someone: someone(18, 'Tom', 'boss'), said: 'not sure this is right', want: { name: null, who: null } },
  { key: 'someone-else', someone: someone(19, 'Ella', 'niece'), said: 'Her brother Max is my nephew too', want: { name: null, who: null } },
  { key: 'former', someone: someone(20, 'Chris', 'boyfriend'), said: 'Chris is my ex now', want: { name: null, who: 'ex' } },
];
