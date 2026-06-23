/**
 * WeeklySummaryV2Screen — Life Map powered weekly summary with flexible card schema.
 *
 * Horizontal paginated flow driven by WSV2Card[] from the backend.
 * Same warm WS palette as v1, new card types rendered per-type.
 *
 * Phase 1 — Shell + FlatList + placeholder card renderers.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import Animated, {
  FadeIn,
  FadeInUp,
  FadeInDown,
  FadeOutLeft,
  Layout,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import {
  X,
  ChevronRight,
  ChevronLeft,
  Check,
  MapPin,
  Timer,
  Dumbbell,
  Heart,
  Code,
  Wine,
  Brain,
  Activity,
  Pause,
  Flag,
  Star,
  Sparkles,
  Calendar,
  Plane,
  Trophy,
  Eye,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  BookOpen,
  Bell,
  Lock,
  CalendarDays,
  Plus,
  MessageCircle,
  Mail,
} from 'lucide-react-native';
import { addDays, nextMonday, format } from 'date-fns';
import { triggerLight, triggerSuccess } from '../../lib/haptics';
import { getDateService } from '../../lib/date';
import { scheduleItemReminder } from '../../lib/notifications/itemReminderService';
import { BRAND } from '../../design/brand';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useCurrentWeekSummary } from '../../lib/store/selectors';
import { selectSummaryByWeek } from '../../lib/store/selectors';
import { useMindDropSubmit } from '../../hooks/useMindDropSubmit';
import type {
  WSV2Card,
  WSV2OpeningCard,
  WSV2Thread,
  WSV2ThreadMovementsCard,
  WSV2DiscoveriesCard,
  WSV2MomentsCard,
  WSV2StaleTriageCard,
  WSV2StaleItem,
  WSV2WeekAheadCard,
  WSV2WeekAheadHighlight,
  WSV2MonthlyRetroCard,
  WSV2ThreadArc,
  WSV2RecommendationCard,
  WeeklySummaryV2Content,
  ItemReminder,
  V07Deck as V07DeckType,
} from '../../lib/types';
import { V07DeckRenderer } from './weeklySummary/v07/V07DeckRenderer';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────
// Weekly Summary color palette — warmer & calmer than the main app
// ─────────────────────────────────────────────────────────────────────────────

const WS = {
  bg: '#FFF6ED', // Warm cream background
  cardBg: '#FFFFFF', // Clean white card
  sage: '#BFD8C0', // Accent (progress dots, highlights)
  sageDark: '#2E5540', // deepForest — primary text in weekly context
  sageLight: 'rgba(191, 216, 192, 0.3)', // Subtle sage tint
  sageGlow: 'rgba(191, 216, 192, 0.12)', // Very subtle background tint (stat cards)
  text: '#2E5540', // deepForest — warmer than charcoalInk
  textSubtle: 'rgba(46, 85, 64, 0.55)', // Secondary (sage-tinted)
  textMuted: 'rgba(46, 85, 64, 0.35)', // Tertiary (sage-tinted)
  border: 'rgba(191, 216, 192, 0.2)', // Sage-tinted border
  divider: 'rgba(191, 216, 192, 0.3)', // Section dividers within cards
  periwinkle: '#9CA6E0', // Used sparingly for calendar/event accents
  golden: '#E0C47A', // Used for highlight moment star
} as const;

// Distinct card shadow — softer than Sweep
const WS_CARD_SHADOW = {
  shadowColor: '#2E5540',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 12,
  elevation: 3,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Lucide icon resolver — maps icon_hint strings to components
// ─────────────────────────────────────────────────────────────────────────────

const ICON_MAP: Record<
  string,
  React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
> = {
  'map-pin': MapPin,
  timer: Timer,
  dumbbell: Dumbbell,
  heart: Heart,
  code: Code,
  wine: Wine,
  brain: Brain,
  activity: Activity,
  pause: Pause,
  flag: Flag,
  star: Star,
  sparkles: Sparkles,
  calendar: Calendar,
  plane: Plane,
  trophy: Trophy,
  eye: Eye,
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
  'alert-triangle': AlertTriangle,
  check: Check,
  'book-open': BookOpen,
  // Aliases for descriptive AI outputs
  travel: MapPin,
  fitness: Dumbbell,
  health: Activity,
  relationship: Heart,
  personal: Heart,
  work: Code,
  creative: Sparkles,
  admin: Calendar,
  briefcase: Code,
  running: Timer,
  strength: Dumbbell,
  yoga: Activity,
  sobriety: Wine,
  mental: Brain,
};

function resolveIcon(hint: string | undefined | null) {
  if (!hint) return Sparkles;
  return ICON_MAP[hint.toLowerCase()] ?? Sparkles;
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress dots
// ─────────────────────────────────────────────────────────────────────────────

function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <View style={styles.dotsContainer}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === current && styles.dotActive,
            i < current && styles.dotCompleted,
          ]}
        />
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Gremly Mood card renderer
// ─────────────────────────────────────────────────────────────────────────────

function formatWeekLabel(raw: string): string {
  try {
    const parts = raw.split(' to ');
    if (parts.length !== 2) return raw;
    const start = new Date(parts[0] + 'T00:00:00Z');
    const end = new Date(parts[1] + 'T00:00:00Z');
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const sMonth = monthNames[start.getUTCMonth()];
    const eMonth = monthNames[end.getUTCMonth()];
    const sDay = start.getUTCDate();
    const eDay = end.getUTCDate();
    if (sMonth === eMonth) {
      return `${sMonth} ${sDay} – ${eDay}`;
    }
    return `${sMonth} ${sDay} – ${eMonth} ${eDay}`;
  } catch {
    return raw;
  }
}

function GremlyMoodCard({ card }: { card: any }) {
  return (
    <Animated.View
      entering={FadeIn.duration(500)}
      style={[
        styles.card,
        { alignItems: 'center', paddingTop: 72, paddingBottom: 48, overflow: 'visible' },
      ]}
    >
      {/* Mascot image */}
      <Animated.View
        entering={FadeInUp.delay(100).duration(400)}
        style={{
          width: 140,
          height: 140,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
          overflow: 'visible',
        }}
      >
        <Image
          source={require('../../assets/gremlywaving.png')}
          style={{ width: 120, height: 120 }}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Mood line */}
      <Animated.Text
        entering={FadeInUp.delay(300).duration(400)}
        style={{
          fontFamily: 'DMSans-Regular',
          fontSize: 14,
          color: WS.textSubtle,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        This week felt
      </Animated.Text>
      <Animated.Text
        entering={FadeInUp.delay(400).duration(400)}
        style={{
          fontFamily: 'Instrument Serif',
          fontSize: 28,
          color: WS.text,
          textAlign: 'center',
          marginBottom: 20,
          paddingHorizontal: 24,
        }}
      >
        {card.mood_line}
      </Animated.Text>

      {/* Hook */}
      <Animated.Text
        entering={FadeInUp.delay(550).duration(400)}
        style={{
          fontFamily: 'DMSans-Regular',
          fontSize: 15,
          color: WS.textSubtle,
          textAlign: 'center',
          lineHeight: 22,
          paddingHorizontal: 32,
          marginBottom: 16,
        }}
      >
        {card.hook}
      </Animated.Text>

      {/* Week date */}
      <Animated.Text
        entering={FadeInUp.delay(650).duration(350)}
        style={{
          fontFamily: 'DMSans-Regular',
          fontSize: 12,
          color: WS.textSubtle,
          opacity: 0.6,
        }}
      >
        {formatWeekLabel(card.week_label)}
      </Animated.Text>

      {/* Fed Stats */}
      {card.fed_stats ? (
        <Animated.View
          entering={FadeInUp.delay(750).duration(400)}
          style={{
            backgroundColor: '#F6F9F4',
            borderRadius: 14,
            padding: 14,
            marginTop: 20,
            width: '100%',
          }}
        >
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={{ fontSize: 20, fontFamily: 'DMSans-Bold', color: WS.sageDark }}>
                {card.fed_stats.fed_days_this_week}
              </Text>
              <Text style={{ fontSize: 11, fontFamily: 'DMSans-Regular', color: WS.textSubtle }}>
                fed days
              </Text>
            </View>
            <View style={{ width: 1, height: 28, backgroundColor: '#D8E5D2' }} />
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={{ fontSize: 20, fontFamily: 'DMSans-Bold', color: WS.sageDark }}>
                Level {card.fed_stats.gremly_age}
              </Text>
              <Text style={{ fontSize: 11, fontFamily: 'DMSans-Regular', color: WS.textSubtle }}>
                age
              </Text>
            </View>
            <View style={{ width: 1, height: 28, backgroundColor: '#D8E5D2' }} />
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={{ fontSize: 20, fontFamily: 'DMSans-Bold', color: WS.sageDark }}>
                {card.fed_stats.fed_days_needed - card.fed_stats.fed_days_toward_next}
              </Text>
              <Text style={{ fontSize: 11, fontFamily: 'DMSans-Regular', color: WS.textSubtle }}>
                to age up
              </Text>
            </View>
          </View>
          <View
            style={{
              marginTop: 10,
              backgroundColor: '#D8E5D2',
              borderRadius: 6,
              height: 6,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                backgroundColor: '#4A8B5C',
                height: '100%',
                width: `${(card.fed_stats.fed_days_toward_next / card.fed_stats.fed_days_needed) * 100}%`,
                borderRadius: 6,
              }}
            />
          </View>
          <Text
            style={{
              fontSize: 11,
              fontFamily: 'DMSans-Regular',
              color: WS.textSubtle,
              textAlign: 'center',
              marginTop: 6,
            }}
          >
            {card.fed_stats.fed_days_toward_next} of {card.fed_stats.fed_days_needed} fed days
            toward next age-up
          </Text>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Opening card renderer
// ─────────────────────────────────────────────────────────────────────────────

function OpeningCard({
  card,
  weekStart,
  weekEnd,
}: {
  card: WSV2OpeningCard;
  weekStart: string;
  weekEnd: string;
}) {
  // Format "Mar 3 – 9" style label from YYYY-MM-DD strings
  const formatWeekLabel = () => {
    try {
      const start = new Date(weekStart + 'T00:00:00');
      const end = new Date(weekEnd + 'T00:00:00');
      const monthShort = format(start, 'MMM');
      const startDay = start.getDate();
      const endDay = end.getDate();
      const endMonth = format(end, 'MMM');
      if (monthShort === endMonth) {
        return `${monthShort} ${startDay} – ${endDay}`;
      }
      return `${monthShort} ${startDay} – ${endMonth} ${endDay}`;
    } catch {
      return '';
    }
  };

  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.card}>
      {/* Week date label */}
      <Animated.View entering={FadeInUp.delay(100).duration(350)}>
        <Text style={openingStyles.weekLabel}>{formatWeekLabel()}</Text>
      </Animated.View>

      {/* Headline */}
      <Animated.View entering={FadeInUp.delay(200).duration(350)}>
        <Text style={openingStyles.headline}>{card.headline}</Text>
      </Animated.View>

      {/* Subheadline + Mood pill row */}
      <Animated.View entering={FadeInUp.delay(300).duration(350)} style={openingStyles.pillRow}>
        <View style={openingStyles.subheadlinePill}>
          <Text style={openingStyles.subheadlineText}>{card.subheadline}</Text>
        </View>
        {card.mood ? (
          <View style={openingStyles.moodPill}>
            <Text style={openingStyles.moodText}>{card.mood}</Text>
          </View>
        ) : null}
      </Animated.View>

      {/* Body */}
      <Animated.View entering={FadeInUp.delay(400).duration(350)}>
        <Text style={openingStyles.body}>{card.body}</Text>
      </Animated.View>

      {/* Hero image */}
      {card.image_url || card.image_hint ? (
        <Animated.View entering={FadeInUp.delay(500).duration(350)}>
          {card.image_url ? (
            <Image
              source={{ uri: card.image_url }}
              style={openingStyles.heroImage}
              resizeMode="cover"
            />
          ) : (
            <View
              style={[openingStyles.heroImage, { alignItems: 'center', justifyContent: 'center' }]}
            >
              <Text style={openingStyles.heroImageLabel}>{card.image_hint}</Text>
            </View>
          )}
        </Animated.View>
      ) : null}

      {/* Quote block */}
      {card.quote ? (
        <Animated.View entering={FadeInUp.delay(600).duration(350)}>
          <View style={openingStyles.quoteBlock}>
            <Text style={openingStyles.quoteLabel}>YOUR WORDS</Text>
            <Text style={openingStyles.quoteText}>“{card.quote}”</Text>
            {card.quote_date ? (
              <Text style={openingStyles.quoteDate}>{card.quote_date}</Text>
            ) : null}
          </View>
        </Animated.View>
      ) : null}

      {/* Engagement pulse */}
      {card.engagement &&
      (card.engagement.drops > 0 || card.engagement.sweeps > 0 || card.engagement.journals > 0) ? (
        <Animated.View entering={FadeInUp.delay(700).duration(350)}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { label: 'drops', value: card.engagement.drops, delta: card.engagement.drops_delta },
              {
                label: 'sweeps',
                value: card.engagement.sweeps,
                delta: card.engagement.sweeps_delta,
              },
              {
                label: 'journals',
                value: card.engagement.journals,
                delta: card.engagement.journals_delta,
              },
            ].map((stat) => (
              <View
                key={stat.label}
                style={{
                  flex: 1,
                  backgroundColor: WS.bg,
                  borderRadius: 10,
                  padding: 10,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 18, fontFamily: 'DMSans-Bold', color: WS.text }}>
                  {stat.value}
                </Text>
                <Text style={{ fontSize: 11, fontFamily: 'DMSans-Regular', color: WS.textSubtle }}>
                  {stat.label}
                </Text>
                {stat.delta != null && stat.delta !== 0 ? (
                  <Text
                    style={{
                      fontSize: 11,
                      fontFamily: 'DMSans-Medium',
                      color: stat.delta > 0 ? '#4A8B5C' : WS.textSubtle,
                    }}
                  >
                    {stat.delta > 0 ? `↑ ${stat.delta}` : `↓ ${Math.abs(stat.delta)}`}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        </Animated.View>
      ) : null}

      {card.mood_arc && card.mood_arc.length > 0 ? (
        <Animated.View entering={FadeInUp.delay(750).duration(350)}>
          <View style={{ backgroundColor: WS.bg, borderRadius: 12, padding: 12, marginTop: 12 }}>
            <Text
              style={{
                fontSize: 10,
                letterSpacing: 1,
                textTransform: 'uppercase',
                color: WS.textSubtle,
                fontFamily: 'DMSans-Medium',
                marginBottom: 6,
              }}
            >
              YOUR WEEK'S MOOD ARC
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 44 }}>
              {card.mood_arc.map(
                (entry: { date: string; day: string; valence: string }, i: number) => {
                  const heightMap: Record<string, number> = {
                    positive: 34,
                    mixed: 22,
                    neutral: 18,
                    anxious: 12,
                  };
                  const colorMap: Record<string, string> = {
                    positive: '#4A8B5C',
                    mixed: '#B0C4A0',
                    neutral: '#D8E5D2',
                    anxious: '#D4A84A',
                  };
                  return (
                    <View key={i} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                      <View
                        style={{
                          width: '100%',
                          backgroundColor: colorMap[entry.valence] || '#D8E5D2',
                          borderRadius: 3,
                          height: heightMap[entry.valence] || 18,
                        }}
                      />
                      <Text
                        style={{ fontSize: 9, fontFamily: 'DMSans-Regular', color: WS.textSubtle }}
                      >
                        {entry.day}
                      </Text>
                    </View>
                  );
                },
              )}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              {[
                { color: '#4A8B5C', label: 'positive' },
                { color: '#B0C4A0', label: 'mixed' },
                { color: '#D4A84A', label: 'anxious' },
              ].map((item) => (
                <View
                  key={item.label}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                >
                  <View
                    style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.color }}
                  />
                  <Text
                    style={{ fontSize: 10, fontFamily: 'DMSans-Regular', color: WS.textSubtle }}
                  >
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Life in Motion card renderer (thread tile grid)
// ─────────────────────────────────────────────────────────────────────────────

const TILE_BG: Record<string, string> = {
  success: '#E8F5E9',
  warning: 'rgba(224, 196, 122, 0.1)',
  danger: 'rgba(232, 69, 60, 0.08)',
  neutral: '#E8EDE6',
  info: 'rgba(191, 216, 192, 0.15)',
};

const BADGE_COLOR: Record<string, string> = {
  success: '#2E7D32',
  warning: '#C4973B',
  danger: '#E8453C',
  neutral: WS.textSubtle as string,
  info: WS.sageDark as string,
};

function ThreadTile({ thread }: { thread: WSV2Thread }) {
  // eslint-disable-next-line react-hooks/static-components -- pure ICON_MAP lookup, not dynamic creation
  const Icon = resolveIcon(thread.icon_hint);
  const bg = TILE_BG[thread.badge_type] ?? TILE_BG.neutral;
  const badgeColor = BADGE_COLOR[thread.badge_type] ?? BADGE_COLOR.neutral;

  return (
    <Animated.View
      entering={FadeInUp.duration(350)}
      style={[tileStyles.tile, { backgroundColor: bg }]}
    >
      {/* Icon + Badge row */}
      <View style={tileStyles.topRow}>
        <View style={tileStyles.iconSquare}>
          {/* eslint-disable-next-line react-hooks/static-components -- pure ICON_MAP lookup, not dynamic creation */}
          <Icon size={14} color={badgeColor} strokeWidth={2} />
        </View>
        {thread.badge_label ? (
          <View style={[tileStyles.badge, { backgroundColor: badgeColor }]}>
            <Text style={tileStyles.badgeText}>{thread.badge_label}</Text>
          </View>
        ) : null}
      </View>

      {/* Thread name */}
      <Text style={tileStyles.threadName} numberOfLines={2}>
        {thread.name}
      </Text>

      {/* Shift label */}
      {thread.shift_label ? <Text style={tileStyles.shiftLabel}>{thread.shift_label}</Text> : null}

      {/* Detail */}
      <Text style={tileStyles.detail}>{thread.detail}</Text>

      {thread.velocity != null && (thread.velocity >= 1.5 || thread.velocity <= 0.7) ? (
        <View
          style={{
            marginTop: 8,
            backgroundColor: '#FFFFFF',
            borderRadius: 8,
            paddingVertical: 5,
            paddingHorizontal: 10,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontFamily: 'DMSans-Medium',
              color:
                thread.velocity > 1.5
                  ? '#2D5A3F'
                  : thread.velocity < 0.5
                    ? '#C45A3A'
                    : WS.textSubtle,
            }}
          >
            {thread.velocity >= 3
              ? 'Your busiest week in a month'
              : thread.velocity >= 1.5
                ? `Mentioned ${Math.round(thread.velocity)}× more than usual`
                : thread.velocity <= 0.3
                  ? 'Quieter than usual this week'
                  : thread.velocity <= 0.7
                    ? 'Slightly less active than usual'
                    : ''}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

function LifeInMotionCard({ card }: { card: WSV2ThreadMovementsCard }) {
  // Sort: highlights first, then the rest
  const sorted = [...card.threads].sort((a, b) => {
    if (a.is_highlight && !b.is_highlight) return -1;
    if (!a.is_highlight && b.is_highlight) return 1;
    return 0;
  });

  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.card}>
      {/* Section header */}
      <Animated.View entering={FadeInUp.delay(100).duration(350)} style={tileStyles.sectionHeader}>
        <Activity size={18} color={WS.sageDark} strokeWidth={2} />
        <Text style={tileStyles.sectionTitle}>Life in motion</Text>
      </Animated.View>

      <Animated.Text
        entering={FadeInUp.delay(150).duration(300)}
        style={{
          fontFamily: 'DMSans-Regular',
          fontSize: 14,
          color: WS.textSubtle,
          marginBottom: 12,
          lineHeight: 20,
        }}
      >
        Here's what moved this week.
      </Animated.Text>

      {/* Tile grid */}
      <Animated.View entering={FadeInUp.delay(200).duration(350)} style={tileStyles.grid}>
        {sorted.map((thread, i) => (
          <ThreadTile key={thread.name + i} thread={thread} />
        ))}
      </Animated.View>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Discoveries card renderer (spotlight + trends)
// ─────────────────────────────────────────────────────────────────────────────

const SPOTLIGHT_BADGE_STYLES: Record<string, { bg: string; text: string }> = {
  discovery: { bg: '#E8F5E9', text: '#2E7D32' },
  shift: { bg: 'rgba(224, 196, 122, 0.15)', text: '#C4973B' },
  breakthrough: { bg: 'rgba(156, 166, 224, 0.15)', text: '#7B84C9' },
};

const TREND_CIRCLE_COLOR: Record<string, string> = {
  warning: 'rgba(224, 196, 122, 0.2)',
  danger: 'rgba(232, 69, 60, 0.12)',
  info: 'rgba(191, 216, 192, 0.25)',
};

const TREND_ICON_COLOR: Record<string, string> = {
  warning: '#C4973B',
  danger: '#E8453C',
  info: WS.sageDark as string,
};

function DiscoveriesCard({ card }: { card: WSV2DiscoveriesCard }) {
  const { spotlight, trends = [], mini_discoveries = [] } = card as any;
  const badgeStyle = SPOTLIGHT_BADGE_STYLES[spotlight.badge] ?? SPOTLIGHT_BADGE_STYLES.discovery;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.card}>
      {/* Section header */}
      <Animated.View entering={FadeInUp.delay(100).duration(350)} style={discStyles.sectionHeader}>
        <Sparkles size={18} color={WS.periwinkle} strokeWidth={2} />
        <Text style={discStyles.sectionTitle}>Discoveries</Text>
      </Animated.View>

      {/* Spotlight */}
      <Animated.View entering={FadeInUp.delay(200).duration(350)} style={discStyles.spotlightCard}>
        {/* Badge */}
        <View style={[discStyles.spotlightBadge, { backgroundColor: badgeStyle.bg }]}>
          <Text style={[discStyles.spotlightBadgeText, { color: badgeStyle.text }]}>
            {spotlight.badge}
          </Text>
        </View>

        {/* Title */}
        <Text style={discStyles.spotlightTitle}>{spotlight.title}</Text>

        {/* Takeaway with left accent */}
        <View style={discStyles.takeawayRow}>
          <View style={discStyles.takeawayAccent} />
          <Text style={discStyles.takeawayText}>{spotlight.takeaway}</Text>
        </View>

        {/* Evidence trail */}
        <Text style={discStyles.evidenceTrail}>{spotlight.evidence_trail}</Text>

        {/* Research context */}
        {spotlight.research_context ? (
          <Animated.View
            entering={FadeInUp.delay(400).duration(350)}
            style={discStyles.researchCard}
          >
            <View style={discStyles.researchHeader}>
              <Brain size={12} color={WS.periwinkle} strokeWidth={2} />
              <Text style={discStyles.researchLabel}>
                {spotlight.research_context.title || 'Why this happens'}
              </Text>
            </View>
            <Text style={discStyles.researchBody}>{spotlight.research_context.body}</Text>
            {spotlight.research_context.sources && spotlight.research_context.sources.length > 0 ? (
              <Text style={discStyles.researchSources}>
                {spotlight.research_context.sources.join(' · ')}
              </Text>
            ) : null}
          </Animated.View>
        ) : null}

        {card.spotlight.ask_gremly_prompt ? (
          <Pressable
            onPress={() => {
              navigation.navigate('AskGremly' as any, {
                prefillPrompt: card.spotlight.ask_gremly_prompt,
              });
            }}
            style={{
              backgroundColor: WS.sageDark,
              borderRadius: 14,
              paddingVertical: 14,
              paddingHorizontal: 20,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginTop: 14,
            }}
          >
            <MessageCircle size={16} color="#FFFFFF" strokeWidth={2} />
            <Text style={{ color: '#FFFFFF', fontSize: 14, fontFamily: 'DMSans-Medium' }}>
              Talk to Gremly about this
            </Text>
          </Pressable>
        ) : null}
      </Animated.View>

      {/* Mini-discoveries */}
      {mini_discoveries.length > 0 ? (
        <Animated.View
          entering={FadeInUp.delay(500).duration(350)}
          style={discStyles.miniDiscoveriesContainer}
        >
          {mini_discoveries.map((mini: any, i: number) => (
            <View key={mini.title + i} style={discStyles.miniDiscoveryRow}>
              <View style={discStyles.miniDiscoveryDot} />
              <View style={{ flex: 1 }}>
                <Text style={discStyles.miniDiscoveryTitle}>{mini.title}</Text>
                <Text style={discStyles.miniDiscoveryDetail}>{mini.detail}</Text>
              </View>
            </View>
          ))}
        </Animated.View>
      ) : trends.length > 0 ? (
        /* Fallback: legacy trends row */
        <Animated.View entering={FadeInUp.delay(500).duration(350)} style={discStyles.trendsRow}>
          {trends.map((item: any, i: number) => {
            const TrendIcon = resolveIcon(item.icon_hint);
            const circleBg = TREND_CIRCLE_COLOR[item.badge_type] ?? TREND_CIRCLE_COLOR.info;
            const iconColor = TREND_ICON_COLOR[item.badge_type] ?? TREND_ICON_COLOR.info;
            return (
              <View key={(item.title || '') + i} style={discStyles.trendTile}>
                {item.icon_hint ? (
                  <View style={[discStyles.trendCircle, { backgroundColor: circleBg }]}>
                    <TrendIcon size={14} color={iconColor} strokeWidth={2} />
                  </View>
                ) : null}
                <Text style={discStyles.trendTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={discStyles.trendDetail} numberOfLines={2}>
                  {item.detail}
                </Text>
              </View>
            );
          })}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Moments card renderer
// ─────────────────────────────────────────────────────────────────────────────

function MomentsCard({ card }: { card: WSV2MomentsCard }) {
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.card}>
      {/* Section header */}
      <Animated.View entering={FadeInUp.delay(100).duration(350)} style={momStyles.sectionHeader}>
        <Star size={18} color={WS.golden} strokeWidth={2} />
        <Text style={momStyles.sectionTitle}>Moments</Text>
      </Animated.View>

      {card.moments.map((moment, i) => (
        <Animated.View key={moment.date + i} entering={FadeInUp.delay(200 + i * 150).duration(350)}>
          {/* Divider between moments */}
          {i > 0 ? <View style={momStyles.divider} /> : null}

          {/* Image */}
          {moment.image_url ? (
            <Image
              source={{ uri: moment.image_url }}
              style={momStyles.imagePlaceholder}
              resizeMode="cover"
            />
          ) : moment.image_hint ? (
            <View style={[momStyles.imagePlaceholder, { justifyContent: 'flex-end' }]}>
              <Text style={momStyles.imageLabel}>{moment.image_hint}</Text>
            </View>
          ) : null}

          {/* Day label */}
          <Text style={momStyles.dayLabel}>{moment.day_label}</Text>

          {/* Title */}
          <Text style={momStyles.title}>{moment.title}</Text>

          {/* Body */}
          <Text style={momStyles.body}>{moment.body}</Text>

          {/* Quote */}
          {moment.quote ? (
            <View style={momStyles.quoteRow}>
              <View style={momStyles.quoteAccent} />
              <Text style={momStyles.quoteText}>“{moment.quote}”</Text>
            </View>
          ) : null}

          {/* Thread tags */}
          {moment.thread_tags.length > 0 ? (
            <View style={momStyles.tagsRow}>
              {moment.thread_tags.map((tag) => (
                <View key={tag} style={momStyles.tagPill}>
                  <Text style={momStyles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Animated.View>
      ))}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stale Triage card — actionable stale-item triage (matches to store todos)
// ─────────────────────────────────────────────────────────────────────────────

function StaleTriageCard({ card }: { card: WSV2StaleTriageCard }) {
  const todos = useGremlyStore((s) => s.todos);
  const updateTodo = useGremlyStore((s) => s.updateTodo);
  const archiveTodo = useGremlyStore((s) => s.archiveTodo);

  const [triagedIds, setTriagedIds] = useState<Set<number>>(new Set());
  const [datePickerIdx, setDatePickerIdx] = useState<number | null>(null);
  const [confirmedDates, setConfirmedDates] = useState<Record<number, string>>({});
  const [remindedIds, setRemindedIds] = useState<Set<number>>(new Set());
  const [allCleared, setAllCleared] = useState(false);

  // Match each stale item by title to a real todo in the store
  type MatchedStaleItem = WSV2StaleItem & { todoId: string | null; idx: number };

  const matchedItems: MatchedStaleItem[] = useMemo(() => {
    return card.items.map((item, idx) => {
      const itemTitle = (item.title ?? '').toLowerCase();
      const match = itemTitle
        ? todos.find(
            (t) =>
              (t.title ?? '').toLowerCase() === itemTitle ||
              (t.name ?? '').toLowerCase() === itemTitle,
          )
        : undefined;
      return { ...item, todoId: match?.id ?? null, idx };
    });
  }, [card.items, todos]);

  const remainingItems = useMemo(
    () => matchedItems.filter((item) => !triagedIds.has(item.idx)),
    [matchedItems, triagedIds],
  );
  const triagedCount = triagedIds.size;
  const totalCount = matchedItems.length;

  const triageItem = useCallback(
    (idx: number) => {
      setTriagedIds((prev) => {
        const next = new Set(prev);
        next.add(idx);
        if (next.size >= totalCount && totalCount > 0) {
          setTimeout(() => {
            setAllCleared(true);
            triggerSuccess();
          }, 300);
        }
        return next;
      });
      setDatePickerIdx(null);
    },
    [totalCount],
  );

  // ── Lock In ────────────────────────────────────────────────────────────
  const handleLockIn = useCallback(
    async (item: MatchedStaleItem) => {
      triggerLight();
      if (item.todoId) {
        const today = getDateService().today();
        await updateTodo(item.todoId, { locked_in: true, due_day: today });
      }
      triageItem(item.idx);
    },
    [updateTodo, triageItem],
  );

  // ── Reschedule toggle ──────────────────────────────────────────────────
  const handleReschedule = useCallback((idx: number) => {
    triggerLight();
    setDatePickerIdx((prev) => (prev === idx ? null : idx));
  }, []);

  // ── Date select ────────────────────────────────────────────────────────
  const handleDateSelect = useCallback(
    async (item: MatchedStaleItem, dateStr: string, label: string) => {
      setConfirmedDates((prev) => ({ ...prev, [item.idx]: label }));
      if (item.todoId) {
        await updateTodo(item.todoId, { due_day: dateStr, scheduled_date: dateStr });
      }
      setTimeout(() => triageItem(item.idx), 500);
    },
    [updateTodo, triageItem],
  );

  // ── Drop ───────────────────────────────────────────────────────────────
  const handleDrop = useCallback(
    async (item: MatchedStaleItem) => {
      triggerLight();
      if (item.todoId) {
        await archiveTodo(item.todoId, 'weekly_cleanup');
      }
      triageItem(item.idx);
    },
    [archiveTodo, triageItem],
  );

  // ── Remind ─────────────────────────────────────────────────────────────
  const handleRemind = useCallback(
    async (item: MatchedStaleItem) => {
      triggerLight();
      const tomorrow = addDays(getDateService().now(), 1);
      const dateStr = format(tomorrow, 'yyyy-MM-dd');

      const reminder: ItemReminder = {
        id: `weekly-remind-${getDateService().now().getTime()}-${(item.todoId ?? item.idx).toString().slice(0, 8)}`,
        time: '09:00',
        frequency: 'once' as const,
        date: dateStr,
      };

      if (item.todoId) {
        const notificationId = await scheduleItemReminder(
          item.todoId,
          item.title,
          'todo',
          reminder,
        );
        await updateTodo(item.todoId, {
          reminders: [{ ...reminder, notificationId: notificationId ?? undefined }],
          due_day: dateStr,
          scheduled_date: dateStr,
          resurface_at: dateStr,
        } as any);
      }

      setRemindedIds((prev) => new Set([...prev, item.idx]));
      setTimeout(() => triageItem(item.idx), 1200);
    },
    [updateTodo, triageItem],
  );

  // ── Drop all remaining ────────────────────────────────────────────────
  const handleDropAll = useCallback(async () => {
    triggerLight();
    for (const item of remainingItems) {
      if (item.todoId) {
        await archiveTodo(item.todoId, 'weekly_cleanup');
      }
    }
    setTriagedIds(new Set(matchedItems.map((_, i) => i)));
    setTimeout(() => {
      setAllCleared(true);
      triggerSuccess();
    }, 300);
  }, [matchedItems, remainingItems, archiveTodo]);

  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.card}>
      {/* Section header */}
      <Animated.View entering={FadeInUp.delay(100).duration(350)} style={staleStyles.sectionHeader}>
        <Flag size={18} color={WS.golden} strokeWidth={2} />
        <Text style={staleStyles.sectionTitle}>{card.headline}</Text>
      </Animated.View>

      {/* Context */}
      <Animated.Text entering={FadeInUp.delay(200).duration(300)} style={staleStyles.contextText}>
        {card.context}
      </Animated.Text>

      {/* Celebration state */}
      {allCleared ? (
        <Animated.View
          entering={FadeIn.duration(300).springify()}
          style={staleStyles.celebrationContainer}
        >
          <Text style={staleStyles.celebrationEmoji}>🧹</Text>
          <Text style={staleStyles.celebrationText}>
            All cleared! That's {totalCount} fewer thing{totalCount !== 1 ? 's' : ''} haunting your
            list.
          </Text>
        </Animated.View>
      ) : totalCount > 0 ? (
        <>
          {/* Progress */}
          <Text style={staleStyles.triageProgress}>
            {triagedCount} of {totalCount} resolved
          </Text>

          {/* Bulk drop — 5+ items */}
          {matchedItems.length >= 5 && remainingItems.length > 1 && (
            <View style={staleStyles.bulkActions}>
              <Pressable
                onPress={handleDropAll}
                style={({ pressed }) => [staleStyles.bulkButton, pressed && { opacity: 0.7 }]}
              >
                <Text style={staleStyles.bulkButtonText}>Drop all remaining</Text>
              </Pressable>
            </View>
          )}

          {/* Stale item list */}
          <View>
            {matchedItems.map((item) => {
              if (triagedIds.has(item.idx)) return null;
              const isDatePickerOpen = datePickerIdx === item.idx;
              const confirmedDate = confirmedDates[item.idx];

              return (
                <Animated.View
                  key={item.idx}
                  exiting={FadeOutLeft.duration(250)}
                  layout={Layout.duration(200)}
                  style={staleStyles.itemRow}
                >
                  {/* Title + days_stale badge */}
                  <View style={staleStyles.titleRow}>
                    <Text style={staleStyles.itemTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <View style={staleStyles.staleBadge}>
                      <Text style={staleStyles.staleBadgeText}>{item.days_stale}d</Text>
                    </View>
                  </View>

                  {/* Domain + context subtitle */}
                  <Text style={staleStyles.itemSubtitle} numberOfLines={1}>
                    {item.domain}
                    {item.context ? ` · ${item.context}` : ''}
                  </Text>

                  {/* Reminder confirmation chip */}
                  {remindedIds.has(item.idx) ? (
                    <View style={[staleStyles.actionRow, { marginTop: 10 }]}>
                      <View style={staleStyles.dateConfirmChip}>
                        <Text style={staleStyles.dateConfirmText}>Reminder set for tomorrow</Text>
                      </View>
                    </View>
                  ) : confirmedDate ? (
                    <View style={[staleStyles.actionRow, { marginTop: 10 }]}>
                      <View style={staleStyles.dateConfirmChip}>
                        <Text style={staleStyles.dateConfirmText}>✓ {confirmedDate}</Text>
                      </View>
                    </View>
                  ) : (
                    <>
                      {/* Action buttons */}
                      <View style={staleStyles.actionRow}>
                        <Pressable
                          onPress={() => handleLockIn(item)}
                          style={({ pressed }) => [
                            staleStyles.lockInBtn,
                            pressed && { opacity: 0.8 },
                          ]}
                        >
                          <Lock size={16} color={WS.sageDark} strokeWidth={2} />
                          <Text style={staleStyles.lockInText}>Lock In</Text>
                        </Pressable>

                        <Pressable
                          onPress={() => handleReschedule(item.idx)}
                          style={({ pressed }) => [
                            staleStyles.rescheduleBtn,
                            pressed && { opacity: 0.8 },
                            isDatePickerOpen && {
                              backgroundColor: WS.sageLight,
                              borderColor: WS.sage,
                            },
                          ]}
                        >
                          <CalendarDays size={16} color={WS.sageDark} strokeWidth={2} />
                          <Text style={staleStyles.rescheduleText}>Reschedule</Text>
                        </Pressable>

                        <Pressable
                          onPress={() => handleRemind(item)}
                          style={({ pressed }) => [
                            staleStyles.rescheduleBtn,
                            pressed && { opacity: 0.8 },
                          ]}
                        >
                          <Bell size={16} color={WS.sageDark} strokeWidth={2} />
                          <Text style={staleStyles.rescheduleText}>Remind</Text>
                        </Pressable>

                        <Pressable
                          onPress={() => handleDrop(item)}
                          style={({ pressed }) => [
                            staleStyles.dropBtn,
                            pressed && { opacity: 0.6 },
                          ]}
                        >
                          <X size={16} color="rgba(46, 85, 64, 0.4)" strokeWidth={2} />
                          <Text style={staleStyles.dropText}>Drop</Text>
                        </Pressable>
                      </View>

                      {/* Inline date picker */}
                      {isDatePickerOpen && (
                        <Animated.View
                          entering={FadeInDown.duration(200)}
                          style={staleStyles.datePickerRow}
                        >
                          <Pressable
                            onPress={() => {
                              const tomorrow = addDays(getDateService().now(), 1);
                              const dateStr = format(tomorrow, 'yyyy-MM-dd');
                              handleDateSelect(item, dateStr, 'Tomorrow');
                            }}
                            style={({ pressed }) => [
                              staleStyles.dateChip,
                              pressed && { opacity: 0.7 },
                            ]}
                          >
                            <Text style={staleStyles.dateChipText}>Tomorrow</Text>
                          </Pressable>

                          <Pressable
                            onPress={() => {
                              const monday = nextMonday(getDateService().now());
                              const dateStr = format(monday, 'yyyy-MM-dd');
                              handleDateSelect(item, dateStr, 'Next Week');
                            }}
                            style={({ pressed }) => [
                              staleStyles.dateChip,
                              pressed && { opacity: 0.7 },
                            ]}
                          >
                            <Text style={staleStyles.dateChipText}>Next Week</Text>
                          </Pressable>

                          <Pressable
                            onPress={() => {
                              const twoWeeks = addDays(getDateService().now(), 14);
                              const dateStr = format(twoWeeks, 'yyyy-MM-dd');
                              handleDateSelect(item, dateStr, 'In 2 Weeks');
                            }}
                            style={({ pressed }) => [
                              staleStyles.dateChip,
                              pressed && { opacity: 0.7 },
                            ]}
                          >
                            <Text style={staleStyles.dateChipText}>In 2 Weeks</Text>
                          </Pressable>
                        </Animated.View>
                      )}
                    </>
                  )}
                </Animated.View>
              );
            })}
          </View>
        </>
      ) : null}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Week Ahead card — upcoming highlights, busy-day warnings, calendar link
// ─────────────────────────────────────────────────────────────────────────────

function WeekAheadCard({ card }: { card: WSV2WeekAheadCard }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.card}>
      {/* Section header */}
      <Animated.View entering={FadeInUp.delay(100).duration(350)} style={waStyles.sectionHeader}>
        <Calendar size={18} color={WS.sageDark} strokeWidth={2} />
        <Text style={waStyles.sectionTitle}>Week ahead</Text>
      </Animated.View>

      {/* Intro */}
      <Animated.Text entering={FadeInUp.delay(200).duration(300)} style={waStyles.introText}>
        {card.intro}
      </Animated.Text>

      {/* Highlights */}
      {(card.highlights || []).map((h, i) => {
        const Icon = resolveIcon(h.icon_hint);
        return (
          <Animated.View
            key={h.date + i}
            entering={FadeInUp.delay(250 + i * 100).duration(300)}
            style={waStyles.highlightRow}
          >
            <Text style={waStyles.dayLabel}>{h.day_label}</Text>
            <View style={waStyles.titleRow}>
              <Icon size={14} color={WS.sageDark} strokeWidth={2} />
              <Text style={waStyles.highlightTitle}>{h.title}</Text>
            </View>
            {h.context ? <Text style={waStyles.highlightContext}>{h.context}</Text> : null}
            {h.prep_nudge ? <Text style={waStyles.prepNudge}>{h.prep_nudge}</Text> : null}
          </Animated.View>
        );
      })}

      {/* Busy day warnings */}
      {(card.busy_day_warnings || []).length > 0 ? (
        <Animated.View
          entering={FadeInUp.delay(250 + (card.highlights || []).length * 100).duration(300)}
          style={waStyles.warningBox}
        >
          {(card.busy_day_warnings || []).map((w, i) => (
            <View key={w.day + i} style={waStyles.warningRow}>
              <AlertTriangle size={14} color={WS.golden} strokeWidth={2} />
              <Text style={waStyles.warningText}>
                {w.day}: {w.detail}
              </Text>
            </View>
          ))}
        </Animated.View>
      ) : null}

      {/* Calendar link */}
      <Animated.View
        entering={FadeInUp.delay(350 + (card.highlights || []).length * 100).duration(300)}
      >
        <Pressable
          style={({ pressed }) => [waStyles.calendarLink, pressed && { opacity: 0.7 }]}
          onPress={() => navigation.navigate('CalendarScreen')}
        >
          <Calendar size={14} color={WS.sageDark} strokeWidth={2} />
          <Text style={waStyles.calendarLinkText}>View full week in calendar</Text>
          <ChevronRight size={14} color={WS.sageDark} strokeWidth={2} />
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Monthly Retro card — thread arcs for the month
// ─────────────────────────────────────────────────────────────────────────────

const ARC_DIRECTION_COLOR: Record<string, string> = {
  grew: '#4CAF50',
  declined: '#999999',
  transformed: WS.golden,
  emerged: WS.periwinkle,
  concluded: '#999999',
};

function MonthlyRetroCard({ card }: { card: WSV2MonthlyRetroCard }) {
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.card}>
      {/* Section header */}
      <Animated.View entering={FadeInUp.delay(100).duration(350)} style={mrStyles.sectionHeader}>
        <BookOpen size={16} color={WS.periwinkle} strokeWidth={2} />
        <Text style={mrStyles.sectionTitle}>Your {card.month_name}</Text>
      </Animated.View>

      {/* Headline */}
      <Animated.Text entering={FadeInUp.delay(200).duration(300)} style={mrStyles.headline}>
        {card.headline}
      </Animated.Text>

      {/* Thread arcs */}
      {card.thread_arcs.map((arc, i) => {
        const Icon = resolveIcon(arc.icon_hint);
        const dirColor = ARC_DIRECTION_COLOR[arc.direction] ?? WS.sage;
        return (
          <Animated.View
            key={arc.thread + i}
            entering={FadeInUp.delay(250 + i * 80).duration(300)}
            style={mrStyles.arcRow}
          >
            <View style={[mrStyles.directionIcon, { backgroundColor: dirColor }]}>
              <Icon size={10} color="#FFFFFF" strokeWidth={2.5} />
            </View>
            <Text style={mrStyles.threadName} numberOfLines={1}>
              {arc.thread}
            </Text>
            <Text style={mrStyles.arcSummary} numberOfLines={2}>
              {arc.arc}
            </Text>
          </Animated.View>
        );
      })}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Recommendation card — Mind Drop submit pattern from v1
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Recommends card — Gremly's coaching suggestions
// ─────────────────────────────────────────────────────────────────────────────

const RECOMMEND_TYPE_ICON: Record<string, any> = {
  thought: Brain,
  experiment: Sparkles,
  habit_idea: Activity,
  mindset_shift: Eye,
};

const RECOMMEND_TYPE_LABEL: Record<string, string> = {
  thought: 'Something to consider',
  experiment: 'Try this',
  habit_idea: 'Habit idea',
  mindset_shift: 'Reframe',
};

function RecommendsCard({ card }: { card: any }) {
  const primary = card.primary;
  const secondary = card.secondary || [];
  const PrimaryIcon = RECOMMEND_TYPE_ICON[primary?.type] || Sparkles;

  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.card}>
      {/* Section header */}
      <Animated.View
        entering={FadeInUp.delay(100).duration(350)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}
      >
        <Sparkles size={18} color={WS.sageDark} strokeWidth={2} />
        <Text style={{ fontFamily: 'Instrument Serif', fontSize: 22, color: WS.text }}>
          Gremly recommends
        </Text>
      </Animated.View>

      {/* Primary recommendation */}
      {primary ? (
        <Animated.View
          entering={FadeInUp.delay(200).duration(350)}
          style={{
            backgroundColor: 'rgba(191, 216, 192, 0.15)',
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <PrimaryIcon size={14} color={WS.sageDark} strokeWidth={2} />
            <Text
              style={{
                fontFamily: 'DMSans-Medium',
                fontSize: 11,
                color: WS.sageDark,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
              }}
            >
              {RECOMMEND_TYPE_LABEL[primary.type] || 'Consider this'}
            </Text>
          </View>
          <Text
            style={{
              fontFamily: 'DMSans-SemiBold',
              fontSize: 16,
              color: WS.text,
              lineHeight: 22,
              marginBottom: 6,
            }}
          >
            {primary.title}
          </Text>
          <Text
            style={{
              fontFamily: 'DMSans-Regular',
              fontSize: 14,
              color: WS.textSubtle,
              lineHeight: 20,
            }}
          >
            {primary.body}
          </Text>
        </Animated.View>
      ) : null}

      {/* Secondary recommendations */}
      {secondary.map((rec: any, i: number) => {
        const SecIcon = RECOMMEND_TYPE_ICON[rec.type] || Sparkles;
        return (
          <Animated.View
            key={rec.title + i}
            entering={FadeInUp.delay(350 + i * 100).duration(300)}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 12,
              paddingVertical: 12,
              borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
              borderTopColor: 'rgba(0,0,0,0.06)',
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: 'rgba(191, 216, 192, 0.2)',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 2,
              }}
            >
              <SecIcon size={13} color={WS.sageDark} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: 'DMSans-SemiBold',
                  fontSize: 14,
                  color: WS.text,
                  lineHeight: 20,
                }}
              >
                {rec.title}
              </Text>
              <Text
                style={{
                  fontFamily: 'DMSans-Regular',
                  fontSize: 13,
                  color: WS.textSubtle,
                  lineHeight: 18,
                  marginTop: 2,
                }}
              >
                {rec.body}
              </Text>
            </View>
          </Animated.View>
        );
      })}
    </Animated.View>
  );
}

function RecommendationCard({ card }: { card: WSV2RecommendationCard }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { submit: mindDropSubmit } = useMindDropSubmit();
  const [done, setDone] = useState(false);

  const handleAction = useCallback(async () => {
    triggerLight();
    if (card.action_type === 'tip') {
      setDone(true);
      return;
    }
    // Build prefill string — same Mind Drop submit pattern as v1
    let prefillText = card.prefill?.name ?? card.text;
    if (card.action_type === 'create_habit' && card.prefill?.frequency) {
      prefillText += ` (${card.prefill.frequency})`;
    }
    await mindDropSubmit(prefillText, { source: 'minddrop' });
    setDone(true);
  }, [card, mindDropSubmit]);

  return (
    <Animated.View entering={FadeIn.duration(400)} style={[styles.card, rcStyles.card]}>
      <Animated.Text entering={FadeInUp.delay(100).duration(300)} style={rcStyles.text}>
        {card.text}
      </Animated.Text>

      {done ? (
        <Animated.View entering={FadeIn.duration(200)} style={rcStyles.doneChip}>
          <Check size={13} color={WS.sageDark} strokeWidth={2.5} />
          <Text style={rcStyles.doneText}>Done</Text>
        </Animated.View>
      ) : (
        <Pressable
          onPress={handleAction}
          style={({ pressed }) => [rcStyles.actionBtn, pressed && { opacity: 0.8 }]}
        >
          <Plus size={14} color="#FFFFFF" strokeWidth={2.5} />
          <Text style={rcStyles.actionBtnText}>{card.action_label}</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────

function LetterCard({ card }: { card: any }) {
  return (
    <Animated.View
      entering={FadeIn.duration(500)}
      style={[
        styles.card,
        { backgroundColor: '#F6F9F4', borderWidth: 1.5, borderColor: '#D8E5D2' },
      ]}
    >
      <Animated.View
        entering={FadeInUp.delay(100).duration(400)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}
      >
        <Mail size={18} color={WS.sageDark} strokeWidth={2} />
        <Text style={{ fontFamily: 'DMSans-Bold', fontSize: 18, color: WS.sageDark }}>
          A note for Monday-you
        </Text>
      </Animated.View>
      <Animated.View entering={FadeInUp.delay(300).duration(400)}>
        <Text
          style={{
            fontFamily: 'Instrument Serif',
            fontSize: 16,
            color: '#3D5A3A',
            lineHeight: 26,
            fontStyle: 'italic',
          }}
        >
          {card.body}
        </Text>
      </Animated.View>
      <Animated.View
        entering={FadeInUp.delay(500).duration(400)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            backgroundColor: '#D8E5D2',
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Image
            source={require('../../assets/gremlywaving.png')}
            style={{ width: 22, height: 22 }}
            resizeMode="contain"
          />
        </View>
        <View>
          <Text style={{ fontSize: 12, fontFamily: 'DMSans-Medium', color: WS.sageDark }}>
            Your Gremly
          </Text>
          <Text style={{ fontSize: 11, fontFamily: 'DMSans-Regular', color: WS.textSubtle }}>
            Level {card.gremly_age || 0} · rooting for you
          </Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

export default function WeeklySummaryV2Screen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<NativeStackScreenProps<RootStackParamList, 'WeeklySummaryV2'>['route']>();
  const insets = useSafeAreaInsets();
  const weekStartParam = route.params?.weekStartDate;
  const currentWeekSummary = useCurrentWeekSummary();
  const paramSummary = useGremlyStore((state) =>
    weekStartParam ? selectSummaryByWeek(state, weekStartParam) : undefined,
  );
  const summary = paramSummary ?? currentWeekSummary;
  const content = summary?.content as WeeklySummaryV2Content | undefined;
  const isV07 = ((content as unknown as V07DeckType)?.content_version ?? 0) >= 4;
  const cards: WSV2Card[] = content?.cards ?? [];

  useEffect(() => {
    if (summary?.id && !summary.viewed) {
      useGremlyStore.getState().markSummaryViewed(summary.id);
    }
  }, [summary?.id, summary?.viewed]);

  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  // ── Navigation handlers ──────────────────────────────────────────────
  const handlePrevious = useCallback(() => {
    if (currentCardIndex <= 0) return;
    const prevIndex = currentCardIndex - 1;
    setCurrentCardIndex(prevIndex);
    flatListRef.current?.scrollToIndex({ index: prevIndex, animated: true });
  }, [currentCardIndex]);

  const handleNext = useCallback(() => {
    if (currentCardIndex < cards.length - 1) {
      const nextIndex = currentCardIndex + 1;
      setCurrentCardIndex(nextIndex);
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    }
  }, [currentCardIndex, cards.length]);

  const handleDone = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  // ── Button press animation ───────────────────────────────────────────
  const buttonScale = useSharedValue(1);

  const buttonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const handleButtonPressIn = () => {
    // eslint-disable-next-line react-hooks/immutability
    buttonScale.value = withSpring(0.96, { damping: 15, stiffness: 200 });
  };

  const handleButtonPressOut = () => {
    // eslint-disable-next-line react-hooks/immutability
    buttonScale.value = withSpring(1, { damping: 12, stiffness: 150 });
  };

  const handleScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentCardIndex(index);
  }, []);

  // ── Empty state ──────────────────────────────────────────────────────
  if (cards.length === 0) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <View style={styles.headerSide}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
              <X size={22} color={WS.text} strokeWidth={2} />
            </Pressable>
          </View>
          <View style={styles.headerCenter} />
          <View style={styles.headerSide} />
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Your weekly summary hasn't been generated yet.</Text>
          <Text style={styles.emptySubtext}>Check back Sunday evening!</Text>
        </View>
      </View>
    );
  }

  // ── Render card by type (placeholders) ───────────────────────────────
  const renderCard = (card: WSV2Card) => {
    switch (card.type) {
      case 'gremly_mood':
        return <GremlyMoodCard card={card} />;
      case 'opening': {
        const ws = weekStartParam ?? getDateService().today();
        const we = format(addDays(new Date(ws + 'T00:00:00'), 6), 'yyyy-MM-dd');
        return <OpeningCard card={card} weekStart={ws} weekEnd={we} />;
      }
      case 'thread_movements':
        return <LifeInMotionCard card={card} />;
      case 'moments':
        return <MomentsCard card={card} />;
      case 'discoveries':
        return <DiscoveriesCard card={card} />;
      case 'recommends':
        return <RecommendsCard card={card} />;
      case 'stale_triage':
        return <StaleTriageCard card={card} />;
      case 'week_ahead':
        return <WeekAheadCard card={card} />;
      case 'monthly_retro':
        return <MonthlyRetroCard card={card} />;
      case 'recommendation':
        return <RecommendationCard card={card} />;
      case 'letter':
        return <LetterCard card={card} />;
      default:
        return null;
    }
  };

  // ── Main render ──────────────────────────────────────────────────────
  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        {/* Left — Back (hidden on first card) */}
        <View style={styles.headerSide}>
          {currentCardIndex > 0 ? (
            <Pressable onPress={handlePrevious} hitSlop={12}>
              <ChevronLeft size={22} color={WS.sageDark} strokeWidth={2} />
            </Pressable>
          ) : (
            <View style={{ width: 22 }} />
          )}
        </View>

        {/* Center — Progress */}
        <View style={styles.headerCenter}>
          <Text style={styles.cardCountText}>
            {currentCardIndex + 1} of {cards.length}
          </Text>
          <ProgressDots total={cards.length} current={currentCardIndex} />
        </View>

        {/* Right — Close */}
        <View style={styles.headerSide}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <X size={22} color={WS.textSubtle} strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      {/* Card Flow */}
      {isV07 ? (
        <V07DeckRenderer
          deck={content as unknown as V07DeckType}
          currentCardIndex={currentCardIndex}
          onScrollEnd={handleScrollEnd}
          flatListRef={flatListRef}
          screenWidth={SCREEN_WIDTH}
          cardScrollStyle={styles.cardScroll}
          cardScrollContentStyle={styles.cardScrollContent}
        />
      ) : (
        <FlatList
          ref={flatListRef}
          data={cards}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate={0.95}
          onMomentumScrollEnd={handleScrollEnd}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => (
            <View style={{ width: SCREEN_WIDTH }}>
              <ScrollView
                style={styles.cardScroll}
                contentContainerStyle={styles.cardScrollContent}
                showsVerticalScrollIndicator={false}
              >
                {renderCard(item)}
              </ScrollView>
            </View>
          )}
        />
      )}

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
        {currentCardIndex < cards.length - 1 ? (
          <Animated.View style={buttonAnimStyle}>
            <Pressable
              style={styles.nextButton}
              onPress={handleNext}
              onPressIn={handleButtonPressIn}
              onPressOut={handleButtonPressOut}
            >
              <Text style={styles.nextButtonText}>Next</Text>
              <ChevronRight size={18} color="#FFFFFF" strokeWidth={2.5} />
            </Pressable>
          </Animated.View>
        ) : (
          <Animated.View style={buttonAnimStyle}>
            <Pressable
              style={styles.doneButton}
              onPress={handleDone}
              onPressIn={handleButtonPressIn}
              onPressOut={handleButtonPressOut}
            >
              <Check size={18} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.doneButtonText}>Done</Text>
            </Pressable>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: WS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerSide: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  cardCountText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: WS.textMuted,
    textAlign: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(191, 216, 192, 0.3)',
    marginHorizontal: 3,
  },
  dotActive: {
    backgroundColor: WS.sageDark,
    width: 20,
    borderRadius: 4,
  },
  dotCompleted: {
    backgroundColor: WS.sage,
  },
  cardScroll: {
    flex: 1,
  },
  cardScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: WS.cardBg,
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    ...WS_CARD_SHADOW,
    borderWidth: 1,
    borderColor: WS.border,
  },
  cardTitle: {
    fontSize: 22,
    fontFamily: 'PlusJakartaSans-Bold',
    color: WS.text,
    marginBottom: 16,
  },
  placeholderLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: WS.textMuted,
    textAlign: 'center',
    paddingVertical: 40,
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    paddingTop: 12,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND.colors.mossGreen,
    height: 52,
    borderRadius: BRAND.radius.xl,
    gap: 6,
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: 'Inter-Medium',
  },
  doneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND.colors.mossGreen,
    height: 52,
    borderRadius: BRAND.radius.xl,
    gap: 8,
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: 'Inter-Medium',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans-Bold',
    color: WS.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    color: WS.textSubtle,
    textAlign: 'center',
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Opening card styles
// ─────────────────────────────────────────────────────────────────────────────

const openingStyles = StyleSheet.create({
  weekLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: WS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  headline: {
    fontSize: 26,
    fontFamily: 'PlusJakartaSans-Bold',
    color: WS.sageDark,
    lineHeight: 30, // ~1.15
    marginBottom: 12,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  subheadlinePill: {
    backgroundColor: WS.sageLight,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  subheadlineText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    color: WS.sageDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  moodPill: {
    backgroundColor: WS.sageLight,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  moodText: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: WS.sageDark,
  },
  body: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#555555',
    lineHeight: 21, // 14 * 1.5
    marginBottom: 20,
  },
  heroImage: {
    height: 160,
    borderRadius: 12,
    backgroundColor: WS.sage,
    marginBottom: 20,
    overflow: 'hidden',
  },
  heroImageLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: WS.sageDark,
    opacity: 0.6,
  },
  quoteBlock: {
    backgroundColor: WS.sageGlow,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  quoteLabel: {
    fontSize: 9,
    fontFamily: 'Inter-Medium',
    color: WS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  quoteText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    fontStyle: 'italic',
    color: WS.sageDark,
    lineHeight: 20,
    marginBottom: 4,
  },
  quoteDate: {
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    color: WS.textMuted,
    textAlign: 'right',
  },
  pulseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WS.sageLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
    alignSelf: 'flex-start',
  },
  pulseText: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: WS.sageDark,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Life in Motion tile styles
// ─────────────────────────────────────────────────────────────────────────────

const tileStyles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans-Bold',
    color: WS.sageDark,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
  },
  tile: {
    width: '48.5%',
    borderRadius: 10,
    padding: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  iconSquare: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 8,
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  threadName: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: WS.sageDark,
    marginBottom: 2,
  },
  shiftLabel: {
    fontSize: 9,
    fontFamily: 'Inter-Regular',
    color: WS.textSubtle,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  detail: {
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    color: '#666666',
    lineHeight: 14,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Discoveries card styles
// ─────────────────────────────────────────────────────────────────────────────

const discStyles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans-Bold',
    color: WS.sageDark,
  },
  spotlightCard: {
    backgroundColor: WS.sageGlow,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  spotlightBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 10,
  },
  spotlightBadgeText: {
    fontSize: 9,
    fontFamily: 'Inter-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  spotlightTitle: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans-Bold',
    color: WS.sageDark,
    marginBottom: 10,
  },
  evidenceTrail: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: '#555555',
    lineHeight: 19.5, // 13 * 1.5
    marginBottom: 12,
  },
  takeawayRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  takeawayAccent: {
    width: 3,
    backgroundColor: WS.sage,
    borderRadius: 2,
    marginRight: 10,
  },
  takeawayText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: WS.sageDark,
    lineHeight: 19,
  },
  researchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  researchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 6,
  },
  researchLabel: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    color: WS.periwinkle,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  researchBody: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: '#666666',
    lineHeight: 16,
  },
  researchSources: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    color: WS.periwinkle,
    marginTop: 6,
    lineHeight: 14,
  },
  trendsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  trendTile: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#f0ece5',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
  },
  trendCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  trendTitle: {
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    color: WS.sageDark,
    textAlign: 'center',
    marginBottom: 2,
  },
  trendDetail: {
    fontSize: 9,
    fontFamily: 'Inter-Regular',
    color: '#888888',
    textAlign: 'center',
  },
  miniDiscoveriesContainer: {
    marginTop: 16,
    gap: 12,
  },
  miniDiscoveryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  miniDiscoveryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: WS.sageDark,
    marginTop: 7,
  },
  miniDiscoveryTitle: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 14,
    color: WS.text,
    lineHeight: 20,
  },
  miniDiscoveryDetail: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: WS.textSubtle,
    lineHeight: 18,
    marginTop: 2,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Moments card styles
// ─────────────────────────────────────────────────────────────────────────────

const momStyles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans-Bold',
    color: WS.sageDark,
  },
  divider: {
    height: 1,
    backgroundColor: WS.divider,
    marginVertical: 20,
  },
  imagePlaceholder: {
    height: 140,
    borderRadius: 10,
    backgroundColor: WS.sage,
    marginBottom: 12,
    overflow: 'hidden',
  },
  imageLabel: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    color: WS.sageDark,
    opacity: 0.6,
  },
  dayLabel: {
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    color: WS.sageDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans-SemiBold',
    color: WS.sageDark,
    marginBottom: 6,
  },
  body: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#555555',
    lineHeight: 17.4, // 12 * 1.45
    marginBottom: 10,
  },
  quoteRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  quoteAccent: {
    width: 2,
    backgroundColor: WS.sage,
    borderRadius: 1,
    marginRight: 8,
  },
  quoteText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    fontStyle: 'italic',
    color: WS.sageDark,
    lineHeight: 17,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  tagPill: {
    backgroundColor: WS.sageLight,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    fontSize: 9,
    fontFamily: 'Inter-Medium',
    color: WS.sageDark,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Stale Triage card styles
// ─────────────────────────────────────────────────────────────────────────────

const staleStyles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans-Bold',
    color: WS.sageDark,
  },
  contextText: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: '#888888',
    lineHeight: 16,
    marginBottom: 16,
  },
  triageProgress: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: WS.textSubtle,
    marginBottom: 12,
  },
  bulkActions: {
    marginBottom: 12,
  },
  bulkButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(46, 85, 64, 0.15)',
  },
  bulkButtonText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: 'rgba(46, 85, 64, 0.5)',
  },
  itemRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(46, 85, 64, 0.08)',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  itemTitle: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    color: WS.text,
  },
  staleBadge: {
    backgroundColor: 'rgba(224, 196, 122, 0.18)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  staleBadgeText: {
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    color: WS.golden,
  },
  itemSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: WS.textSubtle,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  lockInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: WS.sage,
  },
  lockInText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: WS.sageDark,
  },
  rescheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(46, 85, 64, 0.2)',
  },
  rescheduleText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: WS.sageDark,
  },
  dropBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  dropText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: 'rgba(46, 85, 64, 0.4)',
  },
  datePickerRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  dateChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: WS.sageLight,
  },
  dateChipText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: WS.sageDark,
  },
  dateConfirmChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: WS.sage,
  },
  dateConfirmText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: WS.sageDark,
  },
  celebrationContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  celebrationEmoji: {
    fontSize: 36,
  },
  celebrationText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: WS.sageDark,
    textAlign: 'center',
    lineHeight: 22,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Week Ahead card styles
