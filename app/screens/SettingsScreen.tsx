/**
 * SettingsScreen - Clean menu list for app settings
 *
 * Each row navigates to a dedicated sub-screen.
 * Replaces the previous single-page scrolling settings.
 *
 * Settings V2 (Feb 2026)
 */

import React, { useLayoutEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  ChevronLeft,
  ChevronRight,
  Bell,
  Clock,
  CalendarDays,
  Brain,
  Palette,
  Crown,
} from 'lucide-react-native';
import { colors, spacing, borderRadius } from '../../design/tokens';
import { BRAND } from '../../design/brand';
import { generateWeeklySummary } from '../../lib/weeklySummary';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useCurrentWeekSummary } from '../../lib/store/selectors';
import { GREMLY_PALETTES, getPaletteById } from '../../lib/constants/gremlyPalettes';
import { useSubscriptionStatus } from '../../lib/subscriptions/useSubscriptionStatus';

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
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const currentSummary = useCurrentWeekSummary();
  const gremlyColor = useGremlyStore((s) => s.gremlyColor);
  const setGremlyColor = useGremlyStore((s) => s.setGremlyColor);
  const currentPalette = getPaletteById(gremlyColor) ?? GREMLY_PALETTES[0];
  const { isSubscribed, isTrialActive } = useSubscriptionStatus();

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const handleGenerateWeeklySummary = async () => {
    setWeeklyLoading(true);
    try {
      const result = await generateWeeklySummary();
      if (result.success) {
        Alert.alert(
          'Weekly Summary Generated',
          `Commentary: ${result.summary?.content?.weeklyCommentary?.substring(0, 100)}...`,
        );
        console.log('[Dev] Weekly Summary result:', JSON.stringify(result.summary, null, 2));
      } else {
        Alert.alert('Generation Failed', result.error || 'Unknown error');
      }
    } catch (err) {
      Alert.alert('Error', String(err));
    } finally {
      setWeeklyLoading(false);
    }
  };

  const handleDebugWeeklySummary = () => {
    const state = useGremlyStore.getState();
    const count = state.weeklySummaries?.length ?? 0;
    console.log('[Dev] Weekly Summaries in store:', count);
    if (count > 0) {
      console.log('[Dev] Current week summary:', JSON.stringify(state.weeklySummaries[0], null, 2));
    }
    Alert.alert('Weekly Summary Data', `${count} summaries in store. Check console for details.`);
  };

  const premiumSubtitle = isSubscribed
    ? 'Active'
    : isTrialActive
      ? '7-day Training Challenge active'
      : 'Upgrade to continue';

  const handlePremiumPress = () => {
    if (isSubscribed) {
      Linking.openURL('https://apps.apple.com/account/subscriptions');
    } else {
      navigation.navigate('TrialEndPaywall' as never, { source: 'settings' } as never);
    }
  };

  const rows: SettingsRow[] = [
    {
      key: 'premium',
      icon: <Crown size={ICON_SIZE} color={BRAND.colors.mossGreen} />,
      title: 'Gremly Premium',
      subtitle: premiumSubtitle,
      route: '',
    },
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
    {
      key: 'gremly-color',
      icon: <Palette size={ICON_SIZE} color={BRAND.colors.mossGreen} />,
      title: 'Gremly color',
      subtitle: currentPalette.name,
      route: '',
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
            onPress={() => {
              if (row.key === 'premium') {
                handlePremiumPress();
              } else if (row.key === 'gremly-color') {
                Alert.alert('Choose a color', '', [
                  ...GREMLY_PALETTES.map((p) => ({
                    text: p.name,
                    onPress: () => setGremlyColor(p.id),
                  })),
                  { text: 'Cancel', style: 'cancel' as const },
                ]);
              } else {
                navigation.navigate(row.route as never);
              }
            }}
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

      {/* Dev tools — only in __DEV__ */}
      {__DEV__ && (
        <View style={styles.devSection}>
          <Text style={styles.devSectionTitle}>Dev Tools</Text>
          <View style={styles.devCard}>
            <Pressable
              onPress={handleGenerateWeeklySummary}
              disabled={weeklyLoading}
              style={({ pressed }) => [
                styles.devRow,
                pressed && styles.rowPressed,
                weeklyLoading && styles.devRowDisabled,
              ]}
            >
              {weeklyLoading ? (
                <ActivityIndicator
                  size="small"
                  color={BRAND.colors.mossGreen}
                  style={{ marginRight: spacing.sm }}
                />
              ) : null}
              <Text style={styles.devRowText}>
                {weeklyLoading ? 'Generating...' : '🧪 Generate Weekly Summary'}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleDebugWeeklySummary}
              style={({ pressed }) => [styles.devRow, pressed && styles.rowPressed]}
            >
              <Text style={styles.devRowText}>🔍 View Weekly Summary Data</Text>
            </Pressable>
            <Pressable
              onPress={() => (navigation as any).navigate('WeeklySummary')}
              style={({ pressed }) => [styles.devRow, styles.rowLast, pressed && styles.rowPressed]}
            >
              <Text style={styles.devRowText}>
                📊 Open Weekly Summary Screen
                {currentSummary ? ` (${currentSummary.week_start_date})` : ' (none)'}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
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
  devSection: {
    marginTop: spacing.xl,
    marginHorizontal: spacing.lg,
  },
  devSectionTitle: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  devCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    overflow: 'hidden',
  },
  devRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.DEFAULT,
  },
  devRowDisabled: {
    opacity: 0.6,
  },
  devRowText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    color: BRAND.colors.charcoalInk,
  },
});
