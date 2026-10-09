/**
 * @jest-environment node
 *
 * The Sunday classifier's writer never closes a Chapter (data fabric stage
 * 4b): the person closes their own, and Gremly asks first. A close the
 * classifier asks for is counted and not applied. It writes neither the words
 * under a World or a Chapter nor a Chapter's memory: those have one writer
 * each (context/words.js, context/memory.js).
 */
import { writeClassifierOutput } from '../worldsWriter';
import { createClient } from '@supabase/supabase-js';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

const CH = '22222222-2222-4222-8222-222222222222';
const W = '33333333-3333-4333-8333-333333333333';

function fakeClient(inserted = [], chapter = {}) {
  const updates = [];
  const rowsFor = {
    worlds: [{ id: W, name: 'Running', card_subtitle_source: null, summary_source: null }],
    chapters: [{ id: CH, title: 'The half', primary_world_id: null, closed_at: null, ...chapter }],
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
      insert: (rows) => {
        inserted.push({ table, rows: Array.isArray(rows) ? rows : [rows] });
        const done = { data: { id: `new-${inserted.length}` }, error: null };
        return {
          select: () => ({ single: () => Promise.resolve(done) }),
          then: (resolve) => resolve({ error: null }),
        };
      },
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

it('leaves the end date the weekly pass gave, as it leaves one the person set', async () => {
  for (const source of ['synthesis', 'user']) {
    const updates = fakeClient([], { end_date_source: source });
    await writeClassifierOutput(
      {
        ...empty,
        chapter_updates: [
          { chapter_id: CH, close_chapter: false, reason: 'r', evidence: [], new_arc_shape: null, new_end_date: '2026-10-05' },
        ],
      },
      'u-1',
      { SUPABASE_URL: 'x', SUPABASE_SERVICE_KEY: 'y', CONTEXT_PIPELINE: 'on' },
    );
    const ch = updates.find((u) => u.table === 'chapters');
    expect(ch?.patch || {}).not.toHaveProperty('end_date');
  }
});

it('writes no words under a World or a Chapter and no memory, new or old', async () => {
  const inserted = [];
  const updates = fakeClient(inserted);
  await writeClassifierOutput(
    {
      ...empty,
      new_world_candidates: [
        {
          proposed_name: 'Choir',
          display_name: 'Choir',
          description: 'd',
          card_subtitle: 'words',
          summary: 's',
          key_priorities: [],
          mascot_slug: 'gremly-mascot',
          archetypes: [],
          world_type: null,
          confidence: 0.9,
          first_signal_at: null,
          last_signal_at: null,
          seed_module_layout: null,
        },
      ],
      new_chapter_candidates: [
        {
          proposed_title: 'Spring concert',
          primary_world_name: 'Running',
          description: 'd',
          chapter_type: null,
          start_date: null,
          end_date: null,
          target_description: null,
          target_summary: null,
          card_subtitle: 'words',
          summary: 's',
          key_priorities: [],
          phase_labels: [],
          current_phase_key: null,
          arc_shape: null,
          confidence: 0.9,
        },
      ],
      velocity_updates: [
        {
          world_id: W,
          new_display_name: null,
          new_card_subtitle: 'words',
          new_summary: null,
          new_key_priorities: null,
          new_mascot_slug: null,
          new_world_type: null,
        },
      ],
      chapter_updates: [
        {
          chapter_id: CH,
          close_chapter: false,
          reason: '',
          evidence: [],
          new_arc_shape: null,
          new_card_subtitle: 'words',
          new_epigraph: 'a memory',
        },
      ],
    },
    'u-1',
    { SUPABASE_URL: 'x', SUPABASE_SERVICE_KEY: 'y' },
  );
  const made = inserted.filter((i) => ['worlds', 'chapters'].includes(i.table));
  expect(made.map((i) => i.table).sort()).toEqual(['chapters', 'worlds']);
  for (const i of made)
    for (const r of i.rows) {
      expect(r).not.toHaveProperty('card_subtitle');
      expect(r).not.toHaveProperty('card_subtitle_source');
    }
  const changed = updates.filter((u) => ['worlds', 'chapters'].includes(u.table));
  expect(changed.length).toBeGreaterThan(0);
  for (const u of changed) {
    expect(u.patch).not.toHaveProperty('card_subtitle');
    expect(u.patch).not.toHaveProperty('epigraph');
  }
});
