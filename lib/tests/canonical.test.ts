import { canonicalToPersisted } from '../canonical';

describe('canonicalToPersisted', () => {
  it('returns habit record mapping for habit canonical type', () => {
    expect(canonicalToPersisted('habit')).toEqual({ recordType: 'habit' });
  });

  it('returns todo record mapping for todo canonical type', () => {
    expect(canonicalToPersisted('todo')).toEqual({ recordType: 'todo' });
  });

  it.each([
    ['journal', 'journal'],
    ['idea', 'idea'],
    ['list', 'list'],
    ['person', 'catchall'],
    ['everything_else', 'catchall'],
    [null, 'catchall'],
    [undefined, 'catchall'],
  ])('normalizes log subtype %s to persisted subtype %s', (subtype, expected) => {
    const result = canonicalToPersisted('log', subtype as any);
    expect(result).toEqual({ recordType: 'note', noteSubtype: expected });
  });

  it('maps unsorted canonical type to catchall note persistence', () => {
    expect(canonicalToPersisted('unsorted')).toEqual({
      recordType: 'note',
      noteSubtype: 'catchall',
    });
  });

  it('falls back to catchall when canonical type is unknown', () => {
    expect(canonicalToPersisted('unknown' as any)).toEqual({
      recordType: 'note',
      noteSubtype: 'catchall',
    });
  });
});
