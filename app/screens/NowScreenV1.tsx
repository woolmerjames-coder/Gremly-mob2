/**
 * Now Screen V1 - Main NOW page
 * Feature flag: EXPO_PUBLIC_NOW_V1
 * Phase 3: Real data wiring
 * Phase 4: Wire interactions
 *
 * TODO: Remove legacy SweepDrawer component once Sweep v2 has shipped to prod.
 *       SweepDrawer.tsx still exists at components/today/v3/SweepDrawer.tsx but is no longer used.
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
  Pressable,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../ui';
import { NowHeader } from '../../components/now/NowHeader';
import { NowFocusRow } from '../../components/now/NowFocusRow';
import { NowFutureDivider } from '../../components/now/NowFutureDivider';
import { OverdueSection, RecentDropsSection, SweepPill } from '../../components/now';
import { NowQuickAddModal } from '../../components/now/NowQuickAddModal';
import { OverwhelmSelectSheet } from '../../components/now/OverwhelmSelectSheet';
import { OverwhelmPlanSheet } from '../../components/now/OverwhelmPlanSheet';
import { OverwhelmFocusOverlay } from '../../components/now/OverwhelmFocusOverlay';
import { NowProgressPopup } from '../../components/now/NowProgressPopup';
import { NowWeekPopup } from '../../components/now/NowWeekPopup';
import { YourNotesPopup } from '../../components/now/YourNotesPopup';
import { JournalFullScreen } from '../../components/now/JournalFullScreen';
import { useRecentLogs, type LogItem } from '../../lib/notes/useRecentLogs';
import { useTodayStats } from '../../lib/today/hooks';
import { useNowQuickAdd } from '../../lib/now/useNowQuickAdd';
import { useOverwhelmFlow } from '../../lib/now/useOverwhelmFlow';
import { useActionToast } from '../../src/hooks/useActionToast';
import { useTodayInteractions } from '../../lib/today/useTodayInteractions';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import { useRepo } from '../../providers/RepoProvider';
import { useEntityMutations } from '../../hooks/useEntityMutations';
import type { NowLockedItem, NowActiveItem, NowFutureItem } from '../../lib/now/nowTypes';
import type { SweepCandidate } from '../../lib/today/sweepSelectors';
import type { RootStackParamList } from '../../navigation/RootNavigator';

/**
 * Time window priority for sorting
 * Lower number = higher priority (shown first)
 */
const TIME_WINDOW_PRIORITY: Record<string, number> = {
  morning: 1,
  any: 2,
  midday: 3,
  afternoon: 4,
  evening: 5,
};

/**
 * Infer time window from item name if not explicitly set
 * Looks for keywords like "Morning", "Evening", "Daily" in the name
 */
function inferTimeWindow(item: NowActiveItem): string {
  // If explicitly set, use it
  if (item.timeWindow && item.timeWindow !== 'any') {
    return item.timeWindow;
  }

  // Infer from name (case-insensitive)
  const nameLower = item.name.toLowerCase();

  if (nameLower.includes('morning')) {
    return 'morning';
  }
  if (nameLower.includes('evening') || nameLower.includes('night')) {
    return 'evening';
  }
  if (nameLower.includes('afternoon')) {
    return 'afternoon';
  }
  if (nameLower.includes('midday') || nameLower.includes('noon') || nameLower.includes('lunch')) {
    return 'midday';
  }

  // Default to 'any' for daily/anytime items
  return 'any';
}

/**
 * Parse time string (HH:mm) to minutes since midnight for comparison
 */
function parseTimeToMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

/**
 * Sort active items by time window priority and due time
 * Order: morning → any → midday → afternoon → evening
 * Within each group: sort by specific due time (earliest first), then by name
 */
function sortActiveItems<T extends NowActiveItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    // Get time window priority, inferring from name if not set
    const aWindow = inferTimeWindow(a);
    const bWindow = inferTimeWindow(b);
    const aPriority = TIME_WINDOW_PRIORITY[aWindow] ?? 2;
    const bPriority = TIME_WINDOW_PRIORITY[bWindow] ?? 2;

    // Compare by time window first
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    // Within same time window, sort by specific due time
    const aTime = parseTimeToMinutes(a.dueTime);
    const bTime = parseTimeToMinutes(b.dueTime);

    // Items with specific time come before items without
    if (aTime !== null && bTime === null) return -1;
    if (aTime === null && bTime !== null) return 1;

    // Both have times - sort by time (earliest first)
    if (aTime !== null && bTime !== null) {
      if (aTime !== bTime) return aTime - bTime;
    }

    // Finally, sort alphabetically by name as tiebreaker
    return a.name.localeCompare(b.name);
  });
}

