/**
 * MorningBriefSheet - Morning Brief Flow Modal
 *
 * Two-step flow:
 * 1. Select "One Thing" (or skip)
 * 2. Optionally sequence tasks into time blocks (Morning/Day/Evening)
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import DraggableFlatList, {
  ScaleDecorator,
  RenderItemParams,
} from 'react-native-draggable-flatlist';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BRAND } from '../../../design/brand';
import { useMorningBrief } from '../../../lib/today/hooks/useMorningBrief';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { useLockedItems } from '../../../lib/store/selectors';
import { useRepo } from '../../../providers/RepoProvider';
import type { SequencedItem } from '../../../lib/types';

// Step in the brief flow
type BriefStep = 'one-thing' | 'sequence';

// Time block for sequencing
type TimeBlock = 'morning' | 'day' | 'evening' | 'whenever';

// Task item with block assignment
interface SequenceTask {
  id: string;
  type: 'todo' | 'habit';
  name: string;
  block: TimeBlock;
}

interface MorningBriefSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called when brief is saved (for marking daily open) */
  onComplete?: () => void;
}

// Block labels and colors
const BLOCK_CONFIG: Record<TimeBlock, { label: string; color: string; icon: string }> = {
  morning: { label: 'Morning', color: '#F59E0B', icon: '☀️' },
  day: { label: 'Day', color: '#3B82F6', icon: '🌤' },
  evening: { label: 'Evening', color: '#8B5CF6', icon: '🌙' },
  whenever: { label: 'Whenever', color: BRAND.colors.inkMuted, icon: '📋' },
};

const MAX_SELECTIONS = 3;

/**
 * Get today's date string in YYYY-MM-DD format (local time)
 */
