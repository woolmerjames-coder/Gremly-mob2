/**
 * @jest-environment node
 *
 * The Sunday classifier's writer never closes a Chapter (data fabric stage
 * 4b): the person closes their own, and Gremly asks first. A close the
 * classifier asks for is counted and not applied.
 */
import { writeClassifierOutput } from '../worldsWriter';
import { createClient } from '@supabase/supabase-js';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

const CH = '22222222-2222-4222-8222-222222222222';

function fakeClient() {
  const updates = [];
  const rowsFor = {
    worlds: [],
    chapters: [{ id: CH, title: 'The half', primary_world_id: null, closed_at: null }],
    life_contexts: [],
  };
  const query = (table) => {
    const q = {
      _table: table,
      _patch: null,
      _filters: [],
      select: () => q,
      eq: (k, v) => {
        q._filters.push(['eq', k, v]);
        return q;
      },
      is: (k, v) => {
        q._filters.push(['is', k, v]);
        return q;
      },
      update: (patch) => {
        q._patch = patch;
        return q;
      },
      insert: () => Promise.resolve({ error: null }),
      upsert: () => Promise.resolve({ error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (resolve) => {
        if (q._patch) updates.push({ table, patch: q._patch, filters: q._filters });
        return resolve(q._patch ? { error: null } : { data: rowsFor[table] || [], error: null });
      },
    };
    return q;
  };
  createClient.mockReturnValue({ from: query, rpc: () => Promise.resolve({ error: null }) });
  return updates;
}

const empty = {
  run_metadata: { input_tokens: 0, output_tokens: 0 },
  worlds_summary: null,
  new_world_candidates: [],
  new_chapter_candidates: [],
  new_life_context_candidates: [],
  velocity_updates: [],
  evolution_proposals: [],
  reactivation_proposals: [],
  reclassification_proposals: [],
};

it('counts a close the classifier asks for, and applies the rest of the update without it', async () => {
  const updates = fakeClient();
  const result = await writeClassifierOutput(
    {
      ...empty,
      chapter_updates: [
        {
          chapter_id: CH,
          close_chapter: true,
          reason: 'over',
          evidence: [],
          new_arc_shape: null,
          new_end_date: '2026-10-05',
        },
      ],
    },
    'u-1',
    { SUPABASE_URL: 'x', SUPABASE_SERVICE_KEY: 'y', CONTEXT_PIPELINE: 'on' },
  );
  expect(result.chapters).toMatchObject({ closed: 0, close_refused: 1, updated: 1 });
  const ch = updates.find((u) => u.table === 'chapters');
  expect(ch.patch).not.toHaveProperty('phase');
  expect(ch.patch).not.toHaveProperty('closed_at');
  expect(ch.patch).toHaveProperty('end_date', '2026-10-05');
  // and never on a Chapter the person closed while it ran
  expect(ch.filters).toContainEqual(['is', 'closed_at', null]);
});
