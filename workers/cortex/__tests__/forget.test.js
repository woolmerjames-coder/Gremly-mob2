/**
 * @jest-environment node
 *
 * Forget Everything: Gremly forgets what he learned about the person who
 * asked, and only them. What they wrote themselves stays.
 */
import { forgetPerson } from '../context/forget.js';
import { db } from '../../shared/db.js';

jest.mock('../../shared/db.js', () => ({ db: jest.fn() }));

function fakeDb() {
  const calls = [];
  db.mockReturnValue({
    remove: async (path) => {
      calls.push({ op: 'remove', path });
      return [{ id: 'x' }];
    },
    update: async (path, patch) => {
      calls.push({ op: 'update', path, patch });
      return [{ id: 'x' }];
    },
    upsert: async (table, rows) => {
      calls.push({ op: 'upsert', table, rows });
      return rows;
    },
    insert: async (table, rows) => {
      calls.push({ op: 'insert', table, rows });
      return rows;
    },
  });
  return calls;
}

describe('Forget Everything', () => {
  it('removes the ledger, the story, the Life Map and the profile Gremly wrote, for that person only', async () => {
    const calls = fakeDb();
    const deleted = [];
    const env = { CONTEXT_CACHE: { delete: async (k) => deleted.push(k) } };
    const out = await forgetPerson(env, 'u-1');
    const removed = calls.filter((c) => c.op === 'remove').map((c) => c.path.split('?')[0]);
    expect(removed).toEqual(
      expect.arrayContaining([
        'life_facts',
        'story_items',
        'user_life_map',
        'synthesis_runs',
        'gremly_questions',
        'user_temporal_anchors',
        'user_profile_overrides',
        'user_daily_state',
        'weekly_summaries',
        'passage_refs',
        'check_runs',
        'life_people',
      ]),
    );
    for (const c of calls.filter((x) => x.op !== 'upsert' && x.op !== 'insert'))
      expect(c.path).toMatch(/(user_id|owner_id)=eq\.u-1/);
    const profile = calls.find((c) => c.op === 'update' && c.path.startsWith('user_profiles'));
    expect(profile.patch).toEqual({
      profile_text: null,
      signals: null,
      generated_at: null,
      model_used: null,
    });
    expect(out.facts).toBe(1);
    expect(deleted).toContain('life-pack:u-1');
  });

  it("clears only Gremly's words on Worlds and Chapters, never ones the person wrote", async () => {
    const calls = fakeDb();
    await forgetPerson({}, 'u-1');
    const words = calls.filter(
      (c) => c.op === 'update' && /^(worlds|chapters)\?/.test(c.path) && !/_offered/.test(c.path),
    );
    expect(words.length).toBe(5);
    for (const c of words) expect(c.path).toMatch(/_source\.neq\.user/);
  });

  it('clears the words Gremly offered beside theirs, which are always his', async () => {
    const calls = fakeDb();
    await forgetPerson({}, 'u-1');
    const offered = calls.filter((c) => c.op === 'update' && /_offered=not\.is\.null/.test(c.path));
    expect(offered.map((c) => Object.keys(c.patch).sort())).toEqual([
      ['card_subtitle_offered', 'card_subtitle_offered_at'],
      ['card_subtitle_offered', 'card_subtitle_offered_at'],
      ['epigraph_offered', 'epigraph_offered_at'],
    ]);
    expect(offered.map((c) => c.path.split('?')[0])).toEqual(['worlds', 'chapters', 'chapters']);
    for (const c of offered)
      expect(c.patch[Object.keys(c.patch).find((k) => !k.endsWith('_at'))]).toBeNull();
  });

  it('starts reading again from now, so nothing forgotten is read back in', async () => {
    const calls = fakeDb();
    await forgetPerson({}, 'u-1');
    const cursor = calls.find((c) => c.op === 'upsert' && c.table === 'ledger_cursor');
    expect(cursor.rows[0].user_id).toBe('u-1');
    expect(cursor.rows[0].read_through).toBe(cursor.rows[0].backfilled_at);
  });

  it('first says when it forgot, so what came before is kept off the words seen at a glance', async () => {
    const calls = fakeDb();
    await forgetPerson({}, 'u-1');
    expect(calls[0]).toEqual({
      op: 'insert',
      table: 'events',
      rows: [
        { owner_id: 'u-1', kind: 'context.forgotten', payload_json: { by: 'forget_everything' } },
      ],
    });
  });

  it('needs a person', async () => {
    fakeDb();
    await expect(forgetPerson({}, null)).rejects.toThrow();
  });
});
