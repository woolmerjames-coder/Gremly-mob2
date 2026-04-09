/**
 * WeekStrip - Horizontal week navigation for Calendar view
 *
 * Shows Monday–Sunday for the week containing the selected date.
 * Arrow buttons navigate between weeks.
 * Matches Gremly brand styling.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { getDateService } from '../../lib/date';

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const SAGE_GREEN = '#6B8F71';
const LINEN_CREAM = '#F9F6F1';
const CHARCOAL = '#222222';
const MUTED_TEXT = '#8A8A8A';
const WEEKEND_MUTED = '#ACACAC';
const SEPARATOR = '#E0DCD5';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const CIRCLE_SIZE = 36;

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface WeekStripProps {
  selectedDate: string; // YYYY-MM-DD
  onDateSelect: (date: string) => void;
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

/** Return the Monday of the week containing `dateStr`. */
function getMondayOfWeek(dateStr: string): string {
  const ds = getDateService();
  const date = ds.fromLocalDate(dateStr);
  if (!date) return dateStr;
  const dow = date.getDay(); // 0=Sun, 1=Mon…6=Sat
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  return ds.addDays(dateStr, -daysSinceMonday);
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Format month + year from a date string, e.g. "April 2026". */
function formatMonthYear(dateStr: string): string {
  const ds = getDateService();
  const date = ds.fromLocalDate(dateStr);
  if (!date) return '';
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function WeekStrip({ selectedDate, onDateSelect }: WeekStripProps) {
  const ds = getDateService();
  const today = ds.today();

  const monday = useMemo(() => getMondayOfWeek(selectedDate), [selectedDate]);

  const days = useMemo(() => {
    const result: string[] = [];
    for (let i = 0; i < 7; i++) {
      result.push(ds.addDays(monday, i));
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monday]);

  const monthYear = useMemo(() => formatMonthYear(selectedDate), [selectedDate]);

  const goToPreviousWeek = () => onDateSelect(ds.addDays(selectedDate, -7));
  const goToNextWeek = () => onDateSelect(ds.addDays(selectedDate, 7));

  return (
    <View style={styles.container}>
      {/* Month / Year label */}
      <Text style={styles.monthYear}>{monthYear}</Text>

      {/* Arrow ← [day cells] → */}
      <View style={styles.weekRow}>
        <TouchableOpacity onPress={goToPreviousWeek} style={styles.arrowButton} activeOpacity={0.6}>
          <ChevronLeft size={20} color={CHARCOAL} />
        </TouchableOpacity>

        <View style={styles.dayCells}>
          {days.map((day, index) => {
            const isSelected = day === selectedDate;
            const isToday = day === today;
            const isWeekend = index >= 5; // index 5 = Sat, 6 = Sun
            const dateObj = ds.fromLocalDate(day);
            const dayNum = dateObj ? dateObj.getDate() : 0;

            return (
              <TouchableOpacity
                key={day}
                onPress={() => onDateSelect(day)}
                style={styles.dayCell}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.dayLetter,
                    isSelected && styles.selectedText,
                    !isSelected && isWeekend && styles.weekendText,
                  ]}
                >
                  {DAY_LETTERS[index]}
                </Text>
                <View
                  style={[
                    styles.dateCircle,
                    isSelected && styles.selectedCircle,
                    isToday && !isSelected && styles.todayCircle,
                  ]}
                >
                  <Text
                    style={[
                      styles.dateNum,
                      isSelected && styles.selectedText,
                      !isSelected && isToday && styles.todayDateNum,
                      !isSelected && !isToday && isWeekend && styles.weekendText,
                    ]}
                  >
                    {dayNum}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity onPress={goToNextWeek} style={styles.arrowButton} activeOpacity={0.6}>
          <ChevronRight size={20} color={CHARCOAL} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    backgroundColor: LINEN_CREAM,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SEPARATOR,
  },
  monthYear: {
    fontSize: 15,
    fontWeight: '600',
    color: CHARCOAL,
    textAlign: 'center',
    marginBottom: 10,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  arrowButton: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  dayCells: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  dayCell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayLetter: {
    fontSize: 13,
    fontWeight: '500',
    color: MUTED_TEXT,
    marginBottom: 4,
  },
  dateCircle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedCircle: {
    backgroundColor: SAGE_GREEN,
  },
  todayCircle: {
    borderWidth: 1.5,
    borderColor: SAGE_GREEN,
  },
  dateNum: {
    fontSize: 16,
    fontWeight: '600',
    color: CHARCOAL,
  },
  selectedText: {
    color: '#FFFFFF',
  },
  todayDateNum: {
    color: SAGE_GREEN,
  },
  weekendText: {
    color: WEEKEND_MUTED,
  },
});
