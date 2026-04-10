/**
 * HabitModeToggle — Build / Break segmented control
 *
 * Shown only for habits. Swaps the field set:
 * - Build: frequency, time of day, duration, dates
 * - Break: trigger, replacement, tracking
 */

import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { TrendingUp, TrendingDown } from 'lucide-react-native';
import { Text } from '../../ui';
import type { HabitState } from './overlayV2.state';

type HabitMode = 'build' | 'break';

interface HabitModeToggleProps {
  mode: HabitMode;
  onChange: (mode: HabitMode) => void;
  disabled?: boolean;
}

/** Derive mode from subtype */
export function habitSubtypeToMode(subtype?: HabitState['subtype']): HabitMode {
  return subtype === 'break_habit' ? 'break' : 'build';
}

/** Derive subtype from mode */
export function habitModeToSubtype(mode: HabitMode): HabitState['subtype'] {
  return mode === 'break' ? 'break_habit' : 'start_habit';
}

export const HabitModeToggle: React.FC<HabitModeToggleProps> = ({
  mode,
  onChange,
  disabled = false,
}) => {
  const options = [
    { id: 'build' as HabitMode, label: 'Build', icon: TrendingUp },
    { id: 'break' as HabitMode, label: 'Break', icon: TrendingDown },
  ];

  return (
    <View style={styles.container}>
      {options.map((opt) => {
        const active = mode === opt.id;
        const Icon = opt.icon;
        return (
          <Pressable
            key={opt.id}
            onPress={() => !disabled && onChange(opt.id)}
            style={[
              styles.option,
              active && styles.optionActive,
            ]}
          >
            <Icon
              size={14}
              color={active ? '#2E5540' : '#8B8579'}
              strokeWidth={2}
            />
            <Text
              style={[
                styles.optionText,
                active && styles.optionTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#EDEAE3',
    borderRadius: 10,
    padding: 2,
    marginTop: 8,
    marginBottom: 4,
  },
  option: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  optionActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  optionText: {
    fontSize: 13,
    fontWeight: '400',
    color: '#8B8579',
  },
  optionTextActive: {
    fontWeight: '600',
    color: '#2E5540',
  },
});
