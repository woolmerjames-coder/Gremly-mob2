/**
 * A habit's week, under Gremly's reply to the morning check in: a dot for
 * each day of the week, as in the approved prototype (Friday's brief). Done
 * is filled, today is amber while the habit is still on for it, a day still
 * planned is a dashed ring, and any other day is plain.
 *
 * Drawn from the store each time, so it follows what they do next. Nothing is
 * drawn until their weekly day has been read: which seven days are their week
 * depends on it.
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useThisWeek } from '../../lib/week/thisWeek';
import { getDateService } from '../../lib/date/DateService';
import { habitWeekDays, type HabitWeekDay } from '../../lib/brief/checkIn';
import { shortDay } from '../../lib/week/review/words';

type Props = {
  habitId: string;
  /** A day of the week to show: the day the check in was answered */
  day: string;
};

const STATE_WORDS: Record<HabitWeekDay['state'], string> = {
  done: 'done',
  today: 'today',
  planned: 'planned',
  none: 'not planned',
};

export function HabitWeekDots({ habitId, day }: Props) {
  const habitPlans = useGremlyStore((s: any) => s.habitPlans) as Record<string, any>[];
  const habitProgress = useGremlyStore((s: any) => s.habitProgress) as Record<string, any>[];
  const weeklyDay = useThisWeek((w) => w.weeklyDay);
  const weekRead = useThisWeek((w) => w.loaded);
  const today = getDateService().ritualDay();
  const days = useMemo(
    () =>
      habitWeekDays({
        habitId,
        day,
        today,
        weeklyDay,
        habitPlans: habitPlans ?? [],
        habitProgress: habitProgress ?? [],
      }),
    [habitId, day, today, weeklyDay, habitPlans, habitProgress],
  );
  if (!weekRead) return null;
  return (
    <View
      style={styles.row}
      testID="brief-habit-week"
      accessible
      accessibilityLabel={days.map((d) => `${shortDay(d.day)} ${STATE_WORDS[d.state]}`).join(', ')}
    >
      {days.map((d) => (
        <View key={d.day} style={styles.day}>
          <View style={[styles.dot, styles[d.state]]} testID={`habit-week-${d.day}-${d.state}`} />
          <Text style={styles.label}>{shortDay(d.day)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  day: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
  },
  done: { backgroundColor: '#4F8A5F', borderColor: '#4F8A5F' },
  today: { backgroundColor: '#F2C66D', borderColor: '#E3A63A' },
  planned: { backgroundColor: '#FFFFFF', borderColor: '#4F8A5F', borderStyle: 'dashed' },
  none: { backgroundColor: '#EDE7DC', borderColor: '#EDE7DC' },
  label: {
    fontFamily: 'Inter-Bold',
    fontSize: 11,
    color: '#5C6B63',
  },
});
