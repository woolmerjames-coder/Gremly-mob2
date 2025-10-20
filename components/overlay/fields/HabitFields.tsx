/**
 * HabitFields - Form fields for creating/editing habits
 */
import React, { useState } from 'react';
import { View, StyleSheet, Pressable, TextInput } from 'react-native';
import { Input } from '../../../design-system/Input';
import { Textarea } from '../../../design-system/Textarea';
import { Icon } from '../../../design-system/Icon';
import Chip from '../../ui/Chip';
import { Text } from '../../../ui/Text';
import type { Frequency } from '../../../lib/types';
import { HabitFrequency, type FrequencyValue } from './HabitFrequency';
import { RemindersList, type ReminderRow } from './RemindersList';

type HabitSubtype = 'start_habit' | 'break_habit' | 'routine';
type HabitMode = 'start' | 'break';
type StackPosition = 'before' | 'after';
type TaperStrategy = 'step_down' | 'windowing' | 'days_off';
type TaperPeriod = 'day' | 'week';

export interface TaperPlanState {
  baselineCount: number;
  baselinePeriod: TaperPeriod;
  targetCount: number; // 0 for "Zero"
  targetPeriod: TaperPeriod;
  strategy: TaperStrategy | null;
  // Strategy-specific parameters
  stepDownReduceBy?: number;
  stepDownPer?: TaperPeriod;
  windowingWindowSize?: number;
  daysOffCount?: number;
}

export interface HabitDetailsState {
  buddyId?: string | null;
  buddyEmail?: string | null;
  spaceId?: string | null;
  notes?: string;
  tags?: string[];
  stackHabitId?: string | null;
  stackHabitName?: string | null;
  stackPosition?: StackPosition;
  stackOffsetMinutes?: number;
  startDate?: string; // ISO date string
  endDate?: string | null;
}

export interface BreakHabitState {
  taperPlan?: TaperPlanState;
  triggers?: string[];
  replacementHabitId?: string | null;
  replacementHabitName?: string | null;
  replacementFreeText?: string;
}

interface HabitFieldsProps {
  name: string;
  onNameChange: (value: string) => void;
  frequency: Frequency;
  onFrequencyChange: (value: Frequency) => void;
  subtype?: HabitSubtype | null;
  onSubtypeChange?: (value: HabitSubtype) => void;
  disabled?: boolean;
  // New props for Start Habit frequency builder
  frequencyValue?: FrequencyValue;
  onFrequencyValueChange?: (value: FrequencyValue) => void;
  // Reminders for both Start & Break habits
  reminders?: ReminderRow[];
  onRemindersChange?: (value: ReminderRow[]) => void;
  // Optional details
  details?: HabitDetailsState;
  onDetailsChange?: (value: HabitDetailsState) => void;
  // Space selector
  spaceId?: string | null;
  onSpaceIdChange?: (value: string | null) => void;
  // Available tags for autocomplete (from tags repo)
  availableTags?: string[];
  // Available habits for stacking
  availableHabits?: Array<{ id: string; title: string }>;
  // Break Habit specific fields
  breakHabitState?: BreakHabitState;
  onBreakHabitStateChange?: (value: BreakHabitState) => void;
}

const FREQUENCY_OPTIONS: Frequency[] = ['daily', 'weekly', 'monthly'];

