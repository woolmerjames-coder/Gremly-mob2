/**
 * EntityChatScreen - the chat about one todo, habit or note.
 *
 * This was its own chat screen, with its messages kept on the item
 * (views.chat). It is now Ask Gremly tied to the item (ItemChatScreen), and
 * the old messages were moved into each item's chat
 * (supabase/migrations/20261001012238). The name stays so every place that
 * opens it (the item overlay, both habit pages, Sweep) keeps working.
 */
import { ItemChatScreen } from './ItemChatScreen';

export { ItemChatScreen as EntityChatScreen };
export type { ItemChatScreenProps as EntityChatScreenProps } from './ItemChatScreen';
export default ItemChatScreen;
