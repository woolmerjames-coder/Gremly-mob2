/**
 * MorningBriefSheet - Morning Brief Flow Modal
 *
 * Single-screen flow with bucket-based task organization:
 * - Lock In (1-3 committed items)
 * - Morning / Day / Evening time blocks
 * - Unorganized pool
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND } from '../../../design/brand';
import { useMorningBrief } from '../../../lib/today/hooks/useMorningBrief';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { useLockedItems } from '../../../lib/store/selectors';

// Bucket types for task organization
type Bucket = 'lock-in' | 'morning' | 'day' | 'evening';

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
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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

  console.log(
    '[MorningBrief] rawLockedItems:',
    rawLockedItems.map((i) => i.name),
  );
  console.log('[MorningBrief] rawLockedItems FULL:', JSON.stringify(rawLockedItems[0]));
  console.log('[MorningBrief] morningSequence:', morningSequence);
  console.log('[MorningBrief] daySequence:', daySequence);
  console.log('[MorningBrief] eveningSequence:', eveningSequence);

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
      }));

    return [...todayTodos, ...todayHabits];
  }, [todos, habits]);

  // Assignment state: maps task ID to bucket
  const [assignments, setAssignments] = useState<Map<string, Bucket>>(new Map());
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Track which items were originally locked (from Zustand) vs newly assigned
  const originalLockedIdsRef = useRef<Set<string>>(new Set());

  // Re-initialize assignments when modal opens
  useEffect(() => {
    if (!visible) return;

    // Capture original locked IDs at modal open time
    originalLockedIdsRef.current = new Set(rawLockedItems.map((item) => item.id));

    const initial = new Map<string, Bucket>();

    // Add locked items
    rawLockedItems.forEach((item) => {
      initial.set(item.id, 'lock-in');
    });

    // Add morning sequence items
    morningSequence.forEach((item) => {
      if (!initial.has(item.id)) {
        initial.set(item.id, 'morning');
      }
    });

    // Add day sequence items
    daySequence.forEach((item) => {
      if (!initial.has(item.id)) {
        initial.set(item.id, 'day');
      }
    });

    // Add evening sequence items
    eveningSequence.forEach((item) => {
      if (!initial.has(item.id)) {
        initial.set(item.id, 'evening');
      }
    });

    console.log('[MorningBrief] Initialized assignments:', initial.size);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: reset state when modal opens
    setAssignments(initial);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: reset state when modal opens
    setSummaryExpanded(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: reset state when modal opens
    setSelectedTaskId(null);
  }, [visible, rawLockedItems, morningSequence, daySequence, eveningSequence]);

  // Derived bucket contents
  const unorganizedTasks = useMemo(
    () => candidates.filter((c) => !assignments.has(c.id)),
    [candidates, assignments],
  );

  const lockInItems = useMemo(
    () => candidates.filter((c) => assignments.get(c.id) === 'lock-in'),
    [candidates, assignments],
  );

  const morningItems = useMemo(
    () => candidates.filter((c) => assignments.get(c.id) === 'morning'),
    [candidates, assignments],
  );

  const dayItems = useMemo(
    () => candidates.filter((c) => assignments.get(c.id) === 'day'),
    [candidates, assignments],
  );

  const eveningItems = useMemo(
    () => candidates.filter((c) => assignments.get(c.id) === 'evening'),
    [candidates, assignments],
  );

  const scheduledCount = assignments.size;

  // Handlers
  const handleSkip = useCallback(() => {
    onComplete?.();
    onClose();
  }, [onComplete, onClose]);

  const handleDone = useCallback(async () => {
    const originalLockedIds = originalLockedIdsRef.current;
    console.log('[MorningBrief] handleDone - originalLockedIds:', Array.from(originalLockedIds));
    console.log(
      '[MorningBrief] handleDone - current assignments:',
      Array.from(assignments.entries()),
    );
    try {
      // 1. Find items that were originally locked but are NO LONGER in lock-in bucket
      for (const id of originalLockedIds) {
        const currentBucket = assignments.get(id);
        if (currentBucket !== 'lock-in') {
          // User removed this from lock-in - remove the commitment
          const item = rawLockedItems.find((i) => i.id === id);
          if (item) {
            const itemType = ('cadence' in item ? 'habit' : 'todo') as 'todo' | 'habit';
            console.log('[MorningBrief] REMOVING commitment for:', id, itemType);
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

      // 3. Build and save sequences
      const morningSequence = morningItems.map((item) => ({ id: item.id, type: item.type }));
      const daySequence = dayItems.map((item) => ({ id: item.id, type: item.type }));
      const eveningSequence = eveningItems.map((item) => ({ id: item.id, type: item.type }));

      await saveBrief({
        morning_sequence: morningSequence,
        day_sequence: daySequence,
        evening_sequence: eveningSequence,
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
  const handleAssignToBucket = useCallback(
    (taskId: string, bucket: Bucket) => {
      setAssignments((prev) => {
        const next = new Map(prev);
        if (bucket === 'lock-in' && lockInItems.length >= 3) {
          // Max 3 items in lock-in - don't add
          return prev;
        }
        next.set(taskId, bucket);
        return next;
      });
      setSelectedTaskId(null);
    },
    [lockInItems.length],
  );

  // Remove a task from its bucket
  const handleRemoveFromBucket = useCallback(
    async (taskId: string) => {
      // If this was an originally locked item, we need to remove the commitment
      if (originalLockedIdsRef.current.has(taskId)) {
        try {
          // Find the item to get its type
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
    },
    [rawLockedItems, removeCommitment],
  );

  // Tap a task card to open picker
  const handleTaskPress = useCallback((taskId: string) => {
    setSelectedTaskId(taskId);
  }, []);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleSkip}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Pressable onPress={handleSkip} hitSlop={12}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Plan Your Day</Text>
          <View style={{ width: 50 }} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.subtext}>
            Organize your day, or do things whenever you find the time.
            {'\n\n'}
            We recommend locking in 1 item every day so you know you'll get it done (up to 3 if you
            like).
          </Text>

          {/* Unorganized task list */}
          <ScrollView
            style={styles.taskList}
            contentContainerStyle={styles.taskListContent}
            showsVerticalScrollIndicator={false}
          >
            {unorganizedTasks.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>All tasks scheduled!</Text>
              </View>
            ) : (
              unorganizedTasks.map((task) => (
                <Pressable
                  key={task.id}
                  style={styles.taskCard}
                  onPress={() => handleTaskPress(task.id)}
                >
                  <View style={styles.dragHandle}>
                    <Text style={styles.dragHandleText}>⋮⋮</Text>
                  </View>
                  <View style={styles.taskInfo}>
                    <Text style={styles.taskName} numberOfLines={1}>
                      {task.name}
                    </Text>
                    <Text style={styles.taskType}>{task.type === 'habit' ? 'Habit' : 'To-do'}</Text>
                  </View>
                </Pressable>
              ))
            )}
          </ScrollView>

          {/* Divider line */}
          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>Drag tasks to schedule</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Drop zone buckets */}
          <View style={styles.bucketsRow}>
            <View style={styles.bucket}>
              <Text style={styles.bucketIcon}>◇</Text>
              <Text style={styles.bucketLabel}>Lock In</Text>
              {lockInItems.length > 0 && (
                <View style={[styles.bucketBadge, { backgroundColor: BRAND.colors.mossGreen }]}>
                  <Text style={styles.bucketBadgeText}>{lockInItems.length}</Text>
                </View>
              )}
            </View>

            <View style={styles.bucket}>
              <Text style={[styles.bucketIcon, { color: '#F59E0B' }]}>☀</Text>
              <Text style={styles.bucketLabel}>Morning</Text>
              {morningItems.length > 0 && (
                <View style={[styles.bucketBadge, { backgroundColor: '#F59E0B' }]}>
                  <Text style={styles.bucketBadgeText}>{morningItems.length}</Text>
                </View>
              )}
            </View>

            <View style={styles.bucket}>
              <Text style={[styles.bucketIcon, { color: '#3B82F6' }]}>◐</Text>
              <Text style={styles.bucketLabel}>Day</Text>
              {dayItems.length > 0 && (
                <View style={[styles.bucketBadge, { backgroundColor: '#3B82F6' }]}>
                  <Text style={styles.bucketBadgeText}>{dayItems.length}</Text>
                </View>
              )}
            </View>

            <View style={styles.bucket}>
              <Text style={[styles.bucketIcon, { color: '#8B5CF6' }]}>☽</Text>
              <Text style={styles.bucketLabel}>Evening</Text>
              {eveningItems.length > 0 && (
                <View style={[styles.bucketBadge, { backgroundColor: '#8B5CF6' }]}>
                  <Text style={styles.bucketBadgeText}>{eveningItems.length}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Expandable summary */}
          {scheduledCount > 0 && (
            <View style={styles.summaryContainer}>
              <Pressable
                style={styles.summaryHeader}
                onPress={() => setSummaryExpanded(!summaryExpanded)}
              >
                <Text style={styles.summaryText}>
                  {scheduledCount} item{scheduledCount !== 1 ? 's' : ''} scheduled
                </Text>
                <Text style={styles.summaryChevron}>{summaryExpanded ? '▲' : '▼'}</Text>
              </Pressable>

              {summaryExpanded && (
                <View style={styles.summaryContent}>
                  {lockInItems.map((item) => (
                    <View key={item.id} style={styles.summaryRow}>
                      <Text style={styles.summaryBucketIcon}>◇</Text>
                      <Text style={styles.summaryItemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Pressable onPress={() => handleRemoveFromBucket(item.id)} hitSlop={8}>
                        <Text style={styles.summaryRemove}>✕</Text>
                      </Pressable>
                    </View>
                  ))}

                  {morningItems.map((item) => (
                    <View key={item.id} style={styles.summaryRow}>
                      <Text style={[styles.summaryBucketIcon, { color: '#F59E0B' }]}>☀</Text>
                      <Text style={styles.summaryItemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Pressable onPress={() => handleRemoveFromBucket(item.id)} hitSlop={8}>
                        <Text style={styles.summaryRemove}>✕</Text>
                      </Pressable>
                    </View>
                  ))}

                  {dayItems.map((item) => (
                    <View key={item.id} style={styles.summaryRow}>
                      <Text style={[styles.summaryBucketIcon, { color: '#3B82F6' }]}>◐</Text>
                      <Text style={styles.summaryItemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Pressable onPress={() => handleRemoveFromBucket(item.id)} hitSlop={8}>
                        <Text style={styles.summaryRemove}>✕</Text>
                      </Pressable>
                    </View>
                  ))}

                  {eveningItems.map((item) => (
                    <View key={item.id} style={styles.summaryRow}>
                      <Text style={[styles.summaryBucketIcon, { color: '#8B5CF6' }]}>☽</Text>
                      <Text style={styles.summaryItemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Pressable onPress={() => handleRemoveFromBucket(item.id)} hitSlop={8}>
                        <Text style={styles.summaryRemove}>✕</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable style={styles.primaryButton} onPress={handleDone}>
            <Text style={styles.primaryButtonText}>Done</Text>
          </Pressable>
        </View>

        {/* Bucket picker modal */}
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
                  <Text style={[styles.pickerOptionIcon, { color: '#F59E0B' }]}>☀</Text>
                  <Text style={styles.pickerOptionText}>Morning</Text>
                </Pressable>

                <Pressable
                  style={styles.pickerOption}
                  onPress={() => handleAssignToBucket(selectedTaskId, 'day')}
                >
                  <Text style={[styles.pickerOptionIcon, { color: '#3B82F6' }]}>◐</Text>
                  <Text style={styles.pickerOptionText}>Day</Text>
                </Pressable>

                <Pressable
                  style={styles.pickerOption}
                  onPress={() => handleAssignToBucket(selectedTaskId, 'evening')}
                >
                  <Text style={[styles.pickerOptionIcon, { color: '#8B5CF6' }]}>☽</Text>
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
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },
  skipText: {
    fontSize: 16,
    color: BRAND.colors.mossGreen,
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
    marginBottom: 24,
  },
  taskList: {
    flex: 1,
    marginBottom: 16,
  },
  taskListContent: {
    paddingBottom: 8,
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  dragHandle: {
    paddingRight: 12,
    paddingVertical: 4,
  },
  dragHandleText: {
    fontSize: 16,
    color: BRAND.colors.inkMuted,
    letterSpacing: -2,
  },
  taskInfo: {
    flex: 1,
  },
  taskName: {
    fontSize: 15,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
    marginBottom: 2,
  },
  taskType: {
    fontSize: 12,
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
  bucketIcon: {
    fontSize: 20,
    color: BRAND.colors.mossGreen,
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
  summaryContainer: {
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.md,
    overflow: 'hidden',
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
    paddingVertical: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryBucketIcon: {
    fontSize: 14,
    color: BRAND.colors.mossGreen,
    marginRight: 8,
    width: 20,
  },
  summaryItemName: {
    flex: 1,
    fontSize: 13,
    color: BRAND.colors.charcoalInk,
  },
  summaryRemove: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    paddingLeft: 8,
  },
  placeholderText: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.borderSubtle,
    backgroundColor: BRAND.colors.linenCream,
  },
  primaryButton: {
    backgroundColor: BRAND.colors.mossGreen,
    borderRadius: BRAND.radius.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: BRAND.colors.surface,
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
