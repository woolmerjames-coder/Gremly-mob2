/**
 * WeeklySummaryBanner — Nudge banner shown when a new weekly summary is available.
 *
 * Self-manages visibility via store selectors. Renders on NowScreenV1,
 * CatchAllNotepad (MindDrop), and HubScreen.
 */

import React from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { ChevronRight, X, Sparkles } from 'lucide-react-native';
import { useGremlyStore } from '../lib/store/useGremlyStore';
import { useShouldShowSummaryBanner, useCurrentWeekSummary } from '../lib/store/selectors';
import { BRAND } from '../design/brand';

const SAGE_DARK = '#2E5540';

export default function WeeklySummaryBanner() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const shouldShow = useShouldShowSummaryBanner();
  const currentSummary = useCurrentWeekSummary();
  const dismissBanner = useGremlyStore((state) => state.dismissSummaryBanner);

  if (!shouldShow || !currentSummary) return null;

  return (
    <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)}>
      <Pressable
        style={({ pressed }) => [bannerStyles.container, pressed && { opacity: 0.7 }]}
        onPress={() => {
          navigation.navigate('WeeklySummary', {
            weekStartDate: currentSummary.week_start_date,
          });
        }}
      >
        <Sparkles size={20} color={SAGE_DARK} strokeWidth={1.5} />
        <Text style={bannerStyles.text}>Your week in review is ready</Text>
        <ChevronRight size={18} color={SAGE_DARK} style={bannerStyles.chevron} />
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            dismissBanner(currentSummary.id);
          }}
          hitSlop={8}
          style={bannerStyles.dismissButton}
        >
          <X size={16} color="rgba(46, 85, 64, 0.4)" />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const bannerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    backgroundColor: 'rgba(191, 216, 192, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(191, 216, 192, 0.3)',
    borderRadius: BRAND.radius.lg,
  },
  text: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    color: SAGE_DARK,
    marginLeft: 12,
  },
  chevron: {
    opacity: 0.5,
    marginLeft: 4,
  },
  dismissButton: {
    marginLeft: 8,
    padding: 4,
  },
});