export function HabitFields({
  name,
  onNameChange,
  frequency,
  onFrequencyChange,
  subtype,
  onSubtypeChange,
  disabled = false,
  frequencyValue,
  onFrequencyValueChange,
  reminders = [],
  onRemindersChange,
  details = {},
  onDetailsChange,
  spaceId,
  onSpaceIdChange,
  availableTags = [],
  availableHabits = [],
  breakHabitState,
  onBreakHabitStateChange,
}: HabitFieldsProps) {
  // Local state for collapsible details
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [triggerInput, setTriggerInput] = useState('');

  // Derive habit mode from subtype
  const habitMode: HabitMode = subtype === 'break_habit' ? 'break' : 'start';

  const handleModeToggle = (mode: HabitMode) => {
    if (onSubtypeChange) {
      onSubtypeChange(mode === 'start' ? 'start_habit' : 'break_habit');
    }
  };

  // Use new frequency builder for Start Habit mode
  const useNewFrequencyBuilder = habitMode === 'start' && frequencyValue && onFrequencyValueChange;

  // Helper to update details
  const updateDetails = (updates: Partial<HabitDetailsState>) => {
    if (onDetailsChange) {
      onDetailsChange({ ...details, ...updates });
    }
  };

  // Tag handlers
  const handleAddTag = (tag: string) => {
    const trimmedTag = tag.trim().toLowerCase();
    if (trimmedTag && !details.tags?.includes(trimmedTag)) {
      updateDetails({ tags: [...(details.tags || []), trimmedTag] });
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    updateDetails({ tags: details.tags?.filter((t) => t !== tag) || [] });
  };

  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    return new Date().toISOString().split('T')[0];
  };

  // Break Habit helpers
  const updateBreakHabit = (updates: Partial<BreakHabitState>) => {
    if (onBreakHabitStateChange) {
      onBreakHabitStateChange({ ...breakHabitState, ...updates });
    }
  };

  const updateTaperPlan = (updates: Partial<TaperPlanState>) => {
    const currentTaper = breakHabitState?.taperPlan || {
      baselineCount: 7,
      baselinePeriod: 'week' as TaperPeriod,
      targetCount: 0,
      targetPeriod: 'week' as TaperPeriod,
      strategy: null,
    };
    updateBreakHabit({ taperPlan: { ...currentTaper, ...updates } });
  };

  const handleAddTrigger = (trigger: string) => {
    const trimmedTrigger = trigger.trim();
    if (trimmedTrigger && !breakHabitState?.triggers?.includes(trimmedTrigger)) {
      updateBreakHabit({
        triggers: [...(breakHabitState?.triggers || []), trimmedTrigger],
      });
      setTriggerInput('');
    }
  };

  const handleRemoveTrigger = (trigger: string) => {
    updateBreakHabit({
      triggers: breakHabitState?.triggers?.filter((t) => t !== trigger) || [],
    });
  };

  // Common triggers for Break Habit
  const commonTriggers = ['Stress', 'Boredom', 'Social', 'Evening', 'After meals'];

  return (
    <View style={styles.container}>
      {/* Start/Break Toggle - removed "Routine" option */}
      {onSubtypeChange && (
        <View style={styles.section}>
          <View style={styles.toggleContainer}>
            <Pressable
              onPress={() => handleModeToggle('start')}
              disabled={disabled}
              testID="habit-toggle-start"
              style={[
                styles.toggleButton,
                styles.toggleButtonLeft,
                habitMode === 'start' && styles.toggleButtonActive,
              ]}
            >
              <Text style={[styles.toggleText, habitMode === 'start' && styles.toggleTextActive]}>
                Start a habit
              </Text>
            </Pressable>
            <Pressable
              onPress={() => handleModeToggle('break')}
              disabled={disabled}
              testID="habit-toggle-break"
              style={[
                styles.toggleButton,
                styles.toggleButtonRight,
                habitMode === 'break' && styles.toggleButtonActive,
              ]}
            >
              <Text style={[styles.toggleText, habitMode === 'break' && styles.toggleTextActive]}>
                Break a habit
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Name field */}
      <View style={styles.section}>
        <Input
          label="Name"
          value={name}
          onChangeText={onNameChange}
          placeholder="e.g., Morning meditation"
          disabled={disabled}
          testID="habit-name-input"
        />
      </View>

      {/* Break Habit specific fields */}
      {habitMode === 'break' && onBreakHabitStateChange && (
        <View style={styles.breakHabitSection}>
          {/* Taper Plan */}
          <View style={styles.section}>
            <Text style={styles.label}>Taper Plan</Text>

            {/* Baseline */}
            <View style={styles.taperRow}>
              <Text style={styles.taperLabel}>Baseline:</Text>
              <View style={styles.taperInputGroup}>
                <View style={styles.stepper}>
                  <Pressable
                    onPress={() =>
                      updateTaperPlan({
                        baselineCount: Math.max(
                          1,
                          (breakHabitState?.taperPlan?.baselineCount || 7) - 1,
                        ),
                      })
                    }
                    disabled={disabled}
                    style={styles.stepperButton}
                    testID="taper-baseline-minus"
                  >
                    <Text style={styles.stepperButtonText}>−</Text>
                  </Pressable>
                  <TextInput
                    value={String(breakHabitState?.taperPlan?.baselineCount || 7)}
                    onChangeText={(text) => {
                      const num = parseInt(text, 10);
                      if (!isNaN(num) && num > 0) {
                        updateTaperPlan({ baselineCount: num });
                      }
                    }}
                    keyboardType="number-pad"
                    style={styles.stepperValue}
                    editable={!disabled}
                    testID="taper-baseline"
                  />
                  <Pressable
                    onPress={() =>
                      updateTaperPlan({
                        baselineCount: (breakHabitState?.taperPlan?.baselineCount || 7) + 1,
                      })
                    }
                    disabled={disabled}
                    style={styles.stepperButton}
                    testID="taper-baseline-plus"
                  >
                    <Text style={styles.stepperButtonText}>+</Text>
                  </Pressable>
                </View>
                <Text style={styles.taperText}>per</Text>
                <Pressable
                  onPress={() =>
                    updateTaperPlan({
                      baselinePeriod:
                        breakHabitState?.taperPlan?.baselinePeriod === 'day' ? 'week' : 'day',
                    })
                  }
                  disabled={disabled}
                  style={styles.periodButton}
                  testID="taper-baseline-period"
                >
                  <Text style={styles.periodButtonText}>
                    {breakHabitState?.taperPlan?.baselinePeriod || 'week'}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Target */}
            <View style={styles.taperRow}>
              <Text style={styles.taperLabel}>Target:</Text>
              <View style={styles.taperInputGroup}>
                <Pressable
                  onPress={() => updateTaperPlan({ targetCount: 0 })}
                  disabled={disabled}
                  style={[
                    styles.targetChip,
                    breakHabitState?.taperPlan?.targetCount === 0 && styles.targetChipActive,
                  ]}
                  testID="taper-target-zero"
                >
                  <Text
                    style={[
                      styles.targetChipText,
                      breakHabitState?.taperPlan?.targetCount === 0 && styles.targetChipTextActive,
                    ]}
                  >
                    Zero
                  </Text>
                </Pressable>
                <Text style={styles.taperText}>or</Text>
                <View style={styles.stepper}>
                  <Pressable
                    onPress={() =>
                      updateTaperPlan({
                        targetCount: Math.max(
                          1,
                          (breakHabitState?.taperPlan?.targetCount || 1) - 1,
                        ),
                      })
                    }
                    disabled={disabled || breakHabitState?.taperPlan?.targetCount === 0}
                    style={styles.stepperButton}
                    testID="taper-target-minus"
                  >
                    <Text style={styles.stepperButtonText}>−</Text>
                  </Pressable>
                  <TextInput
                    value={
                      breakHabitState?.taperPlan?.targetCount === 0
                        ? ''
                        : String(breakHabitState?.taperPlan?.targetCount || 1)
                    }
                    onChangeText={(text) => {
                      const num = parseInt(text, 10);
                      if (!isNaN(num) && num > 0) {
                        updateTaperPlan({ targetCount: num });
                      }
                    }}
                    keyboardType="number-pad"
                    style={styles.stepperValue}
                    editable={!disabled && breakHabitState?.taperPlan?.targetCount !== 0}
                    testID="taper-target"
                    placeholder="1"
                  />
                  <Pressable
                    onPress={() =>
                      updateTaperPlan({
                        targetCount: (breakHabitState?.taperPlan?.targetCount || 1) + 1,
                      })
                    }
                    disabled={disabled || breakHabitState?.taperPlan?.targetCount === 0}
                    style={styles.stepperButton}
                    testID="taper-target-plus"
                  >
                    <Text style={styles.stepperButtonText}>+</Text>
                  </Pressable>
                </View>
                <Text style={styles.taperText}>per</Text>
                <Pressable
                  onPress={() =>
                    updateTaperPlan({
                      targetPeriod:
                        breakHabitState?.taperPlan?.targetPeriod === 'day' ? 'week' : 'day',
                    })
                  }
                  disabled={disabled || breakHabitState?.taperPlan?.targetCount === 0}
                  style={styles.periodButton}
                  testID="taper-target-period"
                >
                  <Text style={styles.periodButtonText}>
                    {breakHabitState?.taperPlan?.targetPeriod || 'week'}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Strategy chips */}
            <View style={styles.strategySection}>
              <Text style={styles.detailSubtext}>Strategy</Text>
              <View style={styles.chipRow}>
                <Chip
                  label="Step-down"
                  selected={breakHabitState?.taperPlan?.strategy === 'step_down'}
                  onPress={() => updateTaperPlan({ strategy: 'step_down' })}
                  testID="taper-strategy-step_down"
                  disabled={disabled}
                  style={styles.chip}
                />
                <Chip
                  label="Windowing"
                  selected={breakHabitState?.taperPlan?.strategy === 'windowing'}
                  onPress={() => updateTaperPlan({ strategy: 'windowing' })}
                  testID="taper-strategy-windowing"
                  disabled={disabled}
                  style={styles.chip}
                />
                <Chip
                  label="Days off"
                  selected={breakHabitState?.taperPlan?.strategy === 'days_off'}
                  onPress={() => updateTaperPlan({ strategy: 'days_off' })}
                  testID="taper-strategy-days_off"
                  disabled={disabled}
                  style={styles.chip}
                />
              </View>
            </View>

            {/* Strategy-specific parameters */}
            {breakHabitState?.taperPlan?.strategy === 'step_down' && (
              <View style={styles.strategyParams}>
                <Text style={styles.detailSubtext}>Reduce by</Text>
                <View style={styles.taperInputGroup}>
                  <View style={styles.stepper}>
                    <Pressable
                      onPress={() =>
                        updateTaperPlan({
                          stepDownReduceBy: Math.max(
                            1,
                            (breakHabitState?.taperPlan?.stepDownReduceBy || 1) - 1,
                          ),
                        })
                      }
                      disabled={disabled}
                      style={styles.stepperButton}
                      testID="step-down-reduce-minus"
                    >
                      <Text style={styles.stepperButtonText}>−</Text>
                    </Pressable>
                    <Text style={styles.stepperValue}>
                      {breakHabitState?.taperPlan?.stepDownReduceBy || 1}
                    </Text>
                    <Pressable
                      onPress={() =>
                        updateTaperPlan({
                          stepDownReduceBy: (breakHabitState?.taperPlan?.stepDownReduceBy || 1) + 1,
                        })
                      }
                      disabled={disabled}
                      style={styles.stepperButton}
                      testID="step-down-reduce-plus"
                    >
                      <Text style={styles.stepperButtonText}>+</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.taperText}>per</Text>
                  <Pressable
                    onPress={() =>
                      updateTaperPlan({
                        stepDownPer:
                          breakHabitState?.taperPlan?.stepDownPer === 'day' ? 'week' : 'day',
                      })
                    }
                    disabled={disabled}
                    style={styles.periodButton}
                    testID="step-down-per"
                  >
                    <Text style={styles.periodButtonText}>
                      {breakHabitState?.taperPlan?.stepDownPer || 'week'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>

          {/* Triggers */}
          <View style={styles.section}>
            <Text style={styles.label}>Triggers</Text>
            <Text style={styles.detailSubtext}>What prompts this habit?</Text>

            {/* Common trigger chips */}
            <View style={styles.chipRow}>
              {commonTriggers.map((trigger) => (
                <Chip
                  key={trigger}
                  label={trigger}
                  selected={breakHabitState?.triggers?.includes(trigger) || false}
                  onPress={() =>
                    breakHabitState?.triggers?.includes(trigger)
                      ? handleRemoveTrigger(trigger)
                      : handleAddTrigger(trigger)
                  }
                  testID={`trigger-chip-${trigger.toLowerCase().replace(/\s+/g, '_')}`}
                  disabled={disabled}
                  style={styles.chip}
                />
              ))}
            </View>

            {/* Custom trigger input */}
            <View style={styles.tagInputRow}>
              <TextInput
                value={triggerInput}
                onChangeText={setTriggerInput}
                onSubmitEditing={() => triggerInput.trim() && handleAddTrigger(triggerInput)}
                placeholder="Add custom trigger..."
                style={styles.tagInput}
                editable={!disabled}
                testID="trigger-input"
              />
              <Pressable
                onPress={() => triggerInput.trim() && handleAddTrigger(triggerInput)}
                disabled={disabled || !triggerInput.trim()}
                style={[
                  styles.tagAddButton,
                  (!triggerInput.trim() || disabled) && styles.tagAddButtonDisabled,
                ]}
                testID="trigger-add"
              >
                <Text style={styles.tagAddButtonText}>+</Text>
              </Pressable>
            </View>

            {/* Display custom triggers */}
            {breakHabitState?.triggers && breakHabitState.triggers.length > 0 && (
              <View style={styles.tagChips}>
                {breakHabitState.triggers
                  .filter((t) => !commonTriggers.includes(t))
                  .map((trigger) => (
                    <View key={trigger} style={styles.tagChip}>
                      <Text style={styles.tagChipText}>{trigger}</Text>
                      <Pressable
                        onPress={() => handleRemoveTrigger(trigger)}
                        disabled={disabled}
                        testID={`trigger-remove-${trigger.toLowerCase().replace(/\s+/g, '_')}`}
                      >
                        <Text style={styles.tagChipRemove}>✕</Text>
                      </Pressable>
                    </View>
                  ))}
              </View>
            )}
          </View>

          {/* Replacement Routine */}
          <View style={styles.section}>
            <Text style={styles.label}>Replacement Routine</Text>
            <Text style={styles.detailSubtext}>What will you do instead?</Text>

            {/* Pick existing Start habit */}
            <Pressable
              onPress={() => {
                // TODO: Open habit picker modal
                // For MVP, just placeholder
              }}
              disabled={disabled}
              style={styles.placeholderButton}
              testID="replacement-pick"
            >
              <Text style={styles.placeholderButtonText}>
                {breakHabitState?.replacementHabitName || '+ Pick a Start Habit'}
              </Text>
            </Pressable>

            {/* Or free text */}
            <Text style={[styles.detailSubtext, { marginTop: 12 }]}>Or describe it:</Text>
            <TextInput
              value={breakHabitState?.replacementFreeText || ''}
              onChangeText={(text) => updateBreakHabit({ replacementFreeText: text })}
              placeholder="e.g., Take a walk, drink water..."
              style={styles.tagInput}
              editable={!disabled}
              testID="replacement-freetext"
            />
          </View>
        </View>
      )}

      {/* Frequency section - show new builder for Start Habit, old chips for Break Habit */}
      <View style={styles.section}>
        <Text style={styles.label}>Frequency</Text>
        {useNewFrequencyBuilder ? (
          <HabitFrequency
            value={frequencyValue!}
            onChange={onFrequencyValueChange!}
            disabled={disabled}
          />
        ) : (
          <View style={styles.chipRow}>
            {FREQUENCY_OPTIONS.map((freq) => (
              <Chip
                key={freq}
                label={freq.charAt(0).toUpperCase() + freq.slice(1)}
                selected={frequency === freq}
                onPress={() => onFrequencyChange(freq)}
                testID={`frequency-chip-${freq}`}
                disabled={disabled}
                style={styles.chip}
              />
            ))}
          </View>
        )}
      </View>

      {/* Reminders section - available for both Start & Break habits */}
      {onRemindersChange && (
        <View style={styles.section}>
          <RemindersList reminders={reminders} onChange={onRemindersChange} disabled={disabled} />
        </View>
      )}

      {/* Add details collapsible section */}
      {onDetailsChange && (
        <View style={styles.detailsContainer}>
          <Pressable
            onPress={() => setDetailsExpanded(!detailsExpanded)}
            disabled={disabled}
            testID="add-details-toggle"
            style={styles.detailsToggle}
          >
            <Text style={styles.detailsToggleText}>Add details {detailsExpanded ? '▴' : '▾'}</Text>
          </Pressable>

          {detailsExpanded && (
            <View style={styles.detailsSections}>
              {/* Buddy */}
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Buddy (optional)</Text>
                <Pressable
                  onPress={() => {}}
                  disabled={disabled}
                  testID="buddy-open"
                  style={styles.placeholderButton}
                >
                  <Text style={styles.placeholderButtonText}>+ Add Buddy</Text>
                </Pressable>
                {details.buddyEmail && (
                  <Text style={styles.detailValue}>Buddy: {details.buddyEmail}</Text>
                )}
              </View>

              {/* Space Selector */}
              {onSpaceIdChange && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Lives in [Space]</Text>
                  <Pressable
                    onPress={() => {}}
                    disabled={disabled}
                    testID="space-selector"
                    style={styles.spaceSelector}
                  >
                    <Text style={styles.spaceSelectorText}>
                      {spaceId ? `Space: ${spaceId}` : 'Select Space'}
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* Additional Info / Notes */}
              <View style={styles.detailSection}>
                <Textarea
                  label="Additional Info"
                  value={details.notes || ''}
                  onChangeText={(text) => updateDetails({ notes: text })}
                  placeholder="Add notes, tips, or motivation..."
                  testID="habit-notes"
                  disabled={disabled}
                  numberOfLines={4}
                />
              </View>

              {/* Tags */}
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Categories (Tags)</Text>
                <View style={styles.tagInputRow}>
                  <TextInput
                    value={tagInput}
                    onChangeText={setTagInput}
                    placeholder="Add tag..."
                    testID="tag-input"
                    editable={!disabled}
                    style={styles.tagInput}
                    onSubmitEditing={() => handleAddTag(tagInput)}
                  />
                  <Pressable
                    onPress={() => handleAddTag(tagInput)}
                    disabled={disabled || !tagInput.trim()}
                    testID="tag-add"
                    style={[
                      styles.tagAddButton,
                      (!tagInput.trim() || disabled) && styles.tagAddButtonDisabled,
                    ]}
                  >
                    <Text style={styles.tagAddButtonText}>+</Text>
                  </Pressable>
                </View>
                {details.tags && details.tags.length > 0 && (
                  <View style={styles.tagChips}>
                    {details.tags.map((tag) => (
                      <Pressable
                        key={tag}
                        onPress={() => handleRemoveTag(tag)}
                        disabled={disabled}
                        testID={`tag-chip-${tag}`}
                        style={styles.tagChip}
                      >
                        <Text style={styles.tagChipText}>{tag}</Text>
                        <Text style={styles.tagChipRemove}>✕</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                {availableTags.length > 0 && (
                  <View style={styles.tagSuggestions}>
                    {availableTags
                      .filter((tag) => !details.tags?.includes(tag))
                      .slice(0, 5)
                      .map((tag) => (
                        <Pressable
                          key={tag}
                          onPress={() => handleAddTag(tag)}
                          disabled={disabled}
                          style={styles.tagSuggestion}
                        >
                          <Text style={styles.tagSuggestionText}>{tag}</Text>
                        </Pressable>
                      ))}
                  </View>
                )}
              </View>

              {/* Habit Stack */}
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Habit Stack</Text>
                <Text style={styles.detailSubtext}>Stack with</Text>
                <View style={styles.stackRow}>
                  <TextInput
                    value={details.stackHabitName || ''}
                    onChangeText={(text) => updateDetails({ stackHabitName: text })}
                    placeholder="Habit name..."
                    testID="stack-select"
                    editable={!disabled}
                    style={styles.stackInput}
                  />
                </View>
                {details.stackHabitName && (
                  <>
                    <View style={styles.stackPositionRow}>
                      <Pressable
                        onPress={() => updateDetails({ stackPosition: 'before' })}
                        disabled={disabled}
                        testID="stack-pos-before"
                        style={[
                          styles.stackPosButton,
                          details.stackPosition === 'before' && styles.stackPosButtonActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.stackPosText,
                            details.stackPosition === 'before' && styles.stackPosTextActive,
                          ]}
                        >
                          Before
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => updateDetails({ stackPosition: 'after' })}
                        disabled={disabled}
                        testID="stack-pos-after"
                        style={[
                          styles.stackPosButton,
                          details.stackPosition === 'after' && styles.stackPosButtonActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.stackPosText,
                            details.stackPosition === 'after' && styles.stackPosTextActive,
                          ]}
                        >
                          After
                        </Text>
                      </Pressable>
                    </View>
                    <View style={styles.stackOffsetRow}>
                      <Text style={styles.stackOffsetLabel}>Offset (minutes)</Text>
                      <View style={styles.stepper}>
                        <Pressable
                          onPress={() =>
                            updateDetails({
                              stackOffsetMinutes: Math.max(
                                0,
                                (details.stackOffsetMinutes || 0) - 5,
                              ),
                            })
                          }
                          disabled={disabled}
                          testID="stack-offset-minus"
                          style={styles.stepperButton}
                        >
                          <Text style={styles.stepperButtonText}>−</Text>
                        </Pressable>
                        <Text style={styles.stepperValue} testID="stack-offset">
                          {details.stackOffsetMinutes || 0}
                        </Text>
                        <Pressable
                          onPress={() =>
                            updateDetails({
                              stackOffsetMinutes: (details.stackOffsetMinutes || 0) + 5,
                            })
                          }
                          disabled={disabled}
                          testID="stack-offset-plus"
                          style={styles.stepperButton}
                        >
                          <Text style={styles.stepperButtonText}>+</Text>
                        </Pressable>
                      </View>
                    </View>
                  </>
                )}
              </View>

              {/* Dates */}
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Schedule</Text>
                <View style={styles.dateRow}>
                  <View style={styles.dateField}>
                    <Text style={styles.dateLabel}>Start Date</Text>
                    <TextInput
                      value={details.startDate || getTodayDate()}
                      onChangeText={(text) => updateDetails({ startDate: text })}
                      placeholder="YYYY-MM-DD"
                      testID="habit-start-date"
                      editable={!disabled}
                      style={styles.dateInput}
                    />
                  </View>
                  <View style={styles.dateField}>
                    <Text style={styles.dateLabel}>End Date (optional)</Text>
                    <TextInput
                      value={details.endDate || ''}
                      onChangeText={(text) => updateDetails({ endDate: text || null })}
                      placeholder="YYYY-MM-DD"
                      testID="habit-end-date"
                      editable={!disabled}
                      style={styles.dateInput}
                    />
                  </View>
                </View>
              </View>

              {/* Schedule Preview */}
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Schedule Preview</Text>
                <View style={styles.schedulePreview} testID="schedule-preview">
                  <View style={styles.weekPreview}>
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                      <View key={i} style={styles.dayPreview}>
                        <Text style={styles.dayPreviewLabel}>{day}</Text>
                        <View
                          style={[
                            styles.dayPreviewDot,
                            i > 0 && i < 6 && styles.dayPreviewDotActive,
                          ]}
                        />
                      </View>
                    ))}
                  </View>
                  <Pressable
                    onPress={() => {}}
                    disabled={disabled}
                    testID="ask-gremly-plan"
                    style={styles.gremlyButton}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Icon name="Sparkles" size="xs" color="#4B5563" />
                      <Text style={styles.gremlyButtonText}>Ask Gremly to plan</Text>
                    </View>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 20,
  },
  section: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minWidth: 80,
  },
  // Toggle styles for Start/Break habit selection
  toggleContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleButtonLeft: {
    marginRight: 4,
  },
  toggleButtonRight: {
    marginLeft: 4,
  },
  toggleButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
  },
  toggleTextActive: {
    color: '#000000',
    fontWeight: '600',
  },
  // Details section styles
  detailsContainer: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 16,
  },
  detailsToggle: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
    alignItems: 'center',
  },
  detailsToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
  },
  detailsSections: {
    marginTop: 16,
    gap: 20,
  },
  detailSection: {
    gap: 8,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 4,
  },
  detailSubtext: {
    fontSize: 13,
    color: '#666666',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 13,
    color: '#666666',
    marginTop: 4,
  },
  placeholderButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
  },
  placeholderButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
  },
  spaceSelector: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  spaceSelectorText: {
    fontSize: 14,
    color: '#333333',
  },
  tagInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tagInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    backgroundColor: '#FFFFFF',
  },
  tagAddButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#4CAF93',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagAddButtonDisabled: {
    backgroundColor: '#CCCCCC',
    opacity: 0.5,
  },
  tagAddButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  tagChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#E8F5F3',
    borderWidth: 1,
    borderColor: '#4CAF93',
  },
  tagChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#2E7D6A',
  },
  tagChipRemove: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2E7D6A',
  },
  tagSuggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  tagSuggestion: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  tagSuggestionText: {
    fontSize: 12,
    color: '#666666',
  },
  stackRow: {
    gap: 8,
  },
  stackInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    backgroundColor: '#FFFFFF',
  },
  stackPositionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  stackPosButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
  },
  stackPosButtonActive: {
    backgroundColor: '#E8F5F3',
    borderColor: '#4CAF93',
  },
  stackPosText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
  },
  stackPosTextActive: {
    color: '#2E7D6A',
    fontWeight: '600',
  },
  stackOffsetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  stackOffsetLabel: {
    fontSize: 13,
    color: '#666666',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  stepperButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#F5F5F5',
  },
  stepperButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333333',
  },
  stepperValue: {
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#333333',
    minWidth: 40,
    textAlign: 'center',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateField: {
    flex: 1,
    gap: 4,
  },
  dateLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666666',
  },
  dateInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    backgroundColor: '#FFFFFF',
  },
  schedulePreview: {
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    padding: 16,
    gap: 16,
  },
  weekPreview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayPreview: {
    alignItems: 'center',
    gap: 6,
  },
  dayPreviewLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666666',
  },
  dayPreviewDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E0E0E0',
  },
  dayPreviewDotActive: {
    backgroundColor: '#4CAF93',
  },
  gremlyButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#E8F5F3',
    borderWidth: 1,
    borderColor: '#4CAF93',
    alignItems: 'center',
  },
  gremlyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2E7D6A',
  },
  // Break Habit specific styles
  breakHabitSection: {
    gap: 16,
  },
  taperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 8,
  },
  taperLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333333',
    minWidth: 70,
  },
  taperInputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  taperText: {
    fontSize: 14,
    color: '#666666',
  },
  periodButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    minWidth: 70,
    alignItems: 'center',
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333333',
  },
  targetChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  targetChipActive: {
    backgroundColor: '#E8F5F3',
    borderColor: '#4CAF93',
  },
  targetChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
  },
  targetChipTextActive: {
    color: '#2E7D6A',
    fontWeight: '600',
  },
  strategySection: {
    marginTop: 16,
    gap: 8,
  },
  strategyParams: {
    marginTop: 12,
    paddingLeft: 16,
    gap: 8,
  },
});
