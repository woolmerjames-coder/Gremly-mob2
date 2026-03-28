/**
 * MiniSweepGate - Quick-sort gate for rolled over and unscheduled items
 *
 * Shown before Morning Brief when there are items that need attention.
 * Uses 3-position toggle: Archive | Defer | Today
 */

import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Image, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock } from 'lucide-react-native';
import { BRAND } from '../../../design/brand';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { MiniSweepItemRow } from './MiniSweepItemRow';
import type { MiniSweepPosition } from './MiniSweepToggle';
import type { Todo } from '../../../lib/types';
import { useMiniSweepCalendarContext } from '../../../lib/store/capacitySelectors';
import { getDateService } from '../../../lib/date';

// eslint-disable-next-line @typescript-eslint/no-var-requires -- React Native image import
const MORNING_BRIEF_GREMLY = require('../../../assets/mascot/morningbriefgremly.png');

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
 * MiniSweepSection - Section for a category of items with bulk actions
 */
interface MiniSweepSectionProps {
  title: string;
  helperText: string;
  items: Todo[];
  decisions: Map<string, MiniSweepPosition>;
  onDecision: (id: string, decision: MiniSweepPosition) => void;
  onBulkAction: (ids: string[], decision: MiniSweepPosition) => void;
}

function MiniSweepSection({
  title,
  helperText,
  items,
  decisions,
  onDecision,
  onBulkAction,
}: MiniSweepSectionProps) {
  if (items.length === 0) return null;

  const itemIds = items.map((item) => item.id);

  return (
    <View style={sectionStyles.sectionContainer}>
      {/* Section Banner with controls explanation */}
      <View style={sectionStyles.sectionBanner}>
        <View style={sectionStyles.sectionTitleRow}>
          <View style={sectionStyles.sectionAccent} />
          <Text style={sectionStyles.sectionTitle}>
            {title} ({items.length})
          </Text>
          <Text style={sectionStyles.sectionHelper} numberOfLines={1}>
            {'  ·  '}
            {helperText}
          </Text>
        </View>
        <View style={sectionStyles.sectionControls}>
          <Text style={sectionStyles.controlText}>← Archive</Text>
          <Text style={sectionStyles.controlTextCenter}>Defer</Text>
          <Text style={sectionStyles.controlText}>Today →</Text>
        </View>
      </View>

      {/* Item List */}
      <View style={sectionStyles.itemList}>
        {items.map((item, index) => {
          const decision = decisions.get(item.id) ?? 'defer';
          const isLast = index === items.length - 1;
          return (
            <MiniSweepItemRow
              key={item.id}
              item={item}
              value={decision}
              onChange={(value) => onDecision(item.id, value)}
              isLast={isLast}
            />
          );
        })}
      </View>

      {/* Bulk actions at bottom */}
      <View style={sectionStyles.bulkActions}>
        <Pressable
          style={sectionStyles.bulkButton}
          onPress={() => onBulkAction(itemIds, 'archive')}
          testID={`mini-sweep-bulk-archive-${title.toLowerCase()}`}
        >
          <Text style={sectionStyles.bulkButtonText}>All Archive</Text>
        </Pressable>
        <Pressable
          style={sectionStyles.bulkButton}
          onPress={() => onBulkAction(itemIds, 'defer')}
          testID={`mini-sweep-bulk-defer-${title.toLowerCase()}`}
        >
          <Text style={sectionStyles.bulkButtonText}>All Defer</Text>
        </Pressable>
        <Pressable
          style={sectionStyles.bulkButton}
          onPress={() => onBulkAction(itemIds, 'today')}
          testID={`mini-sweep-bulk-today-${title.toLowerCase()}`}
        >
          <Text style={sectionStyles.bulkButtonText}>All Today</Text>
        </Pressable>
      </View>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  sectionContainer: {
    marginBottom: 16,
  },
  sectionBanner: {
    paddingHorizontal: 4,
    paddingVertical: 8,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionAccent: {
    width: 3,
    height: 16,
    backgroundColor: BRAND.colors.periwinkleSmoke,
    borderRadius: 2,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
  },
  sectionHelper: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
  },
  sectionControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  controlText: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
  },
  controlTextCenter: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
  },
  itemList: {
    // Items handle their own padding
  },
  bulkActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 16,
  },
  bulkButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
    backgroundColor: BRAND.colors.surface,
  },
  bulkButtonText: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    fontWeight: '500',
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

  // Calendar-aware Gremly message
  const { gremlyMessage } = useMiniSweepCalendarContext();

  // Zustand actions
  const updateTodo = useGremlyStore((s) => s.updateTodo);
  const archiveTodo = useGremlyStore((s) => s.archiveTodo);

  // Initialize all items to 'defer' by default
  const allItems = useMemo(
    () => [...rolledOverTodos, ...unscheduledTodos],
    [rolledOverTodos, unscheduledTodos],
  );

  const initialDecisions = useMemo(() => {
    const map = new Map<string, MiniSweepPosition>();
    allItems.forEach((item) => map.set(item.id, 'defer'));
    return map;
  }, [allItems]);

  // Local state for staged decisions
  const [decisions, setDecisions] = useState<Map<string, MiniSweepPosition>>(initialDecisions);

  // Track if save is in progress
  const [isSaving, setIsSaving] = useState(false);

  // Handle decision for an item
  const handleDecision = useCallback((id: string, decision: MiniSweepPosition) => {
    setDecisions((prev) => {
      const next = new Map(prev);
      next.set(id, decision);
      return next;
    });
  }, []);

  // Handle bulk action for multiple items
  const handleBulkAction = useCallback((ids: string[], decision: MiniSweepPosition) => {
    setDecisions((prev) => {
      const next = new Map(prev);
      ids.forEach((id) => {
        next.set(id, decision);
      });
      return next;
    });
  }, []);

  // Commit all staged changes
  const handleSave = useCallback(() => {
    if (isSaving) return;
    setIsSaving(true);

    const today = getDateService().today();
    console.log('[MiniSweepGate] handleSave called. Decisions:', decisions.size);

    // Start all updates but don't wait for them
    const updates: Promise<void>[] = [];

    for (const [id, decision] of decisions.entries()) {
      console.log('[MiniSweepGate] Processing decision:', { id, decision });
      switch (decision) {
        case 'today':
          // Set due_day to today - item flows to Morning Brief and Today's Focus
          updates.push(updateTodo(id, { due_day: today }));
          break;
        case 'archive':
          // Archive the todo - disappears from all views
          updates.push(archiveTodo(id, 'mini_sweep'));
          break;
        case 'defer':
          // Do nothing - item stays as-is for Evening Sweep
          break;
      }
    }

    // Fire and forget - let updates happen in background
    Promise.all(updates)
      .then(() => {
        console.log('[MiniSweepGate] All updates completed');
      })
      .catch((error) => {
        console.error('[MiniSweepGate] Error saving decisions:', error);
      });

    // Immediately transition - don't wait for updates to avoid flash
    onComplete();
  }, [decisions, updateTodo, archiveTodo, onComplete, isSaving]);

  // Count of items NOT deferred (actual changes)
  const changeCount = Array.from(decisions.values()).filter((d) => d !== 'defer').length;
  const totalItems = rolledOverTodos.length + unscheduledTodos.length;

  // If no items, don't render
  if (totalItems === 0) {
    return null;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="mini-sweep-gate">
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>A few loose ends</Text>
          <View style={styles.timeEstimate}>
            <Clock size={14} color={BRAND.colors.inkMuted} />
            <Text style={styles.timeText}>~{Math.max(1, Math.floor(totalItems / 6.5))} min</Text>
          </View>
        </View>
        <View style={styles.gremlyRow}>
          <Image source={MORNING_BRIEF_GREMLY} style={styles.gremlyImage} resizeMode="contain" />
          <View style={styles.gremlyTextContainer}>
            <Text style={styles.gremlyTextIntro}>{gremlyMessage}</Text>
            <Text style={styles.gremlyTextInstructions}>
              Slide <Text style={styles.highlightRight}>right</Text> to add to today. Slide{' '}
              <Text style={styles.highlightLeft}>left</Text> to archive. Leave in{' '}
              <Text style={styles.highlightMiddle}>middle</Text> to revisit later.
            </Text>
          </View>
        </View>
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
            helperText="from yesterday/earlier"
            items={rolledOverTodos}
            decisions={decisions}
            onDecision={handleDecision}
            onBulkAction={handleBulkAction}
          />
        )}

        {/* Section separator */}
        {rolledOverTodos.length > 0 && unscheduledTodos.length > 0 && (
          <View style={styles.sectionSeparator} />
        )}

        {/* Unscheduled Section */}
        {unscheduledTodos.length > 0 && (
          <MiniSweepSection
            title="Unscheduled"
            helperText="recent captures"
            items={unscheduledTodos}
            decisions={decisions}
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
              {isSaving ? 'Saving...' : changeCount > 0 ? `Save (${changeCount})` : 'Save'}
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
    paddingTop: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
  },
  timeEstimate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
  },
  gremlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  gremlyImage: {
    width: 48,
    height: 48,
    marginRight: 12,
  },
  gremlyTextContainer: {
    flex: 1,
  },
  gremlyTextIntro: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    marginBottom: 4,
  },
  gremlyTextInstructions: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    lineHeight: 18,
  },
  highlightRight: {
    fontWeight: '700',
    color: BRAND.colors.mossGreen,
  },
  highlightLeft: {
    fontWeight: '700',
    color: BRAND.colors.inkMuted,
  },
  highlightMiddle: {
    fontWeight: '600',
    fontStyle: 'italic',
    color: BRAND.colors.periwinkleSmoke,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  sectionSeparator: {
    height: 1,
    backgroundColor: BRAND.colors.borderSubtle,
    marginVertical: 8,
  },
  footer: {
    paddingHorizontal: 16,
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
