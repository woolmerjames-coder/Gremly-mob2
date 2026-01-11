/**
 * CompletionBadges Component
 *
 * Horizontal completion badges for sweep summary.
 * Only renders badges that apply, hides entire row if no badges.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../../ui';
import { CheckSquare, Repeat, BookOpen } from 'lucide-react-native';
import { BRAND } from '../../design/brand';

interface CompletionBadgesProps {
  /** Number of lock-in items completed */
  lockInCompleted: number;
  /** Total lock-in items */
  lockInTotal: number;
  /** Number of habits checked */
  habitsChecked: number;
  /** Whether journal was written */
  journalWritten: boolean;
}

export function CompletionBadges({
  lockInCompleted,
  lockInTotal,
  habitsChecked,
  journalWritten,
}: CompletionBadgesProps) {
  const showLockIn = lockInTotal > 0;
  const showHabits = habitsChecked > 0;
  const showJournal = journalWritten;

  if (!showLockIn && !showHabits && !showJournal) {
    return null;
  }

  return (
    <View style={styles.container}>
      {showLockIn && (
        <View style={styles.badge}>
          <CheckSquare size={14} color={BRAND.colors.mossGreen} />
          <Text style={styles.badgeLabel}>Lock-in</Text>
          <Text style={styles.badgeValue}>
            {lockInCompleted}/{lockInTotal}
          </Text>
        </View>
      )}
      {showHabits && (
        <View style={styles.badge}>
          <Repeat size={14} color={BRAND.colors.mossGreen} />
          <Text style={styles.badgeLabel}>Habits</Text>
          <Text style={styles.badgeValue}>{habitsChecked}</Text>
        </View>
      )}
      {showJournal && (
        <View style={styles.badge}>
          <BookOpen size={14} color={BRAND.colors.mossGreen} />
          <Text style={styles.badgeLabel}>Journal</Text>
          <Text style={styles.badgeValue}>✓</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: BRAND.colors.sageMist,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
  },
  badgeValue: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
});
