/**
 * An item's chat is one conversation per item. It is the chat whose opener
 * carries the item as its anchor (lib/chat/chatAnchor.ts), whether it was
 * started from the item or from "Talk it through" on a drop, so opening the
 * item later carries on where that left off.
 */
import { supabase } from '../supabase/client';
import type { SpaceChat } from '../types';
import { CHAT_ANCHOR_META } from './chatAnchor';

/** The newest chat about this item that is not archived, or null. */
export async function findItemChat(userId: string, itemId: string): Promise<SpaceChat | null> {
  const { data: openers, error } = await supabase
    .from('scope_chat_messages')
    .select('chat_id, created_at')
    .eq('user_id', userId)
    .eq('metadata_json->>type', CHAT_ANCHOR_META)
    .eq('metadata_json->anchor->>id', itemId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error || !openers || openers.length === 0) return null;
  const ids = [...new Set(openers.map((o: { chat_id: string }) => o.chat_id))];
  const { data: chats, error: chatError } = await supabase
    .from('scope_chats')
    .select('*')
    .in('id', ids)
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (chatError || !chats || chats.length === 0) return null;
  return chats[0] as SpaceChat;
}
