/**
 * GraduationFlow - 4-beat graduation ceremony
 *
 * Renders as a full-screen overlay when pendingGraduation is true.
 * Beat 1: Celebration (confetti + mascot)
 * Beat 2: Generating (weekly summary pipeline)
 * Beat 3: Report (weekly summary cards)
 * Beat 4: The Hook (value props + CTA)
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInUp,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sparkles, TrendingUp, Heart, ArrowRight } from 'lucide-react-native';
import { BRAND } from '../../design/brand';
import { getDateService } from '../../lib/date';
import { format } from 'date-fns';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { triggerSuccess } from '../../lib/haptics';
import celebrationController from '../features/celebration/CelebrationController';
import MascotLottie, { type MascotLottieHandle } from '../components/MascotLottie';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Beat = 'celebration' | 'generating' | 'report' | 'hook';

// ────────────────────────────────────────────────────────────
// Phase text for generating beat
// ────────────────────────────────────────────────────────────

const PHASE_TEXTS = [
  'Reading your drops...',
  'Spotting patterns...',
  'Connecting the dots...',
  'Writing your report...',
];

const PHASE_INTERVAL = 8000;
const GENERATION_TIMEOUT = 120_000;
const POLL_INTERVAL = 5000;

// ────────────────────────────────────────────────────────────
// Colors
// ────────────────────────────────────────────────────────────

const C = {
  mossGreen: BRAND.colors.mossGreen,
  sageMist: BRAND.colors.sageMist,
  charcoalInk: BRAND.colors.charcoalInk,
  inkMuted: BRAND.colors.inkMuted,
  linenCream: BRAND.colors.linenCream,
  surface: BRAND.colors.surface,
  sageDark: '#3A5433',
  sageBody: '#6B8A62',
  trackBg: '#E8EAE2',
  hookBg: '#F7FAF5',
  valueBg: '#EFF3EB',
  valueBorder: '#DDE4D6',
};

// ════════════════════════════════════════════════════════════
// Beat 1: Celebration
// ════════════════════════════════════════════════════════════

function CelebrationBeat({ onAdvance }: { onAdvance: () => void }) {
  const insets = useSafeAreaInsets();
  const mascotRef = useRef<MascotLottieHandle>(null);

  useEffect(() => {
    triggerSuccess();
    celebrationController.celebrate('confetti', { message: 'Training complete' });
    // Trigger mascot celebration animation
    setTimeout(() => mascotRef.current?.celebrateFed(), 300);
  }, []);

  return (
    <View
      style={[
        styles.beatContainer,
        { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={styles.celebrationContent}>
        <View style={styles.mascotLarge}>
          <MascotLottie ref={mascotRef} style={{ width: 200, height: 200 }} />
        </View>

        <Animated.View entering={FadeInUp.delay(400).duration(600)}>
          <Text style={styles.celebrationTitle}>Training complete.</Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(700).duration(600)}>
          <Text style={styles.celebrationSubtitle}>
            Your Gremly knows your brain now. That was the hard part.
          </Text>
        </Animated.View>
      </View>

      <Animated.View entering={FadeInUp.delay(1200).duration(500)} style={styles.ctaContainer}>
        <Pressable style={styles.primaryCta} onPress={onAdvance}>
          <Text style={styles.primaryCtaText}>See what Gremly learned</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// ════════════════════════════════════════════════════════════
// Beat 2: Generating
// ════════════════════════════════════════════════════════════

function GeneratingBeat({
  onReportReady,
  onTimeout,
}: {
  onReportReady: () => void;
  onTimeout: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [timedOut, setTimedOut] = useState(false);

  const fetchWeeklySummaries = useGremlyStore((s) => s.fetchWeeklySummaries);
  const weeklySummaries = useGremlyStore((s) => s.weeklySummaries);
  const initialSummaryCount = useRef(weeklySummaries.length);

  // Indeterminate progress bar animation
  const translateX = useSharedValue(-SCREEN_WIDTH * 0.4);

  useEffect(() => {
    translateX.value = withRepeat(
      withTiming(SCREEN_WIDTH, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
  }, [translateX]);

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Phase text rotation
  useEffect(() => {
    const interval = setInterval(() => {
      setPhaseIndex((prev) => (prev + 1) % PHASE_TEXTS.length);
    }, PHASE_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  // Poll for summary completion
  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        await fetchWeeklySummaries();
      } catch {
        // Ignore fetch errors, keep polling
      }
    };

    // Kick off initial fetch
    poll();

    const interval = setInterval(() => {
      if (active) poll();
    }, POLL_INTERVAL);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [fetchWeeklySummaries]);

  // Check if a new summary appeared
  useEffect(() => {
    if (weeklySummaries.length > initialSummaryCount.current) {
      onReportReady();
    }
  }, [weeklySummaries.length, onReportReady]);

  // Timeout fallback
  useEffect(() => {
    const timer = setTimeout(() => {
      setTimedOut(true);
    }, GENERATION_TIMEOUT);
    return () => clearTimeout(timer);
  }, []);

  if (timedOut) {
    return (
      <View
        style={[
          styles.beatContainer,
          { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <View style={styles.generatingContent}>
          <MascotLottie style={{ width: 120, height: 120 }} />
          <Text style={styles.timeoutTitle}>Gremly needs a moment.</Text>
          <Text style={styles.timeoutBody}>We'll have your report ready soon.</Text>
        </View>
        <View style={styles.ctaContainer}>
          <Pressable style={styles.primaryCta} onPress={onTimeout}>
            <Text style={styles.primaryCtaText}>Continue to app</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.beatContainer,
        { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={styles.generatingContent}>
        <MascotLottie style={{ width: 120, height: 120 }} />

        <Animated.Text key={phaseIndex} entering={FadeIn.duration(400)} style={styles.phaseText}>
          {PHASE_TEXTS[phaseIndex]}
        </Animated.Text>

        {/* Indeterminate progress bar */}
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressSegment, barStyle]} />
        </View>

        <Text style={styles.generatingHint}>This takes a minute or two</Text>
      </View>
    </View>
  );
}

