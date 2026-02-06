/**
 * CalendarHeatmap – Full-width monthly calendar grid showing habit consistency.
 *
 * Features:
 *  - Month navigation arrows (parent-controlled month/year)
 *  - Tappable cells that toggle completion via onToggleDate
 *  - Day-of-month numbers in each cell
 *  - Monday-first columns
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';

// ─── Color tokens ────────────────────────────────────────────────────────────
const MOSS_GREEN = BRAND.colors.mossGreen;
const INK_MUTED = BRAND.colors.inkMuted;
const WARM_RED_LIGHT = 'rgba(201,90,66,0.14)';
const MISSED_GREY = 'rgba(0,0,0,0.06)';
const EMPTY_CELL = 'rgba(0,0,0,0.025)';

// ─── Month names ─────────────────────────────────────────────────────────────
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
] as const;

// ─── Day headers (Mon–Sun) ──────────────────────────────────────────────────
const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

// ─── Props ───────────────────────────────────────────────────────────────────
export interface CalendarHeatmapProps {
  /** ISO date strings (YYYY-MM-DD) of completed days */
  completedDates: string[];
  /** Month (0–11) */
  month: number;
  /** Full year */
  year: number;
  /** If true, missed days show warm red instead of grey */
  isBreak?: boolean;
  /** Today's ISO date string for highlight ring */
  todayDate?: string;

  // ── Month navigation ──
  /** Called when the user taps a nav arrow; parent updates month/year state */
  onMonthChange: (month: number, year: number) => void;
  /** Whether the forward arrow is enabled (default: false = can't go past current month) */
  canGoForward?: boolean;

  // ── Cell toggling ──
  /** Called when the user taps a day cell */
  onToggleDate: (dateISO: string, newState: boolean) => void;
  /** Habit ID (for key stability) */
  habitId: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert JS getDay() (0=Sun) → Mon-first index (0=Mon … 6=Sun) */
function toMondayIndex(jsDay: number): number {
  return (jsDay + 6) % 7;
}

/** Pad YYYY-MM-DD from Date using local timezone */
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface CalendarCell {
  /** Day of month, or null for padding cells outside the month */
  day: number | null;
  /** ISO date string for this cell (null for padding) */
  dateISO: string | null;
}

