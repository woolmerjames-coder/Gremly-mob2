/**
 * WeekStrip - Horizontal date navigation for Calendar view
 *
 * Shows 7 days centered on the selected date.
 * Tapping a day selects it. Dots indicate days with items.
 */

import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { colors, radii, spacing } from '../../theme/tokens';
import { getDateService } from '../../lib/date';
import { useDatesWithItems } from '../../lib/store/calendarSelectors';

interface WeekStripProps {
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (date: string) => void;
}

export default function WeekStrip({ selectedDate, onSelectDate }: WeekStripProps) {
  const dateService = getDateService();
  const scrollRef = useRef<ScrollView>(null);

  // Generate 7 days centered on selected date (3 before, selected, 3 after)
  const days: string[] = [];
  for (let i = -3; i <= 3; i++) {
    days.push(dateService.addDays(selectedDate, i));
  }

  // Get dates with items for dot indicators
  const datesWithItems = useDatesWithItems(days[0], days[days.length - 1]);

  // Navigation handlers
  const goToPreviousWeek = () => {
    onSelectDate(dateService.addDays(selectedDate, -7));
  };

  const goToNextWeek = () => {
    onSelectDate(dateService.addDays(selectedDate, 7));
  };

  const goToToday = () => {
    onSelectDate(dateService.getCurrentDate());
  };

  const today = dateService.getCurrentDate();

  return (
    <View style={styles.container}>
      {/* Navigation arrows + Today button */}
      <View style={styles.navRow}>
        <TouchableOpacity onPress={goToPreviousWeek} style={styles.navButton}>
          <ChevronLeft size={20} color={colors.deepTeal} />
        </TouchableOpacity>

        <TouchableOpacity onPress={goToToday} style={styles.todayButton}>
          <Text style={styles.todayButtonText}>Today</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={goToNextWeek} style={styles.navButton}>
          <ChevronRight size={20} color={colors.deepTeal} />
        </TouchableOpacity>
      </View>

      {/* Day pills */}
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.daysRow}
      >
        {days.map((day) => {
          const isSelected = day === selectedDate;
          const isToday = day === today;
          const hasItems = datesWithItems.has(day);
          const dateObj = dateService.fromDateString(day);

          if (!dateObj) return null;

          const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dateObj.getDay()];
          const dayNum = dateObj.getDate();

          return (
            <TouchableOpacity
              key={day}
              onPress={() => onSelectDate(day)}
              style={[
                styles.dayPill,
                isSelected && styles.dayPillSelected,
                isToday && !isSelected && styles.dayPillToday,
              ]}
            >
              <Text style={[styles.dayName, isSelected && styles.dayTextSelected]}>{dayName}</Text>
              <Text
                style={[
                  styles.dayNum,
                  isSelected && styles.dayTextSelected,
                  isToday && !isSelected && styles.dayNumToday,
                ]}
              >
                {dayNum}
              </Text>
              {/* Dot indicator for days with items */}
              {hasItems && !isSelected && <View style={styles.dot} />}
              {hasItems && isSelected && <View style={styles.dotSelected} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.white,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  navButton: {
    padding: spacing.xs,
  },
  todayButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.mint,
    borderRadius: radii.md,
  },
  todayButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.deepTeal,
  },
  daysRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  dayPill: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    minWidth: 48,
  },
  dayPillSelected: {
    backgroundColor: colors.deepTeal,
  },
  dayPillToday: {
    backgroundColor: colors.gray100,
  },
  dayName: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.gray600,
    marginBottom: 2,
  },
  dayNum: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  dayNumToday: {
    color: colors.deepTeal,
  },
  dayTextSelected: {
    color: colors.white,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.deepTeal,
    marginTop: 4,
  },
  dotSelected: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.mint,
    marginTop: 4,
  },
});
