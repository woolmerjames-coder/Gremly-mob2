/**
 * ItemChatScreen - the chat about one todo, habit or note, opened from the
 * item (the overlay, a habit's page, Sweep). It is Ask Gremly tied to that
 * exact item: one chat per item that carries on each time, the item named at
 * the top, starters for its kind (for a note, drawn from what it says), and
 * every turn sent with the item as its anchor so Gremly knows what the chat
 * is about.
 *
 * It takes the old entity chat's props, so every place that opened that
 * screen opens this one (see EntityChatScreen, behind ITEM_CHAT_V2).
 */
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import AskGremlyScreen from '../../app/tabs/AskGremlyScreen';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import {
  ITEM_STARTERS,
  itemKindLabel,
  openingPrompt,
  startersFromTopics,
} from '../../lib/chat/itemStarters';
import { fetchItemTopics } from '../../lib/cortex/CortexClient';
import type { ChatAnchor } from '../../lib/types';
import type { EntityChatScreenProps } from './EntityChatScreen';

const MOSS = '#2E5540';

export function ItemChatScreen({
  entityId,
  entityType,
  initialPreset,
  onClose,
}: EntityChatScreenProps) {
  const entity = useGremlyStore(
    useCallback(
      (s: any) =>
        entityType === 'todo'
          ? s.todos.find((t: any) => t.id === entityId)
          : entityType === 'habit'
            ? s.habits.find((h: any) => h.id === entityId)
            : s.notes.find((n: any) => n.id === entityId),
      [entityId, entityType],
    ),
  );
  const title = String(entity?.name || entity?.title || '').trim();
  const subtype = entity?.subtype ?? null;

  const anchor = useMemo<ChatAnchor | null>(
    () => (title ? { id: entityId, type: entityType, title } : null),
    [entityId, entityType, title],
  );
  const item = useMemo(
    () =>
      anchor
        ? {
            anchor,
            label: itemKindLabel(entityType, subtype),
            initialPrompt: openingPrompt(entityType, initialPreset ?? null),
            starters: ITEM_STARTERS[entityType],
            // a note's chat opens with things to talk about drawn from what it says
            loadStarters:
              entityType === 'note'
                ? () => fetchItemTopics(entityId).then(startersFromTopics)
                : undefined,
            onClose,
          }
        : null,
    [anchor, entityId, entityType, subtype, initialPreset, onClose],
  );

  if (!item) {
    return (
      <SafeAreaView style={styles.missing} testID="item-chat-missing">
        <TouchableOpacity
          onPress={onClose}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <ChevronLeft size={24} color={MOSS} />
        </TouchableOpacity>
        <View style={styles.missingBody}>
          <Text style={styles.missingText}>This item is no longer here.</Text>
        </View>
      </SafeAreaView>
    );
  }
  return <AskGremlyScreen item={item} />;
}

const styles = StyleSheet.create({
  missing: { flex: 1, backgroundColor: '#F9F6F1' },
  back: { padding: 16 },
  missingBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  missingText: { fontFamily: 'PlusJakartaSans-Medium', fontSize: 15, color: '#4B6A50' },
});

export default ItemChatScreen;
