/**
 * BreakHabitCard — Compact awareness reminder for break habits.
 *
 * Displays a single muted card per time block that lists the break-habit
 * names the user wants to stay mindful of. No checkbox — completion
 * happens in Evening Sweep.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ShieldOff } from 'lucide-react-native';

const MAX_VISIBLE = 3;

interface BreakHabitCardProps {
  /** Break-habit names to display in the card */
  names: string[];
}

export function BreakHabitCard({ names }: BreakHabitCardProps) {
  if (names.length === 0) return null;

  const visible = names.slice(0, MAX_VISIBLE);
  const overflow = names.length - MAX_VISIBLE;

  let nameText = visible.join(', ');
  if (overflow > 0) nameText += ` + ${overflow} more`;

  return (
    <Pressable style={styles.card}>
      <ShieldOff size={16} color="#8B7E74" style={styles.icon} />
      <Text style={styles.text} numberOfLines={2}>
        <Text style={styles.prefix}>Stay mindful: </Text>
        <Text style={styles.names}>{nameText}</Text>
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
    marginHorizontal: 16,
  },
  icon: {
    marginRight: 8,
    marginTop: 2,
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
});
