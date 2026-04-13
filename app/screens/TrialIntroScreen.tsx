/**
 * TrialIntroScreen - Shown after onboarding, before Training Challenge begins.
 */

import React, { useCallback } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Path, Rect, Line } from 'react-native-svg';
import { Text } from '../../ui';
import { BRAND } from '../../design/brand';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import MascotLottie from '../components/MascotLottie';

const FEATURES = [
  {
    icon: 'plus',
    title: 'Clear your head',
    subtitle: "Drop your thoughts and I'll sort them",
  },
  {
    icon: 'calendar',
    title: 'Stay on top of what matters',
    subtitle: "I'll organize your day and keep you on track",
  },
  {
    icon: 'document',
    title: 'Get a weekly summary of your life',
    subtitle: 'Everything you shared, reflected back',
  },
] as const;

function FeatureIcon({ type }: { type: 'plus' | 'calendar' | 'document' }) {
  const color = BRAND.colors.mossGreen;
  if (type === 'plus') {
    return (
      <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
        <Path d="M9 3v12M3 9h12" stroke={color} strokeWidth={2} strokeLinecap="round" />
      </Svg>
    );
  }
  if (type === 'calendar') {
    return (
      <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
        <Rect x={2} y={3} width={14} height={13} rx={2} stroke={color} strokeWidth={1.5} />
        <Line x1={2} y1={7} x2={16} y2={7} stroke={color} strokeWidth={1.5} />
        <Line
          x1={6}
          y1={1.5}
          x2={6}
          y2={4.5}
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
        <Line
          x1={12}
          y1={1.5}
          x2={12}
          y2={4.5}
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </Svg>
    );
  }
  // document
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
      <Rect x={3} y={1.5} width={12} height={15} rx={2} stroke={color} strokeWidth={1.5} />
      <Line x1={6} y1={6} x2={12} y2={6} stroke={color} strokeWidth={1.2} strokeLinecap="round" />
      <Line x1={6} y1={9} x2={12} y2={9} stroke={color} strokeWidth={1.2} strokeLinecap="round" />
      <Line x1={6} y1={12} x2={10} y2={12} stroke={color} strokeWidth={1.2} strokeLinecap="round" />
    </Svg>
  );
}

export default function TrialIntroScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const markOnboardingComplete = useGremlyStore((s) => s.markOnboardingComplete);
  const startTraining = useGremlyStore((s) => s.startTraining);

  const handleStart = useCallback(async () => {
    await markOnboardingComplete();
    await startTraining();
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'Tabs' }],
      }),
    );
  }, [navigation, markOnboardingComplete, startTraining]);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Content */}
      <View style={styles.content}>
        {/* Mascot */}
        <View style={styles.mascotContainer}>
          <View style={{ transform: [{ scale: 2 }] }}>
            <MascotLottie showFullColor />
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title} maxFontSizeMultiplier={1.3}>
          The 7-day Gremly challenge
        </Text>

        {/* Subtitle */}
        <Text style={styles.subtitle}>Feed your Gremly 7 days in a row</Text>

        {/* Trial note */}
        <Text style={styles.trialNote}>Your free trial - no card needed</Text>

        {/* Feature rows */}
        <View style={styles.featureList}>
          {FEATURES.map((feature) => (
            <View key={feature.icon} style={styles.featureRow}>
              <View style={styles.featureIconContainer}>
                <FeatureIcon type={feature.icon} />
              </View>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureSubtitle}>{feature.subtitle}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Bottom button */}
      <View style={[styles.bottomContainer, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <Pressable style={styles.primaryButton} onPress={handleStart} accessibilityRole="button">
          <Text style={styles.primaryButtonText}>Let's do this</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAF8',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  mascotContainer: {
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    marginBottom: 16,
  },
  title: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 28,
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 36,
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 17,
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
    marginBottom: 6,
  },
  trialNote: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    marginBottom: 28,
  },
  featureList: {
    width: '100%',
    gap: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: BRAND.colors.mossGreen + '1F',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    color: BRAND.colors.charcoalInk,
    marginBottom: 2,
  },
  featureSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: BRAND.colors.inkMuted,
  },
  bottomContainer: {
    paddingHorizontal: 32,
  },
  primaryButton: {
    backgroundColor: BRAND.colors.mossGreen,
    paddingVertical: 16,
    borderRadius: BRAND.radius.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 17,
    color: '#FFFFFF',
  },
});
