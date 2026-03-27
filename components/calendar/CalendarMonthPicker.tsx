import React, { useState, useMemo } from 'react';
import { View, Text, Modal, Pressable, StyleSheet } from 'react-native';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react-native';
import { format } from 'date-fns';
import { getDateService } from '../../lib/date';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useNavigation } from '@react-navigation/native';

const COLORS = {
  linenCream: '#F9F6F1',
  mossGreen: '#2E5540',
  charcoalInk: '#0E1116',
  inkMuted: '#666666',
  divider: '#E8E6E1',
};

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CalendarMonthPickerProps {
  visible: boolean;
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (date: string) => void;
  onClose: () => void;
}

export function CalendarMonthPicker({
  visible,
  selectedDate,
  onSelectDate,
  onClose,
}: CalendarMonthPickerProps) {
  const dateService = getDateService();
  const navigation = useNavigation();
  const calendarConnections = useGremlyStore((s) => s.calendarConnections);
  const hasCalendarConnected = calendarConnections.some((c) => c.isConnected);

  // Track which month we're viewing (may differ from selected date)
  const [viewingDate, setViewingDate] = useState(selectedDate);

  const viewingYear = parseInt(viewingDate.slice(0, 4), 10);
  const viewingMonth = parseInt(viewingDate.slice(5, 7), 10) - 1; // 0-indexed

  // Generate days for the month grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewingYear, viewingMonth, 1);
    const lastDay = new Date(viewingYear, viewingMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    const days: Array<{ date: string; dayNum: number; isCurrentMonth: boolean }> = [];

    // Previous month padding
    const prevMonth = new Date(viewingYear, viewingMonth, 0);
    const prevMonthDays = prevMonth.getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const day = prevMonthDays - i;
      const date = new Date(viewingYear, viewingMonth - 1, day);
      days.push({
        date: dateService.toLocalDate(date),
        dayNum: day,
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(viewingYear, viewingMonth, day);
      days.push({
        date: dateService.toLocalDate(date),
        dayNum: day,
        isCurrentMonth: true,
      });
    }

    // Next month padding (fill to 42 cells for 6 rows)
    const remaining = 42 - days.length;
    for (let day = 1; day <= remaining; day++) {
      const date = new Date(viewingYear, viewingMonth + 1, day);
      days.push({
        date: dateService.toLocalDate(date),
        dayNum: day,
        isCurrentMonth: false,
      });
    }

    return days;
  }, [viewingYear, viewingMonth, dateService]);

  const monthYearLabel = format(new Date(viewingYear, viewingMonth), 'MMMM yyyy');

  const handlePrevMonth = () => {
    const newDate = new Date(viewingYear, viewingMonth - 1, 1);
    setViewingDate(dateService.toLocalDate(newDate));
  };

  const handleNextMonth = () => {
    const newDate = new Date(viewingYear, viewingMonth + 1, 1);
    setViewingDate(dateService.toLocalDate(newDate));
  };

  const handleSelectDate = (date: string) => {
    onSelectDate(date);
    onClose();
  };

  const today = dateService.getCurrentDate();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={handlePrevMonth} style={styles.navButton}>
              <ChevronLeft size={20} color={COLORS.charcoalInk} />
            </Pressable>
            <Text style={styles.monthYear}>{monthYearLabel}</Text>
            <Pressable onPress={handleNextMonth} style={styles.navButton}>
              <ChevronRight size={20} color={COLORS.charcoalInk} />
            </Pressable>
          </View>

          {/* Days of week */}
          <View style={styles.weekRow}>
            {DAYS_OF_WEEK.map((day) => (
              <Text key={day} style={styles.weekDay}>
                {day}
              </Text>
            ))}
          </View>

          {/* Calendar grid */}
          <View style={styles.grid}>
            {calendarDays.map((day, index) => {
              const isSelected = day.date === selectedDate;
              const isToday = day.date === today;

              return (
                <Pressable
                  key={index}
                  style={[
                    styles.dayCell,
                    isSelected && styles.dayCellSelected,
                    isToday && !isSelected && styles.dayCellToday,
                  ]}
                  onPress={() => handleSelectDate(day.date)}
                >
                  <Text
                    style={[
                      styles.dayText,
                      !day.isCurrentMonth && styles.dayTextMuted,
                      isSelected && styles.dayTextSelected,
                    ]}
                  >
                    {day.dayNum}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Today button */}
          <Pressable style={styles.todayButton} onPress={() => handleSelectDate(today)}>
            <Text style={styles.todayButtonText}>Today</Text>
          </Pressable>

          {/* Connect calendar CTA - only shown when no calendar connected */}
          {!hasCalendarConnected && (
            <Pressable
              style={styles.connectCalendarCta}
              onPress={() => {
                onClose();
                navigation.navigate('Settings' as never);
              }}
            >
              <Calendar size={16} color={COLORS.mossGreen} />
              <View style={styles.connectCalendarTextContainer}>
                <Text style={styles.connectCalendarTitle}>Connect your calendar</Text>
                <Text style={styles.connectCalendarSubtitle}>See events in your daily view</Text>
              </View>
              <ChevronRight size={16} color={COLORS.inkMuted} />
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: COLORS.linenCream,
    borderRadius: 16,
    padding: 16,
    width: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  navButton: {
    padding: 8,
  },
  monthYear: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.charcoalInk,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekDay: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.inkMuted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%', // 100% / 7 days
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCellSelected: {
    backgroundColor: COLORS.mossGreen,
    borderRadius: 20,
  },
  dayCellToday: {
    borderWidth: 1,
    borderColor: COLORS.mossGreen,
    borderRadius: 20,
  },
  dayText: {
    fontSize: 15,
    color: COLORS.charcoalInk,
  },
  dayTextMuted: {
    color: '#BBBBBB',
  },
  dayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  todayButton: {
    marginTop: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  todayButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.mossGreen,
  },
  connectCalendarCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    marginTop: 4,
  },
  connectCalendarTextContainer: {
    flex: 1,
  },
  connectCalendarTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.charcoalInk,
  },
  connectCalendarSubtitle: {
    fontSize: 12,
    color: COLORS.inkMuted,
    marginTop: 2,
  },
});