export default function NowScreenV1() {
  // Safe area insets for proper bottom positioning
  const insets = useSafeAreaInsets();

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
    overdueTodos,
    recentDrops,
    sweepCandidateCount,
    todayDayString,
    loading,
    reload,
    nowData,
  } = stats;

  // Refresh data when screen gains focus (e.g. returning from Mind Drop)
  // This ensures Recent Drops updates immediately after creating new items
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  // Filter out completed items from the display lists
  // Locked items are always shown first (highest priority)
  const displayLockedItems = useMemo(() => {
    return lockedItems.filter((item) => {
      if (item.type === 'todo') return !interactions.completedTodoIds.has(item.id);
      if (item.type === 'habit') return !interactions.completedHabitIds.has(item.id);
      return true;
    });
  }, [lockedItems, interactions.completedTodoIds, interactions.completedHabitIds]);

  // Active items: filter completed, then sort by time window priority
  const displayActiveItems = useMemo(() => {
    const filtered = activeItems.filter((item) => {
      if (item.type === 'todo') return !interactions.completedTodoIds.has(item.id);
      if (item.type === 'habit') return !interactions.completedHabitIds.has(item.id);
      return true;
    });
    // Sort by time window: morning → any → afternoon/evening
    return sortActiveItems(filtered);
  }, [activeItems, interactions.completedTodoIds, interactions.completedHabitIds]);

  const overwhelm = useOverwhelmFlow();
  const overlayController = useUnifiedOverlayController();
  const repo = useRepo();
  const entityMutations = useEntityMutations();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [isProgressVisible, setProgressVisible] = useState(false);
  const [isWeekVisible, setWeekVisible] = useState(false);
  const [isQuickAddVisible, setQuickAddVisible] = useState(false);
  const [isNotesVisible, setNotesVisible] = useState(false);
  const [isJournalVisible, setJournalVisible] = useState(false);
  const [selectedJournalId, setSelectedJournalId] = useState<string | null>(null);

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

  // Handle add press - opens quick-add MindDrop modal
  const handleAddPress = useCallback(() => {
    setQuickAddVisible(true);
  }, []);

  // Add item to Today's Focus by setting due_day to today
  // Uses todayDayString from useTodayStats to ensure consistency with Today/Sweep logic
  const handleAddToToday = useCallback(
    async (item: SweepCandidate) => {
      try {
        // Capture before state for test logging
        const beforeState = {
          in_today: item.due_day === todayDayString,
          space_id: item.space_id ?? null,
          archived: false,
          dueDay: item.due_day ?? null,
        };

        // Use entity mutations with test logging
        const result = await entityMutations.addToToday(item.id, 'todo', beforeState);

        if (result.success) {
          // Refresh Today stats so the item moves from Recent Drops to Today's Focus
          await reload();
        } else {
          console.warn('[NowScreenV1] Add to Today failed:', result.error);
        }
      } catch (error) {
        console.warn('[NowScreenV1] Add to Today failed:', error);
      }
    },
    [entityMutations, reload, todayDayString],
  );

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
      // Clear optimistic card - no toast needed, error is logged
      setOptimisticQuickAdd(null);
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

  // Fetch recent logs for Your Notes card preview
  const { logs: recentLogs, totalCount: recentLogsCount } = useRecentLogs(7);

  // Handle Your Notes card press
  const handleNotesPress = useCallback(() => {
    setNotesVisible(true);
  }, []);

  // Handle selecting a log from YourNotesPopup
  const handleSelectLog = useCallback(
    (log: LogItem) => {
      setNotesVisible(false);
      // Open overlay to edit this note
      overlayController.openEdit({
        record: { id: log.id, type: 'note' } as any,
      });
    },
    [overlayController],
  );

  // Handle selecting a journal from YourNotesPopup
  const handleSelectJournal = useCallback((log: LogItem) => {
    setNotesVisible(false);
    setSelectedJournalId(log.id);
    setJournalVisible(true);
  }, []);

  // Handle creating new note from YourNotesPopup quick capture
  const handleNotesCreateNew = useCallback(
    (text: string, noteType: 'journal' | 'idea' | 'general', _isList: boolean) => {
      setNotesVisible(false);
      // Map UI note type to LogSubtype
      const logSubtype = noteType === 'general' ? 'general' : noteType;
      // Open overlay with prefilled text and type
      overlayController.openCreate({
        type: 'log',
        logSubtype,
        initialText: text,
        // TODO: Handle _isList flag when list creation is supported
      });
    },
    [overlayController],
  );

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
        weeklySummaries={nowData.weeklySummaries}
        capturesCount={recentLogsCount}
        onPressProgress={() => setProgressVisible(true)}
        onPressWeek={() => setWeekVisible(true)}
        onNotesPress={handleNotesPress}
      />
      <View style={styles.focusSectionHeader}>
        {/* Left: Section title only */}
        <View style={styles.focusSectionHeaderLeft}>
          <Text style={styles.focusSectionTitle}>Today's Focus</Text>
        </View>
        {/* Right: Add to Today header button */}
        <Pressable
          style={({ pressed }) => [
            styles.headerAddButton,
            pressed && styles.headerAddButtonPressed,
          ]}
          onPress={handleAddPress}
          testID="header-add-to-today"
          accessibilityRole="button"
          accessibilityLabel="Add to Today"
        >
          <Text style={styles.headerAddButtonText}>+ Add to Today</Text>
        </Pressable>
      </View>
      <View style={styles.focusSectionDivider} />
      <View style={styles.focusSectionWrapper}>
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
          overdueTodos={overdueTodos}
          recentDrops={recentDrops}
          onAddToToday={handleAddToToday}
          bottomInset={insets.bottom}
        />
      </View>

      {/* Sweep Pill - fixed above tab bar */}
      <View
        style={[styles.sweepPillContainer, { bottom: insets.bottom + 16 }]}
        pointerEvents="box-none"
      >
        <SweepPill
          count={sweepCandidateCount + recentDrops.length}
          onPress={() => {
            navigation.navigate('Sweep');
          }}
        />
      </View>

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
        allHabits={nowData.allHabits}
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

      {/* Legacy SweepDrawer removed - see TODO at top of file */}

      <NowQuickAddModal
        visible={isQuickAddVisible}
        onClose={() => setQuickAddVisible(false)}
        onSubmit={handleQuickAddSubmit}
        onPressManualAdd={handleQuickAddManual}
      />

      <YourNotesPopup
        visible={isNotesVisible}
        onClose={() => setNotesVisible(false)}
        onSelectLog={handleSelectLog}
        onSelectJournal={handleSelectJournal}
        onCreateNew={handleNotesCreateNew}
      />

      <JournalFullScreen
        visible={isJournalVisible}
        logId={selectedJournalId ?? undefined}
        onClose={() => {
          setJournalVisible(false);
          setSelectedJournalId(null);
        }}
        onSave={() => {
          setJournalVisible(false);
          setSelectedJournalId(null);
          // Refresh recent logs to show updated journal
          void reload();
        }}
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
  overdueTodos: SweepCandidate[];
  recentDrops: SweepCandidate[];
  onAddToToday: (item: SweepCandidate) => void;
  bottomInset: number;
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
  overdueTodos,
  recentDrops,
  onAddToToday,
  bottomInset,
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

      {/* Overdue section */}
      {overdueTodos.length > 0 && (
        <OverdueSection
          items={overdueTodos}
          onPressItem={(item) => onPressItem?.(item as unknown as NowActiveItem)}
          onToggleComplete={(item) => onToggleComplete?.(item as unknown as NowActiveItem)}
          style={styles.sectionSpacing}
        />
      )}

      {/* Recent Drops section */}
      {recentDrops.length > 0 && (
        <RecentDropsSection
          items={recentDrops}
          onPressItem={(item) => onPressItem?.(item as unknown as NowActiveItem)}
          onAddToToday={onAddToToday}
          style={styles.sectionSpacing}
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

      {/* Extra space for fixed SweepPill above tab bar */}
      <View style={{ height: bottomInset + 80 }} />
    </ScrollView>
  );
}

