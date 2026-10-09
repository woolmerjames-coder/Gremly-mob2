/**
 * An item's chat is found by the anchor on its opener: the newest chat about
 * that item that is not archived.
 */
const mockCalls: Array<{ table: string; op: string; args: unknown[] }> = [];
let mockResults: Record<string, { data: unknown; error: unknown }> = {};

jest.mock('../../supabase/client', () => {
  const builder = (table: string) => {
    const b: any = {};
    for (const op of ['select', 'eq', 'in', 'is', 'order', 'limit']) {
      b[op] = (...args: unknown[]) => {
        mockCalls.push({ table, op, args });
        return b;
      };
    }
    b.then = (resolve: (v: unknown) => void) => resolve(mockResults[table]);
    return b;
  };
  return { supabase: { from: (table: string) => builder(table) } };
});

import { findItemChat } from '../itemChat';

beforeEach(() => {
  mockCalls.length = 0;
  mockResults = {};
});

describe('findItemChat', () => {
  it('finds the chat whose opener carries this item', async () => {
    mockResults = {
      scope_chat_messages: {
        data: [{ chat_id: 'c2' }, { chat_id: 'c1' }, { chat_id: 'c2' }],
        error: null,
      },
      scope_chats: { data: [{ id: 'c2', title: 'Walk Pepper' }], error: null },
    };
    const chat = await findItemChat('u1', 't1');
    expect(chat).toEqual({ id: 'c2', title: 'Walk Pepper' });
    const onMessages = mockCalls.filter((c) => c.table === 'scope_chat_messages');
    expect(onMessages).toEqual(
      expect.arrayContaining([
        { table: 'scope_chat_messages', op: 'eq', args: ['user_id', 'u1'] },
        { table: 'scope_chat_messages', op: 'eq', args: ['metadata_json->>type', 'chat-anchor'] },
        { table: 'scope_chat_messages', op: 'eq', args: ['metadata_json->anchor->>id', 't1'] },
      ]),
    );
    // each chat once, and never an archived one
    expect(mockCalls).toEqual(
      expect.arrayContaining([
        { table: 'scope_chats', op: 'in', args: ['id', ['c2', 'c1']] },
        { table: 'scope_chats', op: 'is', args: ['archived_at', null] },
      ]),
    );
  });

  it('is null when the item has no chat, or the lookup fails', async () => {
    mockResults = { scope_chat_messages: { data: [], error: null } };
    expect(await findItemChat('u1', 't1')).toBeNull();
    mockResults = { scope_chat_messages: { data: null, error: { message: 'boom' } } };
    expect(await findItemChat('u1', 't1')).toBeNull();
    mockResults = {
      scope_chat_messages: { data: [{ chat_id: 'c1' }], error: null },
      scope_chats: { data: [], error: null },
    };
    expect(await findItemChat('u1', 't1')).toBeNull();
  });
});
