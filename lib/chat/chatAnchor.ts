/**
 * A chat opened about one item ("Talk it through with Gremly" on a drop) is
 * anchored to it. Gremly's opener is saved with the item in its metadata, and
 * every turn of that chat sends the item, so the Worker knows what the chat is
 * about however many turns in, and after the chat is reopened from history.
 *
 * The anchor is soft: the Worker still judges each message against all of the
 * user's items, so the chat can move on to something else.
 */
import type { ChatAnchor, SpaceChatMessage } from '../types';
import type { TalkAboutItem } from './talkAboutOpeners';

export const CHAT_ANCHOR_META = 'chat-anchor' as const;

const ANCHOR_TYPES: ReadonlyArray<ChatAnchor['type']> = ['todo', 'habit', 'note'];

/** The anchor for an item a chat is opened about. */
export function anchorOf(item: TalkAboutItem): ChatAnchor {
  return { id: item.id, type: item.type, title: item.title };
}

/** The metadata saved on Gremly's opener in an anchored chat. */
export function anchorMetadata(anchor: ChatAnchor): Record<string, unknown> {
  return { type: CHAT_ANCHOR_META, anchor };
}

/** The item this chat was opened about, read from its opener, or null. */
export function anchorFor(messages: SpaceChatMessage[]): ChatAnchor | null {
  for (const m of messages) {
    const meta = m.metadata_json as { type?: string; anchor?: Partial<ChatAnchor> } | null;
    if (m.role !== 'assistant' || meta?.type !== CHAT_ANCHOR_META) continue;
    const a = meta.anchor;
    if (
      a &&
      typeof a.id === 'string' &&
      a.id &&
      typeof a.title === 'string' &&
      a.title &&
      a.type &&
      ANCHOR_TYPES.includes(a.type)
    ) {
      return { id: a.id, type: a.type, title: a.title };
    }
    return null;
  }
  return null;
}
