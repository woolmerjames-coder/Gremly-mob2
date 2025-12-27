/**
 * MorningBriefSheet - Morning Brief Flow Modal
 *
 * Bottom sheet for daily intention-setting:
 * 1. Select "One Thing" (or skip)
 * 2. Optionally sequence tasks into time blocks
 * 3. Done - Today page reflects the intention
 */

import React, { useState, useCallback, useMemo } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND } from '../../../design/brand';
import { useMorningBrief } from '../../../lib/today/hooks/useMorningBrief';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import type { DailyBriefInput } from '../../../lib/types';

// Step in the brief flow
type BriefStep = 'one-thing' | 'sequence' | 'done';

interface MorningBriefSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function MorningBriefSheet({ visible, onClose }: MorningBriefSheetProps) {
  const insets = useSafeAreaInsets();
  const {
    candidates,
    saveBrief,
    brief,
    oneThingId,
    morningSequence,
    daySequence,
    eveningSequence,
  } = useMorningBrief();

  // Quick-add state
  const [quickAddText, setQuickAddText] = useState('');
  const [isAddingTask, setIsAddingTask] = useState(false);

  // Selection state
  const [selectedOneThingId, setSelectedOneThingId] = useState<string | null>(oneThingId);
  const [selectedOneThingType, setSelectedOneThingType] = useState<'todo' | 'habit' | null>(
    brief?.one_thing_type ?? null,
  );

  // Flow step
  const [_step, setStep] = useState<BriefStep>('one-thing');

  // Store actions for quick-add
  const createTodo = useGremlyStore((s) => s.createTodo);

  // Get selected item details
  const selectedItem = useMemo(() => {
    if (!selectedOneThingId) return null;
    return candidates.find((c) => c.id === selectedOneThingId) ?? null;
  }, [selectedOneThingId, candidates]);

  // Handle task selection
  const handleSelectTask = useCallback((id: string, type: 'todo' | 'habit') => {
    setSelectedOneThingId(id);
    setSelectedOneThingType(type);
  }, []);

  // Handle quick-add (inline Mind Drop)
  const handleQuickAdd = useCallback(async () => {
    if (!quickAddText.trim()) return;

    setIsAddingTask(true);
    try {
      // Create todo with today's date
      const todayDate = new Date().toISOString().split('T')[0];
      const newTodo = await createTodo({
        name: quickAddText.trim(),
        due_day: todayDate,
        ai_placed: false,
      });

      // Auto-select the new task
      setSelectedOneThingId(newTodo.id);
      setSelectedOneThingType('todo');
      setQuickAddText('');
    } catch (error) {
      console.error('[MorningBrief] Quick add failed:', error);
    } finally {
      setIsAddingTask(false);
    }
  }, [quickAddText, createTodo]);

  // Handle "Set as One Thing" / proceed
  const handleSetOneThing = useCallback(async () => {
    // Save the brief with One Thing
    await saveBrief({
      one_thing_id: selectedOneThingId,
      one_thing_type: selectedOneThingType,
      morning_sequence: morningSequence,
      day_sequence: daySequence,
      evening_sequence: eveningSequence,
    });

    // Move to sequence step or close
    // For v1, skip sequencing and just close
    onClose();
  }, [
    selectedOneThingId,
    selectedOneThingType,
    saveBrief,
    morningSequence,
    daySequence,
    eveningSequence,
    onClose,
  ]);

  // Handle skip
  const handleSkip = useCallback(() => {
    // Close without saving - user keeps flat list
    onClose();
  }, [onClose]);

  // Render task item
  const renderTaskItem = useCallback(
    ({ item }: { item: (typeof candidates)[0] }) => {
      const isSelected = item.id === selectedOneThingId;

      return (
        <Pressable
          style={[styles.taskItem, isSelected && styles.taskItemSelected]}
          onPress={() => handleSelectTask(item.id, item.type)}
          testID={`brief-task-${item.id}`}
        >
          {/* Selection indicator */}
          <View style={[styles.radio, isSelected && styles.radioSelected]}>
            {isSelected && <View style={styles.radioDot} />}
          </View>

          {/* Task info */}
          <View style={styles.taskInfo}>
            <Text style={styles.taskName} numberOfLines={2}>
              {item.name}
            </Text>
            <Text style={styles.taskType}>{item.type === 'habit' ? 'Habit' : 'To-do'}</Text>
          </View>
        </Pressable>
      );
    },
    [selectedOneThingId, handleSelectTask],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Pressable onPress={handleSkip} hitSlop={12} testID="brief-skip">
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>

          <Text style={styles.headerTitle}>Set Your Intention</Text>

          <View style={{ width: 40 }} />
        </View>

        {/* Main content */}
        <View style={styles.content}>
          {/* Question */}
          <Text style={styles.question}>What's the ONE thing that would make today a win?</Text>

          <Text style={styles.subtext}>
            Pick one task to anchor your day. Everything else is bonus.
          </Text>

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
            renderItem={renderTaskItem}
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
          <Pressable
            style={[styles.primaryButton, !selectedOneThingId && styles.primaryButtonDisabled]}
            onPress={handleSetOneThing}
            disabled={!selectedOneThingId}
            testID="brief-confirm"
          >
            <Text
              style={[
                styles.primaryButtonText,
                !selectedOneThingId && styles.primaryButtonTextDisabled,
              ]}
            >
              {selectedOneThingId ? 'Lock It In' : 'Select a Task'}
            </Text>
          </Pressable>
        </View>
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
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: BRAND.colors.inkMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  radioSelected: {
    borderColor: BRAND.colors.mossGreen,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: BRAND.colors.mossGreen,
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
  primaryButton: {
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
});
