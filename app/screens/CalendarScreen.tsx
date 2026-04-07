/**
 * CalendarScreen — Timeline-based calendar view (v2).
 *
 * Replaces the old time-block grouped calendar with a vertical
 * day-timeline layout powered by CalendarService.
 */

import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDateService } from '../../lib/date';
import { useCalendarEvents } from '../../lib/calendar/useCalendarService';
import CalendarHeader from '../../components/calendar/CalendarHeader';
import WeekStrip from '../../components/calendar/WeekStrip';
import DayTimeline from '../../components/calendar/DayTimeline';

const LINEN_CREAM = '#F9F6F1';

export default function CalendarScreen() {
  const [selectedDate, setSelectedDate] = useState(() => getDateService().today());

  const items = useCalendarEvents(selectedDate, {
    includeTodos: true,
    includeHabits: true,
  });

  const handleDateSelect = useCallback((date: string) => {
    setSelectedDate(date);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <CalendarHeader />
      <WeekStrip selectedDate={selectedDate} onSelectDate={handleDateSelect} />
      <View style={styles.timeline}>
        <DayTimeline date={selectedDate} items={items} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LINEN_CREAM,
  },
  timeline: {
    flex: 1,
  },
});
