/**
 * ManualAddSheet - DS-only Manual Add sheet with 6A parity
 * No Tailwind/NativeWind, uses only DS primitives
 */

import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Text, Button, Input, Chip } from '../ui';
import { Textarea } from '../design-system/Textarea';
import { useTokens } from '../design/makeStyles';

type HabitPayload = {
  type: 'habit';
  name: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'custom';
  daysOfWeek?: number[];
  notes?: string;
};

type TodoPayload = {
  type: 'todo';
  name: string;
  date?: string;
  notes?: string;
};

type JournalPayload = {
  type: 'journal';
  title?: string;
  body: string;
};

export type ManualAddSheetProps = {
  /** Visibility state */
  visible: boolean;
  /** Close handler */
  onClose: () => void;
  /** Submit handler */
  onSubmit: (payload: HabitPayload | TodoPayload | JournalPayload) => Promise<void> | void;
  /** Test ID */
  testID?: string;
};

type TabKey = 'habit' | 'todo' | 'journal';

const TAB_LABELS: Record<TabKey, string> = {
  habit: 'Habit',
  todo: 'To-Do',
  journal: 'Journal',
};

const FREQUENCIES = ['daily', 'weekly', 'monthly', 'custom'] as const;
const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ManualAddSheet({
  visible,
  onClose,
  onSubmit,
  testID = 'manual-add-sheet',
}: ManualAddSheetProps) {
  const t = useTokens();
  const insets = useSafeAreaInsets();

  // Tab state
  const [activeTab, setActiveTab] = useState<TabKey>('habit');

  // Habit state
  const [habitName, setHabitName] = useState('');
  const [habitFrequency, setHabitFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>(
    'daily',
  );
  const [habitDaysOfWeek, setHabitDaysOfWeek] = useState<Set<number>>(new Set());
  const [habitNotes, setHabitNotes] = useState('');

  // Todo state
  const [todoName, setTodoName] = useState('');
  const [todoDate, setTodoDate] = useState('');
  const [todoNotes, setTodoNotes] = useState('');

  // Journal state
  const [journalBody, setJournalBody] = useState('');

  // Can save logic
  const canSave = (() => {
    switch (activeTab) {
      case 'habit':
        return habitName.trim().length > 0;
      case 'todo':
        return todoName.trim().length > 0;
      case 'journal':
        return journalBody.trim().length > 0;
    }
  })();

  const handleSave = async () => {
    if (!canSave) return;

    let payload: HabitPayload | TodoPayload | JournalPayload;

    switch (activeTab) {
      case 'habit':
        payload = {
          type: 'habit',
          name: habitName.trim(),
          frequency: habitFrequency,
          ...(habitFrequency === 'weekly' &&
            habitDaysOfWeek.size > 0 && {
              daysOfWeek: Array.from(habitDaysOfWeek).sort(),
            }),
          ...(habitNotes.trim() && { notes: habitNotes.trim() }),
        };
        break;
      case 'todo':
        payload = {
          type: 'todo',
          name: todoName.trim(),
          ...(todoDate.trim() && { date: todoDate.trim() }),
          ...(todoNotes.trim() && { notes: todoNotes.trim() }),
        };
        break;
      case 'journal':
        payload = {
          type: 'journal',
          body: journalBody.trim(),
        };
        break;
    }

    await onSubmit(payload);

    // Reset form
    setHabitName('');
    setHabitFrequency('daily');
    setHabitDaysOfWeek(new Set());
    setHabitNotes('');
    setTodoName('');
    setTodoDate('');
    setTodoNotes('');
    setJournalBody('');
    setActiveTab('habit');

    onClose();
  };

  const toggleDayOfWeek = (day: number) => {
    setHabitDaysOfWeek((prev) => {
      const next = new Set(prev);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Backdrop */}
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'flex-end',
          }}
          onPress={onClose}
        >
          {/* Sheet Container */}
          <Pressable onPress={(e) => e.stopPropagation()}>
            <Box
              testID={testID}
              bg="surface"
              style={{
                borderTopLeftRadius: t.radius[4],
                borderTopRightRadius: t.radius[4],
                maxHeight: '90%',
              }}
            >
              {/* Tabs */}
              <Box
                row
                style={{
                  borderBottomWidth: 1,
                  borderBottomColor: t.colors.border,
                }}
              >
                {(['habit', 'todo', 'journal'] as TabKey[]).map((tab) => (
                  <Pressable
                    key={tab}
                    testID={`tab-${tab}`}
                    onPress={() => setActiveTab(tab)}
                    style={({ pressed }) => ({
                      flex: 1,
                      paddingVertical: t.spacing[4],
                      borderBottomWidth: 2,
                      borderBottomColor: activeTab === tab ? t.colors.primary : 'transparent',
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Text
                      variant={activeTab === tab ? 'title' : 'body'}
                      style={{
                        textAlign: 'center',
                        color: activeTab === tab ? t.colors.primary : t.colors.subtle,
                      }}
                    >
                      {TAB_LABELS[tab]}
                    </Text>
                  </Pressable>
                ))}
              </Box>

              {/* Content */}
              <ScrollView
                style={{ maxHeight: 400 }}
                contentContainerStyle={{
                  padding: t.spacing[4],
                  gap: t.spacing[3],
                }}
              >
                {activeTab === 'habit' && (
                  <Box gap={3}>
                    <Input
                      label="Habit Name"
                      value={habitName}
                      onChangeText={setHabitName}
                      placeholder="e.g., Drink water"
                      testID="habit-name"
                    />

                    <Box gap={2}>
                      <Text variant="label">Frequency</Text>
                      <Box row gap={2} style={{ flexWrap: 'wrap' }}>
                        {FREQUENCIES.map((freq) => (
                          <Chip
                            key={freq}
                            label={freq.charAt(0).toUpperCase() + freq.slice(1)}
                            selected={habitFrequency === freq}
                            onPress={() => setHabitFrequency(freq)}
                            testID={`frequency-${freq}`}
                          />
                        ))}
                      </Box>
                    </Box>

                    {habitFrequency === 'weekly' && (
                      <Box gap={2}>
                        <Text variant="label">Days of Week</Text>
                        <Box row gap={2} style={{ flexWrap: 'wrap' }}>
                          {DAYS_OF_WEEK.map((day, index) => (
                            <Chip
                              key={index}
                              label={day}
                              selected={habitDaysOfWeek.has(index)}
                              onPress={() => toggleDayOfWeek(index)}
                              testID={`dow-${index}`}
                            />
                          ))}
                        </Box>
                      </Box>
                    )}

                    <Textarea
                      label="Notes (optional)"
                      value={habitNotes}
                      onChangeText={setHabitNotes}
                      placeholder="Add notes..."
                      rows={3}
                    />
                  </Box>
                )}

                {activeTab === 'todo' && (
                  <Box gap={3}>
                    <Input
                      label="To-Do Name"
                      value={todoName}
                      onChangeText={setTodoName}
                      placeholder="e.g., Buy groceries"
                      testID="todo-name"
                    />

                    <Input
                      label="Date (optional)"
                      value={todoDate}
                      onChangeText={setTodoDate}
                      placeholder="YYYY-MM-DD"
                      testID="todo-date"
                    />

                    <Textarea
                      label="Notes (optional)"
                      value={todoNotes}
                      onChangeText={setTodoNotes}
                      placeholder="Add notes..."
                      rows={3}
                    />
                  </Box>
                )}

                {activeTab === 'journal' && (
                  <Box gap={3}>
                    <Textarea
                      label="Journal Entry"
                      value={journalBody}
                      onChangeText={setJournalBody}
                      placeholder="What's on your mind?"
                      testID="journal-body"
                      rows={5}
                    />
                  </Box>
                )}
              </ScrollView>

              {/* Save Bar */}
              <Box
                p={4}
                style={{
                  borderTopWidth: 1,
                  borderTopColor: t.colors.border,
                  paddingBottom: insets.bottom || t.spacing[4],
                }}
              >
                <Button
                  title="Save to The Hub"
                  onPress={handleSave}
                  disabled={!canSave}
                  variant="primary"
                  size="lg"
                  testID="save-to-hub"
                />
              </Box>
            </Box>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