// Official Gremly brand background
const LINEN_CREAM = '#F9F6F1';

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: LINEN_CREAM, // Official Gremly background-light
  },
  // Focus section divider - separates header cards from Today's Focus
  focusSectionDivider: {
    height: 1,
    backgroundColor: '#E8E6E1',
    marginHorizontal: 24,
    marginTop: 8,
  },
  // Warm background wrapper for the entire focus section (header + list)
  focusSectionWrapper: {
    flex: 1,
    backgroundColor: LINEN_CREAM, // Match page background
  },
  // Focus section header row
  focusSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 2, // Tight spacing before list
    backgroundColor: LINEN_CREAM, // Match page background
  },
  focusSectionHeaderLeft: {
    flexDirection: 'column',
    flex: 1,
    flexShrink: 1,
    marginRight: 12,
  },
  focusSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0E1116',
  },
  // Header Add to Today button - small ghost pill
  headerAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F0EB', // Very light Sage Mist tint
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  headerAddButtonPressed: {
    backgroundColor: '#D4E4D6', // Slightly darker on press
  },
  headerAddButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#2E5540', // Moss Green
  },
  sweepPillContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  listContainer: {
    flex: 1,
    backgroundColor: LINEN_CREAM, // Match page background
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8, // Space between subtitle and first item (8-10px)
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
  // Optimistic quick-add card styles (processing state)
  optimisticCard: {
    backgroundColor: LINEN_CREAM, // Match page background
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
  // Spacing for Overdue and Recent Drops sections
  sectionSpacing: {
    marginTop: 16,
  },
});
