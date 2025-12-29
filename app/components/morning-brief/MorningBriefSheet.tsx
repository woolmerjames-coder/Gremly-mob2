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
  KeyboardAvoidingView,
  Platform,
  LayoutRectangle,
  Image,
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
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import { BRAND } from '../../../design/brand';
import { useMorningBrief } from '../../../lib/today/hooks/useMorningBrief';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { useLockedItems } from '../../../lib/store/selectors';
import { Clock, Sunrise, Sun, Moon } from 'lucide-react-native';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_FACE = require('../../../assets/buttonforHP.png');

// Bucket types for task organization
type Bucket = 'lock-in' | 'morning' | 'day' | 'evening';

interface TaskItem {
  id: string;
  type: 'todo' | 'habit';
  name: string;
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
  { key: 'day', icon: '◐', label: 'Day', color: BRAND.colors.mossGreen },
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

// Draggable task card component
interface DraggableTaskCardProps {
  task: TaskItem;
  onDragStart: (task: TaskItem, x: number, y: number) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
  onTap: (taskId: string) => void;
  isDragging: boolean;
}

function DraggableTaskCard({
  task,
  onDragStart,
  onDragMove,
  onDragEnd,
  onTap,
  isDragging,
}: DraggableTaskCardProps) {
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
        onDragStart(task, event.nativeEvent.absoluteX, event.nativeEvent.absoluteY);
      }
    },
    [task, onDragStart],
  );

  const handleTapStateChange = useCallback(
    (event: TapGestureHandlerStateChangeEvent) => {
      if (event.nativeEvent.state === State.END) {
        // Only trigger tap if we're not in a drag
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
          minDurationMs={150}
          simultaneousHandlers={panRef}
        >
          <Animated.View>
            <PanGestureHandler
              ref={panRef}
              onGestureEvent={handlePanGesture}
              onHandlerStateChange={handlePanStateChange}
              simultaneousHandlers={longPressRef}
              minDist={0}
            >
              <Animated.View style={[styles.taskCard, isDragging && styles.taskCardDragging]}>
                <Image
                  source={require('../../../assets/buttonforHP.png')}
                  style={styles.gremlyHandle}
                />
                <View style={styles.taskInfo}>
                  <Text style={styles.taskName} numberOfLines={1}>
                    {task.name}
                  </Text>
                  <Text style={styles.taskType}>{task.type === 'habit' ? 'Habit' : 'To-do'}</Text>
                </View>
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

export function MorningBriefSheet({ visible, onClose, onComplete }: MorningBriefSheetProps) {
  const insets = useSafeAreaInsets();

  // Morning brief hook
  const { saveBrief, morningSequence, daySequence, eveningSequence } = useMorningBrief();

  // Store commitment actions (with optimistic Zustand updates)
  const addCommitment = useGremlyStore((s) => s.addCommitment);
  const removeCommitment = useGremlyStore((s) => s.removeCommitment);

  // Locked items from selectors (single source of truth)
  const rawLockedItems = useLockedItems();

  // Candidates: active todos due today + daily habits
  const todos = useGremlyStore((s) => s.todos);
  const habits = useGremlyStore((s) => s.habits);
  const candidates = useMemo(() => {
    const todayDate = getTodayDateString();

    const todayTodos = todos
      .filter((t) => {
        if (t.archived || t.completed_at) return false;
        if (t.due_day && t.due_day > todayDate) return false;
        return true;
      })
      .map((t) => ({
        id: t.id,
        type: 'todo' as const,
        name: t.name || t.title || 'Untitled',
        timeEstimate: t.time_estimate_minutes,
      }));

    const todayHabits = habits
      .filter((h) => {
        if (h.archived) return false;
        return h.cadence === 'daily' || !h.cadence;
      })
      .map((h) => ({
        id: h.id,
        type: 'habit' as const,
        name: h.name || 'Untitled',
        timeEstimate: null,
      }));

    return [...todayTodos, ...todayHabits];
  }, [todos, habits]);

  // Assignment state: maps task ID to bucket
  const [assignments, setAssignments] = useState<Map<string, Bucket>>(new Map());
  // Order within each bucket (for reordering)
  const [bucketOrders, setBucketOrders] = useState<Map<Bucket, string[]>>(new Map());
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Track which items were originally locked (from Zustand) vs newly assigned
  const originalLockedIdsRef = useRef<Set<string>>(new Set());

  // Bucket layout refs for drop detection
  const bucketLayouts = useRef<Map<Bucket, LayoutRectangle>>(new Map());
  const bucketRefs = useRef<Map<Bucket, View | null>>(new Map());

  // Drag state
  const [draggingTask, setDraggingTask] = useState<TaskItem | null>(null);
  const [highlightedBucket, setHighlightedBucket] = useState<Bucket | null>(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });

  // Re-initialize assignments when modal opens
  useEffect(() => {
    if (!visible) return;

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

    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: reset state when modal opens
    setAssignments(initial);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: reset state when modal opens
    setBucketOrders(orders);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: reset state when modal opens
    setSummaryExpanded(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: reset state when modal opens
    setSelectedTaskId(null);
  }, [visible, rawLockedItems, morningSequence, daySequence, eveningSequence]);

  // Derived bucket contents (ordered)
  const unorganizedTasks = useMemo(
    () => candidates.filter((c) => !assignments.has(c.id)),
    [candidates, assignments],
  );

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
          await addCommitment(item.id, item.type, null);
        }
      }

      // 3. Build and save sequences (using ordered items)
      const mSeq = morningItems.map((item) => ({ id: item.id, type: item.type }));
      const dSeq = dayItems.map((item) => ({ id: item.id, type: item.type }));
      const eSeq = eveningItems.map((item) => ({ id: item.id, type: item.type }));

      await saveBrief({
        morning_sequence: mSeq,
        day_sequence: dSeq,
        evening_sequence: eSeq,
      });

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
  const handleAssignToBucket = useCallback((taskId: string, bucket: Bucket) => {
    setAssignments((prev) => {
      const next = new Map(prev);
      if (bucket === 'lock-in') {
        const currentLockInCount = Array.from(prev.values()).filter((b) => b === 'lock-in').length;
        if (currentLockInCount >= 3 && prev.get(taskId) !== 'lock-in') {
          // Max 3 items in lock-in - don't add
          return prev;
        }
      }
      next.set(taskId, bucket);
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
      return next;
    });

    setSelectedTaskId(null);
  }, []);

  // Remove a task from its bucket
  const handleRemoveFromBucket = useCallback(
    async (taskId: string) => {
      // If this was an originally locked item, we need to remove the commitment
      if (originalLockedIdsRef.current.has(taskId)) {
        try {
          const item = rawLockedItems.find((i) => i.id === taskId);
          if (item) {
            const itemType = ('cadence' in item ? 'habit' : 'todo') as 'todo' | 'habit';
            await removeCommitment(taskId, itemType);
          }
        } catch (error) {
          console.error('[MorningBrief] Failed to remove commitment:', error);
        }
      }

      // Remove from local assignments
      setAssignments((prev) => {
        const next = new Map(prev);
        next.delete(taskId);
        return next;
      });

      // Remove from bucket order
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
    [rawLockedItems, removeCommitment],
  );

  // Reorder within a bucket
  const handleReorder = useCallback((bucket: Bucket, newOrder: TaskItem[]) => {
    setBucketOrders((prev) => {
      const next = new Map(prev);
      next.set(
        bucket,
        newOrder.map((item) => item.id),
      );
      return next;
    });
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

  // Drag handlers
  const remeasureBuckets = useCallback(() => {
    // Small delay to let layout settle
    setTimeout(() => {
      for (const [bucket, ref] of bucketRefs.current) {
        if (ref) {
          ref.measureInWindow((x, y, width, height) => {
            if (width > 0 && height > 0) {
              bucketLayouts.current.set(bucket, { x, y, width, height });
            }
          });
        }
      }
    }, 100);
  }, []);

  const handleDragStart = useCallback(
    (task: TaskItem, x: number, y: number) => {
      // Re-measure buckets at drag start in case layout changed
      remeasureBuckets();
      setDraggingTask(task);
      setDragPos({ x, y });
    },
    [remeasureBuckets],
  );

  const handleDragMove = useCallback(
    (x: number, y: number) => {
      setDragPos({ x, y });
      const bucket = detectBucketAtPosition(x, y);
      setHighlightedBucket(bucket);
    },
    [detectBucketAtPosition],
  );

  const handleDragEnd = useCallback(
    (x: number, y: number) => {
      if (draggingTask) {
        const bucket = detectBucketAtPosition(x, y);
        if (bucket) {
          handleAssignToBucket(draggingTask.id, bucket);
        }
      }
      setDraggingTask(null);
      setHighlightedBucket(null);
    },
    [draggingTask, detectBucketAtPosition, handleAssignToBucket],
  );

  const handleTap = useCallback((taskId: string) => {
    setSelectedTaskId(taskId);
  }, []);

  // Render a bucket drop zone
  const renderBucket = useCallback(
    (bucket: (typeof BUCKETS)[0], itemCount: number) => {
      const isHighlighted = highlightedBucket === bucket.key;
      const isMaxed = bucket.key === 'lock-in' && itemCount >= 3 && !isHighlighted;

      return (
        <View
          key={bucket.key}
          ref={(ref) => {
            bucketRefs.current.set(bucket.key, ref);
          }}
          style={[
            styles.bucket,
            isHighlighted && styles.bucketHighlighted,
            { borderColor: isHighlighted ? bucket.color : BRAND.colors.borderSubtle },
          ]}
          onLayout={(e) => {
            e.target.measureInWindow((x, y, width, height) => {
              bucketLayouts.current.set(bucket.key, { x, y, width, height });
            });
          }}
        >
          {bucket.key === 'lock-in' && (
            <Text style={[styles.bucketIcon, { color: bucket.color }]}>{bucket.icon}</Text>
          )}
          {bucket.key === 'morning' && (
            <Sunrise size={22} color={BRAND.colors.goldenPear} style={styles.bucketIconLucide} />
          )}
          {bucket.key === 'day' && (
            <Sun size={22} color={BRAND.colors.sageMist} style={styles.bucketIconLucide} />
          )}
          {bucket.key === 'evening' && (
            <Moon size={22} color={BRAND.colors.periwinkleSmoke} style={styles.bucketIconLucide} />
          )}
          <Text style={styles.bucketLabel}>{bucket.label}</Text>
          {itemCount > 0 && (
            <View style={[styles.bucketBadge, { backgroundColor: bucket.color }]}>
              <Text style={styles.bucketBadgeText}>{itemCount}</Text>
            </View>
          )}
          {isMaxed && <Text style={styles.bucketMaxText}>max</Text>}
        </View>
      );
    },
    [highlightedBucket],
  );

  // Render item for DraggableFlatList (within-bucket reordering)
  const renderBucketItem = useCallback(
    (bucket: Bucket, bucketColor: string, bucketIcon: string) =>
      ({ item, drag, isActive }: RenderItemParams<TaskItem>) => (
        <ScaleDecorator>
          <View style={[styles.summaryRow, isActive && styles.summaryRowActive]}>
            <Pressable style={styles.summaryRowContent} onLongPress={drag} disabled={isActive}>
              {bucket === 'lock-in' && (
                <Text style={[styles.summaryBucketIcon, { color: bucketColor }]}>{bucketIcon}</Text>
              )}
              {bucket === 'morning' && (
                <Sunrise
                  size={14}
                  color={BRAND.colors.goldenPear}
                  style={styles.summaryIconLucide}
                />
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
            </Pressable>
            <TouchableOpacity
              onPress={() => handleRemoveFromBucket(item.id)}
              style={styles.summaryRemoveButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.summaryRemove}>✕</Text>
            </TouchableOpacity>
          </View>
        </ScaleDecorator>
      ),
    [handleRemoveFromBucket],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleSkip}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Plan Your Day</Text>
          </View>

          {/* Content */}
          <View style={styles.content}>
            <Text style={styles.subtext}>
              Long-press and drag tasks to schedule, or tap to assign.
            </Text>

            {/* Unorganized task list */}
            <View style={styles.taskList}>
              {unorganizedTasks.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>All tasks scheduled!</Text>
                </View>
              ) : (
                unorganizedTasks.map((task) => (
                  <DraggableTaskCard
                    key={task.id}
                    task={task}
                    onDragStart={handleDragStart}
                    onDragMove={handleDragMove}
                    onDragEnd={handleDragEnd}
                    onTap={handleTap}
                    isDragging={draggingTask?.id === task.id}
                  />
                ))
              )}
            </View>

            {/* Divider line */}
            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>Drop here to schedule</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Drop zone buckets */}
            <View style={styles.bucketsRow}>
              {renderBucket(BUCKETS[0], lockInItems.length)}
              {renderBucket(BUCKETS[1], morningItems.length)}
              {renderBucket(BUCKETS[2], dayItems.length)}
              {renderBucket(BUCKETS[3], eveningItems.length)}
            </View>

            {/* Expandable summary with reorderable lists */}
            {scheduledCount > 0 && (
              <View style={styles.summaryContainer} pointerEvents={draggingTask ? 'none' : 'auto'}>
                <Pressable
                  style={styles.summaryHeader}
                  onPress={() => {
                    setSummaryExpanded(!summaryExpanded);
                    // Re-measure buckets after summary toggle
                    remeasureBuckets();
                  }}
                >
                  <Text style={styles.summaryText}>
                    {scheduledCount} item{scheduledCount !== 1 ? 's' : ''} scheduled
                  </Text>
                  <Text style={styles.summaryChevron}>{summaryExpanded ? '▲' : '▼'}</Text>
                </Pressable>

                {summaryExpanded && (
                  <View style={styles.summaryContent}>
                    {lockInItems.length > 0 && (
                      <DraggableFlatList
                        data={lockInItems}
                        keyExtractor={(item) => item.id}
                        renderItem={renderBucketItem('lock-in', BRAND.colors.mossGreen, '◇')}
                        onDragEnd={({ data }) => handleReorder('lock-in', data)}
                        scrollEnabled={false}
                      />
                    )}

                    {morningItems.length > 0 && (
                      <DraggableFlatList
                        data={morningItems}
                        keyExtractor={(item) => item.id}
                        renderItem={renderBucketItem('morning', BRAND.colors.goldenPear, '☀')}
                        onDragEnd={({ data }) => handleReorder('morning', data)}
                        scrollEnabled={false}
                      />
                    )}

                    {dayItems.length > 0 && (
                      <DraggableFlatList
                        data={dayItems}
                        keyExtractor={(item) => item.id}
                        renderItem={renderBucketItem('day', BRAND.colors.mossGreen, '◐')}
                        onDragEnd={({ data }) => handleReorder('day', data)}
                        scrollEnabled={false}
                      />
                    )}

                    {eveningItems.length > 0 && (
                      <DraggableFlatList
                        data={eveningItems}
                        keyExtractor={(item) => item.id}
                        renderItem={renderBucketItem('evening', BRAND.colors.periwinkleSmoke, '☽')}
                        onDragEnd={({ data }) => handleReorder('evening', data)}
                        scrollEnabled={false}
                      />
                    )}
                  </View>
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
                    onPress={() => handleAssignToBucket(selectedTaskId, 'lock-in')}
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
                    <Sun size={18} color={BRAND.colors.sageMist} style={styles.pickerIconLucide} />
                    <Text style={styles.pickerOptionText}>Day</Text>
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

                  <Pressable style={styles.pickerCancel} onPress={() => setSelectedTaskId(null)}>
                    <Text style={styles.pickerCancelText}>Cancel</Text>
                  </Pressable>
                </View>
              </Pressable>
            </Modal>
          )}
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
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
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
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
  taskList: {
    maxHeight: 280,
    marginBottom: 12,
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
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  taskCardDragging: {
    opacity: 0.3,
  },
  gremlyHandle: {
    width: 32,
    height: 32,
    marginRight: 12,
  },
  taskInfo: {
    flex: 1,
  },
  taskName: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
    marginBottom: 2,
  },
  taskType: {
    fontSize: 11,
    color: BRAND.colors.inkMuted,
  },
  timeEstimate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  bucket: {
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
  },
  bucketHighlighted: {
    borderStyle: 'solid',
    transform: [{ scale: 1.05 }],
  },
  bucketIcon: {
    fontSize: 20,
    color: BRAND.colors.mossGreen,
    marginBottom: 4,
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
  summaryContent: {
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.borderSubtle,
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
});
