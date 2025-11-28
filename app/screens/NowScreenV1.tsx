/**
 * Now Screen V1 - Main NOW page
 * Feature flag: EXPO_PUBLIC_NOW_V1
 * Phase 3: Real data wiring
 * Phase 4: Wire interactions
 */

import React, { useCallback, useState, useMemo } from 'react';
import { ScrollView, StyleSheet, View, Text } from 'react-native';
import { Screen } from '../../ui';
import { NowHeader } from '../../components/now/NowHeader';
import { NowLockedItemCard } from '../../components/now/NowLockedItemCard';
import { NowActiveItemCard } from '../../components/now/NowActiveItemCard';
import { NowFutureDivider } from '../../components/now/NowFutureDivider';
import { NowQuickAddModal } from '../../components/now/NowQuickAddModal';
import { OverwhelmSelectSheet } from '../../components/now/OverwhelmSelectSheet';
import { OverwhelmPlanSheet } from '../../components/now/OverwhelmPlanSheet';
import { OverwhelmFocusOverlay } from '../../components/now/OverwhelmFocusOverlay';
import { NowProgressPopup } from '../../components/now/NowProgressPopup';
import { NowWeekPopup } from '../../components/now/NowWeekPopup';
import TodayPillsRow from '../../components/today/TodayPillsRow';
import SweepDrawer from '../../components/today/v3/SweepDrawer';
import { useTodayStats } from '../../lib/today/hooks';
import { getSweepStatus, type SweepStatus } from '../../lib/today/useTodayData';
import { useNowQuickAdd } from '../../lib/now/useNowQuickAdd';
import { useOverwhelmFlow } from '../../lib/now/useOverwhelmFlow';
import { useActionToast } from '../../src/hooks/useActionToast';
import { useTodayInteractions } from '../../lib/today/useTodayInteractions';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import type { NowLockedItem, NowActiveItem, NowFutureItem } from '../../lib/now/nowTypes';

