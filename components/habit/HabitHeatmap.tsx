/**
 * HabitHeatmap - GitHub-style contribution graph for habits
 * Shows 4 weeks (28 days) of activity with intensity-based coloring
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getDateService } from '../../lib/date';

const BRAND = {
  mossGreen: '#2E5540',
  sageMist: '#BFD8C0',
  mutedSageText: '#768879',
  linenCream: '#F9F6F1',
};

interface HabitHeatmapProps {
  habitId: string;
  completedDates: Set<string>;
  adherencePercent: number;
}

export function HabitHeatmap({ habitId, completedDates, adherencePercent }: HabitHeatmapProps) {
  const ds = getDateService();

  // Generate 28 days (4 weeks) ending today
  const heatmapData = useMemo(() => {
    const today = ds.today();
    const days: Array<{ dateIso: string; isCompleted: boolean; dayOfWeek: number }> = [];

    for (let i = 27; i >= 0; i--) {
      const dateIso = ds.addDays(today, -i);
      const dateObj = ds.fromLocalDate(dateIso);
      days.push({
        dateIso,
        isCompleted: completedDates.has(dateIso),
        dayOfWeek: dateObj?.getDay() ?? 0,
      });
    }
    return days;
  }, [completedDates]);

  // Group into weeks (columns)
  const weeks: (typeof heatmapData)[] = [];
  for (let i = 0; i < 4; i++) {
    weeks.push(heatmapData.slice(i * 7, (i + 1) * 7));
  }

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {weeks.map((week, weekIndex) => (
          <View key={weekIndex} style={styles.week}>
            {week.map((day) => (
              <View
                key={day.dateIso}
                style={[styles.cell, day.isCompleted ? styles.cellCompleted : styles.cellEmpty]}
              />
            ))}
          </View>
        ))}
      </View>
      <Text style={styles.adherenceText}>{adherencePercent}% this month</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    gap: 4,
  },
  week: {
    flexDirection: 'column',
    gap: 4,
  },
  cell: {
    width: 16,
    height: 16,
    borderRadius: 3,
  },
  cellEmpty: {
    backgroundColor: 'rgba(191, 216, 192, 0.3)', // light sage
  },
  cellCompleted: {
    backgroundColor: BRAND.mossGreen,
  },
  adherenceText: {
    fontSize: 13,
    color: BRAND.mutedSageText,
    marginTop: 12,
  },
});
