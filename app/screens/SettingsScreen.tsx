/**
 * SettingsScreen - Full screen for notification and ritual settings
 *
 * Allows users to configure Morning Brief and Evening Sweep notification times,
 * as well as the day boundary for ritual progress tracking.
 */

import React, { useState, useLayoutEffect, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Switch, Pressable, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { ChevronLeft, Brain } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing, borderRadius } from '../../design/tokens';
import { BRAND } from '../../design/brand';
import DayBoundaryPicker from '../../components/settings/DayBoundaryPicker';
import CalendarConnectionsCard from '../../components/settings/CalendarConnectionsCard';
import { TimeBlockSettingsSection } from '../../components/settings/TimeBlockSettingsSection';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useNotificationPreferences } from '../../hooks/useNotificationPreferences';

export default function SettingsScreen() {
  const navigation = useNavigation();

  // Hide default header, we'll make our own
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
    const d = new Date();
    d.setHours(8, 0, 0, 0);
    return d;
  });
  const [eveningEnabled, setEveningEnabled] = useState(notificationPrefs?.eveningEnabled ?? true);
  const [eveningTime, setEveningTime] = useState(() => {
    if (notificationPrefs?.eveningTime) return notificationPrefs.eveningTime;
    const d = new Date();
    d.setHours(20, 0, 0, 0);
    return d;
  });
  const [localDayBoundary, setLocalDayBoundary] = useState(dayBoundaryHour);

  // Track whether user has made any changes
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
    localDayBoundary,
    notificationPrefs,
  ]);

  const handleBack = () => {
    navigation.goBack();
  };

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

  const handleSave = async () => {
    // Save day boundary if changed
    if (localDayBoundary !== dayBoundaryHour) {
      await setDayBoundaryHour(localDayBoundary);
    }
    // Save notification settings
    if (notificationPrefs) {
      await saveNotificationPrefs({
        morningEnabled,
        morningTime,
        eveningEnabled,
        eveningTime,
        timezone: notificationPrefs.timezone,
      });
    }
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backButton} hitSlop={12}>
          <ChevronLeft size={24} color={BRAND.colors.charcoalInk} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Morning Brief */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Morning Brief</Text>
          <View style={styles.row}>
            {morningEnabled ? (
              <DateTimePicker
                value={morningTime}
                mode="time"
                display={Platform.OS === 'ios' ? 'compact' : 'default'}
                onChange={handleMorningTimeChange}
                accentColor={BRAND.colors.mossGreen}
              />
            ) : (
              <Text style={styles.disabledTimeText}>Disabled</Text>
            )}
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
        </View>

        {/* Evening Sweep */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Evening Sweep</Text>
          <View style={styles.row}>
            {eveningEnabled ? (
              <DateTimePicker
                value={eveningTime}
                mode="time"
                display={Platform.OS === 'ios' ? 'compact' : 'default'}
                onChange={handleEveningTimeChange}
                accentColor={BRAND.colors.mossGreen}
              />
            ) : (
              <Text style={styles.disabledTimeText}>Disabled</Text>
            )}
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
        </View>

        {/* Day Boundary */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Day Boundary</Text>
          <Text style={styles.sectionDescription}>
            Choose when your ritual day resets. Night owls might prefer 3am or later.
          </Text>
          <DayBoundaryPicker value={localDayBoundary} onChange={setLocalDayBoundary} />
        </View>

        {/* Time Block Preferences */}
        <TimeBlockSettingsSection />

        {/* Calendar Connections Section */}
        <View style={styles.section}>
          <CalendarConnectionsCard />
        </View>

        {/* What Gremly Knows */}
        <Pressable
          style={styles.settingsRow}
          onPress={() => navigation.navigate('WhatGremlyKnows' as never)}
        >
          <View style={styles.settingsRowLeft}>
            <Brain size={20} color={BRAND.colors.mossGreen} />
            <View style={styles.settingsRowTextContainer}>
              <Text style={styles.settingsRowTitle}>What Gremly Knows</Text>
              <Text style={styles.settingsRowSubtitle}>
                View and edit what Gremly has learned about you
              </Text>
            </View>
          </View>
          <ChevronLeft
            size={20}
            color={colors.text.tertiary}
            style={{ transform: [{ rotate: '180deg' }] }}
          />
        </Pressable>
      </ScrollView>

      {/* Fixed footer outside ScrollView */}
      <View
        style={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: spacing.lg,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border.DEFAULT,
          backgroundColor: colors.cream,
        }}
      >
        <Pressable style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Save</Text>
        </Pressable>
      </View>
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
  section: {
    marginBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: BRAND.colors.charcoalInk,
  },
  sectionDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: colors.text.secondary,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  disabledTimeText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: colors.text.tertiary,
  },
  saveButton: {
    backgroundColor: colors.deepTeal.DEFAULT,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: colors.white,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
  },
  settingsRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingsRowTextContainer: {
    marginLeft: spacing.md,
    flex: 1,
  },
  settingsRowTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: BRAND.colors.charcoalInk,
  },
  settingsRowSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: colors.text.secondary,
    marginTop: 2,
  },
});