function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function MorningBriefSheet({ visible, onClose, onComplete }: MorningBriefSheetProps) {
  const insets = useSafeAreaInsets();
  const repo = useRepo();

  // Morning brief - sequences only
  const { saveBrief, morningSequence, daySequence, eveningSequence } = useMorningBrief();

  // Locked items from selectors (single source of truth)
  const rawLockedItems = useLockedItems();
  const lockedItems = useMemo(() => {
    return rawLockedItems.map((item) => ({
      id: item.id,
      type: ('cadence' in item ? 'habit' : 'todo') as 'todo' | 'habit',
      name: item.name || ('title' in item ? (item as any).title : '') || 'Untitled',
    }));
  }, [rawLockedItems]);
  const lockedItemIds = useMemo(() => new Set(lockedItems.map((item) => item.id)), [lockedItems]);

  // Candidates: active todos due today + daily habits (excluding already locked)
  const todos = useGremlyStore((s) => s.todos);
  const habits = useGremlyStore((s) => s.habits);
  const candidates = useMemo(() => {
    const todayDate = getTodayDateString();

    const todayTodos = todos
      .filter((t) => {
        if (t.archived || t.completed_at || t.commitment) return false;
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
        if (h.archived || h.commitment) return false;
        return h.cadence === 'daily' || !h.cadence;
      })
      .map((h) => ({
        id: h.id,
        type: 'habit' as const,
        name: h.name || 'Untitled',
      }));

    return [...todayTodos, ...todayHabits];
  }, [todos, habits]);

  // Lock items using repo.addCommitment
  const lockItems = useCallback(
    async (items: Array<{ id: string; type: 'todo' | 'habit' }>) => {
      const limitedItems = items.slice(0, MAX_SELECTIONS);
      await Promise.all(limitedItems.map((item) => repo.addCommitment(item.id, item.type, null)));
    },
    [repo],
  );

  // Quick-add state
  const [quickAddText, setQuickAddText] = useState('');
  const [isAddingTask, setIsAddingTask] = useState(false);

  // Multi-select state - initialize from already locked items
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    return new Set(lockedItems.map((item) => item.id));
  });
  const [selectedItems, setSelectedItems] = useState<Array<{ id: string; type: 'todo' | 'habit' }>>(
    () => lockedItems.map((item) => ({ id: item.id, type: item.type })),
  );

  // Shake animation for max selection feedback
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const [maxWarning, setMaxWarning] = useState(false);

  const triggerShake = useCallback(() => {
    setMaxWarning(true);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => setMaxWarning(false), 1500);
    });
  }, [shakeAnim]);

  // Flow step
  const [step, setStep] = useState<BriefStep>('one-thing');

  // Sequencing state - initialize from existing brief or candidates
  const [sequenceTasks, setSequenceTasks] = useState<SequenceTask[]>(() => {
    // Build initial sequence from existing brief or default all to 'whenever'
    const taskMap = new Map<string, SequenceTask>();

    // Add all candidates as 'whenever' first
    candidates.forEach((c) => {
      taskMap.set(c.id, { ...c, block: 'whenever' });
    });

    // Override with existing sequences
    morningSequence.forEach((item) => {
      const existing = taskMap.get(item.id);
      if (existing) {
        taskMap.set(item.id, { ...existing, block: 'morning' });
      }
    });
    daySequence.forEach((item) => {
      const existing = taskMap.get(item.id);
      if (existing) {
        taskMap.set(item.id, { ...existing, block: 'day' });
      }
    });
    eveningSequence.forEach((item) => {
      const existing = taskMap.get(item.id);
      if (existing) {
        taskMap.set(item.id, { ...existing, block: 'evening' });
      }
    });

    return Array.from(taskMap.values());
  });

  // Store actions for quick-add
  const createTodo = useGremlyStore((s) => s.createTodo);

  // Get anchor item (first selected)
  const anchorItem = useMemo(() => {
    if (selectedItems.length === 0) return null;
    const firstId = selectedItems[0].id;
    return candidates.find((c) => c.id === firstId) ?? null;
  }, [selectedItems, candidates]);

  // Handle task selection (step 1) - toggle multi-select
  const handleSelectTask = useCallback(
    (id: string, type: 'todo' | 'habit') => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          // Deselect
          next.delete(id);
          setSelectedItems((items) => items.filter((item) => item.id !== id));
        } else {
          // Check max limit
          if (next.size >= MAX_SELECTIONS) {
            triggerShake();
            return prev; // Don't modify
          }
          // Select
          next.add(id);
          setSelectedItems((items) => [...items, { id, type }]);
        }
        return next;
      });
    },
    [triggerShake],
  );

  // Handle quick-add
  const handleQuickAdd = useCallback(async () => {
    if (!quickAddText.trim()) return;

    setIsAddingTask(true);
    try {
      const todayDate = new Date().toISOString().split('T')[0];
      const newTodo = await createTodo({
        name: quickAddText.trim(),
        due_day: todayDate,
        ai_placed: false,
      });

      // Auto-select the new task (if under limit)
      if (selectedIds.size < MAX_SELECTIONS) {
        setSelectedIds((prev) => new Set(prev).add(newTodo.id));
        setSelectedItems((prev) => [...prev, { id: newTodo.id, type: 'todo' }]);
      }

      // Add to sequence tasks
      setSequenceTasks((prev) => [
        ...prev,
        { id: newTodo.id, type: 'todo', name: newTodo.name, block: 'whenever' },
      ]);

      setQuickAddText('');
    } catch (error) {
      console.error('[MorningBrief] Quick add failed:', error);
    } finally {
      setIsAddingTask(false);
    }
  }, [quickAddText, createTodo]);

  // Handle proceeding to sequence step
  const handleProceedToSequence = useCallback(() => {
    setStep('sequence');
  }, []);

  // Handle block assignment
  const handleAssignBlock = useCallback((taskId: string, block: TimeBlock) => {
    setSequenceTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, block } : t)));
  }, []);

  // Handle final save
  const handleSave = useCallback(async () => {
    // Lock all selected items
    if (selectedItems.length > 0) {
      await lockItems(selectedItems);
    }

    // Build sequences from current state
    const morning: SequencedItem[] = sequenceTasks
      .filter((t) => t.block === 'morning')
      .map((t) => ({ id: t.id, type: t.type }));

    const day: SequencedItem[] = sequenceTasks
      .filter((t) => t.block === 'day')
      .map((t) => ({ id: t.id, type: t.type }));

    const evening: SequencedItem[] = sequenceTasks
      .filter((t) => t.block === 'evening')
      .map((t) => ({ id: t.id, type: t.type }));

    await saveBrief({
      morning_sequence: morning,
      day_sequence: day,
      evening_sequence: evening,
    });

    onComplete?.();
    onClose();
  }, [sequenceTasks, selectedItems, lockItems, saveBrief, onComplete, onClose]);

  // Handle "Lock It In" (skip sequencing)
  const handleLockItIn = useCallback(async () => {
    // Lock all selected items
    if (selectedItems.length > 0) {
      await lockItems(selectedItems);
    }

    await saveBrief({
      morning_sequence: [],
      day_sequence: [],
      evening_sequence: [],
    });

    onComplete?.();
    onClose();
  }, [selectedItems, lockItems, saveBrief, onComplete, onClose]);

  // Handle skip
  const handleSkip = useCallback(() => {
    onComplete?.();
    onClose();
  }, [onComplete, onClose]);

  // Handle back to step 1
  const handleBack = useCallback(() => {
    setStep('one-thing');
  }, []);

  // Render task item for step 1 (selection)
  const renderSelectionItem = useCallback(
    ({ item }: { item: (typeof candidates)[0] }) => {
      const isSelected = selectedIds.has(item.id);
      const selectionIndex = selectedItems.findIndex((s) => s.id === item.id);
      const isAnchor = selectionIndex === 0;

      return (
        <Pressable
          style={[styles.taskItem, isSelected && styles.taskItemSelected]}
          onPress={() => handleSelectTask(item.id, item.type)}
          testID={`brief-task-${item.id}`}
        >
          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
            {isSelected && <Text style={styles.checkmark}>✓</Text>}
          </View>

          <View style={styles.taskInfo}>
            <Text style={styles.taskName} numberOfLines={2}>
              {isAnchor && '⚓ '}
              {item.name}
            </Text>
            <Text style={styles.taskType}>
              {item.type === 'habit' ? 'Habit' : 'To-do'}
              {isAnchor && ' · Anchor'}
            </Text>
          </View>
        </Pressable>
      );
    },
    [selectedIds, selectedItems, handleSelectTask],
  );

  // Render task item for step 2 (sequencing)
  const renderSequenceItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<SequenceTask>) => {
      const isLocked = selectedIds.has(item.id);
      const lockIndex = selectedItems.findIndex((s) => s.id === item.id);
      const isAnchor = lockIndex === 0;
      const blockConfig = BLOCK_CONFIG[item.block];

      return (
        <ScaleDecorator>
          <Pressable
            style={[
              styles.sequenceItem,
              isActive && styles.sequenceItemActive,
              isLocked && styles.sequenceItemLocked,
            ]}
            onLongPress={drag}
            delayLongPress={150}
            testID={`sequence-task-${item.id}`}
          >
            {/* Drag handle */}
            <View style={styles.dragHandle}>
              <Text style={styles.dragHandleText}>⋮⋮</Text>
            </View>

            {/* Task info */}
            <View style={styles.sequenceTaskInfo}>
              <Text style={styles.sequenceTaskName} numberOfLines={1}>
                {isAnchor ? '⚓ ' : isLocked ? '🔒 ' : ''}
                {item.name}
              </Text>
            </View>

            {/* Block selector */}
            <View style={styles.blockSelector}>
              {(['morning', 'day', 'evening'] as TimeBlock[]).map((block) => {
                const config = BLOCK_CONFIG[block];
                const isCurrentBlock = item.block === block;

                return (
                  <Pressable
                    key={block}
                    style={[styles.blockPill, isCurrentBlock && { backgroundColor: config.color }]}
                    onPress={() => handleAssignBlock(item.id, block)}
                    hitSlop={4}
                  >
                    <Text
                      style={[styles.blockPillText, isCurrentBlock && styles.blockPillTextActive]}
                    >
                      {config.label.charAt(0)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </ScaleDecorator>
      );
    },
    [selectedIds, selectedItems, handleAssignBlock],
  );

  // Step 1: Lock In Selection
  const renderStepOneThing = () => (
    <>
      <View style={styles.content}>
        <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
          <Text style={styles.question}>What matters most today?</Text>
        </Animated.View>

        <Text style={styles.subtext}>Pick up to 3 tasks to lock in. First one is your anchor.</Text>

        {/* Selection counter */}
        <View style={styles.selectionCounter}>
          <Text style={[styles.selectionCountText, maxWarning && styles.selectionCountWarning]}>
            {selectedIds.size} of {MAX_SELECTIONS} selected
            {maxWarning && ' — Max reached!'}
          </Text>
        </View>

        {/* Quick add input */}
        <View style={styles.quickAddContainer}>
          <TextInput
            style={styles.quickAddInput}
            placeholder="Or type something new..."
            placeholderTextColor={BRAND.colors.inkMuted}
            value={quickAddText}
            onChangeText={setQuickAddText}
            onSubmitEditing={handleQuickAdd}
            returnKeyType="done"
            editable={!isAddingTask}
          />
          {quickAddText.length > 0 && (
            <Pressable
              style={styles.quickAddButton}
              onPress={handleQuickAdd}
              disabled={isAddingTask}
            >
              <Text style={styles.quickAddButtonText}>{isAddingTask ? '...' : 'Add'}</Text>
            </Pressable>
          )}
        </View>

        {/* Task list */}
        <FlatList
          data={candidates}
          keyExtractor={(item) => item.id}
          renderItem={renderSelectionItem}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No tasks yet. Type above to add one.</Text>
            </View>
          }
        />
      </View>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {selectedIds.size > 0 ? (
          <View style={styles.footerButtons}>
            <Pressable
              style={styles.secondaryButton}
              onPress={handleLockItIn}
              testID="brief-lock-it-in"
            >
              <Text style={styles.secondaryButtonText}>Lock It In</Text>
            </Pressable>

            <Pressable
              style={styles.primaryButton}
              onPress={handleProceedToSequence}
              testID="brief-sequence"
            >
              <Text style={styles.primaryButtonText}>Sequence Day</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={[styles.primaryButton, styles.primaryButtonDisabled]}
            disabled
            testID="brief-confirm"
          >
            <Text style={[styles.primaryButtonText, styles.primaryButtonTextDisabled]}>
              Select a Task
            </Text>
          </Pressable>
        )}
      </View>
    </>
  );

  // Step 2: Sequencing
  const renderStepSequence = () => (
    <>
      <View style={styles.content}>
        <Text style={styles.question}>Sequence your day</Text>

        <Text style={styles.subtext}>
          Drag tasks or tap M/D/E to assign time blocks. Leave as-is for "whenever."
        </Text>

        {/* Block legend */}
        <View style={styles.blockLegend}>
          {(['morning', 'day', 'evening'] as TimeBlock[]).map((block) => {
            const config = BLOCK_CONFIG[block];
            return (
              <View key={block} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: config.color }]} />
                <Text style={styles.legendText}>{config.label}</Text>
              </View>
            );
          })}
        </View>

        {/* Draggable task list */}
        <GestureHandlerRootView style={styles.list}>
          <DraggableFlatList
            data={sequenceTasks}
            keyExtractor={(item) => item.id}
            renderItem={renderSequenceItem}
            onDragEnd={({ data }) => setSequenceTasks(data)}
            containerStyle={styles.listContent}
          />
        </GestureHandlerRootView>
      </View>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.footerButtons}>
          <Pressable style={styles.secondaryButton} onPress={handleBack} testID="brief-back">
            <Text style={styles.secondaryButtonText}>Back</Text>
          </Pressable>

          <Pressable style={styles.primaryButton} onPress={handleSave} testID="brief-save">
            <Text style={styles.primaryButtonText}>Lock It In</Text>
          </Pressable>
        </View>
      </View>
    </>
  );

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
          <Pressable onPress={handleSkip} hitSlop={12} testID="brief-skip">
            <Text style={styles.skipText}>{step === 'one-thing' ? 'Skip' : 'Cancel'}</Text>
          </Pressable>

          <Text style={styles.headerTitle}>
            {step === 'one-thing' ? 'Lock in your focus' : 'Plan Your Day'}
          </Text>

          <View style={{ width: 50 }} />
        </View>

        {/* Step content */}
        {step === 'one-thing' ? renderStepOneThing() : renderStepSequence()}
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
    paddingTop: 24,
  },
  question: {
    fontSize: 24,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    lineHeight: 32,
    marginBottom: 8,
  },
  subtext: {
    fontSize: 15,
    color: BRAND.colors.inkSubtle,
    lineHeight: 22,
    marginBottom: 24,
  },
  quickAddContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.md,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
  },
  quickAddInput: {
    flex: 1,
    fontSize: 16,
    color: BRAND.colors.charcoalInk,
    paddingVertical: 12,
  },
  quickAddButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: BRAND.colors.mossGreen,
    borderRadius: BRAND.radius.sm,
    marginLeft: 8,
  },
  quickAddButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.surface,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 20,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.md,
    padding: 16,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  taskItemSelected: {
    borderColor: BRAND.colors.mossGreen,
    backgroundColor: 'rgba(46, 85, 64, 0.04)',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: BRAND.colors.inkMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  checkboxSelected: {
    borderColor: BRAND.colors.mossGreen,
    backgroundColor: BRAND.colors.mossGreen,
  },
  checkmark: {
    fontSize: 14,
    fontWeight: '700',
    color: BRAND.colors.surface,
  },
  selectionCounter: {
    marginBottom: 12,
  },
  selectionCountText: {
    fontSize: 14,
    color: BRAND.colors.inkSubtle,
    fontWeight: '500',
  },
  selectionCountWarning: {
    color: '#EF4444',
    fontWeight: '600',
  },
  taskInfo: {
    flex: 1,
  },
  taskName: {
    fontSize: 16,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
    marginBottom: 2,
  },
  taskType: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
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
  footerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: BRAND.colors.mossGreen,
    borderRadius: BRAND.radius.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: BRAND.colors.sageMist,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: BRAND.colors.surface,
  },
  primaryButtonTextDisabled: {
    color: BRAND.colors.inkMuted,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: BRAND.radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BRAND.colors.mossGreen,
  },
  secondaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
  // Sequencing styles
  blockLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 16,
    paddingVertical: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 13,
    color: BRAND.colors.inkSubtle,
  },
  sequenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.md,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
  },
  sequenceItemActive: {
    backgroundColor: BRAND.colors.sageMist,
    transform: [{ scale: 1.02 }],
  },
  sequenceItemLocked: {
    borderColor: BRAND.colors.mossGreen,
    borderWidth: 2,
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
  sequenceTaskInfo: {
    flex: 1,
  },
  sequenceTaskName: {
    fontSize: 15,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  blockSelector: {
    flexDirection: 'row',
    gap: 6,
  },
  blockPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND.colors.borderSubtle,
  },
  blockPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
  },
  blockPillTextActive: {
    color: BRAND.colors.surface,
  },
});
