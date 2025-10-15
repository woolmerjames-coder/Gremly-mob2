import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import ActionSheet, { SheetManager } from 'react-native-actions-sheet';
import { z } from 'zod';
import { useRepo } from '../providers/RepoProvider';
import JournalInspiration from './JournalInspiration';

/**
 * Manual Add Sheet - Phase 6
 *
 * A tabbed modal for creating Habits, To-Dos, Journal entries, and Catch-All notes.
 * All items are created with aiPlaced=false and optionally linked to a Space.
 *
 * Usage:
 *   openManualAdd() - Opens with default tab (Habit)
 *   openManualAdd({ defaultTab: 'journal' }) - Opens to specific tab
 *   openManualAdd({ spaceId: 'space_123' }) - Links created items to a Space
 */

// ============================================================================
// TYPES & STATE
// ============================================================================

type TabKey = 'habit' | 'todo' | 'journal' | 'catchall';

interface ManualAddOptions {
  defaultTab?: TabKey;
  spaceId?: string;
}

interface ManualAddState {
  activeTab: TabKey;
  spaceId?: string;
  // Habit form
  habitName: string;
  habitFrequency: string;
  // Todo form
  todoName: string;
  todoDueDate: string;
  // Journal form
  journalTitle: string;
  journalBody: string;
  // Catch-all form
  catchallBody: string;
  // Validation errors
  errors: Record<string, string>;
  // Submission state
  saving: boolean;
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const habitFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120, 'Name too long (max 120 chars)'),
  frequency: z.string().min(1, 'Frequency is required').max(60, 'Frequency too long'),
});

const todoFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120, 'Name too long (max 120 chars)'),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format')
    .optional()
    .or(z.literal('')),
});

const journalFormSchema = z.object({
  title: z.string().max(120, 'Title too long (max 120 chars)').optional(),
  body: z.string().min(1, 'Journal entry cannot be empty'),
});

const catchallFormSchema = z.object({
  body: z.string().min(1, 'Note cannot be empty'),
});

// ============================================================================
// MODULE-SCOPED STATE (for openManualAdd helper)
// ============================================================================

let globalOptions: ManualAddOptions = {};

export function openManualAdd(options?: ManualAddOptions): void {
  globalOptions = options || {};
  SheetManager.show('manual-add-sheet');
}

