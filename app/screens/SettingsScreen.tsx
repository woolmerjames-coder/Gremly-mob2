/**
 * SettingsScreen - Clean menu list for app settings
 *
 * Each row navigates to a dedicated sub-screen.
 * Replaces the previous single-page scrolling settings.
 *
 * Settings V2 (Feb 2026)
 */

import React, { useLayoutEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft, ChevronRight, Bell, Clock, CalendarDays, Brain } from 'lucide-react-native';
import { colors, spacing, borderRadius } from '../../design/tokens';
import { BRAND } from '../../design/brand';

type SettingsRow = {
  key: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  route: string;
};

const ICON_SIZE = 20;

export default function SettingsScreen() {
  const navigation = useNavigation();

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const rows: SettingsRow[] = [
    {
      key: 'rituals',
      icon: <Bell size={ICON_SIZE} color={BRAND.colors.mossGreen} />,
      title: 'Rituals',
      subtitle: 'Morning Brief, Evening Sweep, Day Boundary',
      route: 'RitualsSettings',
    },
    {
      key: 'time-blocks',
      icon: <Clock size={ICON_SIZE} color={BRAND.colors.mossGreen} />,
      title: 'Time Blocks',
      subtitle: 'Morning, Afternoon, Evening ranges',
      route: 'TimeBlocksSettings',
    },
    {
      key: 'calendar',
      icon: <CalendarDays size={ICON_SIZE} color={BRAND.colors.mossGreen} />,
      title: 'Calendar Connections',
      subtitle: 'Outlook, Google, Calendar links',
      route: 'CalendarSettings',
    },
    {
      key: 'gremly-knows',
      icon: <Brain size={ICON_SIZE} color={BRAND.colors.mossGreen} />,
      title: 'What Gremly Knows',
      subtitle: 'View and edit what Gremly has learned about you',
      route: 'WhatGremlyKnows',
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header — matches existing pattern exactly */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={12}>
          <ChevronLeft size={24} color={BRAND.colors.charcoalInk} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Menu list */}
      <View style={styles.list}>
        {rows.map((row, index) => (
          <Pressable
            key={row.key}
            style={({ pressed }) => [
              styles.row,
              index === rows.length - 1 && styles.rowLast,
              pressed && styles.rowPressed,
            ]}
            onPress={() => navigation.navigate(row.route as never)}
          >
            <View style={styles.rowIcon}>{row.icon}</View>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>{row.title}</Text>
              <Text style={styles.rowSubtitle}>{row.subtitle}</Text>
            </View>
            <ChevronRight size={18} color={colors.text.tertiary} />
          </Pressable>
        ))}
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
  list: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.DEFAULT,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowPressed: {
    backgroundColor: colors.cream,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: `${BRAND.colors.sageMist}40`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  rowContent: {
    flex: 1,
    marginRight: spacing.sm,
  },
  rowTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: BRAND.colors.charcoalInk,
  },
  rowSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: colors.text.secondary,
    marginTop: 2,
  },
});
