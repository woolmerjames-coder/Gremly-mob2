/**
 * @jest-environment node
 */
// Gremly's own words in the evening wrap up (workers/cortex/wrap/words.js):
// what he is told for each moment, and what the app is given back.

import {
  factsFrom,
  gremlyState,
  lifeNowWords,
  readWrapWords,
  storyTail,
  timeWords,
  wrapPrompt,
  writeWrapWords,
} from '../words.js';
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
  card_titles: ['Book the car service', 'Renew the passport'],
  can_plan: true,
  tonight: {
    decisions: [{ title: 'Book the car service', outcome: 'kept for tomorrow' }],
    journal: 'written',
    path: 'cards',
  },
  next: {
    meetings: ['11:00 AM Board review'],
    lined: ['Book the car service'],
    todos: ['Book the car service', 'Email the caterer'],
    todo_count: 2,
  },
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
    expect(p.user).toContain(
      'WAITING IN THE CARDS (3)\nBook the car service; Renew the passport; and 1 more.',
    );
    // the cards bring up what is in them, so his words leave it out
    expect(p.system).toContain('Leave those things out of your words entirely');
    // the wrap up so far is for the moments after the opening
    expect(p.user).not.toContain('THE WRAP UP SO FAR');
  });

  it('closes with what was sorted and what the next day holds, every todo counted', () => {
    const p = wrapPrompt(factsFrom({ ...BODY, moment: 'close' }), {});
    expect(p.user).toContain(
      'Sorted in the cards tonight: Book the car service (kept for tomorrow).',
    );
    expect(p.user).toContain('They wrote in their journal tonight.');
    expect(p.user).toContain('On their calendar tomorrow: 11:00 AM Board review.');
    expect(p.user).toContain(
      'Todos planned for tomorrow (2): Book the car service; Email the caterer.',
    );
    expect(p.user).toContain('Moved there tonight in the cards: Book the car service.');
    expect(p.user).toContain('A button under your words offers to plan tomorrow with them now.');
    // the end of their day: closed out, rest next, tomorrow in one short mention
    expect(p.system).toContain('turn them toward rest, which is what comes next');
    expect(p.system).toContain('always with the number of todos when there are more than a few');
    expect(p.system).toContain('so say nothing about planning');
    expect(p.system).toContain('Say no goodbye or goodnight');
  });

  it('counts more todos than it lists, and says when the next day is already planned', () => {
    const many = Array.from({ length: 15 }, (_, i) => `Todo ${i + 1}`);
    const p = wrapPrompt(
      factsFrom({
        ...BODY,
        moment: 'close',
        can_plan: false,
        next: { meetings: [], lined: [], todos: many, todo_count: 49 },
      }),
      {},
    );
    expect(p.user).toContain('Todos planned for tomorrow (49): Todo 1;');
    expect(p.user).toContain('Todo 15; and 34 more.');
    expect(p.user).toContain('A plan for tomorrow is already in the thread.');
    expect(p.system).not.toContain('A button under your words');
  });

  it('from an app that sends no count, says only what moved there tonight', () => {
    const p = wrapPrompt(
      factsFrom({
        ...BODY,
        moment: 'close',
        can_plan: undefined,
        next: { meetings: [], lined: ['Book the car service'] },
      }),
      {},
    );
    expect(p.user).toContain('Todos moved to tomorrow tonight: Book the car service.');
    expect(p.user).not.toContain('No todos are planned');
    expect(p.user).not.toContain('A button under your words');
  });

  it('asks the journal question about the day as a whole, never one event in it', () => {
    const p = wrapPrompt(factsFrom({ ...BODY, moment: 'journal_ask' }), {});
    expect(p.system).toContain('never names or builds on one event, item, place or person from it');
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

  it('reacts to the cards in his words, naming no item, and to letting go only when something was', () => {
    const p = wrapPrompt(factsFrom({ ...BODY, moment: 'sorted' }), {});
    expect(p.system).toContain('name no item and recite no count');
    expect(p.system).toContain('Nothing was let go tonight');
    expect(p.user).toContain('THE WRAP UP SO FAR');
    const freed = wrapPrompt(
      factsFrom({
        ...BODY,
        moment: 'sorted',
        tonight: { decisions: [{ title: 'Old idea', outcome: 'let go' }], path: 'cards' },
      }),
      {},
    );
    expect(freed.system).toContain('Letting something go is a choice that frees them');
  });

  it('reacts to the habits alone, told plainly which held and which did not, and a run of days', () => {
    const p = wrapPrompt(
      factsFrom({
        ...BODY,
        moment: 'habits',
        tonight: {
          logged: ['Stretch'],
          held: ['No coffee'],
          not_held: ['No sugar'],
          streak: { title: 'Stretch', days: 5 },
          path: 'cards',
        },
      }),
      {},
    );
    expect(p.system).toContain('reaction to their habits alone');
    expect(p.user).toContain('Habits checked in during the wrap up: Stretch.');
    expect(p.user).toContain(
      'Habits they are giving up that they kept off today, which went well: No coffee.',
    );
    expect(p.user).toContain(
      'Habits they are giving up that they did not keep off today: No sugar.',
    );
    expect(p.user).toContain('Stretch now has a run of 5 days.');
  });

  it('says goodnight knowing the next day and what he already said, never going over it again', () => {
    const p = wrapPrompt(
      factsFrom({ ...BODY, moment: 'night', said: ['A full day.', 'Wednesday is wrapped up.'] }),
      {},
    );
    expect(p.system).toContain("Write Gremly's goodnight");
    expect(p.user).toContain('THEIR NEXT DAY');
    expect(p.user).toContain(
      'WHAT GREMLY HAS SAID SO FAR, IN ORDER\n- A full day.\n- Wednesday is wrapped up.',
    );
    const early = wrapPrompt(factsFrom({ ...BODY, moment: 'night', part: 'early' }), {});
    expect(early.system).toContain('goodbye for now, for the rest of their day');
    // the opening is the first thing he says
    const open = wrapPrompt(factsFrom({ ...BODY, said: ['Earlier.'] }), {});
    expect(open.user).not.toContain('WHAT GREMLY HAS SAID SO FAR');
  });

  it('is told their life now and himself, and the journal question is told neither the day picture nor travel', () => {
    const life = 'Training for a half marathon in November.';
    const gremly = { age: 61, tier: 'Sage', nature: 'Warm, steady.', fed_today: true };
    const open = wrapPrompt(factsFrom({ ...BODY, gremly }), { dco: DCO, life });
    expect(open.user).toContain(`THEIR LIFE NOW\n${life}`);
    expect(open.user).toContain(
      'GREMLY HIMSELF\nGremly is age 61, at his Sage stage. His nature at this stage: Warm, steady. He is fed for today.',
    );
    expect(open.system).toContain('his nature at his stage colors how he speaks');
    const ask = wrapPrompt(factsFrom({ ...BODY, moment: 'journal_ask', travel: 'flying home' }), {
      dco: DCO,
      life,
    });
    expect(ask.user).not.toContain('THEIR LIFE NOW');
    expect(ask.user).not.toContain('WHAT TODAY IS ABOUT');
    expect(ask.user).not.toContain('flying home');
    expect(gremlyState(null)).toBe('');
    expect(gremlyState({ age: 4, tier: 'Nestling', fed_today: false })).toBe(
      'Gremly is age 4, at his Nestling stage.',
    );
  });

  it('keeps no example, word list or dash in what it asks of him', () => {
    for (const moment of [
      'open',
      'journal_ask',
      'journal_reply',
      'sorted',
      'habits',
      'close',
      'night',
      'questions',
    ]) {
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
      moods: [],
    });
    // only the app's own moods, once each, two at most
    expect(
      readWrapWords(
        'journal_reply',
        '{"journal": true, "reply": "Saved.", "moods": ["Tired", "tired", "elated", "good", "calm"]}',
      ).moods,
    ).toEqual(['tired', 'good']);
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

  it('the line before his questions, when he chose any', () => {
    const f = { questions: [{ id: 'q1', question: 'A?' }] };
    expect(
      readWrapWords(
        'questions',
        JSON.stringify({ intro: 'One quick thing.', ask: [{ id: 'q1', question: 'A?' }] }),
        f,
      ),
    ).toEqual({ ask: [{ id: 'q1', question: 'A?', choices: [] }], intro: 'One quick thing.' });
    expect(readWrapWords('questions', JSON.stringify({ intro: 'Hm.', ask: [] }), f)).toEqual({
      ask: [],
    });
  });
});

describe('their life now', () => {
  it('is the end of their story, from a sentence start, and the Chapters they are in', () => {
    const story = `${'Long ago things happened. '.repeat(40)}Now they are training for a race.`;
    const tail = storyTail(story, 120);
    expect(tail.endsWith('Now they are training for a race.')).toBe(true);
    expect(tail.startsWith('Long ago') || tail.startsWith('Now')).toBe(true);
    expect(storyTail('Short.')).toBe('Short.');
    expect(
      lifeNowWords('Short story.', [
        { title: 'Training for Bay to Breakers', card_subtitle: 'Strength and swim' },
      ]),
    ).toBe('Short story.\nChapters now: Training for Bay to Breakers (Strength and swim).');
    expect(lifeNowWords('', [])).toBe('');
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
      deps: { person: { first_name: 'Alex' }, dco: DCO, life: 'Training for a race.' },
    });
    expect(out).toEqual({ line: 'A full day, and the deck went out.' });
    expect(sent).toHaveLength(1);
    expect(sent[0].body.messages[1].content).toContain('THEIR LIFE NOW\nTraining for a race.');
    expect(sent[0].url).toContain('api.openai.com');
    expect(sent[0].body.model).toBe('gpt-6-luna');
    // Luna thinks a little before writing
    expect(sent[0].body.reasoning_effort).toBe('low');
    expect(sent[0].body.messages[0].content).toContain('You are Gremly');
  });
});
