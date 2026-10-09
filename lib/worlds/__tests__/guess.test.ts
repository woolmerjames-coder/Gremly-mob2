/**
 * Gremly's guesses for a Chapter started by hand, as the sheet takes them:
 * only a World they see, their own things, and a Gremly the app can show.
 */
import { guessChapter } from '../guess';
import { callChapterGuess } from '../../cortex/CortexClient';

jest.mock('../../cortex/CortexClient', () => ({ callChapterGuess: jest.fn() }));

const reply = (data: object) => ({ ok: true, data: { guessed: true, ...data } });

it('keeps a World they see, real days, a Gremly it can show and their things', async () => {
  (callChapterGuess as jest.Mock).mockResolvedValue(
    reply({
      title: 'Porto trip',
      world_id: 'w1',
      new_world: { name: 'Ignored', gremly: 'x' },
      start_date: '2027-03-02',
      end_date: 'March',
      gremly: 'beach_gremly',
      items: [{ type: 'todo', id: 't1' }, { type: 'fact', id: 'f1' }, { type: 'note' }],
    }),
  );
  expect(await guessChapter('  Porto   trip ', '2026-10-08', ['w1'])).toEqual({
    title: 'Porto trip',
    worldId: 'w1',
    newWorld: null,
    startDate: '2027-03-02',
    endDate: null,
    gremly: 'beach_gremly',
    items: [{ type: 'todo', id: 't1' }],
  });
  expect(callChapterGuess).toHaveBeenCalledWith({ line: 'Porto trip', today: '2026-10-08' });
});

it('a World that is not one they see becomes a new one only when Gremly offered one', async () => {
  (callChapterGuess as jest.Mock).mockResolvedValue(
    reply({
      title: 'Learn Spanish',
      world_id: 'gone',
      new_world: { name: 'Learning', gremly: 'nope' },
      gremly: 'nope',
    }),
  );
  expect(await guessChapter('Learn Spanish', '2026-10-08', ['w1'])).toMatchObject({
    worldId: null,
    newWorld: { name: 'Learning', gremly: 'gremly-mascot' },
    gremly: null,
  });
});

it('no guess when there is none in time, the call fails, or there is no line', async () => {
  (callChapterGuess as jest.Mock).mockResolvedValueOnce({ ok: true, data: { guessed: false } });
  expect(await guessChapter('x', '2026-10-08', [])).toBeNull();
  (callChapterGuess as jest.Mock).mockResolvedValueOnce({ ok: false, error: 'offline' });
  expect(await guessChapter('x', '2026-10-08', [])).toBeNull();
  expect(await guessChapter('  ', '2026-10-08', [])).toBeNull();
});
