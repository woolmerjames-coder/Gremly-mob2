import { ageFacts, agePrompt, readAgeWords, writeAgeWords, MAX_WORDS } from '../words.js';

const DAYS = [
  {
    day: '2026-10-02',
    dropped: ['Send Ana the Harlow deck'],
    done: ['Send Ana the Harlow deck before 5'],
    habits: ['Run'],
  },
  {
    day: '2026-10-04',
    dropped: ['Book the dentist'],
    done: ['Book the dentist for Thursday'],
    habits: [],
  },
  { day: '2026-10-05', dropped: [], done: [], habits: ['Run'] },
];

describe('age words', () => {
  it('lays the three days out oldest first, with what each held', () => {
    const facts = ageFacts([DAYS[2], DAYS[0], DAYS[1]]);
    expect(facts).toHaveLength(3);
    expect(facts[0].startsWith('2026-10-02')).toBe(true);
    expect(facts[0]).toContain('Todos they finished: Send Ana the Harlow deck before 5.');
    expect(facts[0]).toContain('Habits they logged: Run.');
    expect(facts[2]).toContain('Habits they logged: Run.');
    expect(facts[2]).not.toContain('Todos');
  });

  it('a day with nothing says so, and the prompt carries the rules without examples', () => {
    const facts = ageFacts([{ day: '2026-10-01', dropped: [], done: [], habits: [] }]);
    expect(facts[0]).toContain('Nothing is recorded for this day beyond feeding Gremly.');
    const p = agePrompt({
      person: { first_name: 'Sam', pronouns: null, identity: {} },
      days: DAYS,
      age: 7,
    });
    expect(p.system).toContain('Their first name is Sam.');
    expect(p.system).toContain('glanceable line');
    expect(p.user).toContain('age 7');
    expect(p.user).toContain(`at most ${MAX_WORDS} words`);
    expect(p.user).not.toMatch(/for example|e\.g\./i);
    expect(p.user + p.system).not.toMatch(/—/);
  });

  it('reads one clean sentence and leaves the close to the app', () => {
    expect(
      readAgeWords('"The Harlow deck went out, the dentist got booked, and you ran twice."'),
    ).toBe('The Harlow deck went out, the dentist got booked, and you ran twice.');
    expect(readAgeWords('You got the deck out and ran twice. I’m made of that.')).toBe(
      'You got the deck out and ran twice.',
    );
    expect(readAgeWords('You sent the deck — then ran twice')).toBe(
      'You sent the deck, then ran twice.',
    );
    expect(readAgeWords('Two sentences here. And a second one.')).toBe('Two sentences here.');
    expect(readAgeWords('')).toBeNull();
    expect(readAgeWords('Nope')).toBeNull();
    const long = Array.from({ length: MAX_WORDS + 10 }, () => 'word').join(' ') + '.';
    expect(readAgeWords(long)).toBeNull();
  });

  it('writes the line through the helper and returns the days it read', async () => {
    const helperFetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'The Harlow deck went out and you ran twice.' } }],
      }),
    }));
    const out = await writeAgeWords({
      env: {},
      userId: 'u1',
      tz: 'America/Los_Angeles',
      body: { age: 7 },
      deps: {
        fedDays: DAYS.map((d) => d.day),
        days: DAYS,
        dayEndHour: 3,
        person: { first_name: null },
        helperFetch,
      },
    });
    expect(out).toEqual({
      line: 'The Harlow deck went out and you ran twice.',
      days: ['2026-10-02', '2026-10-04', '2026-10-05'],
    });
    expect(helperFetch).toHaveBeenCalledWith(
      'age_words',
      expect.objectContaining({ max_tokens: 120 }),
    );
    const failed = await writeAgeWords({
      env: {},
      userId: 'u1',
      tz: 'UTC',
      body: {},
      deps: { fedDays: [], helperFetch },
    });
    expect(failed).toBeNull();
  });
});
