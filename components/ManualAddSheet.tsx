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

import { useState, useEffect } from 'react';
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
  Animated,
} from 'react-native';
import { Easing } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import ActionSheet, { SheetManager } from 'react-native-actions-sheet';
import { z } from 'zod';
import { useRepo } from '../providers/RepoProvider';
import { toRepoFrequency } from '../app/schemas/manualAdd';
import { spacing, borderRadius, fontSize, fontWeight } from '../design/tokens';
import { useTokens } from '../design/makeStyles';
import JournalInspiration from './JournalInspiration';

// ============================================================================
// TYPES & STATE
// ============================================================================

type TabKey = 'habit' | 'todo' | 'journal' | 'catchall';
// UI (plural) keys for Habit/To-Do tabs
type UITab = 'habits' | 'todos' | 'journal' | 'catchall';
// Allow incoming/plural variants in state/options, but normalize to TabKey for logic
type TabInput = TabKey | UITab;

interface ManualAddOptions {
  defaultTab?: TabInput;
  spaceId?: string;
}

interface ManualAddState {
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
  const tokens = useTokens();

  // Animation values (not refs to avoid render warnings)
  const [tabTransition] = useState(() => new Animated.Value(1));
  const [submitAnimation] = useState(() => new Animated.Value(0));
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // UI tab state: default to 'habits' per spec
  const toUIKey = (tab?: TabInput): UITab => {
    if (tab === 'habit' || tab === 'habits' || tab === undefined) return 'habits';
    if (tab === 'todo' || tab === 'todos') return 'todos';
    if (tab === 'journal') return 'journal';
    if (tab === 'catchall') return 'catchall';
    return 'habits';
  };
  const [activeTab, setActiveTab] = useState<UITab>(
    toUIKey((globalOptions.defaultTab as TabInput) || 'habits'),
  );

