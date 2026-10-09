/**
 * @jest-environment node
 */
// Gremly's guesses when a Chapter is started by hand (Worlds rebuild, stage
// 3): what is read, what the model is told, and that only what is theirs and
// real is kept.

import { guessChapter, guessFrom, guessRequest, readGuessInput } from '../chapterGuess.js';

const id = (n) => `66666666-6666-4666-8666-${String(n).padStart(12, '0')}`;
const W1 = id(1);
const W2 = id(2);
const C1 = id(3);
const T1 = id(4);
const T2 = id(5);
const N1 = id(6);

function fakeDb() {
  return {
    select: async (path) => {
      const [table] = path.split('?');
      if (table === 'worlds')
        return [
          { id: W1, name: 'Travel', phase: 'active', card_subtitle: 'Trips away' },
          { id: W2, name: 'Old band', phase: 'archived' },
        ];
      if (table === 'chapters')
        return [{ id: C1, title: 'Lisbon trip', phase: 'upcoming', primary_world_id: W1 }];
      if (table === 'todos')
        return [
          { id: T1, name: 'Book flights to Porto', due_day: '2026-10-20' },
          { id: T2, name: 'Pack for Lisbon' },
        ];
      if (table === 'notes')
        return [{ id: N1, title: null, body: 'Porto: try the francesinha\nmore', subtype: 'idea' }];
      if (table === 'habits') return [];
      if (table === 'drop_chapter_links') return [{ drop_id: T2, chapter_id: C1 }];
      return [];
    },
  };
}

describe('what is read and told', () => {
  it('the Worlds they see, open Chapters, and their things in no open Chapter', async () => {
    const input = await readGuessInput(fakeDb(), 'u');
    expect(input.worlds.map((w) => w.id)).toEqual([W1]);
    expect(input.items).toEqual([
      { type: 'todo', id: T1, title: 'Book flights to Porto', due: '2026-10-20' },
      { type: 'idea', id: N1, title: 'Porto: try the francesinha', due: null },
    ]);
    const { user, refs } = guessRequest({ line: 'Porto in March', today: '2026-10-08', ...input });
    expect(user).toContain('THEIR LINE: "Porto in March"');
    expect(user).toContain('w1 | Travel | Trips away');
    expect(user).toContain('Lisbon trip | in Travel');
    expect(user).toContain('i1 | todo | Book flights to Porto | due 2026-10-20');
    expect(user).toContain('gremly-mascot | the plain Gremly');
    expect(refs.items.get('i2').id).toBe(N1);
  });
});

describe('what is kept', () => {
  const refs = {
    worlds: new Map([['w1', { id: W1, name: 'Travel' }]]),
    items: new Map([
      ['i1', { id: T1, type: 'todo' }],
      ['i2', { id: N1, type: 'idea' }],
    ]),
  };
  it('their World, their things, a Gremly that exists and days in order', () => {
    expect(
      guessFrom(
        {
          title: ' Porto  trip ',
          world: 'w1',
          start_date: '2027-03-02',
          end_date: '2027-03-05',
          gremly: 'beach_gremly',
          items: ['i1', 'i2', 'i9', 'i1'],
        },
        { line: 'Porto', refs },
      ),
    ).toMatchObject({
      title: 'Porto trip',
      world_id: W1,
      new_world: null,
      start_date: '2027-03-02',
      end_date: '2027-03-05',
      gremly: 'beach_gremly',
      items: [
        { type: 'todo', id: T1 },
        { type: 'note', id: N1 },
      ],
    });
  });

  it('a new World only when none of theirs was picked; nothing made up is kept', () => {
    const g = guessFrom(
      {
        title: '',
        world: 'w7',
        new_world: { name: 'Learning', gremly: 'made_up' },
        start_date: '2027-06-01',
        end_date: '2027-01-01',
        gremly: 'nope',
      },
      { line: 'Learn Spanish', refs },
    );
    expect(g).toMatchObject({
      title: 'Learn Spanish',
      world_id: null,
      new_world: { name: 'Learning', gremly: 'gremly-mascot' },
      start_date: null,
      end_date: null,
      gremly: null,
      items: [],
    });
    expect(
      guessFrom({ world: 'w1', new_world: { name: 'X' } }, { line: 'a', refs }).new_world,
    ).toBeNull();
  });
});

describe('the guess', () => {
  const answer = (o) => async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(o) } }] }),
  });

  it('asks the helper once and hands back the guess', async () => {
    const helperFetch = jest.fn(answer({ title: 'Porto trip', world: 'w1', items: ['i1'] }));
    const g = await guessChapter(
      {},
      'u',
      { line: 'Porto trip', today: '2026-10-08' },
      { db: fakeDb(), helperFetch },
    );
    expect(helperFetch.mock.calls[0][0]).toBe('chapter_guess');
    expect(g).toMatchObject({
      guessed: true,
      title: 'Porto trip',
      world_id: W1,
      items: [{ type: 'todo', id: T1 }],
    });
  });

  it('no guess without a line, or when the helper fails or is slow, and never throws', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await guessChapter({}, 'u', { line: ' ' }, { db: fakeDb() })).toEqual({
      guessed: false,
    });
    expect(
      await guessChapter(
        {},
        'u',
        { line: 'x' },
        { db: fakeDb(), helperFetch: async () => ({ ok: false }) },
      ),
    ).toEqual({ guessed: false });
    const boom = async () => {
      throw new Error('down');
    };
    expect(await guessChapter({}, 'u', { line: 'x' }, { db: fakeDb(), helperFetch: boom })).toEqual(
      { guessed: false },
    );
    const slow = () => new Promise(() => {});
    expect(
      await guessChapter({}, 'u', { line: 'x' }, { db: fakeDb(), helperFetch: slow, waitMs: 5 }),
    ).toMatchObject({ guessed: false, late: true });
    warn.mockRestore();
  });
});
