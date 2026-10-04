/**
 * Ask Gremly's agent lane replay (agent plan step 9, "Chat's replay"): the
 * kinds of message triage sends to the agent, lookups and changes, modelled on
 * real ones with every name, item and calendar entry made up, each with the
 * exchange before it and the items it needs standing in for the database. Today is Saturday 3 October 2026, 10am in San Francisco.
 *
 * expect: rows (exact number of card rows), minRows / maxRows, row (every
 * row must pass), some (at least one row must pass), mentions (the reply must
 * match), notSaid (the reply must not match), askOrRows (a question with no
 * card also passes).
 */

export const TODAY = '2026-10-03';
export const NOW_ISO = '2026-10-03T17:00:00Z';

export const SCENARIOS = [
  {
    id: 'vet-friday',
    kind: 'Change an existing item',
    text: 'I need to change the vet appointment to friday',
    items: [{ id: 'vet', kind: 'todo', title: 'Take Bella to the Vet', due_day: '2026-10-05', due_time: '10:00' }],
    expect: { rows: 1, row: (c) => c.op === 'change' && c.id === 'vet' && c.fields?.day === '2026-10-09' },
  },
  {
    id: 'sage-email',
    kind: 'Change an existing item',
    text: 'Can you push the budget email to Thursday?',
    items: [{ id: 'sage', kind: 'todo', title: 'Send the budget email', due_day: '2026-10-03' }],
    expect: { rows: 1, row: (c) => c.op === 'change' && c.id === 'sage' && c.fields?.day === '2026-10-08' },
  },
  {
    id: 'remind-mum',
    kind: 'Something new to keep',
    text: 'Can you remind me to call mum on Sunday?',
    items: [],
    expect: {
      // asking what time to remind them is fair: a reminder needs one, and Sunday has a flight
      askOrRows: true,
      rows: 1,
      row: (c) => c.op === 'add' && c.type === 'todo' && c.fields?.day === '2026-10-04',
    },
  },
  {
    id: 'weekly-habit',
    kind: 'A new habit',
    text: 'I want to set a weekly habit, on a Saturday, to call my Mum',
    items: [],
    expect: { rows: 1, row: (c) => c.op === 'add' && c.type === 'habit' },
  },
  {
    id: 'mexico-note',
    kind: 'Add to a note',
    text: 'Add to the Mexico note: look at the Oaxaca to Puerto Escondido flight instead of the bus',
    items: [
      {
        id: 'mex',
        kind: 'note',
        title: 'Mexico trip ideas',
        body: 'Mexico City, Oaxaca, Puerto Escondido. The bus from Oaxaca to the coast takes nine hours.',
      },
    ],
    expect: {
      rows: 1,
      // the line added and nothing replaced: an append, or a full text that keeps the old line
      row: (c) => {
        if (c.op !== 'change' || c.id !== 'mex') return false;
        const text = c.fields?.text ?? c.fields?.body;
        const flight = (t) => /fl(y|ight)/i.test(t) && /Puerto Escondido/i.test(t);
        if (text && typeof text === 'object' && 'add' in text) return flight(String(text.add));
        const all = JSON.stringify(c.fields || {});
        return flight(all) && /bus from Oaxaca to the coast/i.test(all);
      },
    },
  },
  {
    id: 'accept-offer',
    kind: "Accept Gremly's offer",
    history: [
      { role: 'user', content: "I'm slammed today" },
      { role: 'assistant', content: 'That sounds like a lot. Want me to move Finish the pitch slides to Wednesday?' },
    ],
    text: 'Yes',
    items: [{ id: 'slides', kind: 'todo', title: 'Finish the pitch slides', due_day: '2026-10-03' }],
    expect: { rows: 1, row: (c) => c.op === 'change' && c.id === 'slides' && c.fields?.day === '2026-10-07' },
  },
  {
    id: 'did-it-go-through',
    kind: 'Follow up',
    history: [
      { role: 'user', content: 'When am I calling the plumber?' },
      { role: 'assistant', content: 'Call the Plumber is on Wednesday.' },
      { role: 'user', content: 'Can we do it Thursday instead?' },
      { role: 'assistant', content: 'Should we move that to Thursday for you?' },
    ],
    text: 'Did that go through?',
    items: [{ id: 'plumber', kind: 'todo', title: 'Call the Plumber', due_day: '2026-10-07' }],
    expect: {
      // nothing has changed yet: it was only offered
      notSaid: /^\s*yes\b|\bwent through\b/i,
      rows: 1,
      row: (c) => c.op === 'change' && c.id === 'plumber' && c.fields?.day === '2026-10-08',
    },
  },
  {
    id: 'hulu-and-sister',
    kind: 'Several asks',
    text: "I keep forgetting to cancel that Hulu subscription and it's driving me crazy. Also I need to figure out what to do when my sister and her family visit in a couple weeks and I haven't even started thinking about it",
    items: [],
    expect: { minRows: 1, some: (c) => c.op === 'add' && /hulu/i.test(c.title || '') },
  },
  {
    id: 'busy-week',
    kind: 'Look ahead',
    text: 'Do I have a busy week coming up?',
    items: [],
    expect: { rows: 0, mentions: /monday|tuesday|wednesday|thursday/i },
  },
  {
    id: 'proud-lately',
    kind: 'Look back',
    text: 'What have i been proud of lately?',
    items: [],
    memories: [
      {
        source: 'journal',
        about_date: '2026-09-28',
        title: 'Launch shipped',
        body: 'Proud of getting the new app version out after weeks of work.',
      },
      { source: 'win', about_date: '2026-10-01', title: 'First 10k since summer', body: 'Ran 10k for the first time since the summer.' },
    ],
    expect: { rows: 0, mentions: /brief|10k/i },
  },
  {
    id: 'exercise',
    kind: 'A feeling with a task in it',
    history: [
      { role: 'user', content: 'What do you think it is?' },
      {
        role: 'assistant',
        content: "I'd guess it's the week catching up with you, with family in town and a launch coming.",
      },
    ],
    text: 'Need to get back into exercise whilst I have family in town and a lot on my plate',
    items: [{ id: 'run', kind: 'habit', title: 'Run 3 Times A Week' }],
    expect: { maxRows: 1 },
  },
  {
    id: 'car-insurance',
    kind: 'Something new to keep',
    text: 'I need to renew my car insurance before it runs out next month',
    items: [],
    expect: {
      askOrRows: true,
      maxRows: 1,
      // a sensible day before next month, never the day it runs out
      row: (c) => c.op === 'add' && c.type === 'todo' && (!c.fields?.day || c.fields.day < '2026-11-01'),
    },
  },
];

