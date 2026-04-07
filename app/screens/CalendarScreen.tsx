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
import type { CalendarItem } from '../../lib/calendar/CalendarService';
import { useOverlayController } from '../../hooks/useOverlayController';
import CalendarHeader from '../../components/calendar/CalendarHeader';
import WeekStrip from '../../components/calendar/WeekStrip';
import DayTimeline from '../../components/calendar/DayTimeline';
import CalendarInputBar from '../../components/calendar/CalendarInputBar';

const LINEN_CREAM = '#F9F6F1';

export default function CalendarScreen() {
  const [selectedDate, setSelectedDate] = useState(() => getDateService().today());
  const overlayController = useOverlayController();

  const items = useCalendarEvents(selectedDate, {
    includeTodos: true,
    includeHabits: true,
  });

  const handleDateSelect = useCallback((date: string) => {
    setSelectedDate(date);
  }, []);

  const handleEventPress = useCallback(
    (event: CalendarItem) => {
      if (!event.sourceData?.record) return;
      overlayController.openEdit({ record: event.sourceData.record });
    },
    [overlayController],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <CalendarHeader />
      <WeekStrip selectedDate={selectedDate} onDateSelect={handleDateSelect} />
      <View style={styles.timeline}>
        <DayTimeline selectedDate={selectedDate} events={items} onEventPress={handleEventPress} />
      </View>
      <CalendarInputBar selectedDate={selectedDate} />
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
