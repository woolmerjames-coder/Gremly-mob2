/**
 * BreakHabitCard — Compact awareness reminder for break habits.
 *
 * Displays a single muted card per time block that lists the break-habit
 * names the user wants to stay mindful of. No checkbox — completion
 * happens in Evening Sweep.
 */

import React, { useState, useCallback } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, Text, UIManager, Platform } from 'react-native';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const MAX_VISIBLE = 3;

interface BreakHabitCardProps {
  /** Break-habit names to display in the card */
  names: string[];
}

export function BreakHabitCard({ names }: BreakHabitCardProps) {
  const canExpand = names.length > MAX_VISIBLE;
  const [expanded, setExpanded] = useState(false);

  const toggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  }, []);

  if (names.length === 0) return null;

  const overflow = names.length - MAX_VISIBLE;
  const visible = expanded ? names : names.slice(0, MAX_VISIBLE);
  const nameText = visible.join(', ');

  return (
    <Pressable style={styles.card} onPress={canExpand ? toggle : undefined}>
      <Text style={styles.text}>
        <Text style={styles.prefix}>Stay mindful: </Text>
        <Text style={styles.names}>{nameText}</Text>
        {!expanded && overflow > 0 && <Text style={styles.moreLabel}> + {overflow} more</Text>}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0EDE8',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 8,
    marginBottom: 12,
    marginHorizontal: 16,
  },
  text: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  prefix: {
    fontWeight: '600',
    color: '#6A6F76',
  },
  names: {
    fontWeight: '400',
    color: '#8B7E74',
  },
  moreLabel: {
    fontWeight: '500',
    color: '#6A6F76',
    textDecorationLine: 'underline' as const,
  },
});
