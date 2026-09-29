/**
 * resolveEntityClarification: answers that do not file the drop.
 * "Chat with Gremly" / "Ask Gremly now" (kind chat) opens Ask Gremly with the
 * drop and removes it from Mind Drop; "Just testing, don't keep it" (kind
 * discard) deletes it. Neither calls the reclassify endpoint.
 */

import { act } from '@testing-library/react-native';
import { useGremlyStore } from '../useGremlyStore';
import { eventBus } from '../../events';
import { buildFallbackClarification } from '../../minddrop/clarification';
import type { Note } from '../../types';

jest.mock('../../supabase/client', () => {
  const makeQueryChain = (): any => {
    const chain: any = {};
    // All query-builder methods return `chain` so any call order is valid.
    const selfReturning = [
      'select',
      'eq',
      'neq',
      'is',
      'or',
      'not',
      'in',
      'gte',
      'lte',
      'ilike',
      'order',
      'limit',
      'update',
      'delete',
      'insert',
      'upsert',
    ];
    selfReturning.forEach((method) => {
      chain[method] = () => chain;
    });
    // range() is awaited by fetchAllPaginated — return an empty page.
    chain.range = () => Promise.resolve({ data: [], error: null });
    // single() is used by point-read queries.
    chain.single = () => Promise.resolve({ data: null, error: null });
    // upsert() resolves directly (also listed above for self-returning, but override).
    chain.upsert = () => Promise.resolve({ error: null });
    // then() makes the chain awaitable (for write ops like .update().eq()).
    chain.then = (resolve: any, reject?: any) =>
      Promise.resolve({ data: [], error: null }).then(resolve, reject);
    return chain;
  };

  return {
    supabase: {
      // Plain function — NOT jest.fn() — so resetMocks doesn't strip it.
      from: (_table: string): any => makeQueryChain(),
      channel: () => ({
        on: () => ({ on: () => ({ subscribe: () => ({ unsubscribe: () => Promise.resolve() }) }) }),
        subscribe: () => ({ unsubscribe: () => Promise.resolve() }),
        unsubscribe: () => Promise.resolve({ error: null }),
      }),
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      },
      rpc: () => Promise.resolve({ data: null, error: null }),
    },
  };
});

function makeDropNote(id: string, body: string, ambiguityType: string): Note {
  const clar = buildFallbackClarification(ambiguityType);
  return {
    id,
    type: 'note',
    title: body,
    body,
    owner_id: 'user-1',
    created_at: '2026-09-29T10:00:00Z',
    updated_at: '2026-09-29T10:00:00Z',
    tags: [],
    views: {
      needs_clarification: true,
      ambiguity_type: clar.ambiguityType,
      clarification_question: clar.question,
      clarification_options: clar.options,
    },
  } as unknown as Note;
}

describe('resolveEntityClarification: answers that do not file the drop', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as any;
    useGremlyStore.setState({ notes: [], todos: [], habits: [], userId: 'user-1' });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('opens Ask Gremly with the drop and removes it from Mind Drop', async () => {
    const heard: string[] = [];
    const unsub = eventBus.on('minddrop:open_chat', ({ text }) => heard.push(text));
    useGremlyStore.setState({
      notes: [makeDropNote('n1', 'What should I do now?', 'conversation')],
    });

    await act(async () => {
      await useGremlyStore.getState().resolveEntityClarification('n1', 'opt_1');
    });

    unsub();
    expect(heard).toEqual(['What should I do now?']);
    expect(useGremlyStore.getState().notes.find((n) => n.id === 'n1')).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('opens Ask Gremly for a question the user wants answered now', async () => {
    const heard: string[] = [];
    const unsub = eventBus.on('minddrop:open_chat', ({ text }) => heard.push(text));
    useGremlyStore.setState({ notes: [makeDropNote('n2', 'What helps focus?', 'open_question')] });

    await act(async () => {
      await useGremlyStore.getState().resolveEntityClarification('n2', 'opt_1');
    });

    unsub();
    expect(heard).toEqual(['What helps focus?']);
    expect(useGremlyStore.getState().notes).toHaveLength(0);
  });

  it('deletes a test drop without opening the chat', async () => {
    const heard: string[] = [];
    const unsub = eventBus.on('minddrop:open_chat', ({ text }) => heard.push(text));
    useGremlyStore.setState({ notes: [makeDropNote('n3', 'Is this working?', 'conversation')] });

    await act(async () => {
      await useGremlyStore.getState().resolveEntityClarification('n3', 'opt_2');
    });

    unsub();
    expect(heard).toEqual([]);
    expect(useGremlyStore.getState().notes).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('files the drop as usual for an answer that keeps it', async () => {
    const heard: string[] = [];
    const unsub = eventBus.on('minddrop:open_chat', ({ text }) => heard.push(text));
    useGremlyStore.setState({ notes: [makeDropNote('n4', 'Hello', 'conversation')] });

    await act(async () => {
      await useGremlyStore.getState().resolveEntityClarification('n4', 'opt_3');
    });

    unsub();
    expect(heard).toEqual([]);
    expect(useGremlyStore.getState().notes.find((n) => n.id === 'n4')).toBeDefined();
  });
});

describe('resolveEntityClarification: when is it?', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as any;
    useGremlyStore.setState({ notes: [], todos: [], habits: [], userId: 'user-1' });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('saves the date and time the user picked on the event', async () => {
    useGremlyStore.setState({ notes: [makeDropNote('b1', 'Doctors appointment', 'booking')] });

    await act(async () => {
      await useGremlyStore
        .getState()
        .resolveEntityClarification('b1', 'opt_1', false, { date: '2026-10-02', time: '15:30' });
    });

    const note = useGremlyStore.getState().notes.find((n) => n.id === 'b1') as any;
    expect(note).toBeDefined();
    expect(note.views.target_date).toBe('2026-10-02');
    expect(note.views.event_time).toBe('15:30');
    expect(note.views.clarification_resolved).toBe(true);
  });

  it('saves a date without a time', async () => {
    useGremlyStore.setState({ notes: [makeDropNote('b2', 'Dentist', 'booking')] });

    await act(async () => {
      await useGremlyStore
        .getState()
        .resolveEntityClarification('b2', 'opt_1', false, { date: '2026-10-03', time: null });
    });

    const note = useGremlyStore.getState().notes.find((n) => n.id === 'b2') as any;
    expect(note.views.target_date).toBe('2026-10-03');
    expect(note.views.event_time).toBeUndefined();
  });
});
