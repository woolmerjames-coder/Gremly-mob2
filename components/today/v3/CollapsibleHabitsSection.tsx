// components/today/v3/CollapsibleHabitsSection.tsx

import React, { useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, LayoutAnimation } from 'react-native';
import { Box, Text } from '../../../ui';
import { Icon } from '../../../design-system/Icon';
import { BRAND } from '../../../design/brand';
import type { Habit } from '../../../lib/types';

interface AvailableHabit {
  id: string;
  name: string;
  progressLabel: string; // e.g., "2/3 past 7d"
  isAtGoal: boolean;
}

interface Props {
  habits: AvailableHabit[];
  onAddToToday: (habitId: string) => void;
}

export function CollapsibleHabitsSection({ habits, onAddToToday }: Props) {
  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  }, []);

  if (habits.length === 0) return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={toggleExpanded}
        accessibilityRole="button"
        accessibilityLabel={`Habits section, ${expanded ? 'expanded' : 'collapsed'}`}
      >
        <View style={styles.headerLeft}>
          <Icon
            name={expanded ? 'ChevronDown' : 'ChevronRight'}
            size="sm"
            color={BRAND.colors.inkMuted}
          />
          <Text style={styles.headerText}>Habits</Text>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.list}>
          {habits.map((habit, index) => (
            <View
              key={habit.id}
              style={[styles.habitRow, index < habits.length - 1 && styles.habitRowBorder]}
            >
              <View style={styles.accentBar} />
              <View style={styles.habitContent}>
                <Text style={styles.habitName} numberOfLines={1}>
                  {habit.name}
                </Text>
                <Text style={styles.habitProgress}>{habit.progressLabel}</Text>
              </View>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => onAddToToday(habit.id)}
                accessibilityLabel={`Add ${habit.name} to today`}
              >
                <Icon name="Plus" size="sm" color={BRAND.colors.mossGreen} />
                <Text style={styles.addText}>Add</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: BRAND.colors.inkSubtle,
  },
  list: {
    marginTop: 8,
    backgroundColor: 'rgba(236, 241, 237, 0.6)',
    borderRadius: BRAND.radius.md,
    padding: 12,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  habitRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
  },
  accentBar: {
    width: 3,
    height: '100%',
    minHeight: 36,
    backgroundColor: BRAND.colors.mossGreen,
    borderRadius: 2,
    marginRight: 10,
  },
  habitContent: {
    flex: 1,
  },
  habitName: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    color: BRAND.colors.charcoalInk,
  },
  habitProgress: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: BRAND.colors.inkMuted,
    marginTop: 2,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: BRAND.colors.sageMist,
    borderRadius: BRAND.radius.sm,
  },
  addText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: BRAND.colors.mossGreen,
  },
});
