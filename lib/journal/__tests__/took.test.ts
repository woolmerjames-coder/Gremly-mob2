/**
 * What Gremly took from an entry (lib/journal/took): reading the facts his
 * reader kept, how each stands now, and the line that says how many.
 */
type Result = { data?: unknown; error?: unknown };
let mockResult: Result = { data: [], error: null };
const mockFilters: [string, unknown][] = [];

jest.mock('../../supabase/client', () => {
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.order = () => q;
  q.eq = (col: string, value: unknown) => {
    mockFilters.push([col, value]);
    return q;
  };
  q.then = (yes: (r: Result) => unknown, no: (e: unknown) => unknown) =>
    Promise.resolve(mockResult).then(yes, no);
  return { supabase: { from: () => q } };
});

import { renderHook, waitFor } from '@testing-library/react-native';
import { loadEntryFacts, tookLine, useEntryFacts, useEntryFactsStore } from '../took';

const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  statement: `Fact ${id}`,
  state: 'happened',
  private: false,
  source_quote: null,
  ...extra,
});

beforeEach(() => {
  mockResult = { data: [], error: null };
  mockFilters.length = 0;
  useEntryFactsStore.setState({ byEntry: {} });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('reading what he kept', () => {
  it('asks for the facts that came from this entry, and no other', async () => {
    await loadEntryFacts('n1');
    expect(mockFilters).toEqual([
      ['source_table', 'notes'],
      ['source_id', 'n1'],
    ]);
  });

  it('gives each fact with the words it came from, and whether it is private', async () => {
    mockResult = {
      data: [
        row('a', { statement: ' Ran eleven miles. ', source_quote: ' Eleven miles today ' }),
        row('b', { private: true }),
      ],
      error: null,
    };
    expect(await loadEntryFacts('n1')).toEqual([
      {
        id: 'a',
        statement: 'Ran eleven miles.',
        quote: 'Eleven miles today',
        private: false,
        standing: 'held',
      },
      { id: 'b', statement: 'Fact b', quote: null, private: true, standing: 'held' },
    ]);
  });

  it('says how each fact stands now', async () => {
    mockResult = {
      data: [
        row('a', { state: 'current' }),
        row('b', { state: 'planned' }),
        row('c', { state: 'unconfirmed' }),
        row('d', { state: 'superseded' }),
        row('e', { state: 'changed' }),
        row('f', { state: 'corrected' }),
      ],
      error: null,
    };
    expect((await loadEntryFacts('n1')).map((f) => f.standing)).toEqual([
      'held',
      'held',
      'unsure',
      'updated',
      'updated',
      'updated',
    ]);
  });

  it('leaves out a row with nothing written in it', async () => {
    mockResult = { data: [row('a', { statement: '  ' }), { statement: 'No id' }], error: null };
    expect(await loadEntryFacts('n1')).toEqual([]);
  });

  it('keeps what was last read when it cannot be reached', async () => {
    mockResult = { data: [row('a')], error: null };
    await loadEntryFacts('n1');
    mockResult = { data: null, error: new Error('offline') };
    expect(await loadEntryFacts('n1')).toHaveLength(1);
    expect(await loadEntryFacts('n2')).toEqual([]);
  });

  it('reaches a screen once it is read, and nothing is read for no entry', async () => {
    mockResult = { data: [row('a')], error: null };
    const { result } = renderHook(() => useEntryFacts('n1'));
    expect(result.current).toEqual([]);
    await waitFor(() => expect(result.current).toHaveLength(1));
    mockFilters.length = 0;
    const none = renderHook(() => useEntryFacts(null));
    expect(none.result.current).toEqual([]);
    expect(mockFilters).toEqual([]);
  });
});

describe('the line that says how many', () => {
  it('counts in words', () => {
    expect(tookLine(1)).toBe('Gremly took one thing from this');
    expect(tookLine(3)).toBe('Gremly took three things from this');
    expect(tookLine(12)).toBe('Gremly took 12 things from this');
  });
});
