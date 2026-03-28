/**
 * RitualsSettingsScreen - Configure Morning Brief, Evening Sweep, and Day Boundary
 *
 * Extracted from the original SettingsScreen. Auto-saves when navigating back.
 *
 * Settings V2 (Feb 2026)
 */

import React, { useState, useLayoutEffect, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Switch, Platform, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { ChevronLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing, borderRadius } from '../../design/tokens';
import { BRAND } from '../../design/brand';
import DayBoundaryPicker from '../../components/settings/DayBoundaryPicker';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useNotificationPreferences } from '../../hooks/useNotificationPreferences';
import { getDateService } from '../../lib/date';

export default function RitualsSettingsScreen() {
  const navigation = useNavigation();

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // Day boundary from store
  const dayBoundaryHour = useGremlyStore((s) => s.dayBoundaryHour);
  const setDayBoundaryHour = useGremlyStore((s) => s.setDayBoundaryHour);

  // Notification preferences from hook
  const { preferences: notificationPrefs, savePreferences: saveNotificationPrefs } =
    useNotificationPreferences();

  // Local state for form values
  const [morningEnabled, setMorningEnabled] = useState(notificationPrefs?.morningEnabled ?? true);
  const [morningTime, setMorningTime] = useState(() => {
    if (notificationPrefs?.morningTime) return notificationPrefs.morningTime;
    const d = getDateService().now();
    d.setHours(8, 0, 0, 0);
    return d;
  });
  const [eveningEnabled, setEveningEnabled] = useState(notificationPrefs?.eveningEnabled ?? true);
  const [eveningTime, setEveningTime] = useState(() => {
    if (notificationPrefs?.eveningTime) return notificationPrefs.eveningTime;
    const d = getDateService().now();
    d.setHours(20, 0, 0, 0);
    return d;
  });
  const [afternoonEnabled, setAfternoonEnabled] = useState(
    notificationPrefs?.afternoonEnabled ?? true,
  );
  const [afternoonTime, setAfternoonTime] = useState(() => {
    if (notificationPrefs?.afternoonTime) return notificationPrefs.afternoonTime;
    const d = getDateService().now();
    d.setHours(14, 0, 0, 0);
    return d;
  });
  const [weeklyEnabled, setWeeklyEnabled] = useState(notificationPrefs?.weeklyEnabled ?? true);
  const [weeklyTime, setWeeklyTime] = useState(() => {
    if (notificationPrefs?.weeklyTime) return notificationPrefs.weeklyTime;
    const d = getDateService().now();
    d.setHours(18, 0, 0, 0);
    return d;
  });
  const [weeklyDay, setWeeklyDay] = useState(notificationPrefs?.weeklyDay ?? 0);
  const [localDayBoundary, setLocalDayBoundary] = useState(dayBoundaryHour);

  const hasChanges = useRef(false);

  // Sync local state when async prefs load completes
  useEffect(() => {
    if (notificationPrefs) {
      if (notificationPrefs.morningTime) setMorningTime(notificationPrefs.morningTime);
      if (notificationPrefs.eveningTime) setEveningTime(notificationPrefs.eveningTime);
      if (notificationPrefs.morningEnabled !== undefined)
        setMorningEnabled(notificationPrefs.morningEnabled);
      if (notificationPrefs.eveningEnabled !== undefined)
        setEveningEnabled(notificationPrefs.eveningEnabled);
      if (notificationPrefs.afternoonTime) setAfternoonTime(notificationPrefs.afternoonTime);
      if (notificationPrefs.afternoonEnabled !== undefined)
        setAfternoonEnabled(notificationPrefs.afternoonEnabled);
      if (notificationPrefs.weeklyTime) setWeeklyTime(notificationPrefs.weeklyTime);
      if (notificationPrefs.weeklyEnabled !== undefined)
        setWeeklyEnabled(notificationPrefs.weeklyEnabled);
      if (notificationPrefs.weeklyDay !== undefined) setWeeklyDay(notificationPrefs.weeklyDay);
    }
  }, [notificationPrefs]);

  // Auto-save when navigating away
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      if (hasChanges.current && notificationPrefs) {
        saveNotificationPrefs({
          morningEnabled,
          morningTime,
          eveningEnabled,
          eveningTime,
          afternoonEnabled,
          afternoonTime,
          weeklyEnabled,
          weeklyTime,
          weeklyDay,
          timezone: notificationPrefs.timezone,
        });
        if (localDayBoundary !== dayBoundaryHour) {
          setDayBoundaryHour(localDayBoundary);
        }
      }
    });
    return unsubscribe;
  }, [
    morningEnabled,
    morningTime,
    eveningEnabled,
    eveningTime,
    afternoonEnabled,
    afternoonTime,
    weeklyEnabled,
    weeklyTime,
    weeklyDay,
    localDayBoundary,
    notificationPrefs,
  ]);

  const handleMorningTimeChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (selectedDate) {
      setMorningTime(selectedDate);
      hasChanges.current = true;
    }
  };

  const handleEveningTimeChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (selectedDate) {
      setEveningTime(selectedDate);
      hasChanges.current = true;
    }
  };

  const handleAfternoonTimeChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (selectedDate) {
      setAfternoonTime(selectedDate);
      hasChanges.current = true;
    }
  };

  const handleWeeklyTimeChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (selectedDate) {
      setWeeklyTime(selectedDate);
      hasChanges.current = true;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={12}>
          <ChevronLeft size={24} color={BRAND.colors.charcoalInk} />
        </Pressable>
        <Text style={styles.title}>Rituals</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Morning Brief */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Morning Brief</Text>
            <Switch
              value={morningEnabled}
              onValueChange={(val) => {
                setMorningEnabled(val);
                hasChanges.current = true;
              }}
              trackColor={{ false: colors.gray, true: BRAND.colors.sageMist }}
              thumbColor={morningEnabled ? BRAND.colors.mossGreen : colors.white}
            />
          </View>
          {morningEnabled && (
            <View style={styles.timeRow}>
              <Text style={styles.timeLabel}>Notification time</Text>
              <DateTimePicker
                value={morningTime}
                mode="time"
                display={Platform.OS === 'ios' ? 'compact' : 'default'}
                onChange={handleMorningTimeChange}
                accentColor={BRAND.colors.mossGreen}
              />
            </View>
          )}
        </View>

        {/* Evening Sweep */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Evening Sweep</Text>
            <Switch
              value={eveningEnabled}
              onValueChange={(val) => {
                setEveningEnabled(val);
                hasChanges.current = true;
              }}
              trackColor={{ false: colors.gray, true: BRAND.colors.sageMist }}
              thumbColor={eveningEnabled ? BRAND.colors.mossGreen : colors.white}
            />
          </View>
          {eveningEnabled && (
            <View style={styles.timeRow}>
              <Text style={styles.timeLabel}>Notification time</Text>
              <DateTimePicker
                value={eveningTime}
                mode="time"
                display={Platform.OS === 'ios' ? 'compact' : 'default'}
                onChange={handleEveningTimeChange}
                accentColor={BRAND.colors.mossGreen}
              />
            </View>
          )}
        </View>

        {/* Afternoon Check-in */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Afternoon Check-in</Text>
            <Switch
              value={afternoonEnabled}
              onValueChange={(val) => {
                setAfternoonEnabled(val);
                hasChanges.current = true;
              }}
              trackColor={{ false: colors.gray, true: BRAND.colors.sageMist }}
              thumbColor={afternoonEnabled ? BRAND.colors.mossGreen : colors.white}
            />
          </View>
          <Text style={styles.cardDescription}>
            A smart nudge to check on your lock-ins and stay on track. Only fires when you have
            something actionable.
          </Text>
          {afternoonEnabled && (
            <View style={styles.timeRow}>
              <Text style={styles.timeLabel}>Notification time</Text>
              <DateTimePicker
                value={afternoonTime}
                mode="time"
                display={Platform.OS === 'ios' ? 'compact' : 'default'}
                onChange={handleAfternoonTimeChange}
                accentColor={BRAND.colors.mossGreen}
              />
            </View>
          )}
        </View>

        {/* Weekly Summary */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Weekly Summary</Text>
            <Switch
              value={weeklyEnabled}
              onValueChange={(val) => {
                setWeeklyEnabled(val);
                hasChanges.current = true;
              }}
              trackColor={{ false: colors.gray, true: BRAND.colors.sageMist }}
              thumbColor={weeklyEnabled ? BRAND.colors.mossGreen : colors.white}
            />
          </View>
          <Text style={styles.cardDescription}>
            Get a personalized review of your week with insights and a preview of what's ahead.
          </Text>
          {weeklyEnabled && (
            <>
              {/* Day picker */}
              <View style={styles.timeRow}>
                <Text style={styles.timeLabel}>Summary day</Text>
                <View style={styles.dayPickerRow}>
                  {(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const).map(
                    (label, index) => (
                      <Pressable
                        key={label}
                        onPress={() => {
                          setWeeklyDay(index);
                          hasChanges.current = true;
                        }}
                        style={[styles.dayPill, weeklyDay === index && styles.dayPillActive]}
                      >
                        <Text
                          style={[
                            styles.dayPillText,
                            weeklyDay === index && styles.dayPillTextActive,
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    ),
                  )}
                </View>
              </View>
              {/* Time picker */}
              <View style={styles.timeRow}>
                <Text style={styles.timeLabel}>Notification time</Text>
                <DateTimePicker
                  value={weeklyTime}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'compact' : 'default'}
                  onChange={handleWeeklyTimeChange}
                  accentColor={BRAND.colors.mossGreen}
                />
              </View>
            </>
          )}
        </View>

        {/* Day Boundary */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Day Boundary</Text>
          <Text style={styles.cardDescription}>
            Choose when your ritual day resets. Night owls might prefer 3am or later.
          </Text>
          <DayBoundaryPicker
            value={localDayBoundary}
            onChange={(val) => {
              setLocalDayBoundary(val);
              hasChanges.current = true;
            }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  backButton: {
    padding: spacing.xs,
  },
  title: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans-Bold',
    color: BRAND.colors.charcoalInk,
  },
  headerSpacer: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: BRAND.colors.charcoalInk,
  },
  cardDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: colors.text.secondary,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.DEFAULT,
  },
  timeLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: colors.text.secondary,
  },
  dayPickerRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dayPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.gray + '20',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  dayPillActive: {
    backgroundColor: BRAND.colors.mossGreen,
  },
  dayPillText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: colors.text.secondary,
  },
  dayPillTextActive: {
    color: colors.white,
  },
});
