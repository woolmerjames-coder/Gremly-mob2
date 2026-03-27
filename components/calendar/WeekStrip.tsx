/**
 * WeekStrip - Horizontal date navigation for Calendar view
 *
 * Shows 7 days centered on the selected date.
 * Tapping a day selects it. Dots indicate days with items.
 * Matches Gremly brand styling.
 */

import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { getDateService } from '../../lib/date';
import { useDatesWithItems } from '../../lib/store/calendarSelectors';

// ═══════════════════════════════════════════════════════════════════
// BRAND COLORS
// ═══════════════════════════════════════════════════════════════════

const BRAND = {
  linenCream: '#F9F6F1',
  mossGreen: '#2E5540',
  sageMist: '#BFD8C0',
  charcoalInk: '#222222',
  mutedSageText: '#768879',
  white: '#FFFFFF',
};

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface WeekStripProps {
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (date: string) => void;
}

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function WeekStrip({ selectedDate, onSelectDate }: WeekStripProps) {
  const dateService = getDateService();

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
    onSelectDate(dateService.today());
  };

  const today = dateService.today();

  return (
    <View style={styles.container}>
      {/* Navigation row */}
      <View style={styles.navRow}>
        <TouchableOpacity onPress={goToPreviousWeek} style={styles.navButton} activeOpacity={0.6}>
          <ChevronLeft size={20} color={BRAND.mossGreen} />
        </TouchableOpacity>

        <TouchableOpacity onPress={goToToday} style={styles.todayButton} activeOpacity={0.7}>
          <Text style={styles.todayButtonText}>Today</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={goToNextWeek} style={styles.navButton} activeOpacity={0.6}>
          <ChevronRight size={20} color={BRAND.mossGreen} />
        </TouchableOpacity>
      </View>

      {/* Days row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.daysRow}
      >
        {days.map((day) => {
          const isSelected = day === selectedDate;
          const isToday = day === today;
          const hasItems = datesWithItems.has(day);
          const dateObj = dateService.fromLocalDate(day);

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
              activeOpacity={0.7}
            >
              <Text style={[styles.dayName, isSelected && styles.dayNameSelected]}>{dayName}</Text>
              <Text style={[styles.dayNum, isSelected && styles.dayNumSelected]}>{dayNum}</Text>
              {hasItems && <View style={[styles.dot, isSelected && styles.dotSelected]} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    backgroundColor: BRAND.linenCream,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.sageMist,
  },
  // Navigation
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    gap: 16,
  },
  navButton: {
    padding: 8,
  },
  todayButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: BRAND.sageMist,
    borderRadius: 999,
  },
  todayButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.mossGreen,
  },
  // Days row
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  // Day pill
  dayPill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    minWidth: 44,
  },
  dayPillSelected: {
    backgroundColor: BRAND.mossGreen,
  },
  dayPillToday: {
    backgroundColor: BRAND.sageMist,
  },
  // Day text
  dayName: {
    fontSize: 11,
    fontWeight: '500',
    color: BRAND.mutedSageText,
    marginBottom: 2,
  },
  dayNameSelected: {
    color: BRAND.white,
  },
  dayNum: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.charcoalInk,
  },
  dayNumSelected: {
    color: BRAND.white,
  },
  // Dot indicator
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: BRAND.mossGreen,
    marginTop: 4,
  },
  dotSelected: {
    backgroundColor: BRAND.white,
    marginTop: 4,
  },
});
