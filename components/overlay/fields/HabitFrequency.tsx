import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';

// ============================================================================
// Types
// ============================================================================

export type FrequencyValue =
  | { kind: 'daily' }
  | { kind: 'weekly' }
  | { kind: 'monthly' }
  | {
      kind: 'custom_days';
      days: number[];
      time?: string;
      window?: { start: string; end: string };
    }
  | {
      kind: 'n_per_period';
      n: number;
      period: 'week' | 'month';
      time?: string;
      window?: { start: string; end: string };
      constraint?: 'spread_out' | 'any';
    };

type CustomTabMode = 'specific_days' | 'n_per_period';

interface HabitFrequencyProps {
  value: FrequencyValue;
  onChange: (value: FrequencyValue) => void;
  disabled?: boolean;
}

// ============================================================================
// Helper Components
// ============================================================================

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
  disabled?: boolean;
  style?: any;
}

function Chip({ label, selected, onPress, testID, disabled = false, style }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={[styles.chip, selected && styles.chipSelected, disabled && styles.chipDisabled, style]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

interface TimePickerRowProps {
  time?: string;
  onChange: (time?: string) => void;
  disabled?: boolean;
}

function TimePickerRow({ time, onChange, disabled = false }: TimePickerRowProps) {
  const [enabled, setEnabled] = useState(!!time);

  const handleToggle = () => {
    if (!enabled) {
      setEnabled(true);
      onChange('09:00'); // Default time
    } else {
      setEnabled(false);
      onChange(undefined);
    }
  };

  return (
    <View style={styles.timeRow}>
      <Pressable
        onPress={handleToggle}
        disabled={disabled}
        testID="time-picker-toggle"
        style={styles.timeToggle}
      >
        <View style={[styles.checkbox, enabled && styles.checkboxChecked]}>
          {enabled && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.timeLabel}>Set specific time</Text>
      </Pressable>
      {enabled && (
        <TextInput
          value={time || '09:00'}
          onChangeText={onChange}
          placeholder="HH:MM"
          testID="time-input"
          editable={!disabled}
          style={styles.timeInput}
        />
      )}
    </View>
  );
}

interface TimeWindowRowProps {
  window?: { start: string; end: string };
  onChange: (window?: { start: string; end: string }) => void;
  disabled?: boolean;
}

function TimeWindowRow({ window, onChange, disabled = false }: TimeWindowRowProps) {
  const [enabled, setEnabled] = useState(!!window);

  const handleToggle = () => {
    if (!enabled) {
      setEnabled(true);
      onChange({ start: '09:00', end: '17:00' }); // Default window
    } else {
      setEnabled(false);
      onChange(undefined);
    }
  };

  return (
    <View style={styles.timeRow}>
      <Pressable
        onPress={handleToggle}
        disabled={disabled}
        testID="time-window-toggle"
        style={styles.timeToggle}
      >
        <View style={[styles.checkbox, enabled && styles.checkboxChecked]}>
          {enabled && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.timeLabel}>Set time window</Text>
      </Pressable>
      {enabled && (
        <View style={styles.windowInputs}>
          <TextInput
            value={window?.start || '09:00'}
            onChangeText={(start) => onChange({ start, end: window?.end || '17:00' })}
            placeholder="Start"
            testID="window-start-input"
            editable={!disabled}
            style={styles.timeInput}
          />
          <Text style={styles.windowSeparator}>to</Text>
          <TextInput
            value={window?.end || '17:00'}
            onChangeText={(end) => onChange({ start: window?.start || '09:00', end })}
            placeholder="End"
            testID="window-end-input"
            editable={!disabled}
            style={styles.timeInput}
          />
        </View>
      )}
    </View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function HabitFrequency({ value, onChange, disabled = false }: HabitFrequencyProps) {
  const [customTabMode, setCustomTabMode] = useState<CustomTabMode>('specific_days');

  // Sync custom tab mode with value kind - update initial state instead of effect
  React.useEffect(() => {
    if (value.kind === 'n_per_period' && customTabMode !== 'n_per_period') {
      setCustomTabMode('n_per_period');
    } else if (value.kind === 'custom_days' && customTabMode !== 'specific_days') {
      setCustomTabMode('specific_days');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.kind]);

  // Determine which preset is selected
  const presetKind =
    value.kind === 'daily' || value.kind === 'weekly' || value.kind === 'monthly'
      ? value.kind
      : 'custom';

  const isCustom = presetKind === 'custom';

  // Handlers for presets
  const handlePresetSelect = (kind: 'daily' | 'weekly' | 'monthly') => {
    onChange({ kind });
  };

  const handleCustomSelect = () => {
    // Initialize with specific_days by default
    onChange({
      kind: 'custom_days',
      days: [],
    });
    setCustomTabMode('specific_days');
  };

  // Custom Days handlers
  const handleDayToggle = (day: number) => {
    if (value.kind !== 'custom_days') return;

    const days = value.days.includes(day)
      ? value.days.filter((d) => d !== day)
      : [...value.days, day].sort((a, b) => a - b);

    onChange({
      ...value,
      days,
    });
  };

  const handleCustomDaysTimeChange = (time?: string) => {
    if (value.kind !== 'custom_days') return;
    const newValue = { ...value, time };
    if (!time) delete newValue.time;
    if (!time) delete newValue.window; // Clear window if time is set
    onChange(newValue);
  };

  const handleCustomDaysWindowChange = (window?: { start: string; end: string }) => {
    if (value.kind !== 'custom_days') return;
    const newValue = { ...value, window };
    if (!window) delete newValue.window;
    if (!window) delete newValue.time; // Clear time if window is set
    onChange(newValue);
  };

  // N per period handlers
  const handleNChange = (n: number) => {
    if (value.kind !== 'n_per_period') return;
    onChange({
      ...value,
      n: Math.max(1, n),
    });
  };

  const handlePeriodChange = (period: 'week' | 'month') => {
    if (value.kind !== 'n_per_period') return;
    onChange({
      ...value,
      period,
    });
  };

  const handleConstraintChange = (constraint?: 'spread_out' | 'any') => {
    if (value.kind !== 'n_per_period') return;
    const newValue = { ...value };
    if (constraint) {
      newValue.constraint = constraint;
    } else {
      delete newValue.constraint;
    }
    onChange(newValue);
  };

  const handleNPerPeriodTimeChange = (time?: string) => {
    if (value.kind !== 'n_per_period') return;
    const newValue = { ...value, time };
    if (!time) delete newValue.time;
    if (!time) delete newValue.window; // Clear window if time is set
    onChange(newValue);
  };

  const handleNPerPeriodWindowChange = (window?: { start: string; end: string }) => {
    if (value.kind !== 'n_per_period') return;
    const newValue = { ...value, window };
    if (!window) delete newValue.window;
    if (!window) delete newValue.time; // Clear time if window is set
    onChange(newValue);
  };

  // Switch between custom tabs
  const handleCustomTabChange = (mode: CustomTabMode) => {
    setCustomTabMode(mode);
    if (mode === 'specific_days') {
      onChange({
        kind: 'custom_days',
        days: [],
      });
    } else {
      onChange({
        kind: 'n_per_period',
        n: 3,
        period: 'week',
      });
    }
  };

  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <View style={styles.container}>
      {/* Preset chips */}
      <View style={styles.presetRow}>
        <Chip
          label="Daily"
          selected={presetKind === 'daily'}
          onPress={() => handlePresetSelect('daily')}
          testID="freq-chip-daily"
          disabled={disabled}
          style={styles.presetChip}
        />
        <Chip
          label="Weekly"
          selected={presetKind === 'weekly'}
          onPress={() => handlePresetSelect('weekly')}
          testID="freq-chip-weekly"
          disabled={disabled}
          style={styles.presetChip}
        />
        <Chip
          label="Monthly"
          selected={presetKind === 'monthly'}
          onPress={() => handlePresetSelect('monthly')}
          testID="freq-chip-monthly"
          disabled={disabled}
          style={styles.presetChip}
        />
        <Chip
          label="Custom"
          selected={isCustom}
          onPress={handleCustomSelect}
          testID="freq-chip-custom"
          disabled={disabled}
          style={styles.presetChip}
        />
      </View>

      {/* Custom builder */}
      {isCustom && (
        <View style={styles.customBuilder}>
          {/* Custom tabs */}
          <View style={styles.customTabs}>
            <Pressable
              onPress={() => handleCustomTabChange('specific_days')}
              disabled={disabled}
              testID="freq-custom-days"
              style={[
                styles.customTab,
                customTabMode === 'specific_days' && styles.customTabActive,
              ]}
            >
              <Text
                style={[
                  styles.customTabText,
                  customTabMode === 'specific_days' && styles.customTabTextActive,
                ]}
              >
                Specific Days
              </Text>
            </Pressable>
            <Pressable
              onPress={() => handleCustomTabChange('n_per_period')}
              disabled={disabled}
              testID="freq-custom-nper"
              style={[styles.customTab, customTabMode === 'n_per_period' && styles.customTabActive]}
            >
              <Text
                style={[
                  styles.customTabText,
                  customTabMode === 'n_per_period' && styles.customTabTextActive,
                ]}
              >
                N per period
              </Text>
            </Pressable>
          </View>

          {/* Specific Days Content */}
          {customTabMode === 'specific_days' && (
            <View style={styles.customContent}>
              {/* Week day chips */}
              <View style={styles.dayChips}>
                {dayLabels.map((label, index) => (
                  <Chip
                    key={index}
                    label={label}
                    selected={value.kind === 'custom_days' && value.days.includes(index)}
                    onPress={() => handleDayToggle(index)}
                    testID={`day-chip-${index}`}
                    disabled={disabled}
                    style={styles.dayChip}
                  />
                ))}
              </View>

              {/* Time picker or window */}
              <View style={styles.timeSection}>
                <TimePickerRow
                  time={value.kind === 'custom_days' ? value.time : undefined}
                  onChange={handleCustomDaysTimeChange}
                  disabled={disabled || value.kind !== 'custom_days' || !!value.window}
                />
                <TimeWindowRow
                  window={value.kind === 'custom_days' ? value.window : undefined}
                  onChange={handleCustomDaysWindowChange}
                  disabled={disabled || value.kind !== 'custom_days' || !!value.time}
                />
              </View>
            </View>
          )}

          {/* N per period Content */}
          {customTabMode === 'n_per_period' && (
            <View style={styles.customContent}>
              {/* N stepper */}
              <View style={styles.nStepperRow}>
                <Text style={styles.nLabel}>Complete</Text>
                <View style={styles.stepper}>
                  <Pressable
                    onPress={() => value.kind === 'n_per_period' && handleNChange(value.n - 1)}
                    disabled={disabled || value.kind !== 'n_per_period' || value.n <= 1}
                    testID="n-stepper-minus"
                    style={styles.stepperButton}
                  >
                    <Text style={styles.stepperButtonText}>−</Text>
                  </Pressable>
                  <Text style={styles.stepperValue} testID="n-stepper-value">
                    {value.kind === 'n_per_period' ? value.n : 3}
                  </Text>
                  <Pressable
                    onPress={() => value.kind === 'n_per_period' && handleNChange(value.n + 1)}
                    disabled={disabled || value.kind !== 'n_per_period'}
                    testID="n-stepper-plus"
                    style={styles.stepperButton}
                  >
                    <Text style={styles.stepperButtonText}>+</Text>
                  </Pressable>
                </View>
                <Text style={styles.nLabel}>times</Text>
              </View>

              {/* Period dropdown */}
              <View style={styles.periodRow}>
                <Text style={styles.periodLabel}>Per</Text>
                <View style={styles.periodChips}>
                  <Chip
                    label="Week"
                    selected={value.kind === 'n_per_period' && value.period === 'week'}
                    onPress={() => handlePeriodChange('week')}
                    testID="period-chip-week"
                    disabled={disabled || value.kind !== 'n_per_period'}
                    style={styles.periodChip}
                  />
                  <Chip
                    label="Month"
                    selected={value.kind === 'n_per_period' && value.period === 'month'}
                    onPress={() => handlePeriodChange('month')}
                    testID="period-chip-month"
                    disabled={disabled || value.kind !== 'n_per_period'}
                    style={styles.periodChip}
                  />
                </View>
              </View>

              {/* Constraint chips */}
              <View style={styles.constraintRow}>
                <Chip
                  label="Spread out"
                  selected={value.kind === 'n_per_period' && value.constraint === 'spread_out'}
                  onPress={() =>
                    handleConstraintChange(
                      value.kind === 'n_per_period' && value.constraint === 'spread_out'
                        ? undefined
                        : 'spread_out',
                    )
                  }
                  testID="constraint-chip-spread"
                  disabled={disabled || value.kind !== 'n_per_period'}
                  style={styles.constraintChip}
                />
                <Chip
                  label="Any day"
                  selected={value.kind === 'n_per_period' && value.constraint === 'any'}
                  onPress={() =>
                    handleConstraintChange(
                      value.kind === 'n_per_period' && value.constraint === 'any'
                        ? undefined
                        : 'any',
                    )
                  }
                  testID="constraint-chip-any"
                  disabled={disabled || value.kind !== 'n_per_period'}
                  style={styles.constraintChip}
                />
              </View>

              {/* Time picker or window */}
              <View style={styles.timeSection}>
                <TimePickerRow
                  time={value.kind === 'n_per_period' ? value.time : undefined}
                  onChange={handleNPerPeriodTimeChange}
                  disabled={disabled || value.kind !== 'n_per_period' || !!value.window}
                />
                <TimeWindowRow
                  window={value.kind === 'n_per_period' ? value.window : undefined}
                  onChange={handleNPerPeriodWindowChange}
                  disabled={disabled || value.kind !== 'n_per_period' || !!value.time}
                />
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    minWidth: 80,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  chipSelected: {
    backgroundColor: '#E8F5F3',
    borderColor: '#4CAF93',
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
    textAlign: 'center',
  },
  chipTextSelected: {
    color: '#2E7D6A',
    fontWeight: '600',
  },
  customBuilder: {
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 16,
    gap: 16,
  },
  customTabs: {
    flexDirection: 'row',
    gap: 8,
  },
  customTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
  },
  customTabActive: {
    backgroundColor: '#E8F5F3',
    borderWidth: 1,
    borderColor: '#4CAF93',
  },
  customTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
  },
  customTabTextActive: {
    color: '#2E7D6A',
    fontWeight: '600',
  },
  customContent: {
    gap: 16,
  },
  dayChips: {
    flexDirection: 'row',
    gap: 8,
  },
  dayChip: {
    flex: 1,
    minWidth: 40,
  },
  timeSection: {
    gap: 12,
  },
  timeRow: {
    gap: 12,
  },
  timeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#CCCCCC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#4CAF93',
    borderColor: '#4CAF93',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  timeLabel: {
    fontSize: 14,
    color: '#333333',
  },
  timeInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    backgroundColor: '#FFFFFF',
    minWidth: 80,
  },
  windowInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  windowSeparator: {
    fontSize: 14,
    color: '#666666',
  },
  nStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  nLabel: {
    fontSize: 14,
    color: '#333333',
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
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  periodLabel: {
    fontSize: 14,
    color: '#333333',
  },
  periodChips: {
    flexDirection: 'row',
    gap: 8,
  },
  periodChip: {
    minWidth: 70,
  },
  constraintRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  constraintChip: {
    minWidth: 100,
  },
});
