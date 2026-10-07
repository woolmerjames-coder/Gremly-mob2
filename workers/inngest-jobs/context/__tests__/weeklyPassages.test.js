/**
 * @jest-environment node
 *
 * The weekly pass records what its words rest on (workers/inngest-jobs/
 * context/weekly.js, applyWeekly): each Life Map thread with the facts in its
 * evidence, and each World and Chapter field it writes with the facts it
 * cites. A field the person wrote is never written, so it is never recorded.
 */
import { applyWeekly } from '../weekly.js';
import { db, personIdentity } from '../db';

jest.mock('../db', () => ({
  ...jest.requireActual('../db'),
  db: jest.fn(),
  personIdentity: jest.fn(async () => ({ first_name: 'Alex', identity: {} })),
}));
jest.mock('../cache', () => ({ invalidateChatCache: jest.fn(async () => ({})) }));

const USER = 'u-1';
const refsSnapshot = [
  [
    'f1',
    {
      type: 'fact',
      id: 'fact-1',
      statement: 'Alex is training for a half marathon.',
      state: 'current',
      private: false,
      about_date: '2026-10-01',
      observed_at: '2026-10-01T10:00:00Z',
    },
  ],
  [
    'f2',
    {
      type: 'fact',
      id: 'fact-2',
      statement: 'Alex runs three times a week.',
      state: 'current',
      private: false,
      about_date: null,
      observed_at: '2026-10-02T10:00:00Z',
    },
  ],
  ['w1', { type: 'world', id: 'world-1' }],
  ['w2', { type: 'world', id: 'world-2' }],
  ['c1', { type: 'chapter', id: 'chapter-1' }],
];
const output = {
  life_map: {
    domains: [
      {
        name: 'Running',
        attention: 'high',
        threads: [
          {
            name: 'Half marathon',
            status: 'active',
            momentum: 'building',
            lifecycle: 'active',
            importance: 'high',
            attention: 'high',
            last_activity: '2026-10-02',
            summary: 'Alex is training for a half marathon and running three times a week.',
            recent_update: 'Three runs this week.',
            fact_refs: ['f1', 'f2'],
          },
        ],
      },
    ],
  },
  profile_text:
    'Alex works in client services and is training for a half marathon this autumn, running three times a week with a plan they chose themselves.',
  worlds: [
    {
      world_ref: 'w1',
      phase: 'active',
      card_subtitle: 'Training for the half',
      summary: 'Alex is building up to a half marathon.',
      key_priorities: [],
      card_fact_refs: ['f1'],
    },
    {
      world_ref: 'w2',
      phase: 'active',
      card_subtitle: 'Running every week',
      summary: 'Alex runs three times a week now.',
      key_priorities: [],
      card_fact_refs: ['f2'],
    },
  ],
  worlds_summary: { headline: null, featured: [] },
  chapters: [
    {
      chapter_ref: 'c1',
      card_subtitle: 'Building up to race day',
      summary: 'Alex is training for a half marathon this autumn.',
      epigraph: null,
      key_priorities: [],
      card_fact_refs: ['f1', 'f2'],
    },
  ],
  questions: [],
};

function fakeDb() {
  const calls = [];
  db.mockReturnValue({
    select: async (path) => {
      calls.push({ op: 'select', path });
      if (path.startsWith('user_life_map'))
        return [{ id: 'lm-1', life_map: { domains: [] }, version: 3 }];
      if (path.startsWith('worlds'))
        return [
          { id: 'world-1', card_subtitle_source: 'synthesis', summary_source: 'synthesis' },
          // the person wrote this one's card line
          { id: 'world-2', card_subtitle_source: 'user', summary_source: 'synthesis' },
        ];
      if (path.startsWith('chapters'))
        return [
          {
            id: 'chapter-1',
            phase: 'active',
            title: 'Race season',
            title_source: 'user',
            card_subtitle_source: 'synthesis',
            summary_source: 'synthesis',
            epigraph_source: 'synthesis',
          },
        ];
      if (path.startsWith('user_profiles')) return [{ user_id: USER, signals: {} }];
      return [];
    },
    update: async (path, patch) => calls.push({ op: 'update', path, patch }),
    insertQuiet: async (table, rows) => calls.push({ op: 'insert', table, rows }),
    remove: async (path) => calls.push({ op: 'remove', path }),
    upsert: async (table, rows, onConflict) =>
      calls.push({ op: 'upsert', table, rows, onConflict }),
  });
  return calls;
}

describe('what the weekly pass records', () => {
  it("records each thread with its evidence, and only the fields it wrote, after clearing the map's old records", async () => {
    const calls = fakeDb();
    const out = await applyWeekly({}, USER, output, refsSnapshot, {
      shadow: false,
      runId: 'run',
      today: '2026-10-08',
    });
    const removeAt = calls.findIndex(
      (c) =>
        c.op === 'remove' &&
        c.path.startsWith('passage_refs?user_id=eq.u-1&row_table=eq.user_life_map'),
    );
    // the epigraph it cleared no longer rests on anything
    expect(
      calls.some(
        (c) =>
          c.op === 'remove' &&
          c.path ===
            'passage_refs?user_id=eq.u-1&row_table=eq.chapters&row_id=eq.chapter-1&field=eq.epigraph',
      ),
    ).toBe(true);
    const upsertAt = calls.findIndex((c) => c.op === 'upsert' && c.table === 'passage_refs');
    expect(removeAt).toBeGreaterThan(-1);
    expect(calls[removeAt].path).toBe(
      'passage_refs?user_id=eq.u-1&row_table=eq.user_life_map&row_id=eq.lm-1',
    );
    expect(upsertAt).toBeGreaterThan(removeAt);
    const rows = calls[upsertAt].rows;
    const key = (r) => `${r.row_table}:${r.row_id}:${r.field}`;
    expect(rows.map(key).sort()).toEqual(
      [
        'chapters:chapter-1:card_subtitle',
        'chapters:chapter-1:summary',
        'user_life_map:lm-1:domains.0.threads.0.recent_update',
        'user_life_map:lm-1:domains.0.threads.0.summary',
        'worlds:world-1:card_subtitle',
      ].sort(),
    );
    const thread = rows.find((r) => r.field === 'domains.0.threads.0.summary');
    expect(thread.fact_ids).toEqual(['fact-1', 'fact-2']);
    expect(rows.find((r) => r.row_id === 'world-1').fact_ids).toEqual(['fact-1']);
    expect(rows.every((r) => r.user_id === USER && r.writer === 'weekly')).toBe(true);
    expect(out.applied.passages).toBe(5);
  });

  it('records nothing in shadow', async () => {
    const calls = fakeDb();
    await applyWeekly({}, USER, output, refsSnapshot, {
      shadow: true,
      runId: 'run',
      today: '2026-10-08',
    });
    expect(
      calls.some(
        (c) => c.table === 'passage_refs' || String(c.path || '').startsWith('passage_refs'),
      ),
    ).toBe(false);
  });
});