// ─── Component ───────────────────────────────────────────────────────────────
export function CalendarHeatmap({
  completedDates,
  month,
  year,
  isBreak = false,
  todayDate,
  onMonthChange,
  canGoForward = false,
  onToggleDate,
  habitId,
}: CalendarHeatmapProps) {
  // Build a Set for O(1) lookups
  const completedSet = useMemo(() => new Set(completedDates), [completedDates]);

  // Build the grid: array of weeks, each week is 7 CalendarCells
  const weeks = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDow = toMondayIndex(firstDay.getDay()); // 0=Mon

    const grid: CalendarCell[][] = [];
    let currentWeek: CalendarCell[] = [];

    // Leading empty cells
    for (let i = 0; i < startDow; i++) {
      currentWeek.push({ day: null, dateISO: null });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      currentWeek.push({ day: d, dateISO: toISODate(date) });

      if (currentWeek.length === 7) {
        grid.push(currentWeek);
        currentWeek = [];
      }
    }

    // Trailing empty cells
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push({ day: null, dateISO: null });
      }
      grid.push(currentWeek);
    }

    return grid;
  }, [year, month]);

  // Today as ISO for comparison
  const todayISO = todayDate ?? '';

  // Determine if a date is in the past (strictly before today)
  const isPast = (dateISO: string): boolean => {
    if (!todayISO) return false;
    return dateISO < todayISO;
  };

  // Is this date in the future (strictly after today)?
  const isFuture = (dateISO: string): boolean => {
    if (!todayISO) return false;
    return dateISO > todayISO;
  };

  // Cell background color
  const getCellColor = (cell: CalendarCell): string => {
    if (cell.day === null || cell.dateISO === null) return EMPTY_CELL;

    const completed = completedSet.has(cell.dateISO);
    if (completed) return MOSS_GREEN;

    if (isPast(cell.dateISO)) {
      return isBreak ? WARM_RED_LIGHT : MISSED_GREY;
    }

    return EMPTY_CELL; // Future or today (not completed)
  };

  // Text color for day number
  const getDayTextColor = (cell: CalendarCell): string => {
    if (cell.day === null || cell.dateISO === null) return 'transparent';

    const completed = completedSet.has(cell.dateISO);
    if (completed) return '#FFFFFF';

    if (cell.dateISO === todayISO) return MOSS_GREEN;

    return INK_MUTED;
  };

  // Text opacity for future days
  const getDayTextOpacity = (cell: CalendarCell): number => {
    if (cell.day === null || cell.dateISO === null) return 0;
    if (isFuture(cell.dateISO)) return 0.4;
    return 1;
  };

  const isTodayCell = (cell: CalendarCell): boolean =>
    cell.dateISO !== null && cell.dateISO === todayISO;

  // ── Month nav handlers ──
  const handlePrev = () => {
    let newMonth = month - 1;
    let newYear = year;
    if (newMonth < 0) {
      newMonth = 11;
      newYear--;
    }
    onMonthChange(newMonth, newYear);
  };

  const handleNext = () => {
    let newMonth = month + 1;
    let newYear = year;
    if (newMonth > 11) {
      newMonth = 0;
      newYear++;
    }
    onMonthChange(newMonth, newYear);
  };

  // ── Cell tap handler ──
  const handleCellPress = (cell: CalendarCell) => {
    if (cell.day === null || cell.dateISO === null) return;
    if (isFuture(cell.dateISO)) return; // Can't mark future days
    const isCurrentlyDone = completedSet.has(cell.dateISO);
    onToggleDate(cell.dateISO, !isCurrentlyDone);
  };

  return (
    <View style={styles.container}>
      {/* Month navigation header */}
      <View style={styles.monthNavRow}>
        <TouchableOpacity onPress={handlePrev} hitSlop={8}>
          <ChevronLeft size={18} color={INK_MUTED} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>
          {MONTH_NAMES[month]} {year}
        </Text>
        <TouchableOpacity
          onPress={handleNext}
          disabled={!canGoForward}
          style={{ opacity: canGoForward ? 1 : 0.3 }}
          hitSlop={8}
        >
          <ChevronRight size={18} color={INK_MUTED} />
        </TouchableOpacity>
      </View>

      {/* Day headers */}
      <View style={styles.headerRow}>
        {DAY_HEADERS.map((h) => (
          <Text key={h} style={styles.headerText}>
            {h}
          </Text>
        ))}
      </View>

      {/* Calendar grid */}
      {weeks.map((week, wi) => (
        <View key={`week-${wi}`} style={styles.weekRow}>
          {week.map((cell, ci) => {
            const isRealDay = cell.day !== null;
            const cellContent = (
              <View
                style={[
                  styles.cell,
                  { backgroundColor: getCellColor(cell) },
                  isTodayCell(cell) && styles.cellToday,
                ]}
              >
                {isRealDay && (
                  <Text
                    style={[
                      styles.dayNumber,
                      {
                        color: getDayTextColor(cell),
                        opacity: getDayTextOpacity(cell),
                        fontWeight: isTodayCell(cell) ? '700' : '500',
                      },
                    ]}
                  >
                    {cell.day}
                  </Text>
                )}
              </View>
            );

            // Only real, non-future days are tappable
            if (isRealDay && !isFuture(cell.dateISO!)) {
              return (
                <TouchableOpacity
                  key={`cell-${wi}-${ci}`}
                  style={styles.cellWrapper}
                  activeOpacity={0.6}
                  onPress={() => handleCellPress(cell)}
                >
                  {cellContent}
                </TouchableOpacity>
              );
            }

            return (
              <View key={`cell-${wi}-${ci}`} style={styles.cellWrapper}>
                {cellContent}
              </View>
            );
          })}
        </View>
      ))}

      {/* Legend */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: MOSS_GREEN }]} />
          <Text style={styles.legendLabel}>{isBreak ? 'Held strong' : 'Done'}</Text>
        </View>
        <View style={styles.legendItem}>
          <View
            style={[
              styles.legendSwatch,
              { backgroundColor: isBreak ? WARM_RED_LIGHT : MISSED_GREY },
            ]}
          />
          <Text style={styles.legendLabel}>{isBreak ? 'Slipped' : 'Missed'}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, styles.legendTodaySwatch]} />
          <Text style={styles.legendLabel}>Today</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {},
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 14,
  },
  monthLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    minWidth: 130,
    textAlign: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  headerText: {
    flex: 1,
    fontSize: 10,
    fontWeight: '600',
    color: INK_MUTED,
    textAlign: 'center',
  },
  weekRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 4,
  },
  cellWrapper: {
    flex: 1,
  },
  cell: {
    aspectRatio: 1,
    borderRadius: 6,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellToday: {
    borderWidth: 2,
    borderColor: MOSS_GREEN,
  },
  dayNumber: {
    fontSize: 11,
    fontWeight: '500',
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  legendTodaySwatch: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: MOSS_GREEN,
  },
  legendLabel: {
    fontSize: 11,
    color: INK_MUTED,
  },
});
