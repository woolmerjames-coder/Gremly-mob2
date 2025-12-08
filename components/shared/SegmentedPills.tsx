/**
 * SegmentedPills - Unified pill selector component
 *
 * Matches UnifiedOverlayV2 type selector styling exactly.
 * Used in both overlay and Space screens for consistent visuals.
 *
 * Variants:
 * - 'primary' (default): Larger, bolder for top-level mode switches (e.g. Actions/Chats)
 * - 'secondary': Smaller, subtler for subcategory filters (e.g. All/Todos/Habits/Logs/Lists)
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

export type SegmentedPillsVariant = 'primary' | 'secondary';

export interface SegmentedPillsProps<T extends string> {
  /** Array of options to display */
  options: SegmentedPillOption<T>[];
  /** Currently selected option key */
  selected: T;
  /** Callback when option is selected */
  onSelect: (key: T) => void;
  /** Visual variant: 'primary' for top-level toggles, 'secondary' for filter rows */
  variant?: SegmentedPillsVariant;
  /** When true, pills expand to fill container width evenly */
  fullWidth?: boolean;
  /** Optional container style override */
  containerStyle?: ViewStyle;
  /** Optional test ID prefix */
  testID?: string;
}

export function SegmentedPills<T extends string>({
  options,
  selected,
  onSelect,
  variant = 'primary',
  fullWidth = false,
  containerStyle,
  testID = 'segmented-pills',
}: SegmentedPillsProps<T>) {
  const isPrimary = variant === 'primary';

  return (
    <View
      style={[
        styles.container,
        isPrimary ? styles.containerPrimary : styles.containerSecondary,
        fullWidth && styles.containerFullWidth,
        containerStyle,
      ]}
      testID={testID}
    >
      {options.map((option) => {
        const isActive = selected === option.key;
        return (
          <Pressable
            key={option.key}
            onPress={() => onSelect(option.key)}
            style={[
              styles.pill,
              isPrimary ? styles.pillPrimary : styles.pillSecondary,
              fullWidth && styles.pillFlex,
              isActive && (isPrimary ? styles.pillActivePrimary : styles.pillActiveSecondary),
            ]}
            testID={`${testID}-${option.key}`}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: isActive }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text
              style={[
                styles.pillText,
                isPrimary ? styles.pillTextPrimary : styles.pillTextSecondary,
                isActive &&
                  (isPrimary ? styles.pillTextActivePrimary : styles.pillTextActiveSecondary),
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Base container
  container: {
    flexDirection: 'row',
    borderRadius: 999,
    backgroundColor: SAGE_MIST_TINT,
    alignSelf: 'center',
  },
  // Full-width mode: stretch to fill parent
  containerFullWidth: {
    alignSelf: 'stretch',
  },
  // Primary variant (top-level mode toggle)
  containerPrimary: {
    padding: 3,
  },
  // Secondary variant (subcategory filter row)
  containerSecondary: {
    padding: 2,
  },

  // Base pill
  pill: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  // Full-width mode: pills expand evenly
  pillFlex: {
    flex: 1,
  },
  // Primary pill (larger)
  pillPrimary: {
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  // Secondary pill (smaller)
  pillSecondary: {
    paddingVertical: 5,
    paddingHorizontal: 12,
  },

  // Primary active state
  pillActivePrimary: {
    backgroundColor: MOSS_GREEN_TINT,
  },
  // Secondary active state
  pillActiveSecondary: {
    backgroundColor: MOSS_GREEN_TINT,
  },

  // Base text
  pillText: {
    color: MUTED_SAGE,
  },
  // Primary text (larger, bolder)
  pillTextPrimary: {
    fontSize: 15,
    fontWeight: '500',
  },
  // Secondary text (smaller, lighter)
  pillTextSecondary: {
    fontSize: 13,
    fontWeight: '400',
  },

  // Primary active text
  pillTextActivePrimary: {
    fontWeight: '700',
    color: MOSS_GREEN,
  },
  // Secondary active text
  pillTextActiveSecondary: {
    fontWeight: '600',
    color: MOSS_GREEN,
  },
});

export default SegmentedPills;
