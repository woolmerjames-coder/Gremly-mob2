/**
 * CompletedInSpaceOverlay - Shows completed todos for a Space
 *
 * Features:
 * - Groups by recency (This week / Older)
 * - Shows completed date
 * - Restore button to mark as incomplete
 */

import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, CheckCircle2, RotateCcw } from 'lucide-react-native';
import { BRAND } from '../../design/brand';
import { getDateService } from '../../lib/date';
import type { Todo } from '../../lib/types';

interface CompletedInSpaceOverlayProps {
  spaceId: string;
  spaceName: string;
  visible: boolean;
  onClose: () => void;
  completedTodos: Todo[];
  onRestore: (todo: Todo) => void;
  loading?: boolean;
}

export function CompletedInSpaceOverlay({
  spaceId,
  spaceName,
  visible,
  onClose,
  completedTodos,
  onRestore,
  loading = false,
}: CompletedInSpaceOverlayProps) {
  const insets = useSafeAreaInsets();

  // Group completed todos by recency
  const { thisWeek, older } = useMemo(() => {
    const now = getDateService().now();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const thisWeekItems: Todo[] = [];
    const olderItems: Todo[] = [];

    // Sort by completion date (most recent first)
    const sorted = [...completedTodos].sort((a, b) => {
      const aDate = new Date(a.completed_at || a.updated_at || a.created_at).getTime();
      const bDate = new Date(b.completed_at || b.updated_at || b.created_at).getTime();
      return bDate - aDate;
    });

    for (const todo of sorted) {
      const completedDate = new Date(todo.completed_at || todo.updated_at || todo.created_at);
      if (completedDate >= weekAgo) {
        thisWeekItems.push(todo);
      } else {
        olderItems.push(todo);
      }
    }

    return { thisWeek: thisWeekItems, older: olderItems };
  }, [completedTodos]);

  const formatCompletedDate = useCallback((dateStr: string | null | undefined) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = getDateService().now();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return getDateService().formatForChip(getDateService().toLocalDate(date));
  }, []);

  const renderTodoRow = useCallback(
    (todo: Todo) => (
      <View key={todo.id} style={styles.todoRow} testID={`completed-todo-${todo.id}`}>
        <View style={styles.todoContent}>
          <CheckCircle2 size={20} color={BRAND.colors.mossGreen} style={styles.checkIcon} />
          <View style={styles.todoTextContainer}>
            <Text style={styles.todoTitle} numberOfLines={1}>
              {todo.title || todo.name}
            </Text>
            <Text style={styles.completedDate}>
              {formatCompletedDate(todo.completed_at || todo.updated_at)}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => onRestore(todo)}
          style={({ pressed }) => [styles.restoreButton, pressed && styles.restoreButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel={`Restore ${todo.title || todo.name}`}
          testID={`restore-todo-${todo.id}`}
        >
          <RotateCcw size={16} color={BRAND.colors.inkMuted} />
        </Pressable>
      </View>
    ),
    [formatCompletedDate, onRestore],
  );

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
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Completed</Text>
            <Text style={styles.headerSubtitle}>in {spaceName}</Text>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close"
            testID="completed-overlay-close"
          >
            <X size={24} color={BRAND.colors.charcoalInk} />
          </Pressable>
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={BRAND.colors.mossGreen} />
          </View>
        ) : completedTodos.length === 0 ? (
          <View style={styles.emptyContainer}>
            <CheckCircle2 size={48} color={BRAND.colors.inkMuted} />
            <Text style={styles.emptyText}>No completed items yet</Text>
            <Text style={styles.emptySubtext}>Completed todos will appear here</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
          >
            {/* This Week Section */}
            {thisWeek.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>This week</Text>
                {thisWeek.map(renderTodoRow)}
              </View>
            )}

            {/* Older Section */}
            {older.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>Older</Text>
                {older.map(renderTodoRow)}
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
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
    borderBottomColor: BRAND.colors.borderSubtle,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
  },
  headerSubtitle: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    marginTop: 2,
  },
  closeButton: {
    padding: 4,
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
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    marginTop: 8,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  todoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.md,
    padding: 14,
    marginBottom: 8,
  },
  todoContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  checkIcon: {
    marginRight: 12,
  },
  todoTextContainer: {
    flex: 1,
  },
  todoTitle: {
    fontSize: 16,
    color: BRAND.colors.charcoalInk,
    textDecorationLine: 'line-through',
  },
  completedDate: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    marginTop: 2,
  },
  restoreButton: {
    padding: 8,
    marginLeft: 8,
  },
  restoreButtonPressed: {
    opacity: 0.5,
  },
});

export default CompletedInSpaceOverlay;
