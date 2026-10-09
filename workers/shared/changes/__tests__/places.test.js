/**
 * @jest-environment node
 */
// Changes to Worlds and Chapters themselves (Worlds rebuild, stage 2): read
// against the person's Worlds and Chapters, and dropped for a build that
// cannot apply them.

import { checkCard, checkChange, checkPlaceChange, placeBefore } from '../check';
import { PLACE_OPS, PLACE_TYPES, OPS, TYPES } from '../fields';

const places = {
  worlds: [
    { id: 'w1', name: 'Travel' },
    { id: 'w2', name: 'Home' },
    { id: 'w3', name: 'Old band', hidden: true },
  ],
  chapters: [{ id: 'c1', title: 'Lisbon trip' }],
};
const lisbon = {
  id: 'c1',
  title: 'Lisbon trip',
  phase: 'upcoming',
  start_date: '2026-11-20',
  end_date: '2026-11-22',
  primary_world_id: 'w1',
  closed_at: null,
  card_subtitle: null,
  mascot_slug: null,
};
const travel = { id: 'w1', name: 'Travel', display_name: 'Travel', phase: 'active' };
const ctx = (extra = {}) => ({ today: '2026-10-08', places, ...extra });

describe('the list', () => {
  it('keeps Worlds and Chapters apart from the item types every surface is offered', () => {
    expect(Object.keys(TYPES)).toEqual(['todo', 'habit', 'note']);
    expect(Object.keys(OPS)).not.toContain('close');
    expect(Object.keys(OPS)).not.toContain('merge');
    expect(Object.keys(PLACE_OPS)).toEqual(['close', 'merge']);
    // nothing deletes a World or a Chapter from a card
    for (const spec of Object.values(PLACE_TYPES)) expect(spec.ops).not.toContain('delete');
  });
});

describe('a new Chapter', () => {
  it('is made in one of their Worlds, with its dates and the items that belong in it', () => {
    const r = checkChange(
      {
        op: 'add',
        type: 'chapter',
        fields: {
          name: 'Half marathon',
          end_day: '2026-11-15',
          world: 'w2',
          gremly: 'fitness_gremly',
          items: [
            { type: 'todo', id: 't1' },
            { type: 'todo', id: 't1' },
            { type: 'habit', id: 'h1' },
          ],
        },
      },
      ctx({ itemKeys: new Set(['todo:t1', 'habit:h1']) }),
    );
    expect(r.ok).toBe(true);
    expect(r.change).toMatchObject({
      op: 'add',
      type: 'chapter',
      id: null,
      title: 'Half marathon',
      fields: {
        name: 'Half marathon',
        end_day: '2026-11-15',
        world: 'w2',
        gremly: 'fitness_gremly',
        items: [
          { type: 'todo', id: 't1' },
          { type: 'habit', id: 'h1' },
        ],
      },
    });
  });

  it('needs a World when they have one, and never a hidden one', () => {
    expect(checkChange({ op: 'add', type: 'chapter', fields: { name: 'X' } }, ctx())).toEqual({
      ok: false,
      reason: 'needs_world',
    });
    expect(
      checkChange({ op: 'add', type: 'chapter', fields: { name: 'X', world: 'w3' } }, ctx()),
    ).toEqual({ ok: false, reason: 'hidden_world' });
    expect(
      checkChange({ op: 'add', type: 'chapter', fields: { name: 'X', world: 'nope' } }, ctx()),
    ).toEqual({ ok: false, reason: 'unknown_world' });
    // a person with no Worlds yet can still start one
    expect(
      checkChange({ op: 'add', type: 'chapter', fields: { name: 'X' } }, { places: { worlds: [] } })
        .ok,
    ).toBe(true);
  });

  it('drops an item that was not found, an end before its start, and an unknown outfit', () => {
    const base = { name: 'X', world: 'w1' };
    expect(
      checkChange(
        { op: 'add', type: 'chapter', fields: { ...base, items: [{ type: 'todo', id: 'zz' }] } },
        ctx({ itemKeys: ['todo:t1'] }),
      ).reason,
    ).toBe('unknown_item');
    expect(
      checkChange(
        {
          op: 'add',
          type: 'chapter',
          fields: { ...base, start_day: '2026-11-10', end_day: '2026-11-01' },
        },
        ctx(),
      ).reason,
    ).toBe('end_before_start');
    expect(
      checkChange({ op: 'add', type: 'chapter', fields: { ...base, gremly: 'pirate' } }, ctx())
        .reason,
    ).toBe('bad_value:gremly');
  });

  it('is dropped for a build that cannot apply it', () => {
    const raw = { op: 'add', type: 'chapter', fields: { name: 'X', world: 'w1' } };
    expect(checkChange(raw, { today: '2026-10-08' })).toEqual({
      ok: false,
      reason: 'unknown_type',
    });
  });
});