// ─────────────────────────────────────────────────────────────────────────────

const waStyles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans-Bold',
    color: WS.sageDark,
  },
  introText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#555555',
    lineHeight: 20,
    marginBottom: 16,
  },
  highlightRow: {
    borderLeftWidth: 3,
    borderLeftColor: WS.sage,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    backgroundColor: WS.sageGlow,
    padding: 8,
    paddingLeft: 12,
    marginBottom: 10,
  },
  dayLabel: {
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    color: WS.sageDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  highlightTitle: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: WS.sageDark,
  },
  highlightContext: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: '#666666',
    lineHeight: 16,
    marginBottom: 2,
  },
  prepNudge: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    color: WS.sageDark,
    marginTop: 2,
  },
  warningBox: {
    backgroundColor: 'rgba(224, 196, 122, 0.12)',
    borderRadius: 8,
    padding: 10,
    marginTop: 6,
    marginBottom: 12,
    gap: 6,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: WS.sageDark,
  },
  calendarLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(46, 85, 64, 0.15)',
  },
  calendarLinkText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: WS.sageDark,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Monthly Retro card styles
// ─────────────────────────────────────────────────────────────────────────────

const mrStyles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans-Bold',
    color: WS.sageDark,
  },
  headline: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: '#555555',
    lineHeight: 19,
    marginBottom: 16,
  },
  arcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(46, 85, 64, 0.08)',
  },
  directionIcon: {
    width: 16,
    height: 16,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  threadName: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: WS.sageDark,
  },
  arcSummary: {
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    color: '#888888',
    textAlign: 'right',
    maxWidth: '45%',
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Legacy recommendation card styles
// ─────────────────────────────────────────────────────────────────────────────

const rcStyles = StyleSheet.create({
  card: {
    backgroundColor: WS.sageLight,
    borderRadius: 10,
    padding: 12,
  },
  text: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: WS.sageDark,
    lineHeight: 18,
    marginBottom: 14,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: WS.sageDark,
  },
  actionBtnText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: '#FFFFFF',
  },
  doneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(191, 216, 192, 0.3)',
  },
  doneText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: WS.sageDark,
  },
});
