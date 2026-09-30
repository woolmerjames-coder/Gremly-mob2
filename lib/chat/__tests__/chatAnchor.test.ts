import { anchorFor, anchorMetadata, anchorOf, CHAT_ANCHOR_META } from '../chatAnchor';
import type { SpaceChatMessage } from '../../types';

const msg = (over: Partial<SpaceChatMessage>): SpaceChatMessage => ({
  id: over.id ?? 'm',
  chat_id: 'c',
  scope_id: null,
  user_id: 'u',
  role: 'assistant',
  content: 'x',
  created_at: '2026-09-30T10:00:00Z',
  ...over,
});

describe('chat anchor', () => {
  const item = {
    id: 'todo-1',
    type: 'todo' as const,
    title: 'Take Bella for a walk',
    label: 'To-do',
  };

  it('saves the item on the opener and reads it back from the chat', () => {
    const anchor = anchorOf(item);
    expect(anchor).toEqual({ id: 'todo-1', type: 'todo', title: 'Take Bella for a walk' });
    const messages = [
      msg({ id: 'a', content: 'Sure, let us talk', metadata_json: anchorMetadata(anchor) as any }),
      msg({ id: 'b', role: 'user', content: 'I keep putting it off' }),
      msg({ id: 'c', content: 'Reply' }),
    ];
    expect(anchorFor(messages)).toEqual(anchor);
  });

  it('is null for a chat not opened about an item', () => {
    expect(anchorFor([])).toBeNull();
    expect(
      anchorFor([msg({ role: 'user' }), msg({ metadata_json: { type: 'entity-card' } as any })]),
    ).toBeNull();
  });

  it('ignores a broken anchor rather than sending it', () => {
    expect(
      anchorFor([
        msg({
          metadata_json: {
            type: CHAT_ANCHOR_META,
            anchor: { id: 'x', type: 'journal', title: 't' },
          } as any,
        }),
      ]),
    ).toBeNull();
    expect(
      anchorFor([
        msg({
          metadata_json: {
            type: CHAT_ANCHOR_META,
            anchor: { id: '', type: 'todo', title: 't' },
          } as any,
        }),
      ]),
    ).toBeNull();
  });
});
