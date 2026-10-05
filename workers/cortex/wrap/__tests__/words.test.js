/**
 * @jest-environment node
 */
// Gremly's own words in the evening wrap up (workers/cortex/wrap/words.js):
// what he is told for each moment, and what the app is given back.

import { factsFrom, readWrapWords, timeWords, wrapPrompt, writeWrapWords } from '../words.js';
import { configureModels } from '../../models.js';

const BODY = {
  moment: 'open',
  day: '2026-09-30',
  weekday: 'Wednesday',
  part: 'evening',
  clock: '8:40 PM',
  day_end: '3 AM',
  tomorrow_word: 'tomorrow',
  recap: {
    counts: { todos: 1, habits: 1, meetings: 2, drops: 3 },
    done: [
      { title: 'Send the board deck', kind: 'todo' },
      { title: 'Morning run', kind: 'habit' },
    ],
    missed: [{ id: 'm1', title: 'Book the car service' }],
    planned: { done: 4, total: 5 },
  },
  meetings: ['9:00 AM Team standup', '2:00 PM Budget review'],
  cards: 3,
  tonight: {
    decisions: [{ title: 'Book the car service', outcome: 'kept for tomorrow' }],
    journal: 'written',
    path: 'cards',
  },
  next: { meetings: ['11:00 AM Board review'], lined: ['Book the car service'] },
};

const DCO = { lead_story: { what: 'The board deck goes out', why_today: 'Thursday review.' } };

describe('what Gremly is told', () => {
  it('opens on the day: the time, what today is about, the day as the app holds it, and the cards', () => {
    const p = wrapPrompt(factsFrom(BODY), { person: { first_name: 'Alex' }, dco: DCO });
    expect(p.json).toBe(false);
    expect(p.system).toContain('You are Gremly');
    expect(p.system).toContain('Their first name is Alex.');
    expect(p.system).toContain('YOUR WORDS NOW');
    expect(p.system).toContain('After your words Gremly offers the cards');
    expect(p.user).toContain('It is 8:40 PM on Wednesday, in the evening of their day.');
    expect(p.user).toContain("WHAT TODAY IS ABOUT (Gremly's picture of their day)");
    expect(p.user).toContain('Todos they finished today: Send the board deck.');
    expect(p.user).toContain('Habits they logged today: Morning run.');
    expect(p.user).toContain('Their plan for today had 5 things, and 4 got done.');
    expect(p.user).toContain('Planned for today and not done: Book the car service.');
    expect(p.user).toContain('Waiting to be sorted in the cards: 3 things.');
    // the wrap up so far is for the moments after the opening
    expect(p.user).not.toContain('THE WRAP UP SO FAR');
  });

  it('closes with what was sorted and the shape of the next day', () => {
    const p = wrapPrompt(factsFrom({ ...BODY, moment: 'close' }), {});
    expect(p.user).toContain(
      'Sorted in the cards tonight: Book the car service (kept for tomorrow).',
    );
    expect(p.user).toContain('They wrote in their journal tonight.');
    expect(p.user).toContain('On their calendar tomorrow: 11:00 AM Board review.');
    expect(p.user).toContain('Todos lined up for tomorrow: Book the car service.');
    expect(p.system).toContain('Say no goodbye or goodnight');
  });

  it('before the evening the day is not over, and after midnight it is still their day', () => {
    expect(timeWords({ part: 'early', clock: '2:10 PM', weekday: 'Friday' })).toContain(
      'nothing you write may speak of tonight, night or sleep',
    );
    const late = timeWords({
      part: 'late',
      clock: '12:30 AM',
      weekday: 'Wednesday',
      day_end: '3 AM',
      tomorrow_word: 'Thursday',
    });
    expect(late).toContain('still Wednesday until their day ends at 3 AM');
    expect(late).toContain('Their next day is Thursday');
  });

  it('reads a journal entry with what decides whether it is one, and asks for JSON', () => {
    const p = wrapPrompt(factsFrom({ ...BODY, moment: 'journal_reply', entry: 'A long day.' }), {});
    expect(p.json).toBe(true);
    expect(p.user).toContain('THEIR ENTRY\nA long day.');
    expect(p.system).toContain('It is not a journal entry when it is addressed to Gremly');
  });

  it('lists the questions that may be asked, with the item each is about', () => {
    const p = wrapPrompt(
      factsFrom({
        ...BODY,
        moment: 'questions',
        questions: [
          {
            id: 'q1',
            question: 'Friday or Monday?',
            about: { kind: 'todo', title: 'Dentist', when: 'Fri 2 Oct' },
          },
        ],
      }),
      {},
    );
    expect(p.user).toContain('- id q1: Friday or Monday? (about their todo Dentist, Fri 2 Oct)');
    expect(p.system).toContain('Choose at most two');
  });

  it('keeps no example, word list or dash in what it asks of him', () => {
    for (const moment of ['open', 'journal_ask', 'journal_reply', 'close', 'questions']) {
      const p = wrapPrompt(factsFrom({ ...BODY, moment }), {});
      const job = p.system.slice(p.system.indexOf('YOUR'));
      expect(job).not.toMatch(/\s[-–—]\s|[–—]|for example|e\.g\./i);
    }
  });
});

describe('what the app is given back', () => {
  it('one line, without wrapping quotes', () => {
    expect(readWrapWords('open', '"A good day."\n')).toEqual({ line: 'A good day.' });
    expect(readWrapWords('close', '   ')).toBeNull();
  });

  it('a journal reply, or that it was not a journal entry', () => {
    expect(
      readWrapWords('journal_reply', '{"journal": true, "reply": "Saved, and glad."}'),
    ).toEqual({
      journal: true,
      reply: 'Saved, and glad.',
    });
    expect(readWrapWords('journal_reply', '{"journal": false, "reply": ""}')).toEqual({
      journal: false,
      reply: '',
    });
    expect(readWrapWords('journal_reply', 'not json')).toBeNull();
  });

  it('at most two questions, only ones he was given, each with short answers', () => {
    const f = {
      questions: [
        { id: 'q1', question: 'A?' },
        { id: 'q2', question: 'B?' },
        { id: 'q3', question: 'C?' },
      ],
    };
    const out = readWrapWords(
      'questions',
      JSON.stringify({
        ask: [
          { id: 'q9', question: 'Made up?' },
          { id: 'q2', question: 'B, in his words?', choices: ['Yes', 'No', 'x'.repeat(60)] },
          { id: 'q1', question: '', choices: [] },
          { id: 'q3', question: 'C?' },
        ],
      }),
      f,
    );
    expect(out).toEqual({
      ask: [
        { id: 'q2', question: 'B, in his words?', choices: ['Yes', 'No'] },
        { id: 'q1', question: 'A?', choices: [] },
      ],
    });
  });
});

describe('one moment end to end', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('asks the wrap words model and gives back his line', async () => {
    configureModels({ OPENAI_API_KEY: 'k', HELPER_MODEL: 'gpt-6-luna' });
    const sent = [];
    global.fetch = jest.fn(async (url, init) => {
      sent.push({ url: String(url), body: JSON.parse(init.body) });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'A full day, and the deck went out.' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    const out = await writeWrapWords({
      env: {},
      userId: 'u1',
      body: BODY,
      deps: { person: { first_name: 'Alex' }, dco: DCO },
    });
    expect(out).toEqual({ line: 'A full day, and the deck went out.' });
    expect(sent[0].url).toContain('api.openai.com');
    expect(sent[0].body.model).toBe('gpt-6-luna');
    expect(sent[0].body.messages[0].content).toContain('You are Gremly');
  });
});