/** The calendar for the week ahead, for the preload (context/weekAhead.js). */
export const WEEK = {
  timed: [
    ['2026-10-04T22:56:00Z', '2026-10-05T00:38:00Z', 'Flight to Denver'],
    ['2026-10-05T15:00:00Z', '2026-10-05T15:30:00Z', 'Team huddle'],
    ['2026-10-06T15:30:00Z', '2026-10-06T16:30:00Z', 'Client weekly status'],
    ['2026-10-06T17:00:00Z', '2026-10-06T17:30:00Z', 'Weekly analytics review'],
    ['2026-10-07T15:00:00Z', '2026-10-07T15:30:00Z', 'Media status'],
    ['2026-10-07T17:00:00Z', '2026-10-07T17:45:00Z', 'Social status'],
    ['2026-10-07T19:00:00Z', '2026-10-07T19:30:00Z', '1:1 with Priya'],
    ['2026-10-08T02:00:00Z', '2026-10-08T03:00:00Z', 'Concert with friends'],
    ['2026-10-08T14:00:00Z', '2026-10-08T15:00:00Z', 'Agency weekly meeting'],
    ['2026-10-08T16:30:00Z', '2026-10-08T17:00:00Z', 'Leadership weekly'],
  ],
  allDay: [['2026-10-09T00:00:00Z', '2026-10-10T23:59:59Z', 'Office closed']],
};
