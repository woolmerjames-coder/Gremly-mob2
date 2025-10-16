/**
 * Manual Add Sheet - Phase 6 (StyleSheet Migration)
 *
 * A tabbed modal for creating Habits, To-Dos, Journal entries, and Catch-All notes.
 * Migrated from Tailwind/className to React Native StyleSheet with design system.
 *
 * Changes from 6B:
 * - Removed journal date field (back to 6A spec)
 * - Removed weekly day-of-week selection chips
 * - Migrated all className usage to StyleSheet
 * - Using design system tokens
 * - Preserved all testIDs for test compatibility
 *
 * Usage:
 *   openManualAdd() - Opens with default tab (Habit)
 *   openManualAdd({ defaultTab: 'journal' }) - Opens to specific tab
 *   openManualAdd({ spaceId: 'space_123' }) - Links created items to a Space
 */

import { useState } from 'react';
import {
  View,
  Text as RNText,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import ActionSheet, { SheetManager } from 'react-native-actions-sheet';
import { z } from 'zod';
import { useRepo } from '../providers/RepoProvider';
import { useTheme } from '../providers/ThemeProvider';
import { spacing, borderRadius, fontSize, fontWeight } from '../design/tokens';
import JournalInspiration from './JournalInspiration';

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
  const { theme } = useTheme();

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

  // Create themed styles
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      position: 'relative',
    },
    header: {
      paddingHorizontal: spacing.base,
      paddingTop: spacing.base,
      paddingBottom: spacing.sm,
    },
    title: {
      fontSize: fontSize['2xl'],
      fontWeight: fontWeight.semibold,
      marginBottom: spacing.base,
      color: theme.colors.gray[900],
    },
    tabContainer: {
      flexDirection: 'row',
      borderRadius: borderRadius['2xl'],
      backgroundColor: 'rgba(255, 255, 255, 0.6)',
      padding: 4,
      marginBottom: spacing.base,
    },
    tabButton: {
      flex: 1,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.xl,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabButtonActive: {
      backgroundColor: theme.colors.deepTeal.DEFAULT,
    },
    tabButtonInactive: {
      backgroundColor: 'transparent',
    },
    tabText: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.medium,
    },
    tabTextActive: {
      color: theme.colors.white,
    },
    tabTextInactive: {
      color: theme.colors.gray[700],
    },
    scrollContent: {
      padding: spacing.base,
      paddingBottom: (insets.bottom || spacing.base) + 100,
    },
    label: {
      fontSize: fontSize.sm,
      marginBottom: 4,
      color: theme.colors.gray[700],
    },
    input: {
      height: 48,
      borderRadius: borderRadius['2xl'],
      borderWidth: 1,
      borderColor: theme.colors.gray[300],
      paddingHorizontal: spacing.md,
      fontSize: fontSize.base,
      backgroundColor: theme.colors.white,
      marginBottom: 4,
      color: theme.colors.text.primary,
    },
    textArea: {
      borderRadius: borderRadius['2xl'],
      borderWidth: 1,
      borderColor: theme.colors.gray[300],
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      fontSize: fontSize.base,
      backgroundColor: theme.colors.white,
      marginBottom: 4,
      minHeight: 120,
      textAlignVertical: 'top',
      color: theme.colors.text.primary,
    },
    errorText: {
      color: theme.colors.error,
      fontSize: fontSize.sm,
      marginBottom: spacing.md,
    },
    chipContainer: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: 4,
    },
    chip: {
      paddingHorizontal: spacing.base,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius['2xl'],
      borderWidth: 1,
    },
    chipActive: {
      borderColor: theme.colors.deepTeal.DEFAULT,
      backgroundColor: 'rgba(13, 59, 58, 0.1)',
    },
    chipInactive: {
      borderColor: theme.colors.gray[300],
      backgroundColor: 'transparent',
    },
    chipText: {
      textTransform: 'capitalize',
    },
    chipTextActive: {
      color: theme.colors.deepTeal.DEFAULT,
      fontWeight: fontWeight.medium,
    },
    chipTextInactive: {
      color: theme.colors.gray[700],
    },
    spacer: {
      marginTop: spacing.md,
    },
    footerContainer: {
      position: 'absolute',
      left: spacing.base,
      right: spacing.base,
      bottom: (insets.bottom || spacing.base) + spacing.base,
    },
    saveButton: {
      borderRadius: borderRadius['2xl'],
      paddingVertical: spacing.md,
      alignItems: 'center',
      minHeight: 48,
    },
    saveButtonEnabled: {
      backgroundColor: theme.colors.deepTeal.DEFAULT,
    },
    saveButtonDisabled: {
      backgroundColor: theme.colors.gray[400],
    },
    saveButtonText: {
      color: theme.colors.white,
      fontWeight: fontWeight.semibold,
      fontSize: fontSize.lg,
    },
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
        style={[styles.tabButton, isActive ? styles.tabButtonActive : styles.tabButtonInactive]}
      >
        <RNText style={[styles.tabText, isActive ? styles.tabTextActive : styles.tabTextInactive]}>
          {label}
        </RNText>
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
          <RNText style={styles.label}>Name</RNText>
          <TextInput
            testID="input-name"
            accessibilityLabel="Habit name"
            value={state.habitName}
            onChangeText={(text) => setState((prev) => ({ ...prev, habitName: text }))}
            placeholder="e.g., Morning run"
            placeholderTextColor={theme.colors.gray[400]}
            placeholderTextColor={theme.colors.gray[400]}
            style={styles.input}
          />
          {state.errors.name && <RNText style={styles.errorText}>{state.errors.name}</RNText>}

          <RNText style={[styles.label, styles.spacer]}>Frequency</RNText>
          <View style={styles.chipContainer}>
            {['daily', 'weekly', 'monthly'].map((freq) => (
              <Pressable
                key={freq}
                testID={`frequency-${freq}`}
                accessibilityRole="button"
                accessibilityLabel={`Frequency ${freq}`}
                onPress={() => setState((prev) => ({ ...prev, habitFrequency: freq }))}
                style={[
                  styles.chip,
                  state.habitFrequency === freq ? styles.chipActive : styles.chipInactive,
                ]}
              >
                <RNText
                  style={[
                    styles.chipText,
                    state.habitFrequency === freq ? styles.chipTextActive : styles.chipTextInactive,
                  ]}
                >
                  {freq}
                </RNText>
              </Pressable>
            ))}
          </View>
          <TextInput
            testID="input-frequency"
            accessibilityLabel="Custom frequency"
            value={state.habitFrequency}
            onChangeText={(text) => setState((prev) => ({ ...prev, habitFrequency: text }))}
            placeholder="Or type custom frequency"
            placeholderTextColor={theme.colors.gray[400]}
            placeholderTextColor={theme.colors.gray[400]}
            style={styles.input}
          />
          {state.errors.frequency && (
            <RNText style={styles.errorText}>{state.errors.frequency}</RNText>
          )}
        </>
      );
    }

    if (state.activeTab === 'todo') {
      return (
        <>
          <RNText style={styles.label}>Name</RNText>
          <TextInput
            testID="input-name"
            accessibilityLabel="To-Do name"
            value={state.todoName}
            onChangeText={(text) => setState((prev) => ({ ...prev, todoName: text }))}
            placeholder="e.g., Buy groceries"
            placeholderTextColor={theme.colors.gray[400]}
            style={styles.input}
          />
          {state.errors.name && <RNText style={styles.errorText}>{state.errors.name}</RNText>}

          <RNText style={[styles.label, styles.spacer]}>Due Date (optional)</RNText>
          <TextInput
            testID="input-dueDate"
            accessibilityLabel="Due date"
            value={state.todoDueDate}
            onChangeText={(text) => setState((prev) => ({ ...prev, todoDueDate: text }))}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.colors.gray[400]}
            style={styles.input}
          />
          {state.errors.dueDate && <RNText style={styles.errorText}>{state.errors.dueDate}</RNText>}
        </>
      );
    }

    if (state.activeTab === 'journal') {
      return (
        <>
          <RNText style={styles.label}>Title (optional)</RNText>
          <TextInput
            testID="input-title"
            accessibilityLabel="Journal title"
            value={state.journalTitle}
            onChangeText={(text) => setState((prev) => ({ ...prev, journalTitle: text }))}
            placeholder="e.g., Morning thoughts"
            placeholderTextColor={theme.colors.gray[400]}
            style={styles.input}
          />

          <RNText style={styles.label}>Entry</RNText>
          <TextInput
            testID="input-body"
            accessibilityLabel="Journal entry"
            value={state.journalBody}
            onChangeText={(text) => setState((prev) => ({ ...prev, journalBody: text }))}
            placeholder="What's on your mind?"
            placeholderTextColor={theme.colors.gray[400]}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            style={styles.textArea}
            style={{ minHeight: 120 }}
          />
          {state.errors.body && <RNText style={styles.errorText}>{state.errors.body}</RNText>}

          {/* Journal Inspiration component */}
          <JournalInspiration />
        </>
      );
    }

    if (state.activeTab === 'catchall') {
      return (
        <>
          <RNText style={styles.label}>Note</RNText>
          <TextInput
            testID="input-body"
            accessibilityLabel="Catch-all note"
            value={state.catchallBody}
            onChangeText={(text) => setState((prev) => ({ ...prev, catchallBody: text }))}
            placeholder="Quick note or idea..."
            placeholderTextColor={theme.colors.gray[400]}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            style={styles.textArea}
            style={{ minHeight: 120 }}
          />
          {state.errors.body && <RNText style={styles.errorText}>{state.errors.body}</RNText>}
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
              <RNText className="text-2xl font-semibold mb-4 text-gray-900">Add to the Hub</RNText>

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
                <RNText className="text-white font-semibold text-lg">
                  {state.saving ? 'Saving...' : 'Save to the Hub'}
                </RNText>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ActionSheet>
  );
}
