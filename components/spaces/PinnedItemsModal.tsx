/**
 * PinnedItemsModal - Shows all pinned items for a Space
 *
 * Features:
 * - Modal/bottom sheet displaying pinned todos, habits, notes
 * - Tap item to open detail
 * - Swipe or long-press to unpin
 * - Empty state when no pinned items
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { X, Pin, PinOff, Circle, CheckCircle2, Flame, FileText } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND } from '../../design/brand';
import { useRepo } from '../../providers/RepoProvider';
import type { Todo, Habit, Note } from '../../lib/types';

interface PinnedItemsModalProps {
  visible: boolean;
  spaceId: string;
  onClose: () => void;
  onItemPress: (item: Todo | Habit | Note, type: 'todo' | 'habit' | 'note') => void;
  onUnpin: () => void; // Callback to refresh pinned count after unpinning
}

interface PinnedItems {
  todos: Todo[];
  habits: Habit[];
  notes: Note[];
}

export function PinnedItemsModal({
  visible,
  spaceId,
  onClose,
  onItemPress,
  onUnpin,
}: PinnedItemsModalProps) {
  const insets = useSafeAreaInsets();
  const repo = useRepo();
  const [loading, setLoading] = useState(true);
  const [pinnedItems, setPinnedItems] = useState<PinnedItems>({ todos: [], habits: [], notes: [] });

  const fetchPinnedItems = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    try {
      const items = await repo.getPinnedItemsForSpace(spaceId);
      setPinnedItems(items);
    } catch (error) {
      console.error('[PinnedItemsModal] Failed to fetch pinned items:', error);
    } finally {
      setLoading(false);
    }
  }, [spaceId, repo]);

  useEffect(() => {
    if (visible) {
      fetchPinnedItems();
    }
  }, [visible, fetchPinnedItems]);

  const handleUnpin = useCallback(
    async (item: Todo | Habit | Note, type: 'todo' | 'habit' | 'note') => {
      try {
        if (type === 'todo') {
          await repo.toggleTodoPinned(item.id, false);
        } else if (type === 'habit') {
          await repo.toggleHabitPinned(item.id, false);
        } else {
          await repo.toggleNotePinned(item.id, false);
        }
        // Refresh the list
        await fetchPinnedItems();
        onUnpin();
      } catch (error) {
        console.error('[PinnedItemsModal] Failed to unpin:', error);
      }
    },
    [repo, fetchPinnedItems, onUnpin],
  );

  const totalCount =
    pinnedItems.todos.length + pinnedItems.habits.length + pinnedItems.notes.length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pin size={20} color={BRAND.colors.mossGreen} />
            <Text style={styles.headerTitle}>Pinned Items</Text>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <X size={24} color={BRAND.colors.charcoalInk} />
          </Pressable>
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={BRAND.colors.mossGreen} />
          </View>
        ) : totalCount === 0 ? (
          <View style={styles.emptyContainer}>
            <Pin size={48} color={BRAND.colors.inkMuted} />
            <Text style={styles.emptyTitle}>No pinned items</Text>
            <Text style={styles.emptySubtitle}>
              Long-press any item to pin it here for quick access
            </Text>
          </View>
        ) : (
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            {/* Pinned Todos */}
            {pinnedItems.todos.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>To Do ({pinnedItems.todos.length})</Text>
                {pinnedItems.todos.map((todo) => (
                  <PinnedTodoRow
                    key={todo.id}
                    todo={todo}
                    onPress={() => onItemPress(todo, 'todo')}
                    onUnpin={() => handleUnpin(todo, 'todo')}
                  />
                ))}
              </View>
            )}

            {/* Pinned Habits */}
            {pinnedItems.habits.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>Habits ({pinnedItems.habits.length})</Text>
                {pinnedItems.habits.map((habit) => (
                  <PinnedHabitRow
                    key={habit.id}
                    habit={habit}
                    onPress={() => onItemPress(habit, 'habit')}
                    onUnpin={() => handleUnpin(habit, 'habit')}
                  />
                ))}
              </View>
            )}

            {/* Pinned Notes */}
            {pinnedItems.notes.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>Guides & Logs ({pinnedItems.notes.length})</Text>
                {pinnedItems.notes.map((note) => (
                  <PinnedNoteRow
                    key={note.id}
                    note={note}
                    onPress={() => onItemPress(note, 'note')}
                    onUnpin={() => handleUnpin(note, 'note')}
                  />
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// Row Components

interface PinnedTodoRowProps {
  todo: Todo;
  onPress: () => void;
  onUnpin: () => void;
}

function PinnedTodoRow({ todo, onPress, onUnpin }: PinnedTodoRowProps) {
  // Check both completed_at AND status field for completion state
  const isCompleted = !!todo.completed_at || (todo as any).status === 'completed';
  return (
    <View style={styles.row}>
      <Pressable onPress={onPress} style={styles.rowContent}>
        {isCompleted ? (
          <CheckCircle2 size={20} color={BRAND.colors.mossGreen} />
        ) : (
          <Circle size={20} color={BRAND.colors.inkMuted} />
        )}
        <Text style={[styles.rowText, isCompleted && styles.rowTextCompleted]} numberOfLines={1}>
          {todo.title || todo.name}
        </Text>
      </Pressable>
      <Pressable
        onPress={onUnpin}
        hitSlop={8}
        style={styles.unpinButton}
        accessibilityRole="button"
        accessibilityLabel="Unpin"
      >
        <PinOff size={18} color={BRAND.colors.inkMuted} />
      </Pressable>
    </View>
  );
}

interface PinnedHabitRowProps {
  habit: Habit;
  onPress: () => void;
  onUnpin: () => void;
}

function PinnedHabitRow({ habit, onPress, onUnpin }: PinnedHabitRowProps) {
  return (
    <View style={styles.row}>
      <Pressable onPress={onPress} style={styles.rowContent}>
        <Flame size={20} color="#E07C3E" />
        <Text style={styles.rowText} numberOfLines={1}>
          {habit.name}
        </Text>
      </Pressable>
      <Pressable
        onPress={onUnpin}
        hitSlop={8}
        style={styles.unpinButton}
        accessibilityRole="button"
        accessibilityLabel="Unpin"
      >
        <PinOff size={18} color={BRAND.colors.inkMuted} />
      </Pressable>
    </View>
  );
}

interface PinnedNoteRowProps {
  note: Note;
  onPress: () => void;
  onUnpin: () => void;
}

function PinnedNoteRow({ note, onPress, onUnpin }: PinnedNoteRowProps) {
  return (
    <View style={styles.row}>
      <Pressable onPress={onPress} style={styles.rowContent}>
        <FileText size={20} color={BRAND.colors.mossGreen} />
        <Text style={styles.rowText} numberOfLines={1}>
          {note.title || 'Untitled'}
        </Text>
      </Pressable>
      <Pressable
        onPress={onUnpin}
        hitSlop={8}
        style={styles.unpinButton}
        accessibilityRole="button"
        accessibilityLabel="Unpin"
      >
        <PinOff size={18} color={BRAND.colors.inkMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.colors.linenCream,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    marginTop: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowText: {
    flex: 1,
    fontSize: 16,
    color: BRAND.colors.charcoalInk,
  },
  rowTextCompleted: {
    textDecorationLine: 'line-through',
    color: BRAND.colors.inkMuted,
  },
  unpinButton: {
    padding: 8,
  },
});

export default PinnedItemsModal;
