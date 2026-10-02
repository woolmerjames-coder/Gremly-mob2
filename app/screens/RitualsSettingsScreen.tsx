/**
 * Day boundary: when Gremly's day starts over. (The brief, the sweep and every
 * other notification setting live in Settings, under Notifications.)
 * Saves when navigating back.
 */

import React, { useState, useLayoutEffect, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing, borderRadius } from '../../design/tokens';
import { BRAND } from '../../design/brand';
import DayBoundaryPicker from '../../components/settings/DayBoundaryPicker';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useBriefInChat } from '../../lib/brief/flag';

export default function RitualsSettingsScreen() {
  const navigation = useNavigation();
  const briefInChat = useBriefInChat();

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const dayBoundaryHour = useGremlyStore((s) => s.dayBoundaryHour);
  const setDayBoundaryHour = useGremlyStore((s) => s.setDayBoundaryHour);
  const [localDayBoundary, setLocalDayBoundary] = useState(dayBoundaryHour);
  const hasChanges = useRef(false);

  // Save when navigating away
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      if (hasChanges.current && localDayBoundary !== dayBoundaryHour) {
        setDayBoundaryHour(localDayBoundary);
      }
    });
    return unsubscribe;
  }, [navigation, localDayBoundary, dayBoundaryHour, setDayBoundaryHour]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={12}>
          <ChevronLeft size={24} color={BRAND.colors.charcoalInk} />
        </Pressable>
        <Text style={styles.title}>Day boundary</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Day Boundary */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Day Boundary</Text>
          <Text style={styles.cardDescription}>
            {briefInChat
              ? "Choose when your day resets. At this time, today's thread with Gremly moves to your chat history and the next day starts. Night owls might prefer 3am or later."
              : 'Choose when your ritual day resets. Night owls might prefer 3am or later.'}
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
});
