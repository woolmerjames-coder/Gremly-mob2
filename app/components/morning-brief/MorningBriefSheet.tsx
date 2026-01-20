/**
 * MorningBriefSheet - Morning Brief Flow Modal
 *
 * Single-screen flow with bucket-based task organization:
 * - Lock In (1-3 committed items)
 * - Morning / Day / Evening time blocks
 * - Unorganized pool
 *
 * Features:
 * - Drag from unorganized list to bucket to assign
 * - Drag within bucket to reorder (via DraggableFlatList)
 * - Tap fallback opens picker modal
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Image,
  LayoutRectangle,
  InteractionManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  GestureHandlerRootView,
  PanGestureHandler,
  State,
  PanGestureHandlerStateChangeEvent,
  PanGestureHandlerGestureEvent,
  LongPressGestureHandler,
  TapGestureHandler,
  TapGestureHandlerStateChangeEvent,
  TouchableOpacity,
  ScrollView,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  cancelAnimation,
} from 'react-native-reanimated';
import { BRAND } from '../../../design/brand';
import { useMorningBrief } from '../../../lib/today/hooks/useMorningBrief';
import { useMiniSweepGate } from '../../../lib/today/hooks/useMiniSweepGate';
import {
  useGremlyStore,
  isHabitLockedIn,
  type HabitProgressRow,
} from '../../../lib/store/useGremlyStore';
import {
  getMonthlyProgress,
  isHabitCompletedToday,
  getFrequencyLabel,
} from '../../../lib/sweep/habitHelpers';
import { useLockedItems, useTodayHabits } from '../../../lib/store/selectors';
import { MiniSweepGate } from './MiniSweepGate';
import {
  Clock,
  Sunrise,
  Sun,
  Moon,
  Lock,
  ChevronDown,
  ChevronUp,
  Check,
} from 'lucide-react-native';
import { NowQuickAddModal } from '../../../components/now/NowQuickAddModal';
import { useNowQuickAdd } from '../../../lib/now/useNowQuickAdd';
import { OverlayHost } from '../../../components/OverlayHost';
import { triggerMedium, triggerSuccess } from '../../../lib/haptics';
import { dateService } from '../../../lib/date/DateService';

// eslint-disable-next-line @typescript-eslint/no-var-requires -- React Native image import
const GREMLY_FACE = require('../../../assets/buttonforHP.png');
// eslint-disable-next-line @typescript-eslint/no-var-requires -- React Native image import
const MORNING_BRIEF_GREMLY = require('../../../assets/mascot/morningbriefgremly.png');

// Bucket types for task organization
type Bucket = 'lock-in' | 'morning' | 'day' | 'evening';

interface TaskItem {
  id: string;
  type: 'todo' | 'habit';
  name: string;
  timeEstimate?: number | null;
  timeWindow?: 'any' | 'morning' | 'day' | 'evening' | null;
}

interface MorningBriefSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called when brief is saved (for marking daily open) */
  onComplete?: () => void;
}

/**
 * Get today's date string in YYYY-MM-DD format (local time)
 */
function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

// Bucket configuration
const BUCKETS: { key: Bucket; icon: string; label: string; color: string }[] = [
  { key: 'lock-in', icon: '◇', label: 'Lock In', color: BRAND.colors.mossGreen },
  { key: 'morning', icon: '☀', label: 'Morning', color: BRAND.colors.goldenPear },
  { key: 'day', icon: '◐', label: 'Afternoon', color: BRAND.colors.mossGreen }, // Display "Afternoon", key stays 'day'
  { key: 'evening', icon: '☽', label: 'Evening', color: BRAND.colors.periwinkleSmoke },
];

// Format time estimate for display
function formatTimeEstimate(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  if (hours === 1) return '1h';
  if (Number.isInteger(hours)) return `${hours}h`;
  return `${hours.toFixed(1)}h`;
}

// Calculate total time for a bucket
function getBucketTimeEstimate(items: TaskItem[]): number {
  return items.reduce((sum, item) => sum + (item.timeEstimate || 0), 0);
}

