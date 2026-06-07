/**
 * CalendarScreen — Timeline-based calendar view (v2).
 *
 * Replaces the old time-block grouped calendar with a vertical
 * day-timeline layout powered by CalendarService.
 */

import React, { useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Link } from 'lucide-react-native';
import { useNavigation, useRoute, useFocusEffect, type RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { getDateService } from '../../lib/date';
import { useCalendarEvents } from '../../lib/calendar/useCalendarService';
import type { CalendarItem } from '../../lib/calendar/CalendarService';
import { useOverlayController } from '../../hooks/useOverlayController';
import CalendarHeader from '../../components/calendar/CalendarHeader';
import WeekStrip from '../../components/calendar/WeekStrip';
import DayTimeline from '../../components/calendar/DayTimeline';
import CalendarInputBar from '../../components/calendar/CalendarInputBar';
import { useGremlyStore } from '../../lib/store/useGremlyStore';

const LINEN_CREAM = '#F9F6F1';

export default function CalendarScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'CalendarScreen'>>();
  const [selectedDate, setSelectedDate] = useState(
    () => route.params?.initialDate ?? getDateService().today(),
  );
  const overlayController = useOverlayController();
  const navigation = useNavigation();
  const calendarConnections = useGremlyStore((s) => s.calendarConnections);
  const hasCalendarConnected = calendarConnections?.some((c) => c.isConnected) ?? false;

  // Refresh calendar connections on focus (not persisted, so starts as [])
  useFocusEffect(
    useCallback(() => {
      useGremlyStore.getState().refreshCalendarConnections();
    }, []),
  );

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

  // Horizontal swipe gesture for day navigation
  const translationX = useSharedValue(0);
  const selectedDateRef = useRef(selectedDate);
  selectedDateRef.current = selectedDate;

  const advanceDay = useCallback(
    (delta: number) => {
      const next = getDateService().addDays(selectedDateRef.current, delta);
      handleDateSelect(next);
    },
    [handleDateSelect],
  );

  const panGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-10, 10])
    .onStart(() => {
      translationX.value = 0;
    })
    .onUpdate((e) => {
      translationX.value = e.translationX;
    })
    .onEnd((e) => {
      const triggered = Math.abs(e.translationX) > 50 || Math.abs(e.velocityX) > 500;
      if (triggered) {
        runOnJS(advanceDay)(e.translationX > 0 ? -1 : 1);
      }
      translationX.value = withTiming(0, { duration: 200 });
    });

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translationX.value }],
  }));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <CalendarHeader />
      <WeekStrip selectedDate={selectedDate} onDateSelect={handleDateSelect} />
      {!hasCalendarConnected && (
        <Pressable
          style={styles.connectBanner}
          onPress={() => navigation.navigate('CalendarSettings' as never)}
        >
          <View style={styles.connectBannerIcon}>
            <Link size={14} color="#5C7A5E" />
          </View>
          <Text style={styles.connectBannerText}>Connect your calendar to see events here</Text>
          <Text style={styles.connectBannerArrow}>›</Text>
        </Pressable>
      )}
      <View style={styles.timeline}>
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[{ flex: 1 }, slideStyle]}>
            <DayTimeline
              selectedDate={selectedDate}
              events={items}
              onEventPress={handleEventPress}
              onDateSelect={handleDateSelect}
            />
          </Animated.View>
        </GestureDetector>
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
  connectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#EEF2EF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D5DDD6',
  },
  connectBannerIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#D5DDD640',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  connectBannerText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#3A3A3A',
  },
  connectBannerArrow: {
    fontSize: 18,
    color: '#5C7A5E',
    fontWeight: '600',
  },
});
