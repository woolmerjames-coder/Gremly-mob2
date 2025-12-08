/**
 * SegmentedPills - Unified pill selector component
 *
 * Matches UnifiedOverlayV2 type selector styling exactly.
 * Used in both overlay and Space screens for consistent visuals.
 */

import React from 'react';
import { View, Pressable, Text, StyleSheet, ViewStyle } from 'react-native';

// Brand colors (matching UnifiedOverlayV2)
const SAGE_MIST_TINT = 'rgba(191, 216, 192, 0.18)';
const MOSS_GREEN_TINT = 'rgba(46, 85, 64, 0.08)';
const MOSS_GREEN = '#2E5540';
const MUTED_SAGE = '#8A8F8A';

export interface SegmentedPillOption<T extends string> {
  key: T;
  label: string;
}

export interface SegmentedPillsProps<T extends string> {
  /** Array of options to display */
  options: SegmentedPillOption<T>[];
  /** Currently selected option key */
  selected: T;
  /** Callback when option is selected */
  onSelect: (key: T) => void;
  /** Optional container style override */
  containerStyle?: ViewStyle;
  /** Optional test ID prefix */
  testID?: string;
}

export function SegmentedPills<T extends string>({
  options,
  selected,
  onSelect,
  containerStyle,
  testID = 'segmented-pills',
}: SegmentedPillsProps<T>) {
  return (
    <View style={[styles.container, containerStyle]} testID={testID}>
      {options.map((option) => {
        const isActive = selected === option.key;
        return (
          <Pressable
            key={option.key}
            onPress={() => onSelect(option.key)}
            style={[styles.pill, isActive && styles.pillActive]}
            testID={`${testID}-${option.key}`}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: isActive }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.pillText, isActive && styles.pillTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Matches UnifiedOverlayV2 tabsContainer exactly
  container: {
    flexDirection: 'row',
    borderRadius: 999,
    backgroundColor: SAGE_MIST_TINT,
    padding: 2,
    alignSelf: 'center',
  },
  // Matches UnifiedOverlayV2 tab
  pill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  // Matches UnifiedOverlayV2 tabActive
  pillActive: {
    backgroundColor: MOSS_GREEN_TINT,
  },
  // Matches UnifiedOverlayV2 tabLabel
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: MUTED_SAGE,
  },
  // Matches UnifiedOverlayV2 tabLabelActive
  pillTextActive: {
    fontWeight: '600',
    color: MOSS_GREEN,
  },
});

export default SegmentedPills;
