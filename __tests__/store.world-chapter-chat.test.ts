/**
 * Tests for createWorldChat and createChapterChat store actions.
 *
 * Covers:
 * - Returns null when userId is not set (no Supabase call)
 * - Inserts to scope_chats with chat_type:'world' for createWorldChat
 * - Inserts to scope_chats with chat_type:'chapter' for createChapterChat
 * - Optimistic insert: temp entry added to spaceChats before DB call
 * - On success: replaces temp entry with server-returned record
 * - On error: removes optimistic entry and re-throws
 */

import { act } from '@testing-library/react-native';
import { useGremlyStore } from '../lib/store/useGremlyStore';

// ─── Controllable supabase mock ────────────────────────────────────────────

type InsertCapture = { table: string; payload: any } | null;
let capturedInsert: InsertCapture = null;
let mockInsertResult: { data: any; error: any } = { data: null, error: null };

jest.mock('../lib/supabase/client', () => {
  const makeQueryChain = (): any => {
    const chain: any = {};
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
      'upsert',
    ];
    selfReturning.forEach((method) => {
      chain[method] = () => chain;
    });
    chain.range = () => Promise.resolve({ data: [], error: null });
    chain.single = () => Promise.resolve(mockInsertResult);
    chain.then = (resolve: any, reject?: any) =>
      Promise.resolve({ data: [], error: null }).then(resolve, reject);
    // insert captures the payload and returns a chain that resolves via .select().single()
    chain.insert = (payload: any) => {
      capturedInsert = { table: (chain as any).__table, payload };
      return chain;
    };
    return chain;
  };

  return {
    supabase: {
      from: (table: string): any => {
        const chain = makeQueryChain();
        (chain as any).__table = table;
        // Override insert so it captures the table name too
        chain.insert = (payload: any) => {
          capturedInsert = { table, payload };
          return chain;
        };
        return chain;
      },
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

jest.mock('../lib/date/DateService', () => ({
  getDateService: () => ({
    now: () => new Date('2026-05-01T12:00:00Z'),
    today: () => '2026-05-01',
    getHour: () => 12,
    getTimezone: () => 'UTC',
  }),
  nowTimestamp: () => '2026-05-01T12:00:00Z',
}));

// ─── Setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  capturedInsert = null;
  mockInsertResult = { data: null, error: null };
  // Reset store to a clean state
  act(() => {
    useGremlyStore.setState({
      userId: 'user-1',
      spaceChats: [],
    } as any);
  });
});

// ─── createWorldChat ────────────────────────────────────────────────────────

describe('createWorldChat', () => {
  it('returns null and skips supabase when userId is not set', async () => {
    act(() => {
      useGremlyStore.setState({ userId: undefined } as any);
    });

    let result: any;
    await act(async () => {
      result = await useGremlyStore.getState().createWorldChat('world-1', 'My World Chat');
    });

    expect(result).toBeNull();
    expect(capturedInsert).toBeNull();
  });

  it('inserts into scope_chats with chat_type: world', async () => {
    const serverRecord = {
      id: 'chat-server-1',
      scope_id: 'world-1',
      user_id: 'user-1',
      chat_type: 'world',
      title: 'My World Chat',
      pinned: false,
      updated_at: '2026-05-01T12:00:00Z',
    };
    mockInsertResult = { data: serverRecord, error: null };

    await act(async () => {
      await useGremlyStore.getState().createWorldChat('world-1', 'My World Chat');
    });

    expect(capturedInsert).not.toBeNull();
    expect(capturedInsert!.table).toBe('scope_chats');
    expect(capturedInsert!.payload).toMatchObject({
      scope_id: 'world-1',
      chat_type: 'world',
      title: 'My World Chat',
      user_id: 'user-1',
      pinned: false,
    });
    // created_at should be stripped from the insert payload (the implementation does this)
    expect(capturedInsert!.payload.created_at).toBeUndefined();
  });

  it('adds an optimistic entry to spaceChats before the DB call resolves', async () => {
    let optimisticChats: any[] = [];

    // Intercept the state mid-flight by checking immediately after calling
    // createWorldChat (before awaiting the returned promise)
    let resolveInsert: (v: any) => void;
    const insertPromise = new Promise((res) => {
      resolveInsert = res;
    });

    // Swap the supabase mock to hold the insert until we inspect optimistic state
    jest
      .spyOn(require('../lib/supabase/client').supabase, 'from')
      .mockImplementationOnce((table: string) => ({
        insert: (payload: any) => ({
          select: () => ({
            single: () => {
              capturedInsert = { table, payload };
              return insertPromise;
            },
          }),
        }),
      }));

    let chatPromise: Promise<any>;
    act(() => {
      chatPromise = useGremlyStore.getState().createWorldChat('world-1', 'Optimistic Chat') as any;
    });

    // Optimistic entry should already be in the store
    optimisticChats = useGremlyStore.getState().spaceChats;
    expect(optimisticChats).toHaveLength(1);
    expect(optimisticChats[0].id).toMatch(/^temp-/);
    expect(optimisticChats[0].chat_type).toBe('world');

    // Resolve the insert
    resolveInsert!({
      data: { id: 'real-id', chat_type: 'world', scope_id: 'world-1' },
      error: null,
    });
    await act(async () => {
      await chatPromise!;
    });

    // Temp entry replaced with real record
    const finalChats = useGremlyStore.getState().spaceChats;
    expect(finalChats).toHaveLength(1);
    expect(finalChats[0].id).toBe('real-id');
  });

  it('removes the optimistic entry and throws on DB error', async () => {
    const dbError = new Error('DB failure');
    mockInsertResult = { data: null, error: dbError };

    // We need single() to actually throw — override the chain for this test
    jest
      .spyOn(require('../lib/supabase/client').supabase, 'from')
      .mockImplementationOnce((_table: string) => ({
        insert: (_payload: any) => ({
          select: () => ({
            single: () => Promise.resolve({ data: null, error: dbError }),
          }),
        }),
      }));

    await act(async () => {
      await expect(
        useGremlyStore.getState().createWorldChat('world-2', 'Fail Chat'),
      ).rejects.toThrow('DB failure');
    });

    // Optimistic entry should have been rolled back
    expect(useGremlyStore.getState().spaceChats).toHaveLength(0);
  });
});

// ─── createChapterChat ──────────────────────────────────────────────────────

describe('createChapterChat', () => {
  it('returns null when userId is not set', async () => {
    act(() => {
      useGremlyStore.setState({ userId: undefined } as any);
    });

    let result: any;
    await act(async () => {
      result = await useGremlyStore.getState().createChapterChat('ch-1', 'Chapter Chat');
    });

    expect(result).toBeNull();
    expect(capturedInsert).toBeNull();
  });

  it('inserts into scope_chats with chat_type: chapter', async () => {
    const serverRecord = {
      id: 'chat-ch-1',
      scope_id: 'ch-1',
      user_id: 'user-1',
      chat_type: 'chapter',
      title: 'Sprint Chat',
      pinned: false,
      updated_at: '2026-05-01T12:00:00Z',
    };
    mockInsertResult = { data: serverRecord, error: null };

    await act(async () => {
      await useGremlyStore.getState().createChapterChat('ch-1', 'Sprint Chat');
    });

    expect(capturedInsert).not.toBeNull();
    expect(capturedInsert!.table).toBe('scope_chats');
    expect(capturedInsert!.payload).toMatchObject({
      scope_id: 'ch-1',
      chat_type: 'chapter',
      title: 'Sprint Chat',
      user_id: 'user-1',
      pinned: false,
    });
    expect(capturedInsert!.payload.created_at).toBeUndefined();
  });

  it('adds optimistic entry with chat_type chapter before DB resolves', async () => {
    let resolveInsert: (v: any) => void;
    const insertPromise = new Promise((res) => {
      resolveInsert = res;
    });

    jest
      .spyOn(require('../lib/supabase/client').supabase, 'from')
      .mockImplementationOnce((table: string) => ({
        insert: (payload: any) => ({
          select: () => ({
            single: () => {
              capturedInsert = { table, payload };
              return insertPromise;
            },
          }),
        }),
      }));

    let chatPromise: Promise<any>;
    act(() => {
      chatPromise = useGremlyStore
        .getState()
        .createChapterChat('ch-1', 'Optimistic Chapter Chat') as any;
    });

    const optimisticChats = useGremlyStore.getState().spaceChats;
    expect(optimisticChats).toHaveLength(1);
    expect(optimisticChats[0].id).toMatch(/^temp-/);
    expect(optimisticChats[0].chat_type).toBe('chapter');

    resolveInsert!({
      data: { id: 'real-ch-chat', chat_type: 'chapter', scope_id: 'ch-1' },
      error: null,
    });
    await act(async () => {
      await chatPromise!;
    });

    const finalChats = useGremlyStore.getState().spaceChats;
    expect(finalChats[0].id).toBe('real-ch-chat');
  });
});
