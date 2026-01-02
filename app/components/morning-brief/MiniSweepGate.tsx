/**
 * MiniSweepGate - Quick-sort gate for rolled over and unscheduled items
 *
 * Shown before Morning Brief when there are items that need attention.
 * Allows users to quickly decide: Today, Done, or Later for each item.
 */

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Image, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND } from '../../../design/brand';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import type { Todo } from '../../../lib/types';

// eslint-disable-next-line @typescript-eslint/no-var-requires -- React Native image import
const MORNING_BRIEF_GREMLY = require('../../../assets/mascot/morningbriefgremly.png');

// Decision types for mini-sweep
type SweepDecision = 'today' | 'done' | 'later';

// Color definitions for button states
const BUTTON_COLORS = {
  today: {
    default: { bg: '#E8F0EB', text: '#2E5540', border: '#2E5540' },
    selected: { bg: '#BFD8C0', text: '#2E5540', border: 'transparent' },
  },
  done: {
    default: { bg: '#F0F0F0', text: '#666666', border: '#9CA3AF' },
    selected: { bg: '#9CA3AF', text: '#FFFFFF', border: 'transparent' },
  },
  later: {
    default: { bg: '#FEF3E2', text: '#B45309', border: '#B45309' },
    selected: { bg: '#9CA6E0', text: '#FFFFFF', border: 'transparent' },
  },
};

interface MiniSweepGateProps {
  /** Rolled over todos (overdue items from previous days) */
  rolledOverTodos: Todo[];
  /** Unscheduled todos (no due_day, created recently) */
  unscheduledTodos: Todo[];
  /** Called after Save pressed and all changes committed */
  onComplete: () => void;
  /** Called when Skip pressed (no changes saved) */
  onSkip: () => void;
}

/**
 * Get today's date string in YYYY-MM-DD format (local time)
 */
function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * ActionButton - Color-coded action button
 */
interface ActionButtonProps {
  action: SweepDecision;
  isSelected: boolean;
  onPress: () => void;
  size?: 'normal' | 'small';
  testID?: string;
}

function ActionButton({ action, isSelected, onPress, size = 'normal', testID }: ActionButtonProps) {
  const colors = BUTTON_COLORS[action];
  const state = isSelected ? colors.selected : colors.default;
  const label = action === 'today' ? 'Today' : action === 'done' ? 'Done' : 'Later';

  const buttonStyle = [
    size === 'normal' ? buttonStyles.normal : buttonStyles.small,
    {
      backgroundColor: state.bg,
      borderColor: state.border,
      borderWidth: isSelected ? 0 : 1,
    },
  ];

  const textStyle = [
    size === 'normal' ? buttonStyles.normalText : buttonStyles.smallText,
    { color: state.text },
  ];

  return (
    <Pressable style={buttonStyle} onPress={onPress} testID={testID}>
      <Text style={textStyle}>{size === 'small' ? `All ${label}` : label}</Text>
    </Pressable>
  );
}

const buttonStyles = StyleSheet.create({
  normal: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  normalText: {
    fontSize: 12,
    fontWeight: '600',
  },
  small: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  smallText: {
    fontSize: 11,
    fontWeight: '500',
  },
});

/**
 * MiniSweepSection - Section for a category of items with bulk actions
 */
interface MiniSweepSectionProps {
  title: string;
  description: string;
  items: Todo[];
  stagedDecisions: Map<string, SweepDecision>;
  onDecision: (id: string, decision: SweepDecision) => void;
  onBulkAction: (ids: string[], decision: SweepDecision) => void;
}

