/**
 * @jest-environment node
 *
 * A new person's first story runs before their Life Map row exists. Once the
 * row is made, the story already written is copied in, with no model call.
 * The database is replaced; the person and their story are made up.
 */
import { compactStory, copyStoryIntoLifeMap } from '../story';
import { db } from '../db';
import { invalidateChatCache } from '../cache';

jest.mock('../db', () => ({ ...jest.requireActual('../db'), db: jest.fn() }));
jest.mock('../llm', () => ({
  jsonCall: jest.fn(),
  modelFor: jest.fn(),
  anthropicJsonParams: jest.fn(),
}));
jest.mock('../cache', () => ({ invalidateChatCache: jest.fn(() => Promise.resolve()) }));

const USER = '0b7c6f0e-1d2a-4c3b-9e8f-aaaaaaaaaaaa';
const items = [
  {
    kind: 'milestone',
    title: 'Moved to Leeds',
    body: 'A new flat.',
    period_start: '2026-08-01',
    period_end: null,
    private: false,
  },
  {
    kind: 'person',
    title: 'Robin',
    body: 'A close friend from work.',
    period_start: null,
    period_end: null,
    private: false,
  },
  {
    kind: 'pattern',
    pattern_kind: 'often',
    title: 'Long walks',
    body: 'Most weekends.',
    period_start: null,
    period_end: null,
    private: true,
  },
];
const run = {
  id: 'run-1',
  applied_at: '2026-10-05T09:04:09.000Z',
  output: {
    story_so_far: 'Gremly has known them for a month.',
    story_for_them: 'You moved this summer.',
  },
};

function fakeDb({ lifeMap, runs = [run], story = items }) {
  const updates = [];
  db.mockReturnValue({
    select: jest.fn(async (path) => {
      if (path.startsWith('user_life_map')) return lifeMap ? [lifeMap] : [];
      if (path.startsWith('synthesis_runs')) return runs;
      if (path.startsWith('story_items')) return story;
      return [];
    }),
    update: jest.fn(async (path, patch) => {
      updates.push({ path, patch });
      return [];
    }),
  });
  return updates;
}

beforeEach(() => jest.clearAllMocks());

describe('compactStory', () => {
  it('copies the passages and sorts the items by kind, writing nothing of its own', () => {
    const s = compactStory(items, run.output, run.applied_at);
    expect(s.story_so_far).toBe('Gremly has known them for a month.');
    expect(s.story_for_them).toBe('You moved this summer.');
    expect(s.milestones).toEqual([
      {
        title: 'Moved to Leeds',
        body: 'A new flat.',
        from: '2026-08-01',
        to: null,
        private: false,
      },
    ]);
    expect(s.people.map((p) => p.title)).toEqual(['Robin']);
    expect(s.patterns[0]).toMatchObject({ title: 'Long walks', kind: 'often', private: true });
    expect(s.shifts).toEqual([]);
    expect(s.written_at).toBe(run.applied_at);
  });
});

describe('copyStoryIntoLifeMap', () => {
  it('copies the story into a Life Map made after the story ran', async () => {
    const updates = fakeDb({
      lifeMap: { id: 'lm-1', life_map: { domains: [{ name: 'Home', threads: [] }] } },
    });
    const out = await copyStoryIntoLifeMap({}, USER);
    expect(out).toEqual({ copied: true, run_id: 'run-1', items: 3 });
    expect(updates).toHaveLength(1);
    expect(updates[0].path).toBe('user_life_map?id=eq.lm-1');
    expect(updates[0].patch.life_map.domains).toEqual([{ name: 'Home', threads: [] }]);
    expect(updates[0].patch.life_map.story.story_for_them).toBe('You moved this summer.');
    expect(invalidateChatCache).toHaveBeenCalledWith({}, USER);
  });

  it('leaves a Life Map that already has a story alone', async () => {
    const updates = fakeDb({
      lifeMap: { id: 'lm-1', life_map: { story: { story_for_them: 'Already there.' } } },
    });
    expect(await copyStoryIntoLifeMap({}, USER)).toEqual({
      copied: false,
      reason: 'already there',
    });
    expect(updates).toHaveLength(0);
  });

  it('does nothing with no Life Map row, or no story yet', async () => {
    let updates = fakeDb({ lifeMap: null });
    expect(await copyStoryIntoLifeMap({}, USER)).toEqual({ copied: false, reason: 'no life map' });
    expect(updates).toHaveLength(0);
    updates = fakeDb({ lifeMap: { id: 'lm-1', life_map: {} }, runs: [], story: [] });
    expect(await copyStoryIntoLifeMap({}, USER)).toEqual({ copied: false, reason: 'no story yet' });
    expect(updates).toHaveLength(0);
  });
});
