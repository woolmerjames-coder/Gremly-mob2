/**
 * StepGlance — Morning Brief opening card
 *
 * Shows the DCO life context as the first thing the user sees
 * when opening Morning Brief. Warm, contextual, sets the tone
 * for the planning session ahead.
 *
 * Design: sage/cream background, mascot, big headline from DCO,
 * subtle life moment context below. Tap or button to continue.
 */

import React from 'react';
import { View, StyleSheet, TouchableWithoutFeedback, Image } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { selectBriefHeadline, selectLifeMoment, selectDcoTone } from '../../../lib/store/selectors';
import type { DcoTone } from '../../../lib/types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const MORNING_BRIEF_GREMLY = require('../../../assets/mascot/morningbriefgremly.png');

// ─────────────────────────────────────────────────────────────────────────────
// Tone-aware subtitles
// ─────────────────────────────────────────────────────────────────────────────

const TONE_SUBTITLES: Record<DcoTone, string[]> = {
  relaxed: [
    'Keep it light today',
    'No rush. Pick what feels right.',
    'Easy day. Plan accordingly.',
  ],
  focused: ["Let's make today count", 'Clear head, clear plan.', 'Good energy. Use it well.'],
  stretched: [
    'Big day ahead. Be selective.',
    "A lot going on. Let's focus.",
    'Pick the non-negotiables.',
  ],
  recovering: [
    'Gentle start. Just the essentials.',
    "Go easy. You'll find your rhythm.",
    'Small wins today.',
  ],
  celebratory: [
    'Riding high. Keep the momentum.',
    'Great energy to plan with.',
    "Strong week. Let's keep going.",
  ],
};

const FALLBACK_SUBTITLES = [
  "Let's shape your day",
  'What matters most today?',
  'A few minutes now, a calmer day ahead.',
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface StepGlanceProps {
  onContinue: () => void;
  onSkipToEnd: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function StepGlance({ onContinue, onSkipToEnd }: StepGlanceProps) {
  const briefHeadline = useGremlyStore(selectBriefHeadline);
  const lifeMoment = useGremlyStore(selectLifeMoment);
  const tone = useGremlyStore(selectDcoTone);

  // Build display text
  const headline = briefHeadline || 'Good morning';
  const subtitle = tone
    ? pickRandom(TONE_SUBTITLES[tone] || FALLBACK_SUBTITLES)
    : pickRandom(FALLBACK_SUBTITLES);

  return (
    <TouchableWithoutFeedback onPress={onContinue}>
      <View style={styles.container}>
        <View style={styles.content}>
          {/* Mascot */}
          <Animated.View entering={FadeIn.duration(600).delay(150)}>
            <Image source={MORNING_BRIEF_GREMLY} style={styles.mascot} resizeMode="contain" />
          </Animated.View>

          {/* Headline — DCO brief_headline or fallback */}
          <Animated.Text style={styles.headline} entering={FadeIn.duration(600).delay(300)}>
            {headline}
          </Animated.Text>

          {/* Subtitle — tone-aware planning prompt */}
          <Animated.Text style={styles.subtitle} entering={FadeIn.duration(500).delay(500)}>
            {subtitle}
          </Animated.Text>

          {/* Life moment context (if available) */}
          {lifeMoment && (
            <Animated.View style={styles.contextPill} entering={FadeIn.duration(400).delay(700)}>
              <Text style={styles.contextText}>
                {lifeMoment.charAt(0).toUpperCase() + lifeMoment.slice(1)}
              </Text>
            </Animated.View>
          )}
        </View>

        {/* Hint at bottom */}
        <Animated.Text style={styles.hint} entering={FadeIn.duration(400).delay(1200)}>
          tap to start planning
        </Animated.Text>
      </View>
    </TouchableWithoutFeedback>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.colors.creamBase || '#FDFBF7',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 40,
  },
  mascot: {
    width: 120,
    height: 120,
    marginBottom: 24,
  },
  headline: {
    fontSize: 28,
    fontWeight: '700',
    color: BRAND.colors.mossGreen,
    textAlign: 'center',
    lineHeight: 36,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '400',
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  contextPill: {
    backgroundColor: 'rgba(224, 196, 122, 0.2)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(224, 196, 122, 0.4)',
  },
  contextText: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
  },
  hint: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
    fontSize: 14,
    color: BRAND.colors.mossGreen,
    opacity: 0.6,
  },
});

export default StepGlance;
