/**
 * LinkedItemsSection - Shows items linked to an event note in UnifiedOverlayV2
 *
 * Features:
 * - Displays todos, notes, and habits linked to an event
 * - Simple list with type indicators
 * - Add todo/note buttons
 * - Link existing item button
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Circle, CheckCircle2, FileText, RotateCw, Plus, Link2 } from 'lucide-react-native';
import { BRAND } from '../../design/brand';
import { useItemsLinkedToEvent } from '../../lib/store/selectors';
import type { Todo, Note, Habit } from '../../lib/types';

export interface LinkedItemsSectionProps {
  eventId: string;
  spaceId: string;
  onItemPress: (item: Todo | Note | Habit) => void;
  onAddTodo: () => void;
  onAddNote: () => void;
  onLinkExisting: () => void;
}

/**
 * Renders a single linked item row
 */
function LinkedItemRow({ item, onPress }: { item: Todo | Note | Habit; onPress: () => void }) {
  const isCompleted = item.type === 'todo' && !!(item as Todo).completed_at;

  // Get icon based on type
  const renderIcon = () => {
    if (item.type === 'todo') {
      return isCompleted ? (
        <CheckCircle2 size={18} color={BRAND.colors.mossGreen} />
      ) : (
        <Circle size={18} color={BRAND.colors.inkMuted} />
      );
    }
    if (item.type === 'note') {
      return <FileText size={18} color={BRAND.colors.periwinkleSmoke} />;
    }
    // habit
    return <RotateCw size={18} color={BRAND.colors.goldenPear} />;
  };

  // Get type label
  const getTypeLabel = () => {
    if (item.type === 'todo') return 'To-Do';
    if (item.type === 'note') return 'Note';
    return 'Habit';
  };

  // Get item name
  const getName = () => {
    if (item.type === 'todo') return (item as Todo).name || (item as Todo).title || 'Untitled';
    if (item.type === 'note') return (item as Note).title || 'Untitled';
    return (item as Habit).name || 'Untitled';
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.itemRow, pressed && { opacity: 0.7 }]}
      onPress={onPress}
    >
      <View style={styles.itemIcon}>{renderIcon()}</View>
      <Text style={[styles.itemName, isCompleted && styles.itemNameCompleted]} numberOfLines={1}>
        {getName()}
      </Text>
      <Text style={styles.itemType}>{getTypeLabel()}</Text>
    </Pressable>
  );
}

export default function LinkedItemsSection({
  eventId,
  onItemPress,
  onAddTodo,
  onAddNote,
  onLinkExisting,
}: LinkedItemsSectionProps) {
  const { todos, notes, habits } = useItemsLinkedToEvent(eventId);

  // Combine all items for display
  const allItems: (Todo | Note | Habit)[] = [
    ...todos.map((t) => ({ ...t, type: 'todo' as const })),
    ...notes.map((n) => ({ ...n, type: 'note' as const })),
    ...habits.map((h) => ({ ...h, type: 'habit' as const })),
  ];

  const totalCount = allItems.length;
  const isEmpty = totalCount === 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerText}>
          Linked Items{totalCount > 0 ? ` (${totalCount})` : ''}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.linkButton, pressed && { opacity: 0.7 }]}
          onPress={onLinkExisting}
        >
          <Link2 size={14} color={BRAND.colors.mossGreen} />
          <Text style={styles.linkButtonText}>Link</Text>
        </Pressable>
      </View>

      {/* Items list or empty state */}
      {isEmpty ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>No items linked yet</Text>
        </View>
      ) : (
        <View style={styles.itemsList}>
          {allItems.map((item) => (
            <LinkedItemRow key={item.id} item={item} onPress={() => onItemPress(item)} />
          ))}
        </View>
      )}

      {/* Add buttons */}
      <View style={styles.addButtonsRow}>
        <Pressable
          style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.7 }]}
          onPress={onAddTodo}
        >
          <Plus size={14} color={BRAND.colors.mossGreen} />
          <Text style={styles.addButtonText}>Add to-do</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.7 }]}
          onPress={onAddNote}
        >
          <Plus size={14} color={BRAND.colors.mossGreen} />
          <Text style={styles.addButtonText}>Add note</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.borderSubtle,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerText: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  linkButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
  },
  itemsList: {
    gap: 2,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: BRAND.colors.linenCream,
    borderRadius: BRAND.radius.sm,
    marginBottom: 4,
  },
  itemIcon: {
    marginRight: 10,
  },
  itemName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
    marginRight: 8,
  },
  itemNameCompleted: {
    textDecorationLine: 'line-through',
    color: BRAND.colors.inkMuted,
  },
  itemType: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
  },
  emptyState: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
  },
  addButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  addButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.md,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
    borderStyle: 'dashed',
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
  },
});