  const [state, setState] = useState<ManualAddState>({
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

  // Normalize any plural/external tab keys to our internal TabKey
  const normalizeTab = (tab: TabInput): TabKey => {
    if (tab === 'habits') return 'habit';
    if (tab === 'todos') return 'todo';
    return tab as TabKey;
  };
  const logicTab: TabKey = normalizeTab(activeTab);

  // Derived enable/disable state for Save button
  const canSave = (() => {
    if (logicTab === 'habit') {
      return state.habitName.trim().length > 0 && state.habitFrequency.trim().length > 0;
    }
    if (logicTab === 'todo') {
      return state.todoName.trim().length > 0;
    }
    if (logicTab === 'journal') {
      return state.journalBody.trim().length > 0;
    }
    if (logicTab === 'catchall') {
      return state.catchallBody.trim().length > 0;
    }
    return false;
  })();

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
      color: tokens.colors.text,
    },
    tabContainer: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: spacing.base,
    },
    tabButton: {
      flex: 1,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.xl,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    tabButtonActive: {
      backgroundColor: tokens.colors.primary,
      borderColor: tokens.colors.primary,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    tabButtonInactive: {
      backgroundColor: 'transparent',
      borderColor: tokens.colors.border,
    },
    tabText: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.medium,
    },
    tabTextActive: {
      color: '#FFFFFF',
    },
    tabTextInactive: {
      color: tokens.colors.subtle,
    },
    scrollContent: {
      padding: spacing.base,
      paddingBottom: (insets.bottom || spacing.base) + 100,
    },
    formContent: {
      opacity: 1,
    },
    label: {
      fontSize: fontSize.sm,
      marginBottom: 4,
      color: tokens.colors.text,
      fontWeight: fontWeight.medium,
    },
    input: {
      height: 48,
      borderRadius: borderRadius['2xl'],
      borderWidth: 1,
      borderColor: tokens.colors.border,
      paddingHorizontal: spacing.md,
      fontSize: fontSize.base,
      backgroundColor: tokens.colors.surface,
      marginBottom: 4,
      color: tokens.colors.text,
    },
    inputError: {
      borderColor: tokens.colors.danger,
      borderWidth: 2,
    },
    textArea: {
      borderRadius: borderRadius['2xl'],
      borderWidth: 1,
      borderColor: tokens.colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      fontSize: fontSize.base,
      backgroundColor: tokens.colors.surface,
      marginBottom: 4,
      minHeight: 120,
      textAlignVertical: 'top',
      color: tokens.colors.text,
    },
    errorText: {
      color: tokens.colors.danger,
      fontSize: fontSize.sm,
      marginBottom: spacing.md,
    },
    chipContainer: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: 4,
      flexWrap: 'wrap',
    },
    chip: {
      paddingHorizontal: spacing.base,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius['2xl'],
      borderWidth: 1,
    },
    chipActive: {
      borderColor: tokens.colors.primary,
      backgroundColor: tokens.colors.primary,
    },
    chipInactive: {
      borderColor: tokens.colors.border,
      backgroundColor: 'transparent',
    },
    chipText: {
      textTransform: 'capitalize',
      fontSize: fontSize.sm,
    },
    chipTextActive: {
      color: '#FFFFFF',
      fontWeight: fontWeight.semibold,
    },
    chipTextInactive: {
      color: tokens.colors.subtle,
    },
    spacer: {
      marginTop: spacing.md,
    },
    footerContainer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: tokens.colors.bg,
      borderTopWidth: 1,
      borderTopColor: tokens.colors.border,
      paddingHorizontal: spacing.base,
      paddingTop: spacing.md,
      paddingBottom: (insets.bottom || spacing.base) + spacing.sm,
      flexDirection: 'row',
      gap: spacing.md,
    },
    exitButton: {
      flex: 1,
      borderRadius: borderRadius['2xl'],
      paddingVertical: spacing.md,
      alignItems: 'center',
      minHeight: 48,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: 'transparent',
    },
    exitButtonText: {
      color: tokens.colors.text,
      fontWeight: fontWeight.medium,
      fontSize: fontSize.base,
    },
    saveButton: {
      flex: 2,
      borderRadius: borderRadius['2xl'],
      paddingVertical: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
      flexDirection: 'row',
      gap: 8,
    },
    saveButtonEnabled: {
      backgroundColor: tokens.colors.primary,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 4,
    },
    saveButtonDisabled: {
      backgroundColor: tokens.colors.border,
    },
    saveButtonText: {
      color: '#FFFFFF',
      fontWeight: fontWeight.semibold,
      fontSize: fontSize.lg,
    },
    saveButtonSuccess: {
      backgroundColor: tokens.colors.success,
    },
  });

  // Update state when sheet opens with new options
  const handleSheetOpen = () => {
    // Reset UI tab to provided default or 'habits'
    setActiveTab(toUIKey((globalOptions.defaultTab as TabInput) || 'habits'));
    // Reset forms
    setState((prev) => ({
      ...prev,
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
    }));
  };

  // ============================================================================
  // TAB SWITCHING
  // ============================================================================

  const switchTab = (tab: UITab) => {
    if (tab === activeTab) return;

    // Fade out current content
    Animated.timing(tabTransition, {
      toValue: 0,
      duration: 100,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      // Switch tab
      setActiveTab(tab);
      setState((prev) => ({ ...prev, errors: {} }));

      // Fade in new content
      Animated.timing(tabTransition, {
        toValue: 1,
        duration: 200,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start();
    });
  };

  // Initialize tab transition on mount
  useEffect(() => {
    tabTransition.setValue(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================================================
  // FORM SUBMISSION
  // ============================================================================

  const handleSave = async () => {
    setState((prev) => ({ ...prev, errors: {}, saving: true }));

    try {
      if (logicTab === 'habit') {
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
          frequency: toRepoFrequency(state.habitFrequency.trim()),
          space_id: state.spaceId || null,
          ai_placed: false,
        });

        // Success animation
        setSubmitSuccess(true);
        Animated.sequence([
          Animated.timing(submitAnimation, {
            toValue: 1,
            duration: 300,
            easing: Easing.out(Easing.back(1.5)),
            useNativeDriver: true,
          }),
          Animated.timing(submitAnimation, {
            toValue: 0,
            duration: 200,
            delay: 500,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ]).start(() => {
          setSubmitSuccess(false);
          closeManualAdd();
        });
      } else if (logicTab === 'todo') {
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

        // Success animation
        setSubmitSuccess(true);
        Animated.sequence([
          Animated.timing(submitAnimation, {
            toValue: 1,
            duration: 300,
            easing: Easing.out(Easing.back(1.5)),
            useNativeDriver: true,
          }),
          Animated.timing(submitAnimation, {
            toValue: 0,
            duration: 200,
            delay: 500,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ]).start(() => {
          setSubmitSuccess(false);
          closeManualAdd();
        });
      } else if (logicTab === 'journal') {
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

        // Success animation
        setSubmitSuccess(true);
        Animated.sequence([
          Animated.timing(submitAnimation, {
            toValue: 1,
            duration: 300,
            easing: Easing.out(Easing.back(1.5)),
            useNativeDriver: true,
          }),
          Animated.timing(submitAnimation, {
            toValue: 0,
            duration: 200,
            delay: 500,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ]).start(() => {
          setSubmitSuccess(false);
          closeManualAdd();
        });
      } else if (logicTab === 'catchall') {
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
          title: '',
          body: state.catchallBody.trim(),
          subtype: 'catchall',
          space_id: state.spaceId || null,
          ai_placed: false,
        });

        // Success animation
        setSubmitSuccess(true);
        Animated.sequence([
          Animated.timing(submitAnimation, {
            toValue: 1,
            duration: 300,
            easing: Easing.out(Easing.back(1.5)),
            useNativeDriver: true,
          }),
          Animated.timing(submitAnimation, {
            toValue: 0,
            duration: 200,
            delay: 500,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ]).start(() => {
          setSubmitSuccess(false);
          closeManualAdd();
        });
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

  const renderTabButton = (tab: UITab, label: string) => {
    const isActive = activeTab === tab;
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
    if (logicTab === 'habit') {
      return (
        <>
          <RNText style={styles.label}>Name</RNText>
          <TextInput
            testID="habit-name"
            accessibilityLabel="Habit name"
            accessibilityHint="Enter the name of your habit"
            value={state.habitName}
            onChangeText={(text) => setState((prev) => ({ ...prev, habitName: text }))}
            placeholder="e.g., Morning run"
            placeholderTextColor={tokens.colors.subtle}
            style={[styles.input, state.errors.name && styles.inputError]}
          />
          {state.errors.name && <RNText style={styles.errorText}>{state.errors.name}</RNText>}

          <RNText style={[styles.label, styles.spacer]}>Frequency</RNText>
          <View style={styles.chipContainer}>
            {['daily', 'weekly', 'monthly'].map((freq) => (
              <Pressable
                key={freq}
                testID={`frequency-${freq}`}
                accessibilityRole="radio"
                accessibilityLabel={`Frequency ${freq}`}
                accessibilityState={{ checked: state.habitFrequency === freq }}
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
            accessibilityHint="Or type a custom frequency"
            value={state.habitFrequency}
            onChangeText={(text) => setState((prev) => ({ ...prev, habitFrequency: text }))}
            placeholder="Or type custom frequency"
            placeholderTextColor={tokens.colors.subtle}
            style={[styles.input, state.errors.frequency && styles.inputError]}
          />
          {state.errors.frequency && (
            <RNText style={styles.errorText}>{state.errors.frequency}</RNText>
          )}
        </>
      );
    }

    if (logicTab === 'todo') {
      return (
        <>
          <RNText style={styles.label}>Name</RNText>
          <TextInput
            testID="todo-name"
            accessibilityLabel="To-Do name"
            accessibilityHint="Enter the name of your to-do"
            value={state.todoName}
            onChangeText={(text) => setState((prev) => ({ ...prev, todoName: text }))}
            placeholder="e.g., Buy groceries"
            placeholderTextColor={tokens.colors.subtle}
            style={[styles.input, state.errors.name && styles.inputError]}
          />
          {state.errors.name && <RNText style={styles.errorText}>{state.errors.name}</RNText>}

          <RNText style={[styles.label, styles.spacer]}>Due Date (optional)</RNText>
          <TextInput
            testID="todo-date"
            accessibilityLabel="Due date"
            accessibilityHint="Enter due date in YYYY-MM-DD format"
            value={state.todoDueDate}
            onChangeText={(text) => setState((prev) => ({ ...prev, todoDueDate: text }))}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={tokens.colors.subtle}
            style={[styles.input, state.errors.dueDate && styles.inputError]}
          />
          {state.errors.dueDate && <RNText style={styles.errorText}>{state.errors.dueDate}</RNText>}
        </>
      );
    }

    if (logicTab === 'journal') {
      return (
        <>
          <RNText style={styles.label}>Title (optional)</RNText>
          <TextInput
            testID="input-title"
            accessibilityLabel="Journal title"
            accessibilityHint="Enter an optional title for your journal entry"
            value={state.journalTitle}
            onChangeText={(text) => setState((prev) => ({ ...prev, journalTitle: text }))}
            placeholder="e.g., Morning thoughts"
            placeholderTextColor={tokens.colors.subtle}
            style={styles.input}
          />

          <RNText style={styles.label}>Entry</RNText>
          <TextInput
            testID="journal-body"
            accessibilityLabel="Journal entry"
            accessibilityHint="Write your journal entry"
            value={state.journalBody}
            onChangeText={(text) => setState((prev) => ({ ...prev, journalBody: text }))}
            placeholder="What's on your mind?"
            placeholderTextColor={tokens.colors.subtle}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            style={[styles.textArea, state.errors.body && styles.inputError]}
          />
          {state.errors.body && <RNText style={styles.errorText}>{state.errors.body}</RNText>}

          {/* Journal Inspiration component */}
          <JournalInspiration />
        </>
      );
    }

    if (logicTab === 'catchall') {
      return (
        <>
          <RNText style={styles.label}>Note</RNText>
          <TextInput
            testID="catchall-body"
            accessibilityLabel="Catch-all note"
            accessibilityHint="Write a quick note or idea"
            value={state.catchallBody}
            onChangeText={(text) => setState((prev) => ({ ...prev, catchallBody: text }))}
            placeholder="Quick note or idea..."
            placeholderTextColor={tokens.colors.subtle}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            style={[styles.textArea, state.errors.body && styles.inputError]}
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
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        height: '85%',
        backgroundColor: tokens.colors.surface,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 8,
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
            <View style={styles.header}>
              <RNText style={styles.title}>Add to the Hub</RNText>

              {/* Tab Buttons */}
              <View style={styles.tabContainer}>
                {renderTabButton('habits', 'Habit')}
                {renderTabButton('todos', 'To-Do')}
                {renderTabButton('journal', 'Journal')}
                {renderTabButton('catchall', 'Catch All')}
              </View>
            </View>

            {/* Scrollable Form Content */}
            <Animated.View
              style={{
                flex: 1,
                opacity: tabTransition,
                transform: [
                  {
                    translateX: tabTransition.interpolate({
                      inputRange: [0, 1],
                      outputRange: [20, 0],
                    }),
                  },
                ],
              }}
            >
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
              >
                {renderFormContent()}
              </ScrollView>
            </Animated.View>

            {/* Sticky Footer with Exit and Submit */}
            <View style={styles.footerContainer}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Exit without saving"
                onPress={closeManualAdd}
                style={styles.exitButton}
              >
                <RNText style={styles.exitButtonText}>Exit</RNText>
              </Pressable>

              <Animated.View
                style={[
                  { flex: 2 },
                  {
                    transform: [
                      {
                        scale: submitAnimation.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 1.05],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <Pressable
                  testID="save-button"
                  accessibilityRole="button"
                  accessibilityLabel={submitSuccess ? 'Saved successfully' : 'Submit to Gremly'}
                  accessibilityState={{ disabled: state.saving || !canSave }}
                  disabled={state.saving || !canSave || submitSuccess}
                  onPress={handleSave}
                  style={[
                    styles.saveButton,
                    submitSuccess
                      ? styles.saveButtonSuccess
                      : state.saving || !canSave
                        ? styles.saveButtonDisabled
                        : styles.saveButtonEnabled,
                  ]}
                >
                  {submitSuccess ? (
                    <Check size={24} color="#FFFFFF" strokeWidth={3} />
                  ) : (
                    <RNText style={styles.saveButtonText}>
                      {state.saving ? 'Submitting...' : 'Submit to Gremly'}
                    </RNText>
                  )}
                </Pressable>
              </Animated.View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ActionSheet>
  );
}
