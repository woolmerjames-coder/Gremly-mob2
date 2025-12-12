import { persistedToCanonical } from '../cortex/canonicalMap';
import { kindToDisplayLabel } from '../ui/kindToDisplayLabel';

describe('persistedToCanonical', () => {
  it('maps habit and todo directly', () => {
    expect(persistedToCanonical('habit')).toBe('habit');
    expect(persistedToCanonical('todo')).toBe('todo');
  });

  it('maps note subtypes to log or unsorted', () => {
    expect(persistedToCanonical('note', 'journal')).toBe('log');
    expect(persistedToCanonical('note', 'idea')).toBe('log');
    expect(persistedToCanonical('note', 'list')).toBe('log');
    expect(persistedToCanonical('note', 'catchall')).toBe('log'); // log-general
    expect(persistedToCanonical('note', 'general')).toBe('log');  // LogSubtype value
    expect(persistedToCanonical('note')).toBe('unsorted'); // No subtype = unsorted
  });
});

describe('kindToDisplayLabel', () => {
  it('returns raw type when flag is off', () => {
    expect(kindToDisplayLabel('note', 'catchall', false)).toBe('note');
  });

  it('maps to canonical labels when flag is on', () => {
    expect(kindToDisplayLabel('habit', null, true)).toBe('habit');
    expect(kindToDisplayLabel('todo', null, true)).toBe('todo');
    expect(kindToDisplayLabel('note', 'journal', true)).toBe('log');
    expect(kindToDisplayLabel('note', 'idea', true)).toBe('log');
    expect(kindToDisplayLabel('note', 'list', true)).toBe('log');
    expect(kindToDisplayLabel('note', 'catchall', true)).toBe('log'); // log-general
    expect(kindToDisplayLabel('note', undefined, true)).toBe('unsorted');
  });
});
