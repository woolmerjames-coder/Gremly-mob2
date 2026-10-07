/**
 * The banner that says a new weekly summary is ready. It decides for itself
 * whether to show (store selectors), and sits on Today (NowScreenV1), Drop
 * (CatchAllNotepad) and the Hub.
 *
 * On Today it also carries Plan your week on their weekly day, until the
 * review is done (lib/week/review/state weekCardToday): a button on the banner
 * while the summary is waiting, and a card of its own in the same place once
 * it is not, so there is never a second card.
 */

import React from 'react';
import { Text, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { CalendarRange, ChevronRight, X, Sparkles } from 'lucide-react-native';
import { useGremlyStore } from '../lib/store/useGremlyStore';
import { useShouldShowSummaryBanner, useCurrentWeekSummary } from '../lib/store/selectors';
import { BRAND } from '../design/brand';

const SAGE_DARK = '#2E5540';
const LINEN = '#F9F6F1';

interface Props {
  /** Plan your week, when Today leads with it: its words, and what a tap opens */
  planWeek?: { label: string; note: string; onPress: () => void } | null;
}

export default function WeeklySummaryBanner({ planWeek = null }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const shouldShow = useShouldShowSummaryBanner();
  const currentSummary = useCurrentWeekSummary();
  const dismissBanner = useGremlyStore((state) => state.dismissSummaryBanner);

  if (!shouldShow || !currentSummary) {
    if (!planWeek) return null;
    // no summary waiting: Plan your week is the card
    return (
      <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)}>
        <Pressable
          style={({ pressed }) => [
            bannerStyles.container,
            bannerStyles.card,
            pressed && { opacity: 0.7 },
          ]}
          onPress={planWeek.onPress}
          accessibilityRole="button"
          accessibilityLabel={planWeek.label}
          testID="plan-week-card"
        >
          <View style={bannerStyles.row}>
            <CalendarRange size={20} color={SAGE_DARK} strokeWidth={1.5} />
            <View style={bannerStyles.words}>
              <Text style={bannerStyles.title}>{planWeek.label}</Text>
              <Text style={bannerStyles.note}>{planWeek.note}</Text>
            </View>
            <ChevronRight size={18} color={SAGE_DARK} style={bannerStyles.chevron} />
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  // The summary, its X and Plan your week are three buttons side by side, none
  // inside another, so each can be reached with VoiceOver and TalkBack
  return (
    <Animated.View
      entering={FadeIn.duration(250)}
      exiting={FadeOut.duration(200)}
      style={bannerStyles.container}
    >
      <View style={bannerStyles.row}>
        <Pressable
          style={({ pressed }) => [bannerStyles.summary, pressed && { opacity: 0.7 }]}
          onPress={() => {
            navigation.navigate('WeeklySummary', {
              weekStartDate: currentSummary.week_start_date,
            });
          }}
          accessibilityRole="button"
          testID="summary-banner-open"
        >
          <Sparkles size={20} color={SAGE_DARK} strokeWidth={1.5} />
          <Text style={bannerStyles.text}>Your week in review is ready</Text>
          <ChevronRight size={18} color={SAGE_DARK} style={bannerStyles.chevron} />
        </Pressable>
        <Pressable
          onPress={() => dismissBanner(currentSummary.id)}
          hitSlop={8}
          style={bannerStyles.dismissButton}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          testID="summary-banner-dismiss"
        >
          <X size={16} color="rgba(46, 85, 64, 0.4)" />
        </Pressable>
      </View>
      {planWeek ? (
        <Pressable
          onPress={planWeek.onPress}
          hitSlop={6}
          style={({ pressed }) => [bannerStyles.planButton, pressed && { opacity: 0.8 }]}
          accessibilityRole="button"
          accessibilityLabel={planWeek.label}
          testID="summary-banner-plan-week"
        >
          <CalendarRange size={15} color={LINEN} strokeWidth={2} />
          <Text style={bannerStyles.planButtonText}>{planWeek.label}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const bannerStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    backgroundColor: 'rgba(191, 216, 192, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(191, 216, 192, 0.3)',
    borderRadius: BRAND.radius.lg,
  },
  // the card on its own is one button, so the padding is its own
  card: {
    paddingVertical: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // the summary's part of the banner: the padding is inside it, so the whole strip opens the summary
  summary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  text: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    color: SAGE_DARK,
    marginLeft: 12,
  },
  words: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: SAGE_DARK,
  },
  note: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(46, 85, 64, 0.75)',
    marginTop: 2,
  },
  chevron: {
    opacity: 0.5,
    marginLeft: 4,
  },
  dismissButton: {
    marginLeft: 8,
    padding: 4,
  },
  planButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginLeft: 32,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: SAGE_DARK,
  },
  planButtonText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: LINEN,
  },
});