function MiniSweepSection({
  title,
  description,
  items,
  stagedDecisions,
  onDecision,
  onBulkAction,
}: MiniSweepSectionProps) {
  if (items.length === 0) return null;

  const itemIds = items.map((item) => item.id);

  return (
    <View style={sectionStyles.container}>
      {/* Section Header */}
      <View style={sectionStyles.header}>
        <Text style={sectionStyles.headerTitle}>
          {title} ({items.length})
        </Text>
        <Text style={sectionStyles.headerDescription}>{description}</Text>
      </View>

      {/* Bulk Action Row */}
      <View style={sectionStyles.bulkActionRow}>
        <ActionButton
          action="today"
          isSelected={false}
          onPress={() => onBulkAction(itemIds, 'today')}
          size="small"
          testID={`mini-sweep-bulk-today-${title.toLowerCase()}`}
        />
        <ActionButton
          action="done"
          isSelected={false}
          onPress={() => onBulkAction(itemIds, 'done')}
          size="small"
          testID={`mini-sweep-bulk-done-${title.toLowerCase()}`}
        />
        <ActionButton
          action="later"
          isSelected={false}
          onPress={() => onBulkAction(itemIds, 'later')}
          size="small"
          testID={`mini-sweep-bulk-later-${title.toLowerCase()}`}
        />
      </View>

      {/* Item List */}
      <View style={sectionStyles.itemList}>
        {items.map((item, index) => {
          const decision = stagedDecisions.get(item.id);
          const isLast = index === items.length - 1;
          return (
            <View
              key={item.id}
              style={[sectionStyles.itemRow, isLast && sectionStyles.itemRowLast]}
            >
              <Text style={sectionStyles.itemName} numberOfLines={2}>
                {item.name}
              </Text>
              <View style={sectionStyles.decisionButtons}>
                <ActionButton
                  action="today"
                  isSelected={decision === 'today'}
                  onPress={() => onDecision(item.id, 'today')}
                  testID={`mini-sweep-today-${item.id}`}
                />
                <ActionButton
                  action="done"
                  isSelected={decision === 'done'}
                  onPress={() => onDecision(item.id, 'done')}
                  testID={`mini-sweep-done-${item.id}`}
                />
                <ActionButton
                  action="later"
                  isSelected={decision === 'later'}
                  onPress={() => onDecision(item.id, 'later')}
                  testID={`mini-sweep-later-${item.id}`}
                />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  container: {
    marginBottom: 16,
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.md,
    ...BRAND.elevation.one,
  },
  header: {
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    marginBottom: 2,
  },
  headerDescription: {
    fontSize: 12,
    color: '#666666',
  },
  bulkActionRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  itemList: {
    // No padding - items handle their own
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E6E1',
  },
  itemRowLast: {
    borderBottomWidth: 0,
  },
  itemName: {
    flex: 1,
    fontSize: 14,
    color: BRAND.colors.charcoalInk,
    marginRight: 12,
  },
  decisionButtons: {
    flexDirection: 'row',
    gap: 6,
  },
});

/**
 * MiniSweepGate - Main component
 */
export function MiniSweepGate({
  rolledOverTodos,
  unscheduledTodos,
  onComplete,
  onSkip,
}: MiniSweepGateProps) {
  const insets = useSafeAreaInsets();

  // Zustand actions
  const updateTodo = useGremlyStore((s) => s.updateTodo);
  const archiveTodo = useGremlyStore((s) => s.archiveTodo);

  // Local state for staged decisions
  const [stagedDecisions, setStagedDecisions] = useState<Map<string, SweepDecision>>(new Map());

  // Track if save is in progress
  const [isSaving, setIsSaving] = useState(false);

  // Handle decision for an item (toggle behavior)
  const handleDecision = useCallback((id: string, decision: SweepDecision) => {
    setStagedDecisions((prev) => {
      const next = new Map(prev);
      // Toggle off if same decision clicked again
      if (prev.get(id) === decision) {
        next.delete(id);
      } else {
        next.set(id, decision);
      }
      return next;
    });
  }, []);

  // Handle bulk action for multiple items
  const handleBulkAction = useCallback((ids: string[], decision: SweepDecision) => {
    setStagedDecisions((prev) => {
      const next = new Map(prev);
      ids.forEach((id) => {
        next.set(id, decision);
      });
      return next;
    });
  }, []);

  // Commit all staged changes
  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);

    const today = getTodayDateString();

    try {
      const updates: Promise<void>[] = [];

      for (const [id, decision] of stagedDecisions.entries()) {
        switch (decision) {
          case 'today':
            // Set due_day to today
            updates.push(updateTodo(id, { due_day: today }));
            break;
          case 'done':
            // Archive the todo as swept/completed
            updates.push(archiveTodo(id, 'swept'));
            break;
          case 'later':
            // Clear due_day (unschedule) - item goes back to unscheduled pool
            updates.push(updateTodo(id, { due_day: null }));
            break;
        }
      }

      await Promise.all(updates);
      onComplete();
    } catch (error) {
      console.error('[MiniSweepGate] Error saving decisions:', error);
      // Still call onComplete to not block the user
      onComplete();
    } finally {
      setIsSaving(false);
    }
  }, [stagedDecisions, updateTodo, archiveTodo, onComplete, isSaving]);

  // Count of items with decisions
  const decisionCount = stagedDecisions.size;
  const totalItems = rolledOverTodos.length + unscheduledTodos.length;

  // If no items, don't render
  if (totalItems === 0) {
    return null;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="mini-sweep-gate">
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>A few things rolled over...</Text>
      </View>

      {/* Gremly Instructions */}
      <View style={styles.gremlyRow}>
        <Image source={MORNING_BRIEF_GREMLY} style={styles.gremlyMascot} resizeMode="contain" />
        <Text style={styles.gremlyText}>Let&apos;s quick-sort these before planning your day!</Text>
      </View>

      {/* Action Description */}
      <Text style={styles.actionDescription}>
        Today adds to your focus • Done archives it • Later saves for Evening Sweep
      </Text>

      {/* Scrollable sections */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {/* Rolled Over Section */}
        {rolledOverTodos.length > 0 && (
          <MiniSweepSection
            title="Rolled Over"
            description="Tasks that were due before today"
            items={rolledOverTodos}
            stagedDecisions={stagedDecisions}
            onDecision={handleDecision}
            onBulkAction={handleBulkAction}
          />
        )}

        {/* Unscheduled Section */}
        {unscheduledTodos.length > 0 && (
          <MiniSweepSection
            title="Unscheduled"
            description="Recent captures without a date"
            items={unscheduledTodos}
            stagedDecisions={stagedDecisions}
            onDecision={handleDecision}
            onBulkAction={handleBulkAction}
          />
        )}
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.footerButtons}>
          <Pressable style={styles.skipButton} onPress={onSkip} testID="mini-sweep-skip">
            <Text style={styles.skipButtonText}>Skip</Text>
          </Pressable>
          <Pressable
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isSaving}
            testID="mini-sweep-save"
          >
            <Text style={styles.saveButtonText}>
              {isSaving ? 'Saving...' : decisionCount > 0 ? `Save (${decisionCount})` : 'Save'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.colors.linenCream,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
  },
  gremlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  gremlyMascot: {
    width: 54,
    height: 54,
    marginRight: 12,
  },
  gremlyText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: BRAND.colors.inkSubtle,
  },
  actionDescription: {
    fontSize: 12,
    color: '#666666',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.borderSubtle,
    backgroundColor: BRAND.colors.linenCream,
  },
  footerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  skipButton: {
    flex: 1,
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
  },
  skipButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: BRAND.colors.inkSubtle,
  },
  saveButton: {
    flex: 1,
    backgroundColor: BRAND.colors.sageMist,
    borderRadius: BRAND.radius.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },
});

export default MiniSweepGate;