// Format bucket time estimate for display
function formatBucketTime(minutes: number): string {
  if (minutes <= 0) return '';
  if (minutes < 60) return `~${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `~${hours}h`;
  return `~${hours}h ${mins}m`;
}

/**
 * Calculate days remaining for a habit lock-in.
 * Returns null if habit is not locked in or expired.
 */
function getLockInDaysRemaining(habit: { commitment_until?: string | null }): number | null {
  if (!habit.commitment_until) return null;
  const today = dateService.getCurrentDate();
  if (habit.commitment_until < today) return null; // Expired
  return dateService.daysBetween(today, habit.commitment_until);
}

/**
 * Get rolling 7-day progress for a habit (today - 6 days to today).
 * This matches the "Habits this week" modal calculation.
 */
function getRolling7DayProgress(habitId: string, habitProgress: HabitProgressRow[]): number {
  const today = dateService.getCurrentDate();
  const weekStart = dateService.addDays(today, -6); // 7 days including today
  return habitProgress.filter(
    (p) => p.habit_id === habitId && p.occurred_day >= weekStart && p.occurred_day <= today,
  ).length;
}

/**
 * Get second line info for a habit card showing progress and frequency.
 * Uses rolling 7-day calculation to match "Habits this week" modal.
 */
function getHabitSecondLine(
  habit: { id: string; cadence?: 'daily' | 'weekly' | 'monthly'; target_per_period?: number },
  habitProgress: HabitProgressRow[],
): { leftText: string; isAhead: boolean; frequencyText: string } {
  const cadence = habit.cadence ?? 'daily';
  const target = habit.target_per_period ?? 1;
  const frequencyText = getFrequencyLabel({ cadence, target_per_period: target });

  if (cadence === 'daily') {
    const isAhead = isHabitCompletedToday(habit.id, habitProgress);
    return {
      leftText: isAhead ? 'Ahead' : '',
      isAhead,
      frequencyText,
    };
  }

  if (cadence === 'weekly') {
    // Use rolling 7-day progress to match "Habits this week" modal
    const progress = getRolling7DayProgress(habit.id, habitProgress);
    const isAhead = progress >= target;
    return {
      leftText: isAhead ? 'Ahead' : `${progress}/${target} this week`,
      isAhead,
      frequencyText,
    };
  }

  if (cadence === 'monthly') {
    const progress = getMonthlyProgress(habit.id, habitProgress);
    const isAhead = progress >= target;
    return {
      leftText: isAhead ? 'Ahead' : `${progress}/${target} this month`,
      isAhead,
      frequencyText,
    };
  }

  return { leftText: '', isAhead: false, frequencyText };
}

// Draggable task card component
interface DraggableTaskCardProps {
  task: TaskItem & { timeEstimate?: number | null };
  onDragStart: (task: TaskItem, x: number, y: number) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
  onTap: (taskId: string) => void;
  isDragging: boolean;
  /** Habit second line info (progress + frequency) - only for habits */
  habitSecondLine?: { leftText: string; isAhead: boolean; frequencyText: string };
  /** Days remaining for habit lock-in (only for locked habits) */
  lockInDaysRemaining?: number | null;
}

function DraggableTaskCard({
  task,
  onDragStart,
  onDragMove,
  onDragEnd,
  onTap,
  isDragging,
  habitSecondLine,
  lockInDaysRemaining,
}: DraggableTaskCardProps) {
  const isAhead = habitSecondLine?.isAhead ?? false;
  const panRef = useRef<PanGestureHandler>(null);
  const longPressRef = useRef<LongPressGestureHandler>(null);
  const tapRef = useRef<TapGestureHandler>(null);
  const isActiveDrag = useRef(false);

  const handlePanGesture = useCallback(
    (event: PanGestureHandlerGestureEvent) => {
      if (isActiveDrag.current) {
        onDragMove(event.nativeEvent.absoluteX, event.nativeEvent.absoluteY);
      }
    },
    [onDragMove],
  );

  const handlePanStateChange = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      if (event.nativeEvent.state === State.END || event.nativeEvent.state === State.CANCELLED) {
        if (isActiveDrag.current) {
          isActiveDrag.current = false;
          onDragEnd(event.nativeEvent.absoluteX, event.nativeEvent.absoluteY);
        }
      }
    },
    [onDragEnd],
  );

  const handleLongPressStateChange = useCallback(
    (event: { nativeEvent: { state: number; absoluteX: number; absoluteY: number } }) => {
      if (event.nativeEvent.state === State.ACTIVE) {
        isActiveDrag.current = true;
        triggerMedium();
        onDragStart(task, event.nativeEvent.absoluteX, event.nativeEvent.absoluteY);
      }
    },
    [task, onDragStart],
  );

  const handleTapStateChange = useCallback(
    (event: TapGestureHandlerStateChangeEvent) => {
      if (event.nativeEvent.state === State.END) {
        if (!isActiveDrag.current) {
          onTap(task.id);
        }
      }
    },
    [task.id, onTap],
  );

  return (
    <TapGestureHandler
      ref={tapRef}
      onHandlerStateChange={handleTapStateChange}
      waitFor={longPressRef}
    >
      <Animated.View>
        <LongPressGestureHandler
          ref={longPressRef}
          onHandlerStateChange={handleLongPressStateChange}
          minDurationMs={300}
          simultaneousHandlers={panRef}
        >
          <Animated.View>
            <PanGestureHandler
              ref={panRef}
              onGestureEvent={handlePanGesture}
              onHandlerStateChange={handlePanStateChange}
              simultaneousHandlers={longPressRef}
              activeOffsetX={[-20, 20]}
              activeOffsetY={[-20, 20]}
            >
              <Animated.View
                style={[
                  styles.taskCard,
                  isDragging && styles.taskCardDragging,
                  isAhead && styles.taskCardMuted,
                ]}
              >
                {/* Avatar - centered vertically */}
                <Image source={GREMLY_FACE} style={styles.gremlyHandle} />
                {/* Content column: title row + optional second line */}
                <View style={styles.taskCardContent}>
                  {/* Row 1: Name, lock-in badge */}
                  <View style={styles.taskCardFirstLine}>
                    <View style={styles.taskInfo}>
                      <Text
                        style={[styles.taskName, isAhead && styles.taskNameMuted]}
                        numberOfLines={1}
                      >
                        {task.name}
                      </Text>
                    </View>
                    {lockInDaysRemaining != null && (
                      <View style={styles.lockInBadge}>
                        <Lock size={10} color={BRAND.colors.mossGreen} />
                        <Text style={styles.lockInBadgeText}>
                          {lockInDaysRemaining === 0
                            ? 'Until tonight'
                            : lockInDaysRemaining === 1
                              ? '1 day left'
                              : `${lockInDaysRemaining} days left`}
                        </Text>
                      </View>
                    )}
                  </View>
                  {/* Row 2: Habit progress + frequency (habits only) */}
                  {habitSecondLine && (
                    <View style={styles.habitSecondLine}>
                      {habitSecondLine.leftText ? (
                        <>
                          {habitSecondLine.isAhead && (
                            <Check
                              size={10}
                              color={BRAND.colors.mossGreen}
                              style={styles.aheadCheckIcon}
                            />
                          )}
                          <Text
                            style={[
                              styles.habitSecondLineText,
                              habitSecondLine.isAhead && styles.habitSecondLineAhead,
                            ]}
                          >
                            {habitSecondLine.leftText}
                          </Text>
                          <Text style={styles.habitSecondLineSeparator}>·</Text>
                        </>
                      ) : null}
                      <Text style={styles.habitSecondLineText}>
                        {habitSecondLine.frequencyText}
                      </Text>
                    </View>
                  )}
                </View>
                {/* Time estimate - centered vertically on right */}
                {formatTimeEstimate(task.timeEstimate) && (
                  <View style={styles.timeEstimate}>
                    <Clock size={12} color={BRAND.colors.inkMuted} />
                    <Text style={styles.timeEstimateText}>
                      {formatTimeEstimate(task.timeEstimate)}
                    </Text>
                  </View>
                )}
              </Animated.View>
            </PanGestureHandler>
          </Animated.View>
        </LongPressGestureHandler>
      </Animated.View>
    </TapGestureHandler>
  );
}

// Summary bucket section component - uses plain Views for proper ScrollView height calculation
interface SummaryBucketSectionProps {
  bucket: Bucket;
  items: TaskItem[];
  bucketColor: string;
  bucketIcon: string;
  onRemove: (id: string) => void;
}

function SummaryBucketSection({
  bucket,
  items,
  bucketColor,
  bucketIcon,
  onRemove,
}: SummaryBucketSectionProps) {
  if (items.length === 0) return null;

  return (
    <View>
      {items.map((item) => (
        <View key={item.id} style={styles.summaryRow}>
          <View style={styles.summaryRowContent}>
            {bucket === 'lock-in' && (
              <Text style={[styles.summaryBucketIcon, { color: bucketColor }]}>{bucketIcon}</Text>
            )}
            {bucket === 'morning' && (
              <Sunrise size={14} color={BRAND.colors.goldenPear} style={styles.summaryIconLucide} />
            )}
            {bucket === 'day' && (
              <Sun size={14} color={BRAND.colors.sageMist} style={styles.summaryIconLucide} />
            )}
            {bucket === 'evening' && (
              <Moon
                size={14}
                color={BRAND.colors.periwinkleSmoke}
                style={styles.summaryIconLucide}
              />
            )}
            <Text style={styles.summaryItemName} numberOfLines={1}>
              {item.name}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => onRemove(item.id)}
            style={styles.summaryRemoveButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.summaryRemove}>✕</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

// Duration for celebration screen
const CELEBRATION_DURATION_MS = 1500;

export function MorningBriefSheet({ visible, onClose, onComplete }: MorningBriefSheetProps) {
  const insets = useSafeAreaInsets();

  // Mini Sweep Gate hook
  const { shouldShowMiniSweep, rolledOverTodos, unscheduledTodos, markMiniSweepCompleted } =
    useMiniSweepGate();

  // Mini Sweep state: tracks if user has completed/skipped mini sweep this session
  const [miniSweepCompleted, setMiniSweepCompleted] = useState(false);
  // Celebration interstitial state
  const [showCelebration, setShowCelebration] = useState(false);

  // Morning brief hook
  const { saveBrief, morningSequence, daySequence, eveningSequence } = useMorningBrief();

  // Store commitment actions (with optimistic Zustand updates)
  const addCommitment = useGremlyStore((s) => s.addCommitment);
  const removeCommitment = useGremlyStore((s) => s.removeCommitment);
  const dismissHabitForToday = useGremlyStore((s) => s.dismissHabitForToday);
  const updateTodo = useGremlyStore((s) => s.updateTodo);
  const updateHabit = useGremlyStore((s) => s.updateHabit);

  // Locked items from selectors (single source of truth)
  const rawLockedItems = useLockedItems();

  // Get dismissed habit IDs from today's brief
  const dailyBrief = useGremlyStore((s) => s.dailyBrief);
  const dismissedHabitIds = useMemo(
    () => dailyBrief?.dismissed_habit_ids ?? [],
    [dailyBrief?.dismissed_habit_ids],
  );

  // Candidates: active todos due today + daily habits (excluding dismissed)
  const todos = useGremlyStore((s) => s.todos);
  const habitProgress = useGremlyStore((s) => s.habitProgress);
  const todayHabitsFromSelector = useTodayHabits();

  const candidates = useMemo(() => {
    const todayDate = getTodayDateString();

    const todayTodos = todos
      .filter((t) => {
        if (t.archived || t.completed_at) return false;
        // Only include items due exactly today - not overdue, not unscheduled, not future
        // Overdue and unscheduled items are handled by Mini Sweep
        if (t.due_day !== todayDate) return false;
        return true;
      })
      .map((t) => ({
        id: t.id,
        type: 'todo' as const,
        name: t.name || t.title || 'Untitled',
        timeEstimate: t.time_estimate_minutes,
        timeWindow: t.time_window,
      }));

    // Filter out dismissed habits
    const todayHabits = todayHabitsFromSelector
      .filter((h) => !dismissedHabitIds.includes(h.id))
      .map((h) => ({
        id: h.id,
        type: 'habit' as const,
        name: h.name || 'Untitled',
        timeEstimate: h.time_estimate_minutes,
        timeWindow: h.time_window,
      }));

    return [...todayTodos, ...todayHabits];
  }, [todos, todayHabitsFromSelector, dismissedHabitIds]);

  // Assignment state: maps task ID to bucket
  const [assignments, setAssignments] = useState<Map<string, Bucket>>(new Map());
  // Order within each bucket (for reordering)
  const [bucketOrders, setBucketOrders] = useState<Map<Bucket, string[]>>(new Map());
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Duration picker state for habit lock-in
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [pendingLockInHabitId, setPendingLockInHabitId] = useState<string | null>(null);

  // Track which items were originally locked (from Zustand) vs newly assigned
  const originalLockedIdsRef = useRef<Set<string>>(new Set());
  // Flag to prevent re-initialization during modal close
  const isClosingRef = useRef(false);

  // Drag state
  const [draggingTask, setDraggingTask] = useState<TaskItem | null>(null);
  const [highlightedBucket, setHighlightedBucket] = useState<Bucket | null>(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });

  // Use shared value for drag position to avoid React re-renders during gesture
  const dragPosShared = useSharedValue({ x: 0, y: 0 });

  // Throttle ref for bucket detection
  const lastBucketCheckTime = useRef(0);
  const BUCKET_CHECK_THROTTLE_MS = 50; // Check bucket every 50ms max

  // Bucket layout refs for drop detection
  const bucketLayouts = useRef<Map<Bucket, LayoutRectangle>>(new Map());

  // Force remeasurement when layout changes
  const [bucketMeasureKey, setBucketMeasureKey] = useState(0);

  // Quick add modal state
  const [isQuickAddVisible, setQuickAddVisible] = useState(false);
  const [optimisticQuickAdd, setOptimisticQuickAdd] = useState<{
    id: string;
    title: string;
  } | null>(null);

  // Quick add hook with optimistic UI
  const quickAdd = useNowQuickAdd({
    onStart: (draftTitle) => {
      setOptimisticQuickAdd({
        id: `morning-brief-optimistic-${Date.now()}`,
        title: draftTitle,
      });
      setQuickAddVisible(false);
    },
    onComplete: () => {
      setOptimisticQuickAdd(null);
    },
    onError: () => {
      setOptimisticQuickAdd(null);
    },
  });

  // Animated scale values for bucket pulse animation
  const lockInScale = useSharedValue(1);
  const morningScale = useSharedValue(1);
  const dayScale = useSharedValue(1);
  const eveningScale = useSharedValue(1);

  const lockInAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: lockInScale.value }],
  }));

  const morningAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: morningScale.value }],
  }));

  const dayAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dayScale.value }],
  }));

  const eveningAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: eveningScale.value }],
  }));

  // Refs to track if animation is in progress (prevents pile-up)
  const animationInProgress = useRef<Record<Bucket, boolean>>({
    'lock-in': false,
    morning: false,
    day: false,
    evening: false,
  });

  const triggerBucketPulse = useCallback(
    (bucket: Bucket) => {
      // Prevent animation pile-up
      if (animationInProgress.current[bucket]) {
        return;
      }
      animationInProgress.current[bucket] = true;

      // Haptic feedback
      if (bucket === 'lock-in') {
        triggerSuccess(); // Stronger feedback for Lock In
      } else {
        triggerMedium();
      }

      // Get the appropriate scale shared value
      const getScaleValue = () => {
        switch (bucket) {
          case 'lock-in':
            return lockInScale;
          case 'morning':
            return morningScale;
          case 'day':
            return dayScale;
          case 'evening':
            return eveningScale;
        }
      };

      const scaleValue = getScaleValue();

      // Cancel any existing animation first
      cancelAnimation(scaleValue);

      // Reset to 1 before starting new animation
      scaleValue.value = 1;

      // Start the pulse animation with completion callback
      scaleValue.value = withSequence(
        withTiming(1.15, { duration: 100 }),
        withTiming(1, { duration: 150 }, (finished) => {
          // Mark animation as complete
          if (finished) {
            animationInProgress.current[bucket] = false;
          }
        }),
      );
    },
    [lockInScale, morningScale, dayScale, eveningScale],
  );

  // Reset mini sweep state when modal closes
  useEffect(() => {
    if (!visible) {
      setMiniSweepCompleted(false);
      setShowCelebration(false);
    }
  }, [visible]);

  // Handle mini sweep completion (with celebration)
  const handleMiniSweepComplete = useCallback(async () => {
    await markMiniSweepCompleted();
    setShowCelebration(true);
    // Show celebration briefly, then transition to main brief
    setTimeout(() => {
      setShowCelebration(false);
      setMiniSweepCompleted(true);
    }, CELEBRATION_DURATION_MS);
  }, [markMiniSweepCompleted]);

  // Handle mini sweep skip
  const handleMiniSweepSkip = useCallback(async () => {
    await markMiniSweepCompleted();
    setMiniSweepCompleted(true);
  }, [markMiniSweepCompleted]);

  // Re-initialize assignments when modal opens
  useEffect(() => {
    if (!visible) {
      // Reset closing flag when modal is hidden
      isClosingRef.current = false;
      return;
    }

    // Skip re-initialization if we're in the process of closing
    if (isClosingRef.current) return;

    // Debug: Log sequences loaded on mount
    console.log('[MorningBrief] Loaded sequences on mount:', {
      morning: morningSequence,
      day: daySequence,
      evening: eveningSequence,
    });

    // Capture original locked IDs at modal open time
    originalLockedIdsRef.current = new Set(rawLockedItems.map((item) => item.id));

    const initial = new Map<string, Bucket>();
    const orders = new Map<Bucket, string[]>();

    // Initialize empty orders for each bucket
    BUCKETS.forEach((b) => orders.set(b.key, []));

    // Add locked items
    rawLockedItems.forEach((item) => {
      initial.set(item.id, 'lock-in');
      orders.get('lock-in')!.push(item.id);
    });

    // Add morning sequence items
    morningSequence.forEach((item) => {
      if (!initial.has(item.id)) {
        initial.set(item.id, 'morning');
        orders.get('morning')!.push(item.id);
      }
    });

    // Add day sequence items
    daySequence.forEach((item) => {
      if (!initial.has(item.id)) {
        initial.set(item.id, 'day');
        orders.get('day')!.push(item.id);
      }
    });

    // Add evening sequence items
    eveningSequence.forEach((item) => {
      if (!initial.has(item.id)) {
        initial.set(item.id, 'evening');
        orders.get('evening')!.push(item.id);
      }
    });

    // Auto-place remaining items based on time_window preference
    candidates.forEach((item) => {
      // Skip if already assigned (from locked items or sequences)
      if (initial.has(item.id)) return;

      // Auto-place based on time_window
      if (item.timeWindow === 'morning') {
        initial.set(item.id, 'morning');
        orders.get('morning')!.push(item.id);
      } else if (item.timeWindow === 'day') {
        initial.set(item.id, 'day');
        orders.get('day')!.push(item.id);
      } else if (item.timeWindow === 'evening') {
        initial.set(item.id, 'evening');
        orders.get('evening')!.push(item.id);
      }
      // Items with time_window = 'any' or null stay unassigned
    });

    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: reset state when modal opens
    setAssignments(initial);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: reset state when modal opens
    setBucketOrders(orders);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: reset state when modal opens
    setSummaryExpanded(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: reset state when modal opens
    setSelectedTaskId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentional: only re-run when modal visibility changes
  }, [visible]);

  // Cleanup animations when component unmounts
  useEffect(() => {
    return () => {
      // Cancel all bucket scale animations on cleanup
      cancelAnimation(lockInScale);
      cancelAnimation(morningScale);
      cancelAnimation(dayScale);
      cancelAnimation(eveningScale);

      // Reset to default values
      lockInScale.value = 1;
      morningScale.value = 1;
      dayScale.value = 1;
      eveningScale.value = 1;

      // Reset animation progress tracking
      animationInProgress.current = {
        'lock-in': false,
        morning: false,
        day: false,
        evening: false,
      };
    };
  }, [lockInScale, morningScale, dayScale, eveningScale]);

  // Cancel animations when modal is closing to prevent orphaned animations
  useEffect(() => {
    if (!visible) {
      cancelAnimation(lockInScale);
      cancelAnimation(morningScale);
      cancelAnimation(dayScale);
      cancelAnimation(eveningScale);

      lockInScale.value = 1;
      morningScale.value = 1;
      dayScale.value = 1;
      eveningScale.value = 1;

      // Reset animation progress tracking
      animationInProgress.current = {
        'lock-in': false,
        morning: false,
        day: false,
        evening: false,
      };
    }
  }, [visible, lockInScale, morningScale, dayScale, eveningScale]);

  // Re-measure bucket positions when summary expands/collapses
  // Uses InteractionManager to avoid conflicting with in-progress animations
  useEffect(() => {
    if (visible) {
      // Wait for any animations to complete before triggering re-measure
      const interactionHandle = InteractionManager.runAfterInteractions(() => {
        // Additional small delay to ensure layout has settled
        setTimeout(() => {
          setBucketMeasureKey((k) => k + 1);
        }, 50);
      });

      return () => interactionHandle.cancel();
    }
  }, [visible, summaryExpanded]);

  // Derived bucket contents (ordered)
  const unorganizedTasks = useMemo(
    () => candidates.filter((c) => !assignments.has(c.id)),
    [candidates, assignments],
  );

  // Section groupings for unorganized items
  const [habitsExpanded, setHabitsExpanded] = useState(true);
  const { lockedInTasks, taskTasks, habitTasks } = useMemo(() => {
    const locked: TaskItem[] = [];
    const tasks: TaskItem[] = [];
    const habits: TaskItem[] = [];

    for (const item of unorganizedTasks) {
      if (item.type === 'todo') {
        // Check if todo is locked in (commitment === true)
        const todo = todos.find((t) => t.id === item.id);
        if (todo?.commitment === true) {
          locked.push(item);
        } else {
          tasks.push(item);
        }
      } else {
        // Habit - check if locked in using commitment_until
        const habit = todayHabitsFromSelector.find((h) => h.id === item.id);
        if (habit && isHabitLockedIn(habit)) {
          locked.push(item);
        } else {
          habits.push(item);
        }
      }
    }

    return { lockedInTasks: locked, taskTasks: tasks, habitTasks: habits };
  }, [unorganizedTasks, todos, todayHabitsFromSelector]);

  const getOrderedBucketItems = useCallback(
    (bucket: Bucket): TaskItem[] => {
      const order = bucketOrders.get(bucket) || [];
      const itemsMap = new Map(candidates.map((c) => [c.id, c]));
      return order
        .filter((id) => assignments.get(id) === bucket && itemsMap.has(id))
        .map((id) => itemsMap.get(id)!);
    },
    [candidates, assignments, bucketOrders],
  );

  const lockInItems = useMemo(() => getOrderedBucketItems('lock-in'), [getOrderedBucketItems]);
  const morningItems = useMemo(() => getOrderedBucketItems('morning'), [getOrderedBucketItems]);
  const dayItems = useMemo(() => getOrderedBucketItems('day'), [getOrderedBucketItems]);
  const eveningItems = useMemo(() => getOrderedBucketItems('evening'), [getOrderedBucketItems]);

  const scheduledCount = assignments.size;

  // Handlers
  const handleSkip = useCallback(() => {
    onComplete?.();
    onClose();
  }, [onComplete, onClose]);

  const handleDone = useCallback(async () => {
    const originalLockedIds = originalLockedIdsRef.current;

    // Set flag to prevent re-initialization flicker during close
    isClosingRef.current = true;

    try {
      // 1. Find items that were originally locked but are NO LONGER in lock-in bucket
      for (const id of originalLockedIds) {
        const currentBucket = assignments.get(id);
        if (currentBucket !== 'lock-in') {
          // User removed this from lock-in - remove the commitment
          const item = rawLockedItems.find((i) => i.id === id);
          if (item) {
            const itemType = ('cadence' in item ? 'habit' : 'todo') as 'todo' | 'habit';
            await removeCommitment(id, itemType);
          }
        }
      }

      // 2. Add commitments for NEW lock-in items (not originally locked)
      for (const item of lockInItems) {
        if (!originalLockedIds.has(item.id)) {
          if (item.type === 'habit') {
            // Default to 7 days for habits dragged into lock-in
            // (Habits locked via tap go through duration picker instead)
            await addCommitment(item.id, item.type, null, 7);
          } else {
            // Todos don't have duration
            await addCommitment(item.id, item.type, null);
          }
        }
      }

      // 3. Build and save sequences (using ordered items)
      const mSeq = morningItems.map((item) => ({ id: item.id, type: item.type }));
      const dSeq = dayItems.map((item) => ({ id: item.id, type: item.type }));
      const eSeq = eveningItems.map((item) => ({ id: item.id, type: item.type }));

      // Debug: Log all state to trace why sequences are empty
      console.log('[MorningBrief] Done pressed - full state debug:', {
        assignments: Object.fromEntries(assignments),
        bucketOrders: Object.fromEntries(bucketOrders),
        candidateIds: candidates.map((c) => c.id),
        morningItems: morningItems.map((i) => i.id),
        dayItems: dayItems.map((i) => i.id),
        eveningItems: eveningItems.map((i) => i.id),
        mSeq,
        dSeq,
        eSeq,
      });

      await saveBrief({
        morning_sequence: mSeq,
        day_sequence: dSeq,
        evening_sequence: eSeq,
      });

      // Close immediately after all saves complete
      onComplete?.();
      onClose();
    } catch (error) {
      console.error('[MorningBrief] Save failed:', error);
      onClose();
    }
  }, [
    assignments,
    rawLockedItems,
    lockInItems,
    morningItems,
    dayItems,
    eveningItems,
    addCommitment,
    removeCommitment,
    saveBrief,
    onComplete,
    onClose,
  ]);

  // Assign a task to a bucket
  const handleAssignToBucket = useCallback(
    (taskId: string, bucket: Bucket) => {
      console.log('[MorningBrief] handleAssignToBucket called:', { taskId, bucket });

      setAssignments((prev) => {
        const next = new Map(prev);
        if (bucket === 'lock-in') {
          const currentLockInCount = Array.from(prev.values()).filter(
            (b) => b === 'lock-in',
          ).length;
          if (currentLockInCount >= 3 && prev.get(taskId) !== 'lock-in') {
            // Max 3 items in lock-in - don't add
            return prev;
          }
        }
        next.set(taskId, bucket);
        console.log('[MorningBrief] assignments updated:', Object.fromEntries(next));
        return next;
      });

      // Add to bucket order
      setBucketOrders((prev) => {
        const next = new Map(prev);
        // Remove from old bucket if exists
        for (const [key, order] of next) {
          const idx = order.indexOf(taskId);
          if (idx !== -1) {
            next.set(
              key,
              order.filter((id) => id !== taskId),
            );
          }
        }
        // Add to new bucket
        const currentOrder = next.get(bucket) || [];
        next.set(bucket, [...currentOrder, taskId]);
        console.log('[MorningBrief] bucketOrders updated:', Object.fromEntries(next));
        return next;
      });

      // Trigger dopamine pulse
      triggerBucketPulse(bucket);

      setSelectedTaskId(null);
    },
    [triggerBucketPulse],
  );

  // Remove a task from its bucket
  const handleRemoveFromBucket = useCallback(
    (taskId: string) => {
      // Get the current bucket before removing
      const currentBucket = assignments.get(taskId);

      // If this was an originally locked item, remove the commitment (fire and forget)
      if (originalLockedIdsRef.current.has(taskId)) {
        const item = rawLockedItems.find((i) => i.id === taskId);
        if (item) {
          const itemType = ('cadence' in item ? 'habit' : 'todo') as 'todo' | 'habit';
          // Fire and forget - don't await
          removeCommitment(taskId, itemType).catch((error) => {
            console.error('[MorningBrief] Failed to remove commitment:', error);
          });
        }
      }

      // If removing from a time-based bucket, reset the time_window on the entity to 'any'
      // Note: habits.time_window has a NOT NULL constraint, so use 'any' instead of null
      if (currentBucket === 'morning' || currentBucket === 'day' || currentBucket === 'evening') {
        // Find if it's a todo or habit and update accordingly
        const todo = todos.find((t) => t.id === taskId);
        const habit = todayHabitsFromSelector.find((h) => h.id === taskId);

        if (todo) {
          // Clear time_window on todo (todos allow null)
          updateTodo(taskId, { time_window: null }).catch((error) => {
            console.error('[MorningBrief] Failed to clear todo time_window:', error);
          });
        } else if (habit) {
          // Reset time_window on habit to 'any' (habits require non-null)
          updateHabit(taskId, { time_window: 'any' }).catch((error) => {
            console.error('[MorningBrief] Failed to reset habit time_window:', error);
          });
        }
      }

      // Remove from local assignments immediately
      setAssignments((prev) => {
        const next = new Map(prev);
        next.delete(taskId);
        return next;
      });

      // Remove from bucket orders
      setBucketOrders((prev) => {
        const next = new Map(prev);
        for (const [key, order] of next) {
          const idx = order.indexOf(taskId);
          if (idx !== -1) {
            next.set(
              key,
              order.filter((id) => id !== taskId),
            );
          }
        }
        return next;
      });
    },
    [
      assignments,
      rawLockedItems,
      removeCommitment,
      todos,
      todayHabitsFromSelector,
      updateTodo,
      updateHabit,
    ],
  );

  const handleTap = useCallback((taskId: string) => {
    console.log('[MorningBrief] handleTap called - opening bucket selector:', { taskId });
    setSelectedTaskId(taskId);
  }, []);

  // Detect which bucket the drag position is over
  const detectBucketAtPosition = useCallback((x: number, y: number): Bucket | null => {
    for (const [bucket, layout] of bucketLayouts.current) {
      if (
        x >= layout.x &&
        x <= layout.x + layout.width &&
        y >= layout.y &&
        y <= layout.y + layout.height
      ) {
        return bucket;
      }
    }
    return null;
  }, []);

  const handleDragStart = useCallback((task: TaskItem, x: number, y: number) => {
    console.log('[MorningBrief] handleDragStart called:', {
      taskId: task.id,
      taskName: task.name,
      x,
      y,
    });
    setDraggingTask(task);
    setDragPos({ x, y });
  }, []);

  const handleDragMove = useCallback(
    (x: number, y: number) => {
      // Update shared value (no React re-render)
      dragPosShared.value = { x, y };

      // Also update state for the overlay (but this is read less frequently)
      setDragPos({ x, y });

      // Throttle bucket detection to reduce computation
      const now = Date.now();
      if (now - lastBucketCheckTime.current >= BUCKET_CHECK_THROTTLE_MS) {
        lastBucketCheckTime.current = now;
        const bucket = detectBucketAtPosition(x, y);
        if (bucket !== highlightedBucket) {
          setHighlightedBucket(bucket);
        }
      }
    },
    [detectBucketAtPosition, highlightedBucket, dragPosShared],
  );

  const handleDragEnd = useCallback(
    (x: number, y: number) => {
      console.log('[MorningBrief] handleDragEnd called:', { x, y, draggingTask: draggingTask?.id });
      if (draggingTask) {
        const bucket = detectBucketAtPosition(x, y);
        console.log('[MorningBrief] Detected bucket at position:', { bucket, x, y });
        if (bucket) {
          handleAssignToBucket(draggingTask.id, bucket);
          if (bucket === 'lock-in') {
            triggerSuccess();
          } else {
            triggerMedium();
          }
        } else {
          console.log(
            '[MorningBrief] No bucket detected - bucketLayouts:',
            Object.fromEntries(bucketLayouts.current),
          );
        }
      }
      setDraggingTask(null);
      setHighlightedBucket(null);
    },
    [draggingTask, detectBucketAtPosition, handleAssignToBucket],
  );

  const handleAddPress = useCallback(() => {
    setQuickAddVisible(true);
  }, []);

  const handleQuickAddSubmit = useCallback(
    (text: string) => {
      quickAdd.onQuickAdd(text);
    },
    [quickAdd],
  );

  const handleQuickAddManual = useCallback(() => {
    setQuickAddVisible(false);
    // Could open full overlay here if needed
  }, []);

  // Measure bucket position using requestAnimationFrame for timing accuracy
  const measureBucket = useCallback(
    (
      bucketKey: Bucket,
      target: {
        measureInWindow: (
          callback: (x: number, y: number, width: number, height: number) => void,
        ) => void;
      },
    ) => {
      // Use requestAnimationFrame to ensure we measure after paint
      requestAnimationFrame(() => {
        target.measureInWindow((x: number, y: number, width: number, height: number) => {
          if (width > 0 && height > 0) {
            bucketLayouts.current.set(bucketKey, { x, y, width, height });
          }
        });
      });
    },
    [],
  );

  // Render a bucket drop zone
  // Outer View handles measurement, inner Animated.View handles visual effects
  // This separation prevents shadow tree corruption when animations run during layout
  const renderBucket = useCallback(
    (bucket: (typeof BUCKETS)[0], items: TaskItem[]) => {
      const itemCount = items.length;
      const timeEstimate = getBucketTimeEstimate(items);
      const isHighlighted = highlightedBucket === bucket.key;
      const isMaxed = bucket.key === 'lock-in' && itemCount >= 3 && !isHighlighted;

      // Get the animated style for this bucket
      const animatedStyle = (() => {
        switch (bucket.key) {
          case 'lock-in':
            return lockInAnimatedStyle;
          case 'morning':
            return morningAnimatedStyle;
          case 'day':
            return dayAnimatedStyle;
          case 'evening':
            return eveningAnimatedStyle;
        }
      })();

      return (
        // Outer View for measurement ONLY - no animated styles
        <View
          key={`${bucket.key}-${bucketMeasureKey}`}
          style={styles.bucketContainer}
          onLayout={(e) => {
            measureBucket(bucket.key, e.target);
          }}
        >
          {/* Inner Animated.View for visual effects ONLY */}
          <Animated.View
            style={[
              styles.bucketBox,
              bucket.key === 'lock-in' && styles.bucketLockIn,
              bucket.key === 'lock-in' && itemCount > 0 && styles.bucketLockInActive,
              isHighlighted && styles.bucketHighlighted,
              isHighlighted && { borderColor: bucket.color },
              animatedStyle,
            ]}
          >
            {bucket.key === 'lock-in' && (
              <Text style={[styles.bucketIcon, styles.bucketIconLockIn]}>{bucket.icon}</Text>
            )}
            {bucket.key === 'morning' && (
              <Sunrise size={22} color={BRAND.colors.goldenPear} style={styles.bucketIconLucide} />
            )}
            {bucket.key === 'day' && (
              <Sun size={22} color={BRAND.colors.sageMist} style={styles.bucketIconLucide} />
            )}
            {bucket.key === 'evening' && (
              <Moon
                size={22}
                color={BRAND.colors.periwinkleSmoke}
                style={styles.bucketIconLucide}
              />
            )}
            <Text style={styles.bucketLabel}>{bucket.label}</Text>
            {itemCount > 0 && (
              <View style={[styles.bucketBadge, { backgroundColor: bucket.color }]}>
                <Text style={styles.bucketBadgeText}>{itemCount}</Text>
              </View>
            )}
            {isMaxed && <Text style={styles.bucketMaxText}>max</Text>}
          </Animated.View>
          {timeEstimate > 0 && (
            <View style={styles.bucketTimeContainer}>
              <Clock size={10} color={BRAND.colors.inkMuted} />
              <Text style={styles.bucketTimeText}>{formatBucketTime(timeEstimate)}</Text>
            </View>
          )}
        </View>
      );
    },
    [
      highlightedBucket,
      bucketMeasureKey,
      lockInAnimatedStyle,
      morningAnimatedStyle,
      dayAnimatedStyle,
      eveningAnimatedStyle,
      measureBucket,
    ],
  );

  // Determine what to show: Mini Sweep Gate, Celebration, or Main Brief
  const showMiniSweepGate = shouldShowMiniSweep && !miniSweepCompleted && !showCelebration;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleSkip}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* Mini Sweep Gate */}
        {showMiniSweepGate && (
          <MiniSweepGate
            rolledOverTodos={rolledOverTodos}
            unscheduledTodos={unscheduledTodos}
            onComplete={handleMiniSweepComplete}
            onSkip={handleMiniSweepSkip}
          />
        )}

        {/* Celebration Interstitial */}
        {showCelebration && (
          <View style={styles.celebrationContainer}>
            <Image
              source={MORNING_BRIEF_GREMLY}
              style={styles.celebrationGremly}
              resizeMode="contain"
            />
            <Text style={styles.celebrationTitle}>Fresh start!</Text>
            <Text style={styles.celebrationSubtitle}>Let&apos;s plan your day.</Text>
          </View>
        )}

        {/* Main Morning Brief Content */}
        {!showMiniSweepGate && !showCelebration && (
          <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>What you have on Today, LFG!</Text>
              <View style={styles.headerTimeEstimate}>
                <Clock size={14} color={BRAND.colors.inkMuted} />
                <Text style={styles.headerTimeText}>~1 min</Text>
              </View>
            </View>

            {/* Content */}
            <View style={styles.content}>
              {/* Gremly Instructions */}
              <View style={styles.gremlyRow}>
                <Pressable
                  onLongPress={() => {
                    setMiniSweepCompleted(false);
                    console.log('[MorningBriefSheet] Long-press: forcing Mini-Sweep to show');
                  }}
                  delayLongPress={800}
                >
                  <Image
                    source={MORNING_BRIEF_GREMLY}
                    style={styles.gremlyMascot}
                    resizeMode="contain"
                  />
                </Pressable>
                <View style={styles.gremlyTextContainer}>
                  <Text style={styles.gremlyTextMain}>
                    Drag or tap items into time blocks, or leave for whenever.
                  </Text>
                  <Text style={styles.gremlyTextSecondary}>
                    <Text style={styles.highlightLockIn}>Lock in</Text> up to 3 priorities.{' '}
                    <Text style={styles.gremlyTextOptional}>Totally optional!</Text>
                  </Text>
                </View>
              </View>

              {/* Action row with add button */}
              <View style={styles.actionRow}>
                <Pressable style={styles.addToTodayButton} onPress={handleAddPress}>
                  <Text style={styles.addToTodayButtonText}>+ Add Something to Today</Text>
                </Pressable>
              </View>

              {/* Scrollable task list - takes available space */}
              <ScrollView
                style={styles.taskListScroll}
                contentContainerStyle={styles.taskListContent}
                showsVerticalScrollIndicator={true}
              >
                {/* Optimistic quick-add card */}
                {optimisticQuickAdd && (
                  <View style={[styles.taskCard, styles.taskCardOptimistic]}>
                    <Image source={GREMLY_FACE} style={styles.gremlyHandle} resizeMode="contain" />
                    <View style={styles.taskInfo}>
                      <Text style={styles.taskName} numberOfLines={1}>
                        {optimisticQuickAdd.title}
                      </Text>
                      <Text style={styles.taskType}>Processing...</Text>
                    </View>
                  </View>
                )}

                {unorganizedTasks.length === 0 && !optimisticQuickAdd ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>All tasks scheduled!</Text>
                  </View>
                ) : (
                  <>
                    {/* Locked In Section */}
                    {lockedInTasks.length > 0 && (
                      <View style={styles.itemSection}>
                        <View style={styles.sectionHeader}>
                          <Lock size={14} color={BRAND.colors.mossGreen} />
                          <Text style={styles.sectionTitle}>Locked In</Text>
                          <Text style={styles.sectionCount}>{lockedInTasks.length}</Text>
                        </View>
                        {lockedInTasks.map((task) => {
                          // For habits, calculate days remaining on lock-in and second line
                          let lockInDaysRemaining: number | null = null;
                          let habitSecondLine:
                            | { leftText: string; isAhead: boolean; frequencyText: string }
                            | undefined;
                          if (task.type === 'habit') {
                            const habit = todayHabitsFromSelector.find((h) => h.id === task.id);
                            if (habit) {
                              lockInDaysRemaining = getLockInDaysRemaining(habit);
                              habitSecondLine = getHabitSecondLine(habit, habitProgress);
                            }
                          }
                          return (
                            <DraggableTaskCard
                              key={task.id}
                              task={task}
                              onDragStart={handleDragStart}
                              onDragMove={handleDragMove}
                              onDragEnd={handleDragEnd}
                              onTap={handleTap}
                              isDragging={draggingTask?.id === task.id}
                              lockInDaysRemaining={lockInDaysRemaining}
                              habitSecondLine={habitSecondLine}
                            />
                          );
                        })}
                      </View>
                    )}

                    {/* Todos Section */}
                    {taskTasks.length > 0 && (
                      <View style={styles.itemSection}>
                        <View style={styles.sectionHeader}>
                          <Text style={styles.sectionTitle}>Todos</Text>
                          <Text style={styles.sectionCount}>{taskTasks.length}</Text>
                        </View>
                        {taskTasks.map((task) => (
                          <DraggableTaskCard
                            key={task.id}
                            task={task}
                            onDragStart={handleDragStart}
                            onDragMove={handleDragMove}
                            onDragEnd={handleDragEnd}
                            onTap={handleTap}
                            isDragging={draggingTask?.id === task.id}
                          />
                        ))}
                      </View>
                    )}

                    {/* Habits Section - collapsible */}
                    {habitTasks.length > 0 && (
                      <View style={styles.itemSection}>
                        <Pressable
                          style={styles.sectionHeader}
                          onPress={() => setHabitsExpanded(!habitsExpanded)}
                        >
                          <Text style={styles.sectionTitle}>Habits</Text>
                          <Text style={styles.sectionCount}>{habitTasks.length}</Text>
                          {habitsExpanded ? (
                            <ChevronUp size={16} color={BRAND.colors.inkMuted} />
                          ) : (
                            <ChevronDown size={16} color={BRAND.colors.inkMuted} />
                          )}
                        </Pressable>
                        {habitsExpanded &&
                          habitTasks.map((task) => {
                            // Look up full habit to get cadence and target for second line
                            const fullHabit = todayHabitsFromSelector.find((h) => h.id === task.id);
                            const secondLine = fullHabit
                              ? getHabitSecondLine(fullHabit, habitProgress)
                              : undefined;
                            return (
                              <DraggableTaskCard
                                key={task.id}
                                task={task}
                                onDragStart={handleDragStart}
                                onDragMove={handleDragMove}
                                onDragEnd={handleDragEnd}
                                onTap={handleTap}
                                isDragging={draggingTask?.id === task.id}
                                habitSecondLine={secondLine}
                              />
                            );
                          })}
                      </View>
                    )}
                  </>
                )}
              </ScrollView>
            </View>

            {/* Bottom section - pinned above footer */}
            <View style={styles.bottomSection}>
              {/* Divider line */}
              <View style={styles.dividerContainer}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>Drop here to schedule</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Drop zone buckets */}
              <View style={styles.bucketsRow}>
                {renderBucket(BUCKETS[0], lockInItems)}
                {renderBucket(BUCKETS[1], morningItems)}
                {renderBucket(BUCKETS[2], dayItems)}
                {renderBucket(BUCKETS[3], eveningItems)}
              </View>

              {/* Expandable summary with reorderable lists */}
              {scheduledCount > 0 && (
                <View style={styles.summaryContainer}>
                  <Pressable
                    style={styles.summaryHeader}
                    onPress={() => {
                      setSummaryExpanded(!summaryExpanded);
                    }}
                  >
                    <Text style={styles.summaryText}>
                      {scheduledCount} item{scheduledCount !== 1 ? 's' : ''} scheduled
                    </Text>
                    <Text style={styles.summaryChevron}>{summaryExpanded ? '▲' : '▼'}</Text>
                  </Pressable>

                  {summaryExpanded && (
                    <ScrollView
                      style={styles.summaryScrollView}
                      contentContainerStyle={styles.summaryContent}
                      showsVerticalScrollIndicator={true}
                    >
                      <SummaryBucketSection
                        bucket="lock-in"
                        items={lockInItems}
                        bucketColor={BRAND.colors.mossGreen}
                        bucketIcon="◇"
                        onRemove={handleRemoveFromBucket}
                      />
                      <SummaryBucketSection
                        bucket="morning"
                        items={morningItems}
                        bucketColor={BRAND.colors.goldenPear}
                        bucketIcon="☀"
                        onRemove={handleRemoveFromBucket}
                      />
                      <SummaryBucketSection
                        bucket="day"
                        items={dayItems}
                        bucketColor={BRAND.colors.mossGreen}
                        bucketIcon="◐"
                        onRemove={handleRemoveFromBucket}
                      />
                      <SummaryBucketSection
                        bucket="evening"
                        items={eveningItems}
                        bucketColor={BRAND.colors.periwinkleSmoke}
                        bucketIcon="☽"
                        onRemove={handleRemoveFromBucket}
                      />
                    </ScrollView>
                  )}
                </View>
              )}
            </View>

            {/* Footer */}
            <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
              <View style={styles.footerButtons}>
                <Pressable style={styles.skipButton} onPress={handleSkip}>
                  <Text style={styles.skipButtonText}>Skip</Text>
                </Pressable>
                <Pressable style={styles.doneButton} onPress={handleDone}>
                  <Text style={styles.doneButtonText}>Done</Text>
                </Pressable>
              </View>
            </View>

            {/* Bucket picker modal (tap fallback) */}
            {selectedTaskId && (
              <Modal
                visible={true}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setSelectedTaskId(null)}
              >
                <Pressable style={styles.pickerOverlay} onPress={() => setSelectedTaskId(null)}>
                  <View style={styles.pickerContainer}>
                    <Text style={styles.pickerTitle}>Assign to:</Text>

                    <Pressable
                      style={styles.pickerOption}
                      onPress={() => {
                        const item = candidates.find((c) => c.id === selectedTaskId);
                        if (item?.type === 'habit') {
                          // Show duration picker for habits
                          setPendingLockInHabitId(selectedTaskId);
                          setShowDurationPicker(true);
                          setSelectedTaskId(null);
                        } else {
                          // Immediate lock-in for todos
                          handleAssignToBucket(selectedTaskId, 'lock-in');
                        }
                      }}
                    >
                      <Text style={styles.pickerOptionIcon}>◇</Text>
                      <Text style={styles.pickerOptionText}>Lock In</Text>
                      {lockInItems.length >= 3 && (
                        <Text style={styles.pickerOptionDisabled}>(max 3)</Text>
                      )}
                    </Pressable>

                    <Pressable
                      style={styles.pickerOption}
                      onPress={() => handleAssignToBucket(selectedTaskId, 'morning')}
                    >
                      <Sunrise
                        size={18}
                        color={BRAND.colors.goldenPear}
                        style={styles.pickerIconLucide}
                      />
                      <Text style={styles.pickerOptionText}>Morning</Text>
                    </Pressable>

                    <Pressable
                      style={styles.pickerOption}
                      onPress={() => handleAssignToBucket(selectedTaskId, 'day')}
                    >
                      <Sun
                        size={18}
                        color={BRAND.colors.sageMist}
                        style={styles.pickerIconLucide}
                      />
                      <Text style={styles.pickerOptionText}>Afternoon</Text>
                    </Pressable>

                    <Pressable
                      style={styles.pickerOption}
                      onPress={() => handleAssignToBucket(selectedTaskId, 'evening')}
                    >
                      <Moon
                        size={18}
                        color={BRAND.colors.periwinkleSmoke}
                        style={styles.pickerIconLucide}
                      />
                      <Text style={styles.pickerOptionText}>Evening</Text>
                    </Pressable>

                    {/* Not today - only for habits */}
                    {candidates.find((c) => c.id === selectedTaskId)?.type === 'habit' && (
                      <Pressable
                        style={styles.notTodayButton}
                        onPress={async () => {
                          await dismissHabitForToday(selectedTaskId);
                          setSelectedTaskId(null);
                        }}
                      >
                        <Text style={styles.notTodayButtonText}>Not today</Text>
                      </Pressable>
                    )}

                    <Pressable style={styles.pickerCancel} onPress={() => setSelectedTaskId(null)}>
                      <Text style={styles.pickerCancelText}>Cancel</Text>
                    </Pressable>
                  </View>
                </Pressable>
              </Modal>
            )}

            {/* Quick Add Modal */}
            <NowQuickAddModal
              visible={isQuickAddVisible}
              onClose={() => setQuickAddVisible(false)}
              onSubmit={handleQuickAddSubmit}
              onPressManualAdd={handleQuickAddManual}
            />

            {/* Duration Picker for Habit Lock-In */}
            {showDurationPicker && pendingLockInHabitId && (
              <View style={styles.durationPickerOverlay}>
                <View style={styles.durationPickerSheet}>
                  <Text style={styles.durationPickerTitle}>Lock in for how long?</Text>
                  <Text style={styles.durationPickerSubtitle}>
                    Helps build the habit, then it flows naturally
                  </Text>

                  <View style={styles.durationOptions}>
                    <Pressable
                      style={styles.durationOption}
                      onPress={async () => {
                        if (!pendingLockInHabitId) return;
                        await addCommitment(pendingLockInHabitId, 'habit', null, 1);
                        handleAssignToBucket(pendingLockInHabitId, 'lock-in');
                        setShowDurationPicker(false);
                        setPendingLockInHabitId(null);
                      }}
                    >
                      <Text style={styles.durationOptionText}>Just today</Text>
                    </Pressable>

                    <Pressable
                      style={styles.durationOption}
                      onPress={async () => {
                        if (!pendingLockInHabitId) return;
                        await addCommitment(pendingLockInHabitId, 'habit', null, 3);
                        handleAssignToBucket(pendingLockInHabitId, 'lock-in');
                        setShowDurationPicker(false);
                        setPendingLockInHabitId(null);
                      }}
                    >
                      <Text style={styles.durationOptionText}>3 days</Text>
                    </Pressable>

                    <Pressable
                      style={styles.durationOption}
                      onPress={async () => {
                        if (!pendingLockInHabitId) return;
                        await addCommitment(pendingLockInHabitId, 'habit', null, 7);
                        handleAssignToBucket(pendingLockInHabitId, 'lock-in');
                        setShowDurationPicker(false);
                        setPendingLockInHabitId(null);
                      }}
                    >
                      <Text style={styles.durationOptionText}>1 week</Text>
                    </Pressable>

                    <Pressable
                      style={styles.durationOption}
                      onPress={async () => {
                        if (!pendingLockInHabitId) return;
                        await addCommitment(pendingLockInHabitId, 'habit', null, 14);
                        handleAssignToBucket(pendingLockInHabitId, 'lock-in');
                        setShowDurationPicker(false);
                        setPendingLockInHabitId(null);
                      }}
                    >
                      <Text style={styles.durationOptionText}>2 weeks</Text>
                    </Pressable>
                  </View>

                  <Pressable
                    style={styles.durationCancelButton}
                    onPress={() => {
                      setShowDurationPicker(false);
                      setPendingLockInHabitId(null);
                    }}
                  >
                    <Text style={styles.durationCancelText}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Drag overlay */}
            {draggingTask && (
              <View
                style={[styles.dragOverlay, { top: dragPos.y - 30, left: dragPos.x - 100 }]}
                pointerEvents="none"
              >
                <View style={styles.dragOverlayCard}>
                  <Text style={styles.dragOverlayText} numberOfLines={1}>
                    {draggingTask.name}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Overlay Host for item detail overlay - must be inside Modal */}
        <OverlayHost />
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.colors.linenCream,
  },
  // Celebration interstitial styles
  celebrationContainer: {
    flex: 1,
    backgroundColor: BRAND.colors.linenCream,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  celebrationGremly: {
    width: 120,
    height: 120,
    marginBottom: 24,
  },
  celebrationTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: BRAND.colors.mossGreen,
    marginBottom: 8,
    textAlign: 'center',
  },
  celebrationSubtitle: {
    fontSize: 17,
    color: BRAND.colors.inkSubtle,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },
  headerTimeEstimate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerTimeText: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  subtext: {
    fontSize: 15,
    color: BRAND.colors.inkSubtle,
    lineHeight: 22,
    marginBottom: 16,
  },
  taskListScroll: {
    flex: 1,
    minHeight: 0,
  },
  taskListContent: {
    paddingBottom: 16,
  },
  // Section styles for grouped items
  itemSection: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCount: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    marginLeft: 'auto',
    marginRight: 4,
  },
  bottomSection: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: BRAND.colors.linenCream,
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
    ...BRAND.elevation.one,
  },
  taskCardDragging: {
    opacity: 0.4,
    backgroundColor: BRAND.colors.sageMist,
  },
  taskCardOptimistic: {
    opacity: 0.6,
    borderStyle: 'dashed',
  },
  addToTodayButton: {
    alignSelf: 'flex-end',
    backgroundColor: BRAND.colors.surface,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: BRAND.radius.pill,
    borderWidth: 1,
    borderColor: BRAND.colors.sageMist,
    marginBottom: 12,
    ...BRAND.elevation.one,
  },
  addToTodayButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
  gremlyHandle: {
    width: 32,
    height: 32,
    marginRight: 12,
    alignSelf: 'center',
  },
  taskCardContent: {
    flex: 1,
    flexDirection: 'column',
  },
  taskInfo: {
    flex: 1,
  },
  taskName: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  taskNameMuted: {
    color: BRAND.colors.inkMuted,
  },
  taskCardMuted: {
    opacity: 0.6,
  },
  taskCardFirstLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  habitSecondLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  habitSecondLineText: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
  },
  habitSecondLineAhead: {
    color: BRAND.colors.mossGreen,
    fontWeight: '600',
  },
  habitSecondLineSeparator: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    marginHorizontal: 6,
  },
  aheadCheckIcon: {
    marginRight: 4,
  },
  lockInBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(95, 145, 100, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginRight: 8,
  },
  lockInBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
  taskType: {
    fontSize: 11,
    color: BRAND.colors.inkMuted,
  },
  timeEstimate: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 4,
    marginLeft: 8,
  },
  timeEstimateText: {
    fontSize: 11,
    color: BRAND.colors.inkMuted,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 15,
    color: BRAND.colors.inkMuted,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: BRAND.colors.borderSubtle,
  },
  dividerText: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
  },
  bucketsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  bucketContainer: {
    alignItems: 'center',
  },
  bucketBox: {
    width: 72,
    height: 72,
    borderRadius: BRAND.radius.lg,
    backgroundColor: BRAND.colors.surface,
    borderWidth: 2,
    borderColor: BRAND.colors.borderSubtle,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...BRAND.elevation.one,
  },
  bucketTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 2,
  },
  bucketTimeText: {
    fontSize: 10,
    color: BRAND.colors.inkMuted,
  },
  bucketHighlighted: {
    borderStyle: 'solid',
    transform: [{ scale: 1.05 }],
  },
  bucketReceiving: {
    borderStyle: 'solid',
    borderColor: BRAND.colors.mossGreen,
    transform: [{ scale: 1.08 }],
    backgroundColor: 'rgba(46, 85, 64, 0.15)',
  },
  bucketLockIn: {
    backgroundColor: 'rgba(46, 85, 64, 0.05)',
    borderColor: 'rgba(46, 85, 64, 0.35)',
    // Keep dashed border from parent - only solid when active
    ...BRAND.elevation.two,
  },
  bucketLockInActive: {
    borderStyle: 'solid',
    borderColor: BRAND.colors.mossGreen,
  },
  bucketIcon: {
    fontSize: 20,
    color: BRAND.colors.mossGreen,
    marginBottom: 4,
  },
  bucketIconLockIn: {
    color: BRAND.colors.mossGreen,
    fontSize: 24,
    fontWeight: '600',
  },
  bucketIconLucide: {
    marginBottom: 4,
  },
  bucketLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: BRAND.colors.inkMuted,
  },
  bucketBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bucketBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: BRAND.colors.surface,
  },
  bucketMaxText: {
    position: 'absolute',
    bottom: -8,
    fontSize: 9,
    color: BRAND.colors.inkMuted,
  },
  summaryContainer: {
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.md,
    overflow: 'hidden',
    maxHeight: 200,
    ...BRAND.elevation.one,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  summaryText: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.inkSubtle,
  },
  summaryChevron: {
    fontSize: 10,
    color: BRAND.colors.inkMuted,
  },
  summaryScrollView: {
    maxHeight: 180,
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.borderSubtle,
  },
  summaryContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    backgroundColor: BRAND.colors.surface,
  },
  summaryRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  summaryRowActive: {
    backgroundColor: BRAND.colors.linenCream,
    borderRadius: BRAND.radius.sm,
  },
  summaryBucketIcon: {
    fontSize: 14,
    color: BRAND.colors.mossGreen,
    marginRight: 8,
    width: 20,
  },
  summaryIconLucide: {
    marginRight: 8,
    width: 20,
  },
  summaryItemName: {
    flex: 1,
    fontSize: 13,
    color: BRAND.colors.charcoalInk,
  },
  summaryRemoveButton: {
    padding: 8,
  },
  summaryRemove: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
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
  doneButton: {
    flex: 1,
    backgroundColor: BRAND.colors.sageMist,
    borderRadius: BRAND.radius.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },
  dragOverlay: {
    position: 'absolute',
    width: 200,
    zIndex: 1000,
  },
  dragOverlayCard: {
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: BRAND.colors.mossGreen,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  dragOverlayText: {
    fontSize: 15,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
  },
  // Picker modal styles
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerContainer: {
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.lg,
    padding: 20,
    width: '80%',
    maxWidth: 300,
    ...BRAND.elevation.two,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    marginBottom: 16,
    textAlign: 'center',
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: BRAND.radius.md,
    marginBottom: 8,
    backgroundColor: BRAND.colors.linenCream,
  },
  pickerOptionIcon: {
    fontSize: 18,
    marginRight: 12,
    color: BRAND.colors.mossGreen,
  },
  pickerIconLucide: {
    marginRight: 12,
  },
  pickerOptionText: {
    fontSize: 16,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
    flex: 1,
  },
  pickerOptionDisabled: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
  },
  pickerCancel: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  pickerCancelText: {
    fontSize: 16,
    color: BRAND.colors.mossGreen,
    fontWeight: '500',
  },
  notTodayButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
    backgroundColor: 'transparent',
    alignItems: 'center',
    marginTop: 12,
  },
  notTodayButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: BRAND.colors.inkMuted,
  },
  // Gremly Instructions
  gremlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  gremlyMascot: {
    width: 54,
    height: 54,
    marginRight: 12,
  },
  gremlyTextContainer: {
    flex: 1,
  },
  gremlyTextMain: {
    fontSize: 14,
    color: BRAND.colors.charcoalInk,
    lineHeight: 20,
  },
  gremlyTextSecondary: {
    fontSize: 14,
    color: BRAND.colors.charcoalInk,
    lineHeight: 20,
    marginTop: 2,
  },
  highlightLockIn: {
    fontWeight: '700',
    color: BRAND.colors.mossGreen,
  },
  gremlyTextOptional: {
    fontStyle: 'italic',
    color: BRAND.colors.inkMuted,
  },
  // Duration picker for habit lock-in
  durationPickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  durationPickerSheet: {
    backgroundColor: BRAND.colors.linenCream,
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 24,
    width: '85%',
    maxWidth: 320,
  },
  durationPickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
    marginBottom: 4,
  },
  durationPickerSubtitle: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    marginBottom: 20,
  },
  durationOptions: {
    gap: 10,
  },
  durationOption: {
    backgroundColor: BRAND.colors.sageMist,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  durationOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },
  durationCancelButton: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  durationCancelText: {
    fontSize: 15,
    fontWeight: '500',
    color: BRAND.colors.inkMuted,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 16,
  },
});