export function closeManualAdd(): void {
  globalOptions = {};
  SheetManager.hide('manual-add-sheet');
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ManualAddSheet() {
  const insets = useSafeAreaInsets();
  const repo = useRepo();

  const [state, setState] = useState<ManualAddState>({
    activeTab: globalOptions.defaultTab || 'habit',
    spaceId: globalOptions.spaceId,
    habitName: '',
    habitFrequency: 'daily',
    todoName: '',
    todoDueDate: '',
    journalTitle: '',
    journalBody: '',
    catchallBody: '',
    errors: {},
    saving: false,
  });

  // Update state when sheet opens with new options
  const handleSheetOpen = () => {
    setState((prev) => ({
      ...prev,
      activeTab: globalOptions.defaultTab || 'habit',
      spaceId: globalOptions.spaceId,
      // Reset forms
      habitName: '',
      habitFrequency: 'daily',
      todoName: '',
      todoDueDate: '',
      journalTitle: '',
      journalBody: '',
      catchallBody: '',
      errors: {},
      saving: false,
    }));
  };

  // ============================================================================
  // TAB SWITCHING
  // ============================================================================

  const switchTab = (tab: TabKey) => {
    setState((prev) => ({ ...prev, activeTab: tab, errors: {} }));
  };

  // ============================================================================
  // FORM SUBMISSION
  // ============================================================================

  const handleSave = async () => {
    setState((prev) => ({ ...prev, errors: {}, saving: true }));

    try {
      if (state.activeTab === 'habit') {
        // Validate
        const result = habitFormSchema.safeParse({
          name: state.habitName,
          frequency: state.habitFrequency,
        });

        if (!result.success) {
          const errors: Record<string, string> = {};
          result.error.issues.forEach((issue) => {
            errors[issue.path[0] as string] = issue.message;
          });
          setState((prev) => ({ ...prev, errors, saving: false }));
          return;
        }

        // Create Habit
        await repo.create({
          type: 'habit',
          title: state.habitName.trim(),
          frequency: state.habitFrequency.trim() as any, // Allow custom frequency strings
          space_id: state.spaceId || null,
          ai_placed: false,
        });

        Alert.alert('Success', 'Habit saved to the Hub');
        closeManualAdd();
      } else if (state.activeTab === 'todo') {
        // Validate
        const result = todoFormSchema.safeParse({
          name: state.todoName,
          dueDate: state.todoDueDate,
        });

        if (!result.success) {
          const errors: Record<string, string> = {};
          result.error.issues.forEach((issue) => {
            errors[issue.path[0] as string] = issue.message;
          });
          setState((prev) => ({ ...prev, errors, saving: false }));
          return;
        }

        // Create To-Do
        await repo.create({
          type: 'todo',
          title: state.todoName.trim(),
          due_date: state.todoDueDate.trim() || null,
          undefined_due: !state.todoDueDate.trim(),
          space_id: state.spaceId || null,
          ai_placed: false,
        });

        Alert.alert('Success', 'To-Do saved to the Hub');
        closeManualAdd();
      } else if (state.activeTab === 'journal') {
        // Validate
        const result = journalFormSchema.safeParse({
          title: state.journalTitle,
          body: state.journalBody,
        });

        if (!result.success) {
          const errors: Record<string, string> = {};
          result.error.issues.forEach((issue) => {
            errors[issue.path[0] as string] = issue.message;
          });
          setState((prev) => ({ ...prev, errors, saving: false }));
          return;
        }

        // Create Journal Note
        await repo.create({
          type: 'note',
          title: state.journalTitle.trim() || '',
          body: state.journalBody.trim(),
          subtype: 'journal',
          space_id: state.spaceId || null,
          ai_placed: false,
        });

        Alert.alert('Success', 'Journal entry saved to the Hub');
        closeManualAdd();
      } else if (state.activeTab === 'catchall') {
        // Validate
        const result = catchallFormSchema.safeParse({
          body: state.catchallBody,
        });

        if (!result.success) {
          const errors: Record<string, string> = {};
          result.error.issues.forEach((issue) => {
            errors[issue.path[0] as string] = issue.message;
          });
          setState((prev) => ({ ...prev, errors, saving: false }));
          return;
        }

        // Create Catch-All Note
        await repo.create({
          type: 'note',
          title: '', // Required by interface but not used for catch-all
          body: state.catchallBody.trim(),
          subtype: 'catchall',
          space_id: state.spaceId || null,
          ai_placed: false,
        });

        Alert.alert('Success', 'Note saved to the Hub');
        closeManualAdd();
      }
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to save. Please try again.');
      setState((prev) => ({ ...prev, saving: false }));
    }
  };

  // ============================================================================
  // RENDER TAB BUTTONS
  // ============================================================================

  const renderTabButton = (tab: TabKey, label: string) => {
    const isActive = state.activeTab === tab;
    return (
      <Pressable
        key={tab}
        testID={`tab-${tab}`}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: isActive }}
        onPress={() => switchTab(tab)}
        className={`flex-1 py-2 px-3 rounded-xl items-center justify-center ${
          isActive ? 'bg-deepTeal' : 'bg-transparent'
        }`}
      >
        <Text className={`text-sm font-medium ${isActive ? 'text-white' : 'text-gray-700'}`}>
          {label}
        </Text>
      </Pressable>
    );
  };

  // ============================================================================
  // RENDER FORM CONTENT
  // ============================================================================

  const renderFormContent = () => {
    if (state.activeTab === 'habit') {
      return (
        <>
          <Text className="text-sm mb-1 text-gray-700">Name</Text>
          <TextInput
            testID="input-name"
            accessibilityLabel="Habit name"
            value={state.habitName}
            onChangeText={(text) => setState((prev) => ({ ...prev, habitName: text }))}
            placeholder="e.g., Morning run"
            className="h-12 rounded-2xl border border-gray-300 px-3 text-base bg-white mb-1"
          />
          {state.errors.name && (
            <Text className="text-red-600 text-sm mb-3">{state.errors.name}</Text>
          )}

          <Text className="text-sm mb-1 mt-3 text-gray-700">Frequency</Text>
          <View className="flex-row gap-2 mb-1">
            {['daily', 'weekly', 'monthly'].map((freq) => (
              <Pressable
                key={freq}
                testID={`frequency-${freq}`}
                accessibilityRole="button"
                accessibilityLabel={`Frequency ${freq}`}
                onPress={() => setState((prev) => ({ ...prev, habitFrequency: freq }))}
                className={`px-4 py-2 rounded-2xl border ${
                  state.habitFrequency === freq
                    ? 'border-deepTeal bg-deepTeal/10'
                    : 'border-gray-300'
                }`}
              >
                <Text
                  className={`capitalize ${state.habitFrequency === freq ? 'text-deepTeal font-medium' : 'text-gray-700'}`}
                >
                  {freq}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            testID="input-frequency"
            accessibilityLabel="Custom frequency"
            value={state.habitFrequency}
            onChangeText={(text) => setState((prev) => ({ ...prev, habitFrequency: text }))}
            placeholder="Or type custom frequency"
            className="h-12 rounded-2xl border border-gray-300 px-3 text-base bg-white mb-1"
          />
          {state.errors.frequency && (
            <Text className="text-red-600 text-sm mb-3">{state.errors.frequency}</Text>
          )}
        </>
      );
    }

    if (state.activeTab === 'todo') {
      return (
        <>
          <Text className="text-sm mb-1 text-gray-700">Name</Text>
          <TextInput
            testID="input-name"
            accessibilityLabel="To-Do name"
            value={state.todoName}
            onChangeText={(text) => setState((prev) => ({ ...prev, todoName: text }))}
            placeholder="e.g., Buy groceries"
            className="h-12 rounded-2xl border border-gray-300 px-3 text-base bg-white mb-1"
          />
          {state.errors.name && (
            <Text className="text-red-600 text-sm mb-3">{state.errors.name}</Text>
          )}

          <Text className="text-sm mb-1 mt-3 text-gray-700">Due Date (optional)</Text>
          <TextInput
            testID="input-dueDate"
            accessibilityLabel="Due date"
            value={state.todoDueDate}
            onChangeText={(text) => setState((prev) => ({ ...prev, todoDueDate: text }))}
            placeholder="YYYY-MM-DD"
            className="h-12 rounded-2xl border border-gray-300 px-3 text-base bg-white mb-1"
          />
          {state.errors.dueDate && (
            <Text className="text-red-600 text-sm mb-3">{state.errors.dueDate}</Text>
          )}
        </>
      );
    }

    if (state.activeTab === 'journal') {
      return (
        <>
          <Text className="text-sm mb-1 text-gray-700">Title (optional)</Text>
          <TextInput
            testID="input-title"
            accessibilityLabel="Journal title"
            value={state.journalTitle}
            onChangeText={(text) => setState((prev) => ({ ...prev, journalTitle: text }))}
            placeholder="e.g., Morning thoughts"
            className="h-12 rounded-2xl border border-gray-300 px-3 text-base bg-white mb-3"
          />

          <Text className="text-sm mb-1 text-gray-700">Entry</Text>
          <TextInput
            testID="input-body"
            accessibilityLabel="Journal entry"
            value={state.journalBody}
            onChangeText={(text) => setState((prev) => ({ ...prev, journalBody: text }))}
            placeholder="What's on your mind?"
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            className="rounded-2xl border border-gray-300 px-3 py-3 text-base bg-white mb-1"
            style={{ minHeight: 120 }}
          />
          {state.errors.body && (
            <Text className="text-red-600 text-sm mb-3">{state.errors.body}</Text>
          )}

          {/* Journal Inspiration component */}
          <JournalInspiration />
        </>
      );
    }

    if (state.activeTab === 'catchall') {
      return (
        <>
          <Text className="text-sm mb-1 text-gray-700">Note</Text>
          <TextInput
            testID="input-body"
            accessibilityLabel="Catch-all note"
            value={state.catchallBody}
            onChangeText={(text) => setState((prev) => ({ ...prev, catchallBody: text }))}
            placeholder="Quick note or idea..."
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            className="rounded-2xl border border-gray-300 px-3 py-3 text-base bg-white mb-1"
            style={{ minHeight: 120 }}
          />
          {state.errors.body && (
            <Text className="text-red-600 text-sm mb-3">{state.errors.body}</Text>
          )}
        </>
      );
    }

    return null;
  };

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  return (
    <ActionSheet
      id="manual-add-sheet"
      gestureEnabled
      backgroundInteractionEnabled={false}
      onOpen={handleSheetOpen}
      containerStyle={{
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        height: '85%',
        backgroundColor: '#FFF7EA', // cream
      }}
      indicatorStyle={{
        backgroundColor: '#E5E5E5',
        width: 72,
        height: 5,
        borderRadius: 3,
      }}
    >
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <View style={{ flex: 1, position: 'relative' }}>
            {/* Header with Tabs */}
            <View className="px-4 pt-4 pb-2">
              <Text className="text-2xl font-semibold mb-4 text-gray-900">Add to the Hub</Text>

              {/* Tab Buttons */}
              <View className="flex-row rounded-2xl bg-white/60 p-1 mb-4">
                {renderTabButton('habit', 'Habit')}
                {renderTabButton('todo', 'To-Do')}
                {renderTabButton('journal', 'Journal')}
                {renderTabButton('catchall', 'Catch All')}
              </View>
            </View>

            {/* Scrollable Form Content */}
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{
                padding: 16,
                paddingBottom: (insets.bottom || 16) + 100,
              }}
              keyboardShouldPersistTaps="handled"
            >
              {renderFormContent()}
            </ScrollView>

            {/* Sticky Footer Button */}
            <View
              style={{
                position: 'absolute',
                left: 16,
                right: 16,
                bottom: (insets.bottom || 16) + 16,
              }}
            >
              <Pressable
                testID="button-save"
                accessibilityRole="button"
                accessibilityLabel="Save to the Hub"
                disabled={state.saving}
                onPress={handleSave}
                className={`${
                  state.saving ? 'bg-gray-400' : 'bg-deepTeal'
                } rounded-2xl py-3 items-center`}
                style={{ minHeight: 48 }}
              >
                <Text className="text-white font-semibold text-lg">
                  {state.saving ? 'Saving...' : 'Save to the Hub'}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ActionSheet>
  );
}
