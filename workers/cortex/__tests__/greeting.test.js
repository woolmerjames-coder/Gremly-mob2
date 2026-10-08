/**
 * @jest-environment node
 *
 * Gremly's line on Chat's fresh home: what it may draw on, and the hour.
 */
import { greetingFacts, greetingPrompt, partOfDay } from '../greeting.js';

const focus = {
  lifeMoment: 'Anniversary weekend in San Diego',
  briefHeadline: 'In San Diego for anniversary weekend with Dave.',
  namedAnchors: [
    { type: 'person', label: 'Dave' },
    { type: 'place', label: 'San Diego' },
  ],
  leadStory: { what: 'Anniversary weekend with Dave', why_today: 'It runs through Sunday.' },
};

test('the facts: the day, its people, what is still to come, what waits in the app', () => {
  const facts = greetingFacts({
    focus,
    laterToday: ['3:56pm Flight to San Francisco'],
    briefUnread: true,
    toDecide: 3,
  });
  expect(facts).toEqual([
    'Where their life is: Anniversary weekend in San Diego',
    'Today in a line: In San Diego for anniversary weekend with Dave.',
    'What matters most today: Anniversary weekend with Dave. It runs through Sunday.',
    'People in their day: Dave',
    'Still to come today: 3:56pm Flight to San Francisco',
    "Today's brief is written and waiting for them, not read yet.",
    '3 things wait for a decision before the day closes.',
  ]);
  expect(greetingFacts({ focus: null })).toEqual([]);
  expect(greetingFacts({ focus: null, toDecide: 1 })).toEqual([
    '1 thing waits for a decision before the day closes.',
  ]);
});

test("Gremly's questions, only while the way into them shows, and whether one needs an answer", () => {
  expect(greetingFacts({ focus: null, questions: { count: 3, needs: 1 } })).toEqual([
    'Gremly has 3 questions for them about things it is unsure of, waiting in the app; one is about something Gremly would rather get right.',
  ]);
  expect(greetingFacts({ focus: null, questions: { count: 4, needs: 0 } })).toEqual([
    'Gremly has 4 questions for them about things it is unsure of, waiting in the app.',
  ]);
  expect(greetingFacts({ focus: null, questions: null })).toEqual([]);
  expect(greetingFacts({ focus: null, questions: { count: 0, needs: 0 } })).toEqual([]);
});

test('the prompt names the hour and says when nothing is known', () => {
  const p = greetingPrompt({ timeStr: '8:45 PM', dayStr: 'Saturday', hour: 20, facts: [] });
  expect(p).toContain('It is 8:45 PM on Saturday, the evening where they are.');
  expect(p).toContain('Gremly knows nothing particular about today yet.');
  expect(partOfDay(2)).toBe('the middle of the night');
  expect(partOfDay(9)).toBe('the morning');
  expect(partOfDay(14)).toBe('the afternoon');
  expect(partOfDay(23)).toBe('late in the evening');
});
