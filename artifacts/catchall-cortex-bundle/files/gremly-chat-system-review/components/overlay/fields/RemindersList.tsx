/**
 * RemindersList - Reusable reminders component for Habits (Start & Break)
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';

// ============================================================================
// Types
// ============================================================================

export type ReminderRow = {
  id: string;
  time: string; // HH:MM format
  days: number[] | 'every' | 'per_occurrence';
};

interface RemindersListProps {
  reminders: ReminderRow[];
  onChange: (reminders: ReminderRow[]) => void;
  disabled?: boolean;
}

// ============================================================================
// Helper Components
// ============================================================================

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
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

interface ReminderRowComponentProps {
  reminder: ReminderRow;
  onChange: (reminder: ReminderRow) => void;
  onDelete: () => void;
  disabled?: boolean;
}

function ReminderRowComponent({
  reminder,
  onChange,
  onDelete,
  disabled = false,
}: ReminderRowComponentProps) {
  const handleTimeChange = (text: string) => {
    // Basic validation for HH:MM format
    if (text.length <= 5) {
      onChange({ ...reminder, time: text });
    }
  };

  const handleDaysChange = (days: number[] | 'every' | 'per_occurrence') => {
    onChange({ ...reminder, days });
  };

  const handleDayToggle = (day: number) => {
    if (typeof reminder.days === 'string') {
      // If currently 'every' or 'per_occurrence', switch to specific days
      onChange({ ...reminder, days: [day] });
    } else {
      // Toggle the day - reminder.days is number[] here
      const currentDays = reminder.days as number[];
      const days = currentDays.includes(day)
        ? currentDays.filter((d) => d !== day)
        : [...currentDays, day].sort((a, b) => a - b);
      onChange({ ...reminder, days });
    }
  };

  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <View style={styles.reminderRow} testID={`reminder-row-${reminder.id}`}>
      {/* Time Input */}
      <View style={styles.timeSection}>
        <Text style={styles.label}>Time</Text>
        <TextInput
          value={reminder.time}
          onChangeText={handleTimeChange}
          placeholder="HH:MM"
          testID={`reminder-time-${reminder.id}`}
          editable={!disabled}
          style={styles.timeInput}
          maxLength={5}
        />
      </View>

      {/* Days Rule */}
      <View style={styles.daysSection} testID={`reminder-days-${reminder.id}`}>
        <Text style={styles.label}>Days</Text>

        {/* Preset options */}
        <View style={styles.daysPresets}>
          <Chip
            label="Every day"
            selected={reminder.days === 'every'}
            onPress={() => handleDaysChange('every')}
            testID={`reminder-days-every-${reminder.id}`}
            disabled={disabled}
            style={styles.presetChip}
          />
          <Chip
            label="Per occurrence"
            selected={reminder.days === 'per_occurrence'}
            onPress={() => handleDaysChange('per_occurrence')}
            testID={`reminder-days-per-occurrence-${reminder.id}`}
            disabled={disabled}
            style={styles.presetChip}
          />
          <Chip
            label="Specific days"
            selected={Array.isArray(reminder.days)}
            onPress={() => handleDaysChange([])}
            testID={`reminder-days-specific-${reminder.id}`}
            disabled={disabled}
            style={styles.presetChip}
          />
        </View>

        {/* Day chips - only show if specific days selected */}
        {Array.isArray(reminder.days) && (
          <View style={styles.dayChips}>
            {dayLabels.map((label, index) => {
              const daysArray = reminder.days as number[];
              return (
                <Chip
                  key={index}
                  label={label}
                  selected={daysArray.includes(index)}
                  onPress={() => handleDayToggle(index)}
                  testID={`reminder-day-chip-${reminder.id}-${index}`}
                  disabled={disabled}
                  style={styles.dayChip}
                />
              );
            })}
          </View>
        )}
      </View>

      {/* Delete button */}
      <Pressable
        onPress={onDelete}
        disabled={disabled}
        testID={`reminder-delete-${reminder.id}`}
        style={styles.deleteButton}
      >
        <Text style={styles.deleteText}>✕</Text>
      </Pressable>
    </View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function RemindersList({ reminders, onChange, disabled = false }: RemindersListProps) {
  const handleAddReminder = () => {
    const newReminder: ReminderRow = {
      id: Date.now().toString(),
      time: '09:00',
      days: 'every',
    };
    onChange([...reminders, newReminder]);
  };

  const handleUpdateReminder = (id: string, updatedReminder: ReminderRow) => {
    onChange(reminders.map((r) => (r.id === id ? updatedReminder : r)));
  };

  const handleDeleteReminder = (id: string) => {
    onChange(reminders.filter((r) => r.id !== id));
  };

  return (
    <View style={styles.container}>
      {/* Section header */}
      <View style={styles.header}>
        <Text style={styles.headerText}>Reminders</Text>
        <Pressable
          onPress={handleAddReminder}
          disabled={disabled}
          testID="reminders-add"
          style={styles.addButton}
        >
          <Text style={styles.addButtonText}>+ Add reminder</Text>
        </Pressable>
      </View>

      {/* Reminder rows */}
      {reminders.length > 0 && (
        <View style={styles.remindersList}>
          {reminders.map((reminder) => (
            <ReminderRowComponent
              key={reminder.id}
              reminder={reminder}
              onChange={(updated) => handleUpdateReminder(reminder.id, updated)}
              onDelete={() => handleDeleteReminder(reminder.id)}
              disabled={disabled}
            />
          ))}
        </View>
      )}

      {/* Empty state */}
      {reminders.length === 0 && (
        <Text style={styles.emptyText}>No reminders set. Tap "Add reminder" to create one.</Text>
      )}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333333',
  },
  addButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#E8F5F3',
    borderWidth: 1,
    borderColor: '#4CAF93',
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2E7D6A',
  },
  remindersList: {
    gap: 16,
  },
  reminderRow: {
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  timeSection: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333333',
  },
  timeButton: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
  },
  timeText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333333',
  },
  timeInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    color: '#333333',
    width: 100,
  },
  daysSection: {
    gap: 8,
  },
  daysPresets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    minWidth: 100,
  },
  dayChips: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  dayChip: {
    flex: 1,
    minWidth: 40,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
  },
  chipSelected: {
    backgroundColor: '#E8F5F3',
    borderColor: '#4CAF93',
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666666',
  },
  chipTextSelected: {
    color: '#2E7D6A',
    fontWeight: '600',
  },
  deleteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFE5E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    fontSize: 16,
    color: '#D32F2F',
    fontWeight: 'bold',
  },
  emptyText: {
    fontSize: 14,
    color: '#999999',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },
});
