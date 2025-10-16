// Archived backup of ManualAddSheet (no-op in build)
import { useMemo, useState } from 'react';
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
import { useRepo } from '../../providers/RepoProvider';
import JournalInspiration from '../../components/JournalInspiration';

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
  journalDate: string;
  // Catch-all form
  catchallBody: string;
  // Weekly DOW selection
  weeklyDays: Record<string, boolean>;
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
    journalDate: new Date().toISOString().slice(0, 10),
    catchallBody: '',
    weeklyDays: {
      mon: false,
      tue: false,
      wed: false,
      thu: false,
      fri: false,
      sat: false,
      sun: false,
    },
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
      journalDate: new Date().toISOString().slice(0, 10),
      catchallBody: '',
      weeklyDays: {
        mon: false,
        tue: false,
        wed: false,
        thu: false,
        fri: false,
        sat: false,
        sun: false,
      },
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
        const normalizeFrequency = (f: string) => f.trim().toLowerCase();
        await repo.create({
          type: 'habit',
          title: state.habitName.trim(),
          frequency: normalizeFrequency(state.habitFrequency) as any,
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
          title: '',
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
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to save. Please try again.';
      Alert.alert('Error', errorMessage);
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
          <ScrollView>
            <Text>Archived backup</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ActionSheet>
  );
}
