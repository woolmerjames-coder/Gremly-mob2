/**
 * @jest-environment node
 *
 * The story records what each item was written from (workers/inngest-jobs/
 * context/story.js, applyStory): the title and body of every item it writes,
 * with the facts the item cites, under the item's own id. Every item's body
 * goes through the check first (data fabric stage 6). Made up records only.
 */
import { applyStory, checkStory } from '../story.js';
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
      stated: [],
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
      select: async (path) =>
        path.startsWith('life_facts_now?')
          ? [
              { id: 'fact-1', statement: 'Alex ran a half marathon.', state: 'happened', observed_at: '2026-10-04' },
              { id: 'fact-2', statement: 'Alex trained all summer.', state: 'happened', observed_at: '2026-09-01' },
            ]
          : [],
      update: async (path, patch) => calls.push({ op: 'update', path, patch }),
      insertQuiet: async (table, rows) => calls.push({ op: 'insert', table, rows }),
      upsert: async (table, rows, onConflict) =>
        calls.push({ op: 'upsert', table, rows, onConflict }),
      remove: async (path) => calls.push({ op: 'remove', path }),
    });
    const out = await applyStory({}, 'u-1', output, refsSnapshot, {
      shadow: false,
      runId: 'run',
      model: 'm',
      today: '2026-10-08',
      calls: { ask: async () => ({ not_held: false, what: null }), rewrite: async () => null },
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
    // a retry starts clean: this run's items go before it writes them
    const cleanAt = calls.findIndex(
      (c) => c.op === 'remove' && c.path === 'story_items?user_id=eq.u-1&run_id=eq.run',
    );
    const insertAt = calls.findIndex((c) => c.op === 'insert' && c.table === 'story_items');
    expect(cleanAt).toBeGreaterThan(-1);
    expect(cleanAt).toBeLessThan(insertAt);
  });
});

const rec = (ref, label, dates = []) => [ref, { ref, label: `${ref} | ${label}`, dates }];

describe('the story through the check', () => {
  const records = new Map([
    rec('f1', 'happened | 2026-09-12 | They moved into the flat on Elm Road.', ['2026-09-12']),
    rec('f2', 'happened | 2026-07-01 | They started at the bakery.', ['2026-07-01']),
    rec('f3', 'current | no date | They bake bread every Sunday.'),
  ]);
  const story = {
    story_so_far: 'x',
    story_for_them: 'y',
    milestones: [
      { title: 'A new home', body: 'They moved into the flat on Elm Road in September.', fact_refs: ['f1'], stated: [{ kind: 'date', value: '2026-09-12', ref: 'f1' }] },
      { title: 'The bakery', body: 'They started at the bakery in June 2026.', fact_refs: ['f2'], stated: [{ kind: 'date', value: '2026-06-01', ref: 'f2' }] },
    ],
    shifts: [],
    proud_moments: [],
    patterns: [{ kind: 'rhythm', title: 'Sunday bread', body: 'Sunday is for baking bread, every week for 3 years.', fact_refs: ['f3'], stated: [] }],
    people: [],
  };

  it('keeps a body that holds, writes one again that does not, and leaves out one still wrong', async () => {
    const asked = [];
    const out = await checkStory({
      output: story,
      records,
      today: '2026-10-08',
      person: null,
      ask: async (req) => {
        asked.push(req.user);
        return { not_held: /June/.test(req.user), what: /June/.test(req.user) ? 'the month' : null };
      },
      // the bakery is written again from its own fact; the pattern cannot be put right
      rewrite: async ({ key, records: own, problems }) => {
        expect(own.map((r) => r.ref)).toEqual(key.startsWith('milestones') ? ['f2'] : ['f3']);
        expect(problems.length).toBeGreaterThan(0);
        return key === 'milestones.1'
          ? { text: 'They started at the bakery in July 2026.', refs: ['f2'], stated: [{ kind: 'date', value: '2026-07-01', ref: 'f2' }] }
          : { text: 'Sunday is for baking bread, for 3 years now.', refs: ['f3'], stated: [] };
      },
    });
    expect(out.output.milestones.map((m) => m.body)).toEqual([
      'They moved into the flat on Elm Road in September.',
      'They started at the bakery in July 2026.',
    ]);
    // a number in its words that no fact holds, even written again: the item goes
    expect(out.output.patterns).toEqual([]);
    expect(out.left_out).toEqual([{ list: 'patterns', title: 'Sunday bread' }]);
    expect(out.counts).toMatchObject({ checked: 3, sent_back: 2, left_out: 1 });
    // the story is read on any day, where they open it on purpose
    expect(asked[0]).toContain('kept in their story');
  });
});
