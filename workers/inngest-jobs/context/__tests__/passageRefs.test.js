/**
 * @jest-environment node
 *
 * What was written from what (workers/shared/passageRefs.js): each stored
 * sentence is recorded by the table, row and field that hold it, with the
 * facts it rests on, and a rewrite replaces the old record.
 */
import { passageRow, recordPassages, PASSAGE_KEY } from '../../../shared/passageRefs.js';

describe('a passage record', () => {
  it('names where the sentence lives and what it rests on, once each', () => {
    const row = passageRow({
      userId: 'u-1',
      surface: 'story',
      table: 'story_items',
      id: 's-1',
      field: 'body',
      factIds: ['f-1', 'f-2', 'f-1', null],
      writer: 'story',
      promptVersion: 'story-x',
      at: '2026-10-08T00:00:00Z',
    });
    expect(row).toEqual({
      user_id: 'u-1',
      surface: 'story',
      row_table: 'story_items',
      row_id: 's-1',
      field: 'body',
      fact_ids: ['f-1', 'f-2'],
      person_ids: [],
      items: [],
      writer: 'story',
      model: null,
      prompt_version: 'story-x',
      written_at: '2026-10-08T00:00:00Z',
    });
  });

  it('is replaced, not added to, when the same field is written again', async () => {
    const calls = [];
    const d = {
      upsert: async (table, rows, onConflict) => calls.push({ table, rows, onConflict }),
    };
    const n = await recordPassages(d, [
      passageRow({
        userId: 'u',
        surface: 'world',
        table: 'worlds',
        id: 'w',
        field: 'card_subtitle',
        writer: 'weekly',
      }),
      null,
    ]);
    expect(n).toBe(1);
    expect(calls[0]).toMatchObject({ table: 'passage_refs', onConflict: PASSAGE_KEY });
    expect(PASSAGE_KEY).toBe('row_table,row_id,field');
  });

  it('writes nothing when there is nothing to record', async () => {
    const d = { upsert: jest.fn() };
    expect(await recordPassages(d, [])).toBe(0);
    expect(d.upsert).not.toHaveBeenCalled();
  });
});
