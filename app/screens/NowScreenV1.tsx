/**
 * Now Screen V1 - Main NOW page
 * Feature flag: EXPO_PUBLIC_NOW_V1
 * Phase 3: Real data wiring
 * Phase 4: Wire interactions
 */

import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  Text,
  Animated,
  Easing,
  ActivityIndicator,
} from 'react-native';
import { CompletionCheckIcon } from '../../components/today/CompletionCheckIcon';
import { Screen } from '../../ui';
import { NowHeader } from '../../components/now/NowHeader';
import { NowFocusRow } from '../../components/now/NowFocusRow';
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
import type { NowProgressDotItem } from '../../components/now/NowHeader';

export default function NowScreenV1() {
  // Shared interactions from Today screen
  const interactions = useTodayInteractions({
    celebrationEnabled: false, // Can enable later
    showCelebrationToast: false, // Disable toast on NOW - use dot glow instead
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

  // Build progress items for dots (all today items with done status)
  const progressItems: NowProgressDotItem[] = useMemo(() => {
    const allItems = [...lockedItems, ...activeItems];
    return allItems.map((item) => {
      const isDone =
        (item.type === 'todo' && interactions.completedTodoIds.has(item.id)) ||
        (item.type === 'habit' && interactions.completedHabitIds.has(item.id));
      return {
        id: item.id,
        type: item.type as 'todo' | 'habit',
        done: isDone,
      };
    });
  }, [lockedItems, activeItems, interactions.completedTodoIds, interactions.completedHabitIds]);

  // Build justCompletedIds set from the interaction hook's lastPendingInfo
  const justCompletedIds = useMemo(() => {
    const set = new Set<string>();
    if (interactions.lastPendingInfo?.persisted) {
      set.add(interactions.lastPendingInfo.id);
    }
    return set;
  }, [interactions.lastPendingInfo]);

  // Filter out completed items from the display lists
  const displayLockedItems = useMemo(() => {
    return lockedItems.filter((item) => {
      if (item.type === 'todo') return !interactions.completedTodoIds.has(item.id);
      if (item.type === 'habit') return !interactions.completedHabitIds.has(item.id);
      return true;
    });
  }, [lockedItems, interactions.completedTodoIds, interactions.completedHabitIds]);

  const displayActiveItems = useMemo(() => {
    return activeItems.filter((item) => {
      if (item.type === 'todo') return !interactions.completedTodoIds.has(item.id);
      if (item.type === 'habit') return !interactions.completedHabitIds.has(item.id);
      return true;
    });
  }, [activeItems, interactions.completedTodoIds, interactions.completedHabitIds]);

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

  // Handle sweep complete - show appropriate toast after modal closes
  const handleSweepComplete = useCallback(
    (summary: { archived: number; total: number }) => {
      // Modal is now closed, safe to show toast
      if (summary.archived > 0) {
        // Items were archived
        showToast({ type: 'success', content: "Everything's where it should be." });
      } else if (summary.total > 0) {
        // Items were handled but none archived
        showToast({ type: 'success', content: "You're all set for today." });
      }
      // Reload to reflect any changes
      void reload();
    },
    [showToast, reload],
  );

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
        progressItems={progressItems}
        justCompletedIds={justCompletedIds}
        onPressProgress={() => setProgressVisible(true)}
        onPressWeek={() => setWeekVisible(true)}
      />
      <View style={styles.sectionHeaderRow}>
        {/* Left: Two-line header block */}
        <View style={styles.sectionHeaderLeft}>
          <Text style={styles.sectionTitle}>Today's Focus</Text>
          <View style={styles.sectionSubtitleRow}>
            <CompletionCheckIcon completed={totalCompletedToday > 0} size={16} />
            <Text style={styles.sectionSubtitle}>
              <Text style={styles.completedCount}>{totalCompletedToday}</Text> of {totalTasksToday}{' '}
              done
            </Text>
          </View>
        </View>
        {/* Right: Sweep pill in HIGH state (uses showInHeader flag) */}
        {sweepStatus.showInHeader && (
          <TodayPillsRow
            sweepLevel={sweepStatus.level}
            sweepLabel={sweepStatus.headerLabel}
            sweepCountLabel=""
            onSweepPress={handleSweepPress}
            onAddPress={handleAddPress}
            showSweepOnly
            compact
          />
        )}
      </View>
      <TodayFocusList
        lockedItems={displayLockedItems}
        activeItems={displayActiveItems}
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

      {/* TODO: In a future branch, replace SweepDrawer with CompletedItemsModal
          from TodayV3 for parity. The new modal shows completed items (habits + todos)
          with clearer "Daily Review" / "Evening Review" copy. See TodayV3View.tsx
          for the updated implementation. */}
      <SweepDrawer
        visible={isSweepVisible}
        onClose={() => setSweepVisible(false)}
        onSweepComplete={handleSweepComplete}
      />

      <NowQuickAddModal
        visible={isQuickAddVisible}
        onClose={() => setQuickAddVisible(false)}
        onSubmit={handleQuickAddSubmit}
        onPressManualAdd={handleQuickAddManual}
      />
    </Screen>
  );
}

/**
 * Animated optimistic card that fades in on mount and fades out + slides down on unmount.
 * Uses a "leaving" state pattern since React Native Animated doesn't support exit animations natively.
 * Features calm background processing animation with animated dots.
 */
type OptimisticQuickAddCardProps = {
  id: string;
  title: string;
  onExitComplete?: () => void;
  isLeaving?: boolean;
};

// Brand color for loading indicator
const MOSS_GREEN = '#2E5540';

/* eslint-disable react-hooks/refs -- Animated.Value refs are intentionally accessed in render for RN animations */
function OptimisticQuickAddCard({
  id,
  title,
  onExitComplete,
  isLeaving,
}: OptimisticQuickAddCardProps) {
  // Animation refs for React Native Animated API
  const opacityRef = useRef(new Animated.Value(0));
  const translateYRef = useRef(new Animated.Value(0));
  const textOpacityRef = useRef(new Animated.Value(0.6));

  // Animated dots: add one every 500ms, reset after 3
  const [dots, setDots] = useState('');

  // Animated dots interval
  useEffect(() => {
    if (isLeaving) return; // Don't animate dots when leaving

    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, [isLeaving]);

  // Gentle text opacity pulse
  useEffect(() => {
    if (isLeaving) return; // Stop pulse animation when leaving

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(textOpacityRef.current, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(textOpacityRef.current, {
          toValue: 0.6,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [isLeaving]);

  // Fade in on mount
  useEffect(() => {
    Animated.timing(opacityRef.current, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, []);

  // Fade out + slide down when leaving
  useEffect(() => {
    if (isLeaving) {
      Animated.parallel([
        Animated.timing(opacityRef.current, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateYRef.current, {
          toValue: 4,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        onExitComplete?.();
      });
    }
  }, [isLeaving, onExitComplete]);

  return (
    <Animated.View
      key={id}
      style={[
        styles.optimisticCard,
        {
          opacity: opacityRef.current,
          transform: [{ translateY: translateYRef.current }],
        },
      ]}
      accessibilityLabel={`Processing ${title}`}
      accessibilityRole="text"
    >
      <View style={styles.optimisticContent}>
        <View style={styles.optimisticTextContainer}>
          <Text numberOfLines={1} style={styles.optimisticTitle}>
            {title}
          </Text>
          <Animated.Text
            style={[styles.optimisticSubtitle, { opacity: textOpacityRef.current }]}
            accessibilityLabel="Processing"
          >
            Processing{dots}
          </Animated.Text>
        </View>
        <View style={styles.optimisticLoader}>
          <ActivityIndicator size="small" color={MOSS_GREEN} />
        </View>
      </View>
    </Animated.View>
  );
}
/* eslint-enable react-hooks/refs */

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
  // Track leaving card for exit animation
  const [leavingCard, setLeavingCard] = useState<{ id: string; title: string } | null>(null);
  const prevOptimisticRef = useRef<{ id: string; title: string } | null>(null);

  // Detect when optimistic card is being removed and trigger exit animation
  useEffect(() => {
    const prev = prevOptimisticRef.current;
    const curr = optimisticQuickAdd;

    // If we had a card and now we don't, trigger exit animation
    if (prev && !curr) {
      setLeavingCard(prev);
    }

    prevOptimisticRef.current = curr ?? null;
  }, [optimisticQuickAdd]);

  const handleExitComplete = useCallback(() => {
    setLeavingCard(null);
  }, []);

  const hasNoItems =
    lockedItems.length === 0 && activeItems.length === 0 && !optimisticQuickAdd && !leavingCard;
  const isAllComplete =
    progressPercent === 100 && hasAnyTodayWork && !optimisticQuickAdd && !leavingCard;

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

      {lockedItems.map((item, index) => (
        <NowFocusRow
          key={item.id}
          item={item}
          isCompleted={isItemCompleted(item)}
          isLocked
          isFirst={index === 0}
          isLast={index === lockedItems.length - 1 && activeItems.length === 0}
          onPress={() => onPressItem?.(item)}
          onToggleComplete={() => onToggleComplete?.(item)}
        />
      ))}

      {activeItems.map((item, index) => (
        <NowFocusRow
          key={item.id}
          item={item}
          isCompleted={isItemCompleted(item)}
          isFirst={lockedItems.length === 0 && index === 0}
          isLast={index === activeItems.length - 1}
          onPress={() => onPressItem?.(item)}
          onToggleComplete={() => onToggleComplete?.(item)}
        />
      ))}

      {/* Optimistic 'Processing...' card appended after active items */}
      {/* Shows active card while processing, or leaving card during exit animation */}
      {optimisticQuickAdd && (
        <OptimisticQuickAddCard
          key={optimisticQuickAdd.id}
          id={optimisticQuickAdd.id}
          title={optimisticQuickAdd.title}
        />
      )}
      {!optimisticQuickAdd && leavingCard && (
        <OptimisticQuickAddCard
          key={leavingCard.id}
          id={leavingCard.id}
          title={leavingCard.title}
          isLeaving
          onExitComplete={handleExitComplete}
        />
      )}

      {futureItems.length > 0 && <NowFutureDivider />}

      {futureItems.map((item, index) => (
        <NowFocusRow
          key={item.id}
          item={item}
          isFuture
          isCompleted={isItemCompleted(item)}
          isFirst={index === 0}
          isLast={index === futureItems.length - 1}
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
  },
  sectionSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2, // Reduced from 4 for tighter header
  },
  completedCount: {
    fontWeight: '700',
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
  optimisticLoader: {
    marginLeft: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // TodayPillsRow container - used below cards
  pillsRowContainer: {
    marginTop: 8, // Tightened spacing after cards
    marginBottom: 0, // listBottomSpacer handles bottom spacing
  },
});