export default function NowScreenV1() {
  // Shared interactions from Today screen
  const interactions = useTodayInteractions({
    celebrationEnabled: false, // Can enable later
  });

  // Single source of truth for all Today stats, with optimistic state
  const stats = useTodayStats({
    completedTodoIds: interactions.completedTodoIds,
    completedHabitIds: interactions.completedHabitIds,
    deletedItemIds: interactions.deletedItemIds,
  });

  // Destructure for convenience
  const {
    lockedItems,
    activeItems,
    futureItems,
    completedToday,
    habitsToday,
    completedHabitsToday,
    totalTasksToday,
    totalCompletedToday,
    progressFraction,
    progressPercent,
    hasAnyTodayWork,
    logsToday,
    sweepCandidateCount,
    loading,
    reload,
    nowData,
  } = stats;

  // Compute sweep status based on sweep candidate count
  // For now, daysSinceSweep defaults to 0 (no lastSweepAt tracking yet)
  const sweepStatus = useMemo(() => {
    return getSweepStatus(sweepCandidateCount, 0);
  }, [sweepCandidateCount]);

  const overwhelm = useOverwhelmFlow();
  const overlayController = useUnifiedOverlayController();
  const [isProgressVisible, setProgressVisible] = useState(false);
  const [isWeekVisible, setWeekVisible] = useState(false);
  const [isSweepVisible, setSweepVisible] = useState(false);
  const [isQuickAddVisible, setQuickAddVisible] = useState(false);

  // Optimistic quick-add state - shows 'Processing...' card while pipeline runs
  const [optimisticQuickAdd, setOptimisticQuickAdd] = useState<{
    id: string;
    title: string;
  } | null>(null);

  // Toast for quick add feedback
  const { showToast, Toast: QuickAddToast } = useActionToast();

  // Handle item press - open overlay
  const handlePressItem = useCallback(
    (item: NowLockedItem | NowActiveItem | NowFutureItem) => {
      interactions.openEntityOverlay(item);
    },
    [interactions],
  );

  // Handle toggle complete - type-narrow and delegate
  const handleToggleComplete = useCallback(
    (item: NowLockedItem | NowActiveItem | NowFutureItem) => {
      if (item.type === 'todo') {
        void interactions.toggleTodoComplete(item);
      } else if (item.type === 'habit') {
        void interactions.toggleHabitComplete(item);
      }
    },
    [interactions],
  );

  // Handle overwhelm plan submission
  const handleOverwhelmSubmit = useCallback(() => {
    const selectedItems = [...lockedItems, ...activeItems]
      .filter((item) => overwhelm.selectedIds.includes(item.id))
      .map((item) => ({ id: item.id, title: item.name }));

    void overwhelm.requestPlan(selectedItems);
  }, [overwhelm, lockedItems, activeItems]);

  // Handle sweep press
  const handleSweepPress = useCallback(() => {
    // Open sweep modal (same for both quick sweep and regular sweep)
    setSweepVisible(true);
  }, []);

  // Handle add press - opens quick-add MindDrop modal
  const handleAddPress = useCallback(() => {
    setQuickAddVisible(true);
  }, []);

  // Quick add hook - wires to MindDrop pipeline with Today scoping
  // Uses optimistic flow: onStart for immediate feedback, onComplete for final state
  const quickAdd = useNowQuickAdd({
    onStart: (draftTitle) => {
      console.log('[NowScreenV1] Quick add started:', draftTitle);
      // Show optimistic 'Processing...' card
      setOptimisticQuickAdd({
        id: `now-optimistic-${Date.now()}`,
        title: draftTitle,
      });
    },
    onComplete: (result) => {
      console.log('[NowScreenV1] Quick add complete:', result);
      // Clear optimistic card
      setOptimisticQuickAdd(null);

      // Reload Today data - no toast needed, optimistic card + refresh is the feedback
      if (result.kind === 'todo' || result.kind === 'habit') {
        void reload();
      } else if (result.kind === 'log' || result.kind === 'note') {
        // Log/note doesn't appear on Today, no reload needed
      } else {
        // Unknown outcome - just reload
        void reload();
      }
    },
    onError: (error) => {
      console.error('[NowScreenV1] Quick add error:', error.message);
      // Clear optimistic card and show error toast
      setOptimisticQuickAdd(null);
      showToast({ type: 'success', content: 'Something went wrong. Please try again.' });
    },
  });

  // Handle quick add submission - fire-and-forget, modal closes immediately
  const handleQuickAddSubmit = useCallback(
    (text: string) => {
      quickAdd.onQuickAdd(text);
    },
    [quickAdd],
  );

  // Handle "Prefer to add manually" from quick add modal
  const handleQuickAddManual = useCallback(() => {
    overlayController.openCreate({ type: 'todo', defaultDueToday: true });
  }, [overlayController]);

  // Handle undo from progress popup
  const handleUndoCompletedItem = useCallback(
    (item: { id: string; type: 'habit' | 'todo' }) => {
      void interactions.undoCompletionById(item.id, item.type);
    },
    [interactions],
  );

  // Use today's logs count from useTodayStats
  const capturesCount = logsToday;

  if (loading) {
    return (
      <Screen style={styles.screen} edges={['top', 'bottom']} padded={false}>
        <View />
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen} edges={['top', 'bottom']} padded={false}>
      <NowHeader
        dateTimeLabel={nowData.dateTimeLabel}
        totalTasksToday={totalTasksToday}
        totalCompletedToday={totalCompletedToday}
        progressFraction={progressFraction}
        weeklySummaries={nowData.weeklySummaries}
        capturesCount={capturesCount}
        onPressProgress={() => setProgressVisible(true)}
        onPressWeek={() => setWeekVisible(true)}
      />
      <View style={styles.sectionHeaderRow}>
        {/* Left: Two-line header block */}
        <View style={styles.sectionHeaderLeft}>
          <Text style={styles.sectionTitle}>Today's Focus</Text>
          <Text style={styles.sectionSubtitle}>
            {totalCompletedToday} of {totalTasksToday} done
          </Text>
        </View>
        {/* Right: Sweep pill in HIGH state (uses showInHeader flag) */}
        {sweepStatus.showInHeader && (
          <TodayPillsRow
            sweepLevel={sweepStatus.level}
            sweepLabel={sweepStatus.label}
            sweepCountLabel={sweepStatus.countLabel}
            onSweepPress={handleSweepPress}
            onAddPress={handleAddPress}
            showSweepOnly
            compact
          />
        )}
      </View>
      <TodayFocusList
        lockedItems={lockedItems}
        activeItems={activeItems}
        futureItems={futureItems}
        progressPercent={progressPercent}
        completedTodoIds={interactions.completedTodoIds}
        completedHabitIds={interactions.completedHabitIds}
        hasAnyTodayWork={hasAnyTodayWork}
        onPressItem={handlePressItem}
        onToggleComplete={handleToggleComplete}
        optimisticQuickAdd={optimisticQuickAdd}
        sweepStatus={sweepStatus}
        onSweepPress={handleSweepPress}
        onAddPress={handleAddPress}
      />

      {/* Quick Add toast */}
      {QuickAddToast}

      <NowProgressPopup
        visible={isProgressVisible}
        completed={completedToday}
        totalTasksToday={totalTasksToday}
        totalCompletedToday={totalCompletedToday}
        onClose={() => setProgressVisible(false)}
        onUndoItem={handleUndoCompletedItem}
      />

      <NowWeekPopup
        visible={isWeekVisible}
        habitsToday={habitsToday}
        completedHabitsToday={completedHabitsToday}
        weeklySummaries={nowData.weeklySummaries}
        onClose={() => setWeekVisible(false)}
      />

      <OverwhelmSelectSheet
        visible={overwhelm.step === 'select'}
        items={[...lockedItems, ...activeItems]}
        selectedIds={overwhelm.selectedIds}
        onToggleSelect={overwhelm.toggleSelection}
        onSubmit={handleOverwhelmSubmit}
        onClose={overwhelm.close}
      />

      <OverwhelmPlanSheet
        visible={overwhelm.step === 'planning'}
        plan={overwhelm.plan}
        isLoading={overwhelm.isLoading}
        onEnterFocus={overwhelm.enterFocusMode}
        onChangeSelection={overwhelm.open}
        onClose={overwhelm.close}
      />

      <OverwhelmFocusOverlay
        visible={overwhelm.step === 'focus'}
        plan={overwhelm.plan}
        onExit={overwhelm.exitFocusMode}
      />

      <SweepDrawer visible={isSweepVisible} onClose={() => setSweepVisible(false)} />

      <NowQuickAddModal
        visible={isQuickAddVisible}
        onClose={() => setQuickAddVisible(false)}
        onSubmit={handleQuickAddSubmit}
        onPressManualAdd={handleQuickAddManual}
      />
    </Screen>
  );
}

