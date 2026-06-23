import React from 'react';
import { View, Text, Image, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { StyleProp, ViewStyle } from 'react-native';
import LottieView from 'lottie-react-native';
import { v07 } from './tokens';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const MASCOT_IDLE = require('../../../../assets/lottie/character1_A.json');

// ── SummaryCard ────────────────────────────────────────────────────────────

interface SummaryCardProps {
  children: React.ReactNode;
  center?: boolean;
  noPadding?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function SummaryCard({ children, center, noPadding, style }: SummaryCardProps) {
  return (
    <View
      style={[styles.card, center && styles.cardCenter, noPadding && styles.cardNoPadding, style]}
    >
      {children}
    </View>
  );
}

// ── Eyebrow ────────────────────────────────────────────────────────────────

interface EyebrowProps {
  label: string;
  icon?: React.ReactNode;
}

export function Eyebrow({ label, icon }: EyebrowProps) {
  return (
    <View style={styles.eyebrowRow}>
      {icon}
      <Text style={styles.eyebrowText}>{label}</Text>
    </View>
  );
}

// ── Headline ───────────────────────────────────────────────────────────────

interface HeadlineProps {
  children: React.ReactNode;
  size?: 'default' | 'hero' | 'timeline';
  style?: StyleProp<ViewStyle>;
}

export function Headline({ children, size = 'default', style }: HeadlineProps) {
  return (
    <Text
      style={[
        styles.headline,
        size === 'hero' && styles.headlineHero,
        size === 'timeline' && styles.headlineTimeline,
        style as StyleProp<ViewStyle>,
      ]}
    >
      {children}
    </Text>
  );
}

// ── PhotoBacker ────────────────────────────────────────────────────────────

type PhotoTone = 'overcast' | 'reflective' | 'warm';

const GRADIENT_CONFIGS: Record<
  PhotoTone,
  { colors: string[]; start: { x: number; y: number }; end: { x: number; y: number } }
> = {
  overcast: {
    colors: ['#9aa8a0', '#6f8079', '#45534c'],
    start: { x: 0.3, y: 0 },
    end: { x: 0.7, y: 1 },
  },
  reflective: {
    colors: ['#8b9ba2', '#5d6f73', '#3a4749'],
    start: { x: 0.7, y: 0.2 },
    end: { x: 0.3, y: 1 },
  },
  warm: {
    colors: ['#c8a877', '#9c7d4f', '#5e4a2e'],
    start: { x: 0.3, y: 0 },
    end: { x: 0.7, y: 1 },
  },
};

interface PhotoBackerProps {
  imageUrl?: string;
  tone: PhotoTone;
  style: StyleProp<ViewStyle>;
}

export function PhotoBacker({ imageUrl, tone, style }: PhotoBackerProps) {
  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[style, { resizeMode: 'cover' }] as StyleProp<any>}
      />
    );
  }

  const cfg = GRADIENT_CONFIGS[tone];
  return (
    <LinearGradient
      colors={cfg.colors as [string, string, ...string[]]}
      start={cfg.start}
      end={cfg.end}
      style={style}
    />
  );
}

// ── GremlyMascot ───────────────────────────────────────────────────────────

interface GremlyMascotProps {
  size: number;
  level?: number;
  showLevel?: boolean;
}

export function GremlyMascot({ size, level, showLevel }: GremlyMascotProps) {
  return (
    <View style={{ width: size, height: size }}>
      <LottieView source={MASCOT_IDLE} autoPlay loop style={{ width: size, height: size }} />
      {showLevel && level !== undefined && (
        <View style={styles.levelBadge}>
          <Text style={styles.levelBadgeText}>Lv {level}</Text>
        </View>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: v07.color.linen,
    borderRadius: v07.card.radius,
    paddingTop: v07.card.padTop,
    paddingLeft: v07.card.padX,
    paddingRight: v07.card.padX,
    paddingBottom: v07.card.padBottom,
    minHeight: v07.card.minHeight,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 18 },
      },
      android: {
        elevation: 8,
      },
    }),
  },
  cardCenter: {
    justifyContent: 'center',
  },
  cardNoPadding: {
    paddingTop: 0,
    paddingLeft: 0,
    paddingRight: 0,
    paddingBottom: 0,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 16,
  },
  eyebrowText: {
    fontFamily: v07.font.uiBold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: v07.color.moss,
  },
  headline: {
    fontFamily: v07.font.displayMedium,
    fontWeight: '500',
    fontSize: 25,
    lineHeight: 30,
    letterSpacing: -0.3,
    color: v07.color.mossDeep,
  },
  headlineHero: {
    fontSize: 26,
    lineHeight: 32,
  },
  headlineTimeline: {
    fontSize: 21,
    lineHeight: 27,
  },
  levelBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: v07.color.golden,
    borderRadius: 9,
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
  levelBadgeText: {
    fontFamily: v07.font.ui,
    fontSize: 10,
    fontWeight: '700',
    color: v07.color.mossDeep,
  },
});