describe('a Chapter as it is', () => {
  it('changes its name, dates and World, with what each was before', () => {
    const r = checkChange(
      {
        op: 'change',
        type: 'chapter',
        id: 'c1',
        fields: { name: 'Lisbon', end_day: '2026-11-23', world: 'w2' },
      },
      ctx({ place: lisbon }),
    );
    expect(r.ok).toBe(true);
    expect(r.change.fields).toEqual({ name: 'Lisbon', end_day: '2026-11-23', world: 'w2' });
    expect(r.change.before).toEqual({
      name: 'Lisbon trip',
      end_day: '2026-11-22',
      world: 'w1',
    });
  });

  it('reads the dates as they will stand, against the one not changed', () => {
    expect(
      checkChange(
        { op: 'change', type: 'chapter', id: 'c1', fields: { end_day: '2026-11-19' } },
        ctx({ place: lisbon }),
      ).reason,
    ).toBe('end_before_start');
    // clearing the start makes it one date
    const r = checkChange(
      { op: 'change', type: 'chapter', id: 'c1', fields: { start_day: null } },
      ctx({ place: lisbon }),
    );
    expect(r.change.fields).toEqual({ start_day: null });
  });

  it('never gathers items once it exists, and says when nothing changes', () => {
    expect(
      checkChange(
        { op: 'change', type: 'chapter', id: 'c1', fields: { items: [] } },
        ctx({ place: lisbon }),
      ).reason,
    ).toBe('add_only:items');
    expect(
      checkChange(
        { op: 'change', type: 'chapter', id: 'c1', fields: { name: 'Lisbon trip' } },
        ctx({ place: lisbon }),
      ).reason,
    ).toBe('no_change');
  });

  it('closes an open one and opens a closed one again', () => {
    expect(checkChange({ op: 'close', type: 'chapter', id: 'c1' }, ctx({ place: lisbon })).ok).toBe(
      true,
    );
    const closed = { ...lisbon, phase: 'closed', closed_at: '2026-10-01T10:00:00Z' };
    expect(
      checkChange({ op: 'close', type: 'chapter', id: 'c1' }, ctx({ place: closed })).reason,
    ).toBe('no_change');
    expect(
      checkChange({ op: 'reopen', type: 'chapter', id: 'c1' }, ctx({ place: closed })).ok,
    ).toBe(true);
    expect(
      checkChange({ op: 'reopen', type: 'chapter', id: 'c1' }, ctx({ place: lisbon })).reason,
    ).toBe('no_change');
    // one Gremly only suggested is not open
    expect(
      checkChange(
        { op: 'close', type: 'chapter', id: 'c1' },
        ctx({ place: { ...lisbon, phase: 'suggested' } }),
      ).reason,
    ).toBe('not_open');
  });

  it('is dropped when it is not one of theirs', () => {
    expect(checkChange({ op: 'close', type: 'chapter', id: 'c9' }, ctx()).reason).toBe('no_place');
  });
});

describe('a World', () => {
  it('is made with a name that is not already one of theirs', () => {
    expect(
      checkChange(
        { op: 'add', type: 'world', fields: { name: 'Garden', gremly: 'gardener_gremly' } },
        ctx(),
      ).change,
    ).toMatchObject({ op: 'add', type: 'world', title: 'Garden' });
    expect(
      checkChange({ op: 'add', type: 'world', fields: { name: ' travel ' } }, ctx()).reason,
    ).toBe('world_exists');
  });

  it('merges into another World of theirs that is not hidden', () => {
    const r = checkChange(
      { op: 'merge', type: 'world', id: 'w1', into: 'w2' },
      ctx({ place: travel }),
    );
    expect(r.change).toMatchObject({
      op: 'merge',
      id: 'w1',
      title: 'Travel',
      into: 'w2',
      into_title: 'Home',
    });
    expect(
      checkChange({ op: 'merge', type: 'world', id: 'w1', into: 'w1' }, ctx({ place: travel }))
        .reason,
    ).toBe('bad_merge');
    expect(
      checkChange({ op: 'merge', type: 'world', id: 'w1', into: 'w3' }, ctx({ place: travel }))
        .reason,
    ).toBe('hidden_world');
  });

  it('hides and brings back, and is not renamed to the name of another', () => {
    expect(checkChange({ op: 'archive', type: 'world', id: 'w1' }, ctx({ place: travel })).ok).toBe(
      true,
    );
    const hid = { ...travel, phase: 'archived' };
    expect(checkChange({ op: 'restore', type: 'world', id: 'w1' }, ctx({ place: hid })).ok).toBe(
      true,
    );
    expect(
      checkChange(
        { op: 'change', type: 'world', id: 'w1', fields: { name: 'X' } },
        ctx({ place: hid }),
      ).reason,
    ).toBe('archived');
    expect(
      checkChange(
        { op: 'change', type: 'world', id: 'w1', fields: { name: 'home' } },
        ctx({ place: travel }),
      ).reason,
    ).toBe('world_exists');
    expect(placeBefore('world', { name: 'travel', display_name: 'Travel' }, 'name')).toBe('Travel');
  });

  it('cannot close or delete a World', () => {
    expect(
      checkPlaceChange({ op: 'close', type: 'world', id: 'w1' }, ctx({ place: travel })).reason,
    ).toBe('op_not_for_type');
  });
});

describe('on a card', () => {
  it('keeps one row for each World or Chapter', () => {
    const { changes, dropped } = checkCard(
      [
        { op: 'change', type: 'chapter', id: 'c1', fields: { name: 'Lisbon' } },
        { op: 'close', type: 'chapter', id: 'c1' },
      ],
      () => ctx({ place: lisbon }),
    );
    expect(changes).toHaveLength(1);
    expect(dropped).toEqual([{ cid: 'c2', reason: 'conflict' }]);
  });
});