type TodayFocusListProps = {
  lockedItems: NowLockedItem[];
  activeItems: NowActiveItem[];
  futureItems: NowFutureItem[];
  progressPercent: number;
  completedTodoIds: Set<string>;
  completedHabitIds: Set<string>;
  hasAnyTodayWork: boolean;
  onPressItem?: (item: NowLockedItem | NowActiveItem | NowFutureItem) => void;
  onToggleComplete?: (item: NowLockedItem | NowActiveItem | NowFutureItem) => void;
  optimisticQuickAdd?: { id: string; title: string } | null;
  sweepStatus: SweepStatus;
  onSweepPress: () => void;
  onAddPress: () => void;
};

function TodayFocusList({
  lockedItems,
  activeItems,
  futureItems,
  progressPercent,
  completedTodoIds,
  completedHabitIds,
  hasAnyTodayWork,
  onPressItem,
  onToggleComplete,
  optimisticQuickAdd,
  sweepStatus,
  onSweepPress,
  onAddPress,
}: TodayFocusListProps) {
  const hasNoItems = lockedItems.length === 0 && activeItems.length === 0 && !optimisticQuickAdd;
  const isAllComplete = progressPercent === 100 && hasAnyTodayWork && !optimisticQuickAdd;

  // Helper to check if an item is completed
  const isItemCompleted = (item: NowLockedItem | NowActiveItem | NowFutureItem): boolean => {
    if (item.type === 'todo') {
      return completedTodoIds.has(item.id);
    } else if (item.type === 'habit') {
      return completedHabitIds.has(item.id);
    }
    return false;
  };

  return (
    <ScrollView
      style={styles.listContainer}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
    >
      {isAllComplete && !hasNoItems && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>🎉 All done for today!</Text>
        </View>
      )}

      {hasNoItems && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Nothing scheduled for today.</Text>
          <Text style={styles.emptySubtext}>Enjoy a calmer day — or try a Sweep.</Text>
        </View>
      )}

      {/* Optimistic 'Processing...' card at the top while pipeline runs */}
      {optimisticQuickAdd && (
        <View key={optimisticQuickAdd.id} style={styles.optimisticCard}>
          <View style={styles.optimisticContent}>
            <View style={styles.optimisticTextContainer}>
              <Text numberOfLines={1} style={styles.optimisticTitle}>
                {optimisticQuickAdd.title}
              </Text>
              <Text style={styles.optimisticSubtitle}>Processing...</Text>
            </View>
            <View style={styles.optimisticCheckbox}>
              <Text style={styles.optimisticSpinner}>⏳</Text>
            </View>
          </View>
        </View>
      )}

      {lockedItems.map((item) => (
        <NowLockedItemCard
          key={item.id}
          item={item}
          isCompleted={isItemCompleted(item)}
          onPress={() => onPressItem?.(item)}
          onToggleComplete={() => onToggleComplete?.(item)}
        />
      ))}

      {activeItems.map((item) => (
        <NowActiveItemCard
          key={item.id}
          item={item}
          isCompleted={isItemCompleted(item)}
          onPress={() => onPressItem?.(item)}
          onToggleComplete={() => onToggleComplete?.(item)}
        />
      ))}

      {futureItems.length > 0 && <NowFutureDivider />}

      {futureItems.map((item) => (
        <NowActiveItemCard
          key={item.id}
          item={item}
          future
          isCompleted={isItemCompleted(item)}
          onPress={() => onPressItem?.(item)}
          onToggleComplete={() => onToggleComplete?.(item)}
        />
      ))}

      {/* Bottom pills section - uses showAtBottom flag from sweep status */}
      {/* When showInHeader is true (high state), only show Add pill */}
      {/* When showAtBottom is true (normal/moderate), show both pills */}
      {/* When level is 'none', don't show sweep pill at all */}
      <View style={styles.pillsRowContainer}>
        <TodayPillsRow
          sweepLevel={sweepStatus.level}
          sweepLabel={sweepStatus.label}
          sweepCountLabel={sweepStatus.countLabel}
          onSweepPress={onSweepPress}
          onAddPress={onAddPress}
          showAddOnly={!sweepStatus.showAtBottom}
        />
      </View>

      <View style={styles.listBottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    // backgroundColor inherited from Screen component (t.colors.bg = #FFFDF8)
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginTop: 0,
    marginBottom: 8, // Reduced from 12 to match section spacing
  },
  sectionHeaderLeft: {
    flexDirection: 'column',
    flex: 1,
    flexShrink: 1, // Allow shrinking to prevent text wrap
    marginRight: 12, // Gap before sweep pill when present
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0E1116',
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#757575', // subtle color, matches WEEK label style
    marginTop: 2, // Reduced from 4 for tighter header
  },
  listContainer: {
    flex: 1,
    // backgroundColor inherited from parent for continuous surface
  },
  listContent: {
    padding: 16,
    paddingBottom: 24,
  },
  banner: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  bannerText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#424242',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
  },
  listBottomSpacer: {
    height: 120,
  },
  // Optimistic quick-add card styles (processing state)
  optimisticCard: {
    backgroundColor: '#F5F3EE', // linenCream
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 16,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E5E2DA',
    opacity: 0.8, // Slightly reduced opacity for processing state
  },
  optimisticContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optimisticTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  optimisticTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0E1116',
    lineHeight: 18,
  },
  optimisticSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
    fontStyle: 'italic',
  },
  optimisticCheckbox: {
    marginLeft: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optimisticSpinner: {
    fontSize: 16,
  },
  // TodayPillsRow container - used below cards
  pillsRowContainer: {
    marginTop: 8, // Tightened spacing after cards
    marginBottom: 0, // listBottomSpacer handles bottom spacing
  },
});