// ════════════════════════════════════════════════════════════
// Beat 3: Report
// ════════════════════════════════════════════════════════════

function ReportBeat({ onAdvance }: { onAdvance: () => void }) {
  const insets = useSafeAreaInsets();
  const weeklySummaries = useGremlyStore((s) => s.weeklySummaries);
  const trainingStartedAt = useGremlyStore((s) => s.trainingStartedAt);

  // Use the most recent summary
  const summary = useMemo(() => {
    if (weeklySummaries.length === 0) return null;
    return weeklySummaries[0]; // Sorted most recent first
  }, [weeklySummaries]);

  // Date range
  const dateRange = useMemo(() => {
    const start = trainingStartedAt ? new Date(trainingStartedAt) : getDateService().now();
    const end = getDateService().now();
    const fmt = (d: Date) => format(d, 'MMM d');
    return `${fmt(start)} - ${fmt(end)}`;
  }, [trainingStartedAt]);

  // Build cards: intro + summary content
  const cards = useMemo(() => {
    const result: Array<{ key: string; type: 'intro' | 'commentary' | 'insight' | 'week_ahead' }> =
      [];
    result.push({ key: 'intro', type: 'intro' });
    if (summary?.content) {
      if (summary.content.weeklyCommentary) {
        result.push({ key: 'commentary', type: 'commentary' });
      }
      if (summary.content.insights) {
        summary.content.insights.forEach((_, i) => {
          result.push({ key: `insight-${i}`, type: 'insight' });
        });
      }
      if (summary.content.weekAhead) {
        result.push({ key: 'week_ahead', type: 'week_ahead' });
      }
    }
    return result;
  }, [summary]);

  const [cardIndex, setCardIndex] = useState(0);
  const isLastCard = cardIndex >= cards.length - 1;

  const handleNext = useCallback(() => {
    if (isLastCard) {
      onAdvance();
    } else {
      setCardIndex((prev) => prev + 1);
    }
  }, [isLastCard, onAdvance]);

  const currentCard = cards[cardIndex];

  const renderCard = () => {
    if (!currentCard) return null;

    if (currentCard.type === 'intro') {
      return (
        <View style={styles.reportCard}>
          <MascotLottie style={{ width: 80, height: 80 }} />
          <Text style={styles.reportIntroTitle}>Your first week with Gremly</Text>
          <Text style={styles.reportDateRange}>{dateRange}</Text>
          <Text style={styles.reportIntroBody}>
            Here's what Gremly learned from a week inside your brain.
          </Text>
        </View>
      );
    }

    if (currentCard.type === 'commentary' && summary?.content?.weeklyCommentary) {
      return (
        <View style={styles.reportCard}>
          <Text style={styles.reportSectionTitle}>Week in Review</Text>
          <Text style={styles.reportBody}>{summary.content.weeklyCommentary}</Text>
          {summary.content.keyThemes && summary.content.keyThemes.length > 0 && (
            <View style={styles.themesRow}>
              {summary.content.keyThemes.map((theme, i) => (
                <View key={i} style={styles.themeBadge}>
                  <Text style={styles.themeBadgeText}>{theme}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      );
    }

    if (currentCard.type === 'insight' && summary?.content?.insights) {
      const insightIndex = parseInt(currentCard.key.split('-')[1], 10);
      const insight = summary.content.insights[insightIndex];
      if (!insight) return null;
      return (
        <View style={styles.reportCard}>
          <Text style={styles.reportInsightHeadline}>{insight.headline}</Text>
          <Text style={styles.reportBody}>{insight.body}</Text>
        </View>
      );
    }

    if (currentCard.type === 'week_ahead' && summary?.content?.weekAhead) {
      return (
        <View style={styles.reportCard}>
          <Text style={styles.reportSectionTitle}>Week Ahead</Text>
          <Text style={styles.reportBody}>{summary.content.weekAhead.introduction}</Text>
        </View>
      );
    }

    return null;
  };

  return (
    <View
      style={[
        styles.beatContainer,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      {/* Card counter */}
      <Text style={styles.cardCounter}>
        {cardIndex + 1} of {cards.length}
      </Text>

      <ScrollView
        style={styles.reportScroll}
        contentContainerStyle={styles.reportScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View key={currentCard?.key} entering={FadeIn.duration(300)}>
          {renderCard()}
        </Animated.View>
      </ScrollView>

      <View style={styles.ctaContainer}>
        <Pressable style={styles.primaryCta} onPress={handleNext}>
          <Text style={styles.primaryCtaText}>{isLastCard ? 'Continue' : 'Next'}</Text>
          <ArrowRight size={16} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

// ════════════════════════════════════════════════════════════
// Beat 4: The Hook
// ════════════════════════════════════════════════════════════

const VALUE_PROPS = [
  {
    Icon: Sparkles,
    text: 'Weekly insights that get sharper over time',
  },
  {
    Icon: TrendingUp,
    text: 'Patterns spotted across weeks, not just days',
  },
  {
    Icon: Heart,
    text: 'A companion that actually knows your life',
  },
];

function HookBeat({ onDismiss }: { onDismiss: () => void }) {
  const insets = useSafeAreaInsets();
  const [showDismissText, setShowDismissText] = useState(false);
  const trainingStartedAt = useGremlyStore((s) => s.trainingStartedAt);

  // Calculate trial days remaining (if applicable)
  const [trialDaysLeft, setTrialDaysLeft] = useState(7);
  useEffect(() => {
    if (!trainingStartedAt) return;
    const started = new Date(trainingStartedAt).getTime();
    const trialEnd = started + 8 * 24 * 60 * 60 * 1000; // 8-day trial (7 challenge + 1 grace)
    const remaining = Math.max(
      0,
      Math.ceil((trialEnd - getDateService().now().getTime()) / (1000 * 60 * 60 * 24)),
    );
    setTrialDaysLeft(remaining);
  }, [trainingStartedAt]);

  const handleMaybeLater = useCallback(() => {
    if (showDismissText) {
      onDismiss();
    } else {
      setShowDismissText(true);
    }
  }, [showDismissText, onDismiss]);

  return (
    <View
      style={[
        styles.hookContainer,
        { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={styles.hookContent}>
        <Animated.View entering={FadeInUp.delay(200).duration(500)}>
          <Text style={styles.hookTitle}>The hard part's done.</Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(500).duration(500)}>
          <Text style={styles.hookSubtitle}>
            You taught Gremly how your brain works. Now just keep dropping thoughts. That's it.
            Gremly handles the rest.
          </Text>
        </Animated.View>

        {/* Value props */}
        <View style={styles.valuePropsContainer}>
          {VALUE_PROPS.map((prop, i) => (
            <Animated.View
              key={i}
              entering={FadeInUp.delay(800 + i * 200).duration(400)}
              style={styles.valueProp}
            >
              <View style={styles.valuePropIcon}>
                <prop.Icon size={18} color={C.sageDark} />
              </View>
              <Text style={styles.valuePropText}>{prop.text}</Text>
            </Animated.View>
          ))}
        </View>
      </View>

      <View style={styles.hookCtaContainer}>
        <Pressable style={styles.primaryCta} onPress={onDismiss}>
          <Text style={styles.primaryCtaText}>Keep going together</Text>
        </Pressable>

        <Pressable style={styles.secondaryCta} onPress={handleMaybeLater}>
          <Text style={styles.secondaryCtaText}>Maybe later</Text>
        </Pressable>

        {showDismissText && (
          <Animated.View entering={FadeIn.duration(300)}>
            <Text style={styles.trialText}>
              Your trial ends in {trialDaysLeft} days. After that, Gremly goes to sleep until you
              come back.
            </Text>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

// ════════════════════════════════════════════════════════════
// Main Component
// ════════════════════════════════════════════════════════════

interface GraduationFlowProps {
  visible: boolean;
  onComplete: () => void;
}

export default function GraduationFlow({ visible, onComplete }: GraduationFlowProps) {
  const [beat, setBeat] = useState<Beat>('celebration');

  // Reset beat when flow opens
  useEffect(() => {
    if (visible) {
      setBeat('celebration');
    }
  }, [visible]);

  const handleCelebrationAdvance = useCallback(() => {
    setBeat('generating');
  }, []);

  const handleReportReady = useCallback(() => {
    setBeat('report');
  }, []);

  const handleGenerationTimeout = useCallback(() => {
    onComplete();
  }, [onComplete]);

  const handleReportAdvance = useCallback(() => {
    setBeat('hook');
  }, []);

  const handleDismiss = useCallback(() => {
    onComplete();
  }, [onComplete]);

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen">
      {beat === 'celebration' && <CelebrationBeat onAdvance={handleCelebrationAdvance} />}
      {beat === 'generating' && (
        <GeneratingBeat onReportReady={handleReportReady} onTimeout={handleGenerationTimeout} />
      )}
      {beat === 'report' && <ReportBeat onAdvance={handleReportAdvance} />}
      {beat === 'hook' && <HookBeat onDismiss={handleDismiss} />}
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════
// Styles
// ════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  // Shared beat container
  beatContainer: {
    flex: 1,
    backgroundColor: C.surface,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },

  // ── Beat 1: Celebration ──
  celebrationContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mascotLarge: {
    marginBottom: 32,
  },
  celebrationTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: C.charcoalInk,
    fontFamily: BRAND.typography.subhead.fontFamily,
    textAlign: 'center',
    marginBottom: 10,
  },
  celebrationSubtitle: {
    fontSize: 15,
    color: C.inkMuted,
    fontFamily: BRAND.typography.body.fontFamily,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },

  // ── CTAs ──
  ctaContainer: {
    paddingTop: 16,
  },
  primaryCta: {
    backgroundColor: C.mossGreen,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryCtaText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: BRAND.typography.subhead.fontFamily,
  },

  // ── Beat 2: Generating ──
  generatingContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phaseText: {
    fontSize: 17,
    fontWeight: '500',
    color: C.charcoalInk,
    fontFamily: BRAND.typography.bodyMedium.fontFamily,
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 24,
  },
  progressTrack: {
    width: '80%',
    height: 3,
    backgroundColor: C.trackBg,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressSegment: {
    width: '30%',
    height: 3,
    backgroundColor: C.mossGreen,
    borderRadius: 2,
  },
  generatingHint: {
    fontSize: 13,
    color: C.inkMuted,
    fontFamily: BRAND.typography.body.fontFamily,
  },
  timeoutTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: C.charcoalInk,
    fontFamily: BRAND.typography.subhead.fontFamily,
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 8,
  },
  timeoutBody: {
    fontSize: 15,
    color: C.inkMuted,
    fontFamily: BRAND.typography.body.fontFamily,
    textAlign: 'center',
  },

  // ── Beat 3: Report ──
  cardCounter: {
    fontSize: 12,
    color: C.inkMuted,
    fontFamily: BRAND.typography.body.fontFamily,
    textAlign: 'center',
    marginBottom: 8,
  },
  reportScroll: {
    flex: 1,
  },
  reportScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  reportCard: {
    backgroundColor: '#FEFDFB',
    borderRadius: BRAND.radius.xl,
    padding: 24,
    alignItems: 'center',
    ...BRAND.elevation.two,
  },
  reportIntroTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: C.charcoalInk,
    fontFamily: BRAND.typography.subhead.fontFamily,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 6,
  },
  reportDateRange: {
    fontSize: 13,
    color: C.inkMuted,
    fontFamily: BRAND.typography.body.fontFamily,
    marginBottom: 12,
  },
  reportIntroBody: {
    fontSize: 15,
    color: C.inkMuted,
    fontFamily: BRAND.typography.body.fontFamily,
    textAlign: 'center',
    lineHeight: 22,
  },
  reportSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#A8AC9F',
    fontFamily: BRAND.typography.bodyMedium.fontFamily,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  reportBody: {
    fontSize: 15,
    color: C.charcoalInk,
    fontFamily: BRAND.typography.body.fontFamily,
    lineHeight: 22,
    alignSelf: 'flex-start',
  },
  reportInsightHeadline: {
    fontSize: 17,
    fontWeight: '600',
    color: C.charcoalInk,
    fontFamily: BRAND.typography.subhead.fontFamily,
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  themesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
    alignSelf: 'flex-start',
  },
  themeBadge: {
    backgroundColor: '#EFF3EB',
    borderRadius: BRAND.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  themeBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: C.sageDark,
    fontFamily: BRAND.typography.bodyMedium.fontFamily,
  },

  // ── Beat 4: Hook ──
  hookContainer: {
    flex: 1,
    backgroundColor: C.hookBg,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  hookContent: {
    flex: 1,
    justifyContent: 'center',
  },
  hookTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: C.charcoalInk,
    fontFamily: BRAND.typography.subhead.fontFamily,
    marginBottom: 12,
  },
  hookSubtitle: {
    fontSize: 15,
    color: C.inkMuted,
    fontFamily: BRAND.typography.body.fontFamily,
    lineHeight: 22,
    marginBottom: 28,
  },
  valuePropsContainer: {
    gap: 14,
  },
  valueProp: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.valueBg,
    borderWidth: 1,
    borderColor: C.valueBorder,
    borderRadius: BRAND.radius.md,
    padding: 14,
    gap: 12,
  },
  valuePropIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: 'rgba(191,216,192,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  valuePropText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: C.charcoalInk,
    fontFamily: BRAND.typography.bodyMedium.fontFamily,
    lineHeight: 20,
  },
  hookCtaContainer: {
    gap: 12,
    alignItems: 'center',
  },
  secondaryCta: {
    paddingVertical: 8,
  },
  secondaryCtaText: {
    fontSize: 14,
    color: C.inkMuted,
    fontFamily: BRAND.typography.body.fontFamily,
  },
  trialText: {
    fontSize: 12,
    color: C.inkMuted,
    fontFamily: BRAND.typography.body.fontFamily,
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: 12,
    marginTop: 4,
  },
});
