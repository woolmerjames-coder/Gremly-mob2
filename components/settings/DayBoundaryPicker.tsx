/**
 * DayBoundaryPicker Component
 *
 * Allows users to select when their "day" starts for ritual tracking.
 * Useful for night owls who stay up past midnight.
 *
 * Example: If set to 4am, activity at 2am on Jan 10th
 * counts toward Jan 9th's ritual progress.
 */

import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from '../../ui';
import { BRAND } from '../../design/brand';
import { DAY_BOUNDARY_OPTIONS } from '../../lib/date/ritualDay';

interface DayBoundaryPickerProps {
  /** Currently selected hour (0-5) */
  value: number;
  /** Callback when user selects a different hour */
  onChange: (hour: number) => void;
  /** Whether the picker is disabled */
  disabled?: boolean;
}

export default function DayBoundaryPicker({
  value,
  onChange,
  disabled = false,
}: DayBoundaryPickerProps) {
  return (
    <View style={styles.container}>
      {/* Options row */}
      <View style={styles.optionsRow}>
        {DAY_BOUNDARY_OPTIONS.map((option) => {
          const isSelected = option.value === value;

          return (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.chip,
                isSelected ? styles.chipSelected : styles.chipUnselected,
                disabled && styles.chipDisabled,
              ]}
              onPress={() => !disabled && onChange(option.value)}
              activeOpacity={disabled ? 1 : 0.7}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected, disabled }}
              accessibilityLabel={`Day starts at ${option.label}`}
            >
              <Text
                style={[
                  styles.chipText,
                  isSelected ? styles.chipTextSelected : styles.chipTextUnselected,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BRAND.radius.pill,
    borderWidth: 1,
  },
  chipSelected: {
    backgroundColor: BRAND.colors.mossGreen,
    borderColor: BRAND.colors.mossGreen,
  },
  chipUnselected: {
    backgroundColor: BRAND.colors.surface,
    borderColor: BRAND.colors.borderSubtle,
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  chipTextUnselected: {
    color: BRAND.colors.charcoalInk,
  },
});
