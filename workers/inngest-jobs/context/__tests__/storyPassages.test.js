/**
 * @jest-environment node
 *
 * The story records what each item was written from (workers/inngest-jobs/
 * context/story.js, applyStory): the title and body of every item it writes,
 * with the facts the item cites, under the item's own id.
 */
import { applyStory } from '../story.js';
import { db } from '../db';

jest.mock('../db', () => ({ ...jest.requireActual('../db'), db: jest.fn() }));
jest.mock('../cache', () => ({ invalidateChatCache: jest.fn(async () => ({})) }));

const refsSnapshot = [
  [
    'f1',
    {
      type: 'fact',
      id: 'fact-1',
      statement: 'Alex ran a half marathon.',
      state: 'happened',
      private: false,
    },
  ],
  [
    'f2',
    {
      type: 'fact',
      id: 'fact-2',
      statement: 'Alex trained all summer.',
      state: 'happened',
      private: false,
    },
  ],
];
const output = {
  story_so_far: 'Alex spent the summer training and ran the half marathon in October.',
  story_for_them: 'You trained all summer and ran the half marathon in October.',
  milestones: [
    {
      title: 'First half marathon',
      date: '2026-10-04',
      body: 'Alex ran a half marathon after training all summer.',
      private: false,
      fact_refs: ['f1', 'f2'],
    },
  ],
  shifts: [],
  proud_moments: [],
  patterns: [],
  people: [],
};

describe('what the story records', () => {
  it("records each item's title and body with the facts it cites", async () => {
    const calls = [];
    db.mockReturnValue({
      select: async () => [],
      update: async (path, patch) => calls.push({ op: 'update', path, patch }),
      insertQuiet: async (table, rows) => calls.push({ op: 'insert', table, rows }),
      upsert: async (table, rows, onConflict) =>
        calls.push({ op: 'upsert', table, rows, onConflict }),
    });
    const out = await applyStory({}, 'u-1', output, refsSnapshot, {
      shadow: false,
      runId: 'run',
      model: 'm',
      today: '2026-10-08',
    });
    const items = calls.find((c) => c.op === 'insert' && c.table === 'story_items').rows;
    const refs = calls.find((c) => c.op === 'upsert' && c.table === 'passage_refs').rows;
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
      for (const field of ['title', 'body']) {
        const r = refs.find((x) => x.row_id === item.id && x.field === field);
        expect(r).toMatchObject({
          user_id: 'u-1',
          surface: 'story',
          row_table: 'story_items',
          writer: 'story',
        });
        expect(r.fact_ids).toEqual(item.fact_ids);
      }
    }
    expect(out.applied.passages).toBe(items.length * 2);
  });
});
