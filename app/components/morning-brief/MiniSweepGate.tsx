/**
 * MiniSweepGate - Quick-sort gate for rolled over and unscheduled items
 *
 * Shown before Morning Brief when there are items that need attention.
 * Allows users to quickly decide: Today, Done, or Later for each item.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Image, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND } from '../../../design/brand';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import type { Todo } from '../../../lib/types';

// eslint-disable-next-line @typescript-eslint/no-var-requires -- React Native image import
const MORNING_BRIEF_GREMLY = require('../../../assets/mascot/morningbriefgremly.png');

// Decision types for mini-sweep
type SweepDecision = 'today' | 'done' | 'later';

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
 * MiniSweepSection - Collapsible section for a category of items
 */
interface MiniSweepSectionProps {
  title: string;
  count: number;
  items: Todo[];
  stagedDecisions: Map<string, SweepDecision>;
  onDecision: (id: string, decision: SweepDecision) => void;
}

function MiniSweepSection({
  title,
  count,
  items,
  stagedDecisions,
  onDecision,
}: MiniSweepSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (items.length === 0) return null;

  return (
    <View style={sectionStyles.container}>
      <Pressable
        style={sectionStyles.header}
        onPress={() => setIsExpanded(!isExpanded)}
        testID={`mini-sweep-section-${title.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <Text style={sectionStyles.headerTitle}>
          {title} ({count})
        </Text>
        <Text style={sectionStyles.chevron}>{isExpanded ? '▼' : '▶'}</Text>
      </Pressable>

      {isExpanded && (
        <View style={sectionStyles.itemList}>
          {items.map((item) => {
            const decision = stagedDecisions.get(item.id);
            return (
              <View key={item.id} style={sectionStyles.itemRow}>
                <Text style={sectionStyles.itemName} numberOfLines={2}>
                  {item.name}
                </Text>
                <View style={sectionStyles.decisionButtons}>
                  <Pressable
                    style={[
                      sectionStyles.decisionButton,
                      decision === 'today' && sectionStyles.decisionButtonActive,
                      decision === 'today' && { backgroundColor: BRAND.colors.sageMist },
                    ]}
                    onPress={() => onDecision(item.id, 'today')}
                    testID={`mini-sweep-today-${item.id}`}
                  >
                    <Text
                      style={[
                        sectionStyles.decisionButtonText,
                        decision === 'today' && sectionStyles.decisionButtonTextActive,
                      ]}
                    >
                      Today
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      sectionStyles.decisionButton,
                      decision === 'done' && sectionStyles.decisionButtonActive,
                      decision === 'done' && { backgroundColor: BRAND.colors.mossGreen },
                    ]}
                    onPress={() => onDecision(item.id, 'done')}
                    testID={`mini-sweep-done-${item.id}`}
                  >
                    <Text
                      style={[
                        sectionStyles.decisionButtonText,
                        decision === 'done' && sectionStyles.decisionButtonTextActive,
                      ]}
                    >
                      Done
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      sectionStyles.decisionButton,
                      decision === 'later' && sectionStyles.decisionButtonActive,
                      decision === 'later' && { backgroundColor: BRAND.colors.periwinkleSmoke },
                    ]}
                    onPress={() => onDecision(item.id, 'later')}
                    testID={`mini-sweep-later-${item.id}`}
                  >
                    <Text
                      style={[
                        sectionStyles.decisionButtonText,
                        decision === 'later' && sectionStyles.decisionButtonTextActive,
                      ]}
                    >
                      Later
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },
  chevron: {
    fontSize: 10,
    color: BRAND.colors.inkMuted,
  },
  itemList: {
    paddingVertical: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
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
  decisionButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: BRAND.radius.sm,
    backgroundColor: BRAND.colors.linenCream,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
  },
  decisionButtonActive: {
    borderColor: 'transparent',
  },
  decisionButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: BRAND.colors.inkSubtle,
  },
  decisionButtonTextActive: {
    color: BRAND.colors.charcoalInk,
    fontWeight: '600',
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

  // Handle decision for an item
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

  // Commit all staged changes
  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);

    const today = getTodayDateString();
    const now = new Date().toISOString();

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
            count={rolledOverTodos.length}
            items={rolledOverTodos}
            stagedDecisions={stagedDecisions}
            onDecision={handleDecision}
          />
        )}

        {/* Unscheduled Section */}
        {unscheduledTodos.length > 0 && (
          <MiniSweepSection
            title="Unscheduled"
            count={unscheduledTodos.length}
            items={unscheduledTodos}
            stagedDecisions={stagedDecisions}
            onDecision={handleDecision}
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
    marginBottom: 16,
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
