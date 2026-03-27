/**
 * WeeklySummaryScreen — Card flow for the AI-generated weekly summary.
 *
 * Horizontal paginated flow: Week in Review → Insight cards → Week Ahead.
 * Distinct warm palette (#FFF6ED background, sage accents) for reflective Sunday feel.
 *
 * Phase 2A — Navigation + Screen Shell + Card Flow
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
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
  Check,
  Sparkles,
  Star,
  Archive,
  Inbox,
  BarChart3,
  LayoutGrid,
  Scale,
  Activity,
  BookOpen,
  Calendar,
  CalendarDays,
  AlertTriangle,
  Lightbulb,
  Lock,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  Wand2,
  Zap,
  Plus,
  Bell,
} from 'lucide-react-native';
import { BRAND } from '../../design/brand';
import { useCurrentWeekSummary } from '../../lib/store/selectors';
import { selectSummaryByWeek } from '../../lib/store/selectors';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { addDays, nextMonday, format } from 'date-fns';
import { scheduleItemReminder } from '../../lib/notifications/itemReminderService';
import type { ItemReminder } from '../../lib/types';
import { triggerLight, triggerSuccess } from '../../lib/haptics';
import { getDateService } from '../../lib/date';
import { useMindDropSubmit } from '../../hooks/useMindDropSubmit';
import type {
  WeeklySummaryContent,
  WeeklySummaryInsight,
  WeeklySummaryMagicMoment,
  WeeklySummaryRecommendation,
  WeeklySummaryWeekAheadHighlight,
} from '../../lib/types';

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
// Card type union
// ─────────────────────────────────────────────────────────────────────────────

type CardType =
  | { type: 'mood'; mood: string; weekType?: string; weekTypeShort?: string }
  | { type: 'weekInReview'; content: WeeklySummaryContent }
  | { type: 'magicMoments'; moments: WeeklySummaryMagicMoment[]; weekType?: string }
  | { type: 'insightsStack'; insights: WeeklySummaryInsight[] }
  | { type: 'insight'; insight: WeeklySummaryInsight; index: number }
  | { type: 'recommends'; recommendations: WeeklySummaryRecommendation[] }
  | { type: 'weekAhead'; content: WeeklySummaryContent };

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Format YYYY-MM-DD → "Feb 9" */
function formatShortDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return format(date, 'MMM d');
  } catch {
    return dateStr;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mood Opener card — first screen, single line, fortune-cookie feel
// ─────────────────────────────────────────────────────────────────────────────

const moodStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    minHeight: 280,
  },
  weekLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: WS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  moodText: {
    fontSize: 28,
    fontFamily: 'PlusJakartaSans-Bold',
    color: WS.sageDark,
    textAlign: 'center',
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  weekTypeText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: WS.textSubtle,
    textAlign: 'center',
    marginTop: 16,
    fontStyle: 'italic',
  },
  swipeHint: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: WS.textMuted,
    textAlign: 'center',
    marginTop: 32,
  },
});

function MoodOpenerCard({
  mood,
  weekType,
  weekTypeShort,
}: {
  mood: string;
  weekType?: string;
  weekTypeShort?: string;
}) {
  return (
    <Animated.View entering={FadeIn.duration(600)} style={wsStyles.card}>
      <View style={moodStyles.container}>
        <Animated.Text entering={FadeIn.duration(400).delay(200)} style={moodStyles.weekLabel}>
          This week felt
        </Animated.Text>
        <Animated.Text entering={FadeInUp.duration(500).delay(400)} style={moodStyles.moodText}>
          {mood}
        </Animated.Text>
        {weekTypeShort || weekType ? (
          <Animated.Text entering={FadeIn.duration(400).delay(700)} style={moodStyles.weekTypeText}>
            {weekTypeShort ?? weekType}
          </Animated.Text>
        ) : null}
        <Animated.Text entering={FadeIn.duration(300).delay(1000)} style={moodStyles.swipeHint}>
          Swipe to see your week →
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Week in Review card styles
// ─────────────────────────────────────────────────────────────────────────────

const wirStyles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontFamily: 'PlusJakartaSans-Bold',
    color: WS.text,
  },
  dateRange: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: WS.textSubtle,
    marginBottom: 20,
  },
  commentary: {
    fontFamily: 'Inter-Regular',
    fontSize: 17,
    lineHeight: 26,
    color: WS.sageDark,
    letterSpacing: -0.2,
    marginTop: 16,
    marginBottom: 24,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: WS.divider,
    marginVertical: 20,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: WS.sageGlow,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  statNumber: {
    fontSize: 22,
    fontFamily: 'PlusJakartaSans-Bold',
    color: WS.sageDark,
  },
  trendUp: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#4CAF50',
  },
  trendDown: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: WS.textSubtle,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: 'rgba(46, 85, 64, 0.5)',
    marginTop: 2,
  },
  highlight: {
    backgroundColor: WS.sageGlow,
    borderRadius: BRAND.radius.lg,
    borderLeftWidth: 4,
    borderLeftColor: WS.sage,
    padding: 16,
    marginBottom: 20,
  },
  highlightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  highlightLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: WS.textSubtle,
  },
  highlightTitle: {
    fontSize: 17,
    fontFamily: 'PlusJakartaSans-Bold',
    color: WS.text,
    marginBottom: 6,
  },
  highlightReason: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: WS.textSubtle,
    lineHeight: 20,
    marginBottom: 10,
  },
  highlightComment: {
    fontSize: 14,
    fontFamily: 'Inter-Italic',
    fontStyle: 'italic',
    color: WS.sageDark,
    lineHeight: 20,
  },
  themesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  themePill: {
    backgroundColor: WS.sageLight,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  themePillText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: WS.sageDark,
  },
  mood: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    fontStyle: 'italic',
    color: WS.textMuted,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Week in Review card (Prompt 2B)
// ─────────────────────────────────────────────────────────────────────────────

function WeekInReviewCard({
  content,
  stats,
  weekStart,
  weekEnd,
}: {
  content: WeeklySummaryContent;
  stats: Record<string, unknown>;
  weekStart: string;
  weekEnd: string;
}) {
  const todosCompleted = (stats?.todosCompleted as number) ?? 0;
  const todosCompletedLastWeek = (stats?.todosCompletedLastWeek as number) ?? 0;
  const journalEntries = (stats?.journalEntries as number) ?? 0;
  const mindDropsCreated = (stats?.mindDropsCreated as number) ?? 0;
  const habitsTracked = stats?.habitsTracked as Record<string, unknown> | undefined;
  const habitCount = habitsTracked ? Object.keys(habitsTracked).length : 0;

  // Build stats items (skip zeros except todosCompleted)
  const statItems: Array<{ value: number; label: string; trend?: 'up' | 'down' }> = [];

  // Todos completed + optional trend
  let todoTrend: 'up' | 'down' | undefined;
  if (todosCompletedLastWeek > 0 && todosCompleted > 0) {
    const pctChange = (todosCompleted - todosCompletedLastWeek) / todosCompletedLastWeek;
    if (pctChange >= 0.2) todoTrend = 'up';
    else if (pctChange <= -0.2) todoTrend = 'down';
  }
  statItems.push({ value: todosCompleted, label: 'done', trend: todoTrend });

  if (journalEntries > 0) statItems.push({ value: journalEntries, label: 'journal' });
  if (mindDropsCreated > 0) statItems.push({ value: mindDropsCreated, label: 'drops' });
  if (habitCount > 0 && statItems.length < 4)
    statItems.push({ value: habitCount, label: 'habits' });

  return (
    <Animated.View entering={FadeInUp.duration(300).delay(100)} style={wsStyles.card}>
      {/* Header + date range */}
      <View style={wirStyles.headerRow}>
        <Sparkles size={20} color={WS.golden} strokeWidth={2} />
        <Text style={wirStyles.title}>Your Week</Text>
      </View>
      <Text style={wirStyles.dateRange}>
        {formatShortDate(weekStart)} – {formatShortDate(weekEnd)}
      </Text>

      {/* Weekly commentary */}
      <Text style={wirStyles.commentary}>{content.weeklyCommentary ?? ''}</Text>

      {/* Divider */}
      <View style={wirStyles.sectionDivider} />

      {/* Stat tiles */}
      {statItems.length > 0 && (
        <View style={wirStyles.statsRow}>
          {statItems.map((s) => (
            <View key={s.label} style={wirStyles.statItem}>
              <View style={wirStyles.statValueRow}>
                <Text style={wirStyles.statNumber}>{s.value}</Text>
                {s.trend === 'up' && <Text style={wirStyles.trendUp}> ↑</Text>}
                {s.trend === 'down' && <Text style={wirStyles.trendDown}> ↓</Text>}
              </View>
              <Text style={wirStyles.statLabel} numberOfLines={1} adjustsFontSizeToFit>
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Highlight moment */}
      {content.highlightMoment && (
        <Animated.View entering={FadeInUp.duration(300).delay(300)} style={wirStyles.highlight}>
          <View style={wirStyles.highlightHeader}>
            <Star size={16} color={WS.golden} fill={WS.golden} strokeWidth={1.5} />
            <Text style={wirStyles.highlightLabel}>Highlight of the Week</Text>
          </View>
          <Text style={wirStyles.highlightTitle}>{content.highlightMoment?.title ?? ''}</Text>
          <Text style={wirStyles.highlightReason}>{content.highlightMoment?.reason ?? ''}</Text>
          {content.highlightMoment.gremlyComment ? (
            <Text style={wirStyles.highlightComment}>
              “{content.highlightMoment.gremlyComment}”
            </Text>
          ) : null}
        </Animated.View>
      )}

      {/* Key themes */}
      {content.keyThemes && content.keyThemes.length > 0 && (
        <View style={wirStyles.themesRow}>
          {content.keyThemes.map((theme) => (
            <View key={theme} style={wirStyles.themePill}>
              <Text style={wirStyles.themePillText}>{theme}</Text>
            </View>
          ))}
        </View>
      )}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Magic Moments card
// ─────────────────────────────────────────────────────────────────────────────

const mmStyles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  title: { fontSize: 22, fontFamily: 'PlusJakartaSans-Bold', color: WS.text },
  weekType: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: WS.periwinkle,
    marginBottom: 20,
    textTransform: 'capitalize',
  },
  timelineContainer: { paddingTop: 8 },
  timelineRow: { flexDirection: 'row', gap: 12 },
  timelineLeft: { alignItems: 'center', width: 44 },
  dayPill: {
    backgroundColor: WS.sageLight,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginBottom: 4,
  },
  dayText: { fontSize: 11, fontFamily: 'Inter-Medium', color: WS.sageDark, textAlign: 'center' },
  connectorLine: { flex: 1, width: 1, backgroundColor: WS.divider },
  timelineContent: { flex: 1, paddingBottom: 24 },
  momentTitle: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans-SemiBold',
    color: WS.sageDark,
    marginBottom: 5,
    marginTop: 2,
  },
  momentBody: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 21,
    color: WS.sageDark,
    letterSpacing: -0.1,
    marginBottom: 8,
  },
  connectedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  connectedPill: {
    backgroundColor: 'rgba(191, 216, 192, 0.2)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  connectedText: { fontSize: 12, fontFamily: 'Inter-Medium', color: WS.textSubtle },
  emptyState: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    color: WS.textMuted,
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 22,
  },
});

function MagicMomentsCard({
  moments,
  weekType,
}: {
  moments: WeeklySummaryMagicMoment[];
  weekType?: string;
}) {
  function getDayLabel(dateStr?: string): string {
    if (!dateStr) return '—';
    const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const [y, m, d] = dateStr.split('-').map(Number);
    const day = new Date(y, m - 1, d).getDay();
    return DAY_NAMES[day];
  }

  return (
    <Animated.View entering={FadeInUp.duration(300).delay(100)} style={wsStyles.card}>
      <View style={mmStyles.headerRow}>
        <Wand2 size={20} color={WS.golden} strokeWidth={2} />
        <Text style={mmStyles.title}>Moments</Text>
      </View>
      {weekType ? <Text style={mmStyles.weekType}>{weekType}</Text> : null}

      {moments.length === 0 ? (
        <Text style={mmStyles.emptyState}>A quiet week — sometimes those are the best ones.</Text>
      ) : (
        <View style={mmStyles.timelineContainer}>
          {moments.map((moment, i) => {
            const isLast = i === moments.length - 1;
            return (
              <Animated.View
                key={moment.title}
                entering={FadeInUp.duration(250).delay(200 + i * 120)}
                style={mmStyles.timelineRow}
              >
                {/* Left: day pill + connector line */}
                <View style={mmStyles.timelineLeft}>
                  <View style={mmStyles.dayPill}>
                    <Text style={mmStyles.dayText}>{getDayLabel(moment.date)}</Text>
                  </View>
                  {!isLast && <View style={mmStyles.connectorLine} />}
                </View>

                {/* Right: content */}
                <View style={mmStyles.timelineContent}>
                  <Text style={mmStyles.momentTitle}>{moment.title}</Text>
                  <Text style={mmStyles.momentBody}>{moment.body}</Text>
                  {moment.connectedItems && moment.connectedItems.length > 0 && (
                    <View style={mmStyles.connectedRow}>
                      {moment.connectedItems.map((item) => (
                        <View key={item} style={mmStyles.connectedPill}>
                          <Text style={mmStyles.connectedText}>{item}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </Animated.View>
            );
          })}
        </View>
      )}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Insight card styles + config (Prompt 2C)
// ─────────────────────────────────────────────────────────────────────────────

const INSIGHT_ICON_MAP: Record<string, React.ComponentType<any>> = {
  stale_cleanup: Archive,
  capture_ratio: Inbox,
  productivity_pattern: BarChart3,
  space_activity: LayoutGrid,
  balance: Scale,
  habit_observation: Activity,
  journal_encouragement: BookOpen,
  life_event: Calendar,
  week_rhythm: CalendarDays,
};

const INSIGHT_STYLE: Record<string, { accent: string; bg: string }> = {
  stale_cleanup: { accent: '#E0C47A', bg: 'rgba(224, 196, 122, 0.1)' },
  capture_ratio: { accent: '#9CA6E0', bg: 'rgba(156, 166, 224, 0.1)' },
  productivity_pattern: { accent: '#BFD8C0', bg: 'rgba(191, 216, 192, 0.1)' },
  space_activity: { accent: '#BFD8C0', bg: 'rgba(191, 216, 192, 0.1)' },
  balance: { accent: '#9CA6E0', bg: 'rgba(156, 166, 224, 0.1)' },
  habit_observation: { accent: '#A5F3C1', bg: 'rgba(165, 243, 193, 0.1)' },
  journal_encouragement: { accent: '#E0C47A', bg: 'rgba(224, 196, 122, 0.1)' },
  life_event: { accent: '#E0C47A', bg: 'rgba(224, 196, 122, 0.1)' },
  week_rhythm: { accent: '#9CA6E0', bg: 'rgba(156, 166, 224, 0.1)' },
};

const DEFAULT_INSIGHT_STYLE = { accent: '#BFD8C0', bg: 'rgba(191, 216, 192, 0.1)' };

/** Humanize insight type: 'habit_observation' → 'Habit Observation' */
function humanizeInsightType(type: string): string {
  const labels: Record<string, string> = {
    stale_cleanup: 'Stale Items',
    capture_ratio: 'Capture Ratio',
    productivity_pattern: 'Productivity',
    space_activity: 'Space Activity',
    balance: 'Balance',
    habit_observation: 'Habit Observation',
    journal_encouragement: 'Journaling',
    life_event: 'Life Event',
    week_rhythm: 'Week Rhythm',
  };
  return labels[type] ?? type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const insStyles = StyleSheet.create({
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: WS.textSubtle,
  },
  headline: {
    fontSize: 22,
    fontFamily: 'PlusJakartaSans-Bold',
    color: WS.text,
    marginTop: 12,
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    color: WS.sageDark,
    lineHeight: 22,
    marginBottom: 20,
  },
  cardAccent: {
    height: 3,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginHorizontal: -24,
    marginTop: -28,
    marginBottom: 20,
  },
  staleCount: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: WS.textSubtle,
    marginBottom: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  actionButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
});

function InsightCard({
  insight,
  index: _index,
  navigation,
}: {
  insight: WeeklySummaryInsight;
  index: number;
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) {
  const style = INSIGHT_STYLE[insight.type] ?? DEFAULT_INSIGHT_STYLE;
  const IconComponent = INSIGHT_ICON_MAP[insight.type] ?? Sparkles;

  const handleInsightAction = useCallback(
    (ins: WeeklySummaryInsight) => {
      triggerLight();
      switch (ins.actionType) {
        case 'open_cleanup':
          navigation.navigate('Sweep');
          break;
        case 'open_sweep':
          navigation.navigate('Sweep');
          break;
        case 'open_habits':
          navigation.navigate('Habits');
          break;
        default:
          break;
      }
    },
    [navigation],
  );

  return (
    <Animated.View entering={FadeInUp.duration(300).delay(100)} style={wsStyles.card}>
      {/* Accent bar */}
      <View style={[insStyles.cardAccent, { backgroundColor: style.accent }]} />

      {/* Type badge + icon */}
      <View style={insStyles.typeBadge}>
        <IconComponent size={20} color={style.accent} strokeWidth={2} />
        <Text style={insStyles.typeLabel}>Insight · {humanizeInsightType(insight.type)}</Text>
      </View>

      {/* Headline */}
      <Animated.Text entering={FadeInUp.duration(250).delay(150)} style={insStyles.headline}>
        {insight.headline}
      </Animated.Text>

      {/* Body */}
      <Animated.Text entering={FadeInUp.duration(250).delay(250)} style={insStyles.body}>
        {insight.body}
      </Animated.Text>

      {/* Stale items count (stale_cleanup only) */}
      {insight.type === 'stale_cleanup' && (insight.staleItemIds?.length ?? 0) > 0 && (
        <Text style={insStyles.staleCount}>
          {insight.staleItemIds!.length} item{insight.staleItemIds!.length !== 1 ? 's' : ''} to
          review
        </Text>
      )}

      {/* Action button */}
      {insight.isActionable && insight.actionLabel ? (
        <Animated.View entering={FadeInUp.duration(250).delay(350)}>
          <Pressable
            style={({ pressed }) => [
              insStyles.actionButton,
              { backgroundColor: WS.sage },
              pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
            ]}
            onPress={() => handleInsightAction(insight)}
          >
            <Text style={[insStyles.actionButtonText, { color: WS.sageDark }]}>
              {insight.actionLabel}
            </Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Insights Stack card — all non-stale insights on one compact card
// ─────────────────────────────────────────────────────────────────────────────

const stackStyles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontFamily: 'PlusJakartaSans-Bold',
    color: WS.text,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
    gap: 12,
  },
  insightRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: WS.divider,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
  },
  insightHeadline: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans-SemiBold',
    color: WS.text,
    marginBottom: 3,
  },
  insightBody: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: WS.textSubtle,
    lineHeight: 20,
  },
  actionChip: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: WS.sageLight,
  },
  actionChipText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: WS.sageDark,
  },
});

function InsightsStackCard({
  insights,
  navigation,
}: {
  insights: WeeklySummaryInsight[];
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) {
  const handleInsightAction = useCallback(
    (ins: WeeklySummaryInsight) => {
      triggerLight();
      switch (ins.actionType) {
        case 'open_cleanup':
        case 'open_sweep':
          navigation.navigate('Sweep');
          break;
        case 'open_habits':
          navigation.navigate('Habits');
          break;
        default:
          break;
      }
    },
    [navigation],
  );

  return (
    <Animated.View entering={FadeInUp.duration(300).delay(100)} style={wsStyles.card}>
      <View style={stackStyles.headerRow}>
        <Lightbulb size={20} color={WS.periwinkle} strokeWidth={2} />
        <Text style={stackStyles.title}>Patterns</Text>
      </View>

      {insights.map((insight, i) => {
        const style = INSIGHT_STYLE[insight.type] ?? DEFAULT_INSIGHT_STYLE;
        const IconComponent = INSIGHT_ICON_MAP[insight.type] ?? Sparkles;
        const isLast = i === insights.length - 1;

        return (
          <Animated.View
            key={`${insight.type}-${i}`}
            entering={FadeInUp.duration(200).delay(100 + i * 80)}
            style={[stackStyles.insightRow, !isLast && stackStyles.insightRowBorder]}
          >
            <View style={[stackStyles.iconContainer, { backgroundColor: style.bg }]}>
              <IconComponent size={18} color={style.accent} strokeWidth={2} />
            </View>
            <View style={stackStyles.textContainer}>
              <Text style={stackStyles.insightHeadline}>{insight.headline}</Text>
              <Text style={stackStyles.insightBody}>{insight.body}</Text>
              {insight.isActionable && insight.actionLabel ? (
                <Pressable
                  onPress={() => handleInsightAction(insight)}
                  style={({ pressed }) => [stackStyles.actionChip, pressed && { opacity: 0.7 }]}
                >
                  <Text style={stackStyles.actionChipText}>{insight.actionLabel}</Text>
                </Pressable>
              ) : null}
            </View>
          </Animated.View>
        );
      })}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stale Cleanup card — actionable triage of stale items (Prompt 2D)
// ─────────────────────────────────────────────────────────────────────────────

const staleStyles = StyleSheet.create({
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
  itemTitle: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    color: WS.text,
    marginBottom: 2,
  },
  itemAge: {
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
    backgroundColor: WS.sage, // #BFD8C0
  },
  lockInText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: WS.sageDark, // #2E5540
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

function StaleCleanupCard({ insight }: { insight: WeeklySummaryInsight }) {
  const staleItemIds = insight.staleItemIds ?? [];
  const todos = useGremlyStore((s) => s.todos);
  const habits = useGremlyStore((s) => s.habits);
  const updateTodo = useGremlyStore((s) => s.updateTodo);
  const archiveTodo = useGremlyStore((s) => s.archiveTodo);

  const style = INSIGHT_STYLE[insight.type] ?? DEFAULT_INSIGHT_STYLE;
  const IconComponent = INSIGHT_ICON_MAP[insight.type] ?? Sparkles;

  const [triagedIds, setTriagedIds] = useState<Set<string>>(new Set());
  const [datePickerItemId, setDatePickerItemId] = useState<string | null>(null);
  const [confirmedDates, setConfirmedDates] = useState<Record<string, string>>({});
  const [remindedIds, setRemindedIds] = useState<Set<string>>(new Set());
  const [allCleared, setAllCleared] = useState(false);

  type StaleEntity = {
    id: string;
    entityType: 'todo' | 'habit';
    name?: string;
    title?: string;
    created_at?: string;
    sweep_reschedule_count?: number;
    time_window?: string | null;
  };

  const staleItems: StaleEntity[] = useMemo(() => {
    const result: StaleEntity[] = [];
    for (const id of staleItemIds) {
      const todo = todos.find((t) => t.id === id);
      if (todo) {
        result.push({
          id: todo.id,
          entityType: 'todo',
          name: todo.name,
          title: todo.title,
          created_at: todo.created_at,
          sweep_reschedule_count: (todo as any).sweep_reschedule_count,
          time_window: (todo as any).time_window,
        });
        continue;
      }
      const habit = habits.find((h) => h.id === id);
      if (habit) {
        result.push({
          id: habit.id,
          entityType: 'habit',
          name: habit.name,
          created_at: habit.created_at,
          sweep_reschedule_count: (habit as any).sweep_reschedule_count,
          time_window: (habit as any).time_window,
        });
      }
    }
    return result;
  }, [staleItemIds, todos, habits]);

  const remainingItems = useMemo(
    () => staleItems.filter((item) => !triagedIds.has(item.id)),
    [staleItems, triagedIds],
  );
  const triagedCount = triagedIds.size;
  const totalCount = staleItems.length;

  const triageItem = useCallback(
    (itemId: string) => {
      setTriagedIds((prev) => {
        const next = new Set(prev);
        next.add(itemId);
        // Check if all items are now triaged
        if (next.size >= totalCount && totalCount > 0) {
          setTimeout(() => {
            setAllCleared(true);
            triggerSuccess();
          }, 300);
        }
        return next;
      });
      setDatePickerItemId(null);
    },
    [totalCount],
  );

  const handleLockIn = useCallback(
    async (item: StaleEntity) => {
      triggerLight();
      const today = getDateService().getCurrentDate();
      if (item.entityType === 'todo') {
        await updateTodo(item.id, { locked_in: true, due_day: today });
      }
      // Habits don't have due_day — just lock in
      triageItem(item.id);
    },
    [updateTodo, triageItem],
  );

  const handleReschedule = useCallback((itemId: string) => {
    triggerLight();
    setDatePickerItemId((prev) => (prev === itemId ? null : itemId));
  }, []);

  const handleDateSelect = useCallback(
    async (item: StaleEntity, dateStr: string, label: string) => {
      // Show confirmed date in the UI
      setConfirmedDates((prev) => ({ ...prev, [item.id]: label }));

      // Update the store
      if (item.entityType === 'todo') {
        await updateTodo(item.id, { due_day: dateStr, scheduled_date: dateStr });
      }

      // Animate out after a brief confirmation pause
      setTimeout(() => triageItem(item.id), 500);
    },
    [updateTodo, triageItem],
  );

  const handleDrop = useCallback(
    async (item: StaleEntity) => {
      triggerLight();
      if (item.entityType === 'todo') {
        await archiveTodo(item.id, 'weekly_cleanup');
      }
      triageItem(item.id);
    },
    [archiveTodo, triageItem],
  );

  const handleRemind = useCallback(
    async (item: StaleEntity) => {
      triggerLight();

      const tomorrow = addDays(getDateService().now(), 1);
      const dateStr = format(tomorrow, 'yyyy-MM-dd');
      const entityTitle = item.title || item.name || 'Reminder';

      // Default reminder time: use time_window if available, else 9am
      let reminderTime = '09:00';
      if (item.time_window === 'day') reminderTime = '13:00';
      if (item.time_window === 'evening') reminderTime = '18:00';

      const reminder: ItemReminder = {
        id: `weekly-remind-${getDateService().now().getTime()}-${item.id.slice(0, 8)}`,
        time: reminderTime,
        frequency: 'once' as const,
        date: dateStr,
      };

      // Schedule local notification
      const notificationId = await scheduleItemReminder(
        item.id,
        entityTitle,
        item.entityType === 'todo' ? 'todo' : 'habit',
        reminder,
      );

      // Persist reminder and set due_day to tomorrow so it shows on Today
      if (item.entityType === 'todo') {
        await updateTodo(item.id, {
          reminders: [{ ...reminder, notificationId: notificationId ?? undefined }],
          due_day: dateStr,
          scheduled_date: dateStr,
          resurface_at: dateStr,
        } as any);
      }

      // Mark as reminded (shows confirmation chip)
      setRemindedIds((prev) => new Set([...prev, item.id]));

      // Auto-triage after a brief delay (same pattern as reschedule)
      setTimeout(() => {
        triageItem(item.id);
      }, 1200);
    },
    [updateTodo, triageItem, triggerLight],
  );

  const handleDropAll = useCallback(async () => {
    triggerLight();
    const remaining = staleItems.filter((item) => !triagedIds.has(item.id));
    for (const item of remaining) {
      if (item.entityType === 'todo') {
        await archiveTodo(item.id, 'weekly_cleanup');
      }
    }
    setTriagedIds(new Set(staleItems.map((i) => i.id)));
    setTimeout(() => {
      setAllCleared(true);
      triggerSuccess();
    }, 300);
  }, [staleItems, triagedIds, archiveTodo]);

  const getAgeContext = useCallback((item: StaleEntity): string => {
    if ((item.sweep_reschedule_count ?? 0) >= 7) {
      return `Rescheduled ${item.sweep_reschedule_count} times in Sweep`;
    }
    if (item.created_at) {
      const ds = getDateService();
      const ageDays = ds.daysBetween(ds.toLocalDate(new Date(item.created_at)), ds.today());
      return `On your list for ${ageDays} days`;
    }
    return '';
  }, []);

  return (
    <Animated.View entering={FadeInUp.duration(300).delay(100)} style={wsStyles.card}>
      {/* Accent bar */}
      <View style={[insStyles.cardAccent, { backgroundColor: style.accent }]} />

      {/* Type badge + icon */}
      <View style={insStyles.typeBadge}>
        <IconComponent size={20} color={style.accent} strokeWidth={2} />
        <Text style={insStyles.typeLabel}>Insight · {humanizeInsightType(insight.type)}</Text>
      </View>

      {/* Headline */}
      <Animated.Text entering={FadeInUp.duration(250).delay(150)} style={insStyles.headline}>
        {insight.headline}
      </Animated.Text>

      {/* Body — Gremly observation */}
      <Animated.Text entering={FadeInUp.duration(250).delay(250)} style={insStyles.body}>
        {insight.body}
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

          {/* Bulk drop — only for 5+ items */}
          {staleItems.length >= 5 && remainingItems.length > 1 && (
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
            {staleItems.map((item) => {
              if (triagedIds.has(item.id)) return null;
              const displayTitle = item.title || item.name || 'Untitled';
              const ageText = getAgeContext(item);
              const isDatePickerOpen = datePickerItemId === item.id;
              const confirmedDate = confirmedDates[item.id];

              return (
                <Animated.View
                  key={item.id}
                  exiting={FadeOutLeft.duration(250)}
                  layout={Layout.duration(200)}
                  style={staleStyles.itemRow}
                >
                  {/* Title + age */}
                  <Text style={staleStyles.itemTitle} numberOfLines={2}>
                    {displayTitle}
                  </Text>
                  {ageText ? <Text style={staleStyles.itemAge}>{ageText}</Text> : null}

                  {/* Reminder confirmation chip */}
                  {remindedIds.has(item.id) ? (
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
                          onPress={() => handleReschedule(item.id)}
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

const recStyles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { fontSize: 22, fontFamily: 'PlusJakartaSans-Bold', color: WS.text },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: WS.textSubtle,
    marginBottom: 20,
    fontStyle: 'italic',
  },
  recRow: {
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: WS.divider,
  },
  recRowLast: { borderBottomWidth: 0 },
  recText: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    color: WS.sageDark,
    lineHeight: 22,
    marginBottom: 12,
  },
  recActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: WS.sage,
  },
  primaryBtnText: { fontSize: 13, fontFamily: 'Inter-Medium', color: WS.sageDark },
  dismissBtn: { paddingVertical: 8, paddingHorizontal: 10 },
  dismissText: { fontSize: 13, fontFamily: 'Inter-Regular', color: WS.textMuted },
  doneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(191, 216, 192, 0.2)',
  },
  doneText: { fontSize: 13, fontFamily: 'Inter-Medium', color: WS.sageDark },
  emptyState: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    color: WS.textMuted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
});

function GremlyRecommendsCard({
  recommendations,
  onOpenMindDrop,
}: {
  recommendations: WeeklySummaryRecommendation[];
  onOpenMindDrop: (prefillText: string) => void;
}) {
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const markDone = useCallback((trigger: string) => {
    triggerSuccess();
    setDoneIds((prev) => new Set([...prev, trigger]));
  }, []);

  const dismiss = useCallback((trigger: string) => {
    triggerLight();
    setDismissedIds((prev) => new Set([...prev, trigger]));
  }, []);

  const handleAction = useCallback(
    (rec: WeeklySummaryRecommendation) => {
      triggerLight();
      if (rec.actionType === 'tip') {
        dismiss(rec.trigger);
        return;
      }
      // Build a descriptive prefill string the Mind Drop classifier can work with
      // For habits, append frequency hint so classifier picks it up
      let prefillText = rec.prefill?.name ?? rec.text;
      if (rec.actionType === 'create_habit' && rec.prefill?.frequency) {
        prefillText += ` (${rec.prefill.frequency})`;
      }
      onOpenMindDrop(prefillText);
      markDone(rec.trigger);
    },
    [onOpenMindDrop, dismiss, markDone],
  );

  const visibleRecs = recommendations.filter((r) => !dismissedIds.has(r.trigger));

  return (
    <Animated.View entering={FadeInUp.duration(300).delay(100)} style={wsStyles.card}>
      <View style={recStyles.headerRow}>
        <Zap size={20} color={WS.golden} strokeWidth={2} />
        <Text style={recStyles.title}>Gremly Suggests</Text>
      </View>
      <Text style={recStyles.subtitle}>Based on your week's patterns</Text>
      {visibleRecs.length === 0 ? (
        <Text style={recStyles.emptyState}>Nothing to act on — solid week.</Text>
      ) : (
        visibleRecs.map((rec, i) => {
          const isDone = doneIds.has(rec.trigger);
          const isLast = i === visibleRecs.length - 1;
          return (
            <Animated.View
              key={rec.trigger}
              entering={FadeInUp.duration(200).delay(100 + i * 80)}
              style={[recStyles.recRow, isLast && recStyles.recRowLast]}
            >
              <Text style={recStyles.recText}>{rec.text}</Text>
              <View style={recStyles.recActions}>
                {isDone ? (
                  <View style={recStyles.doneChip}>
                    <Check size={13} color={WS.sageDark} strokeWidth={2.5} />
                    <Text style={recStyles.doneText}>Done</Text>
                  </View>
                ) : rec.actionType === 'tip' ? (
                  <Pressable
                    onPress={() => dismiss(rec.trigger)}
                    style={({ pressed }) => [recStyles.primaryBtn, pressed && { opacity: 0.8 }]}
                  >
                    <Text style={recStyles.primaryBtnText}>{rec.actionLabel}</Text>
                  </Pressable>
                ) : (
                  <>
                    <Pressable
                      onPress={() => handleAction(rec)}
                      style={({ pressed }) => [recStyles.primaryBtn, pressed && { opacity: 0.8 }]}
                    >
                      <Plus size={13} color={WS.sageDark} strokeWidth={2.5} />
                      <Text style={recStyles.primaryBtnText}>{rec.actionLabel}</Text>
                    </Pressable>
                    <Pressable onPress={() => dismiss(rec.trigger)} style={recStyles.dismissBtn}>
                      <Text style={recStyles.dismissText}>Skip</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </Animated.View>
          );
        })
      )}
    </Animated.View>
  );
}

function getEventAccentColor(highlight: WeeklySummaryWeekAheadHighlight): string {
  const title = highlight.eventTitle.toLowerCase();
  if (
    title.includes('flight') ||
    title.includes('travel') ||
    title.includes('airport') ||
    title.includes('train') ||
    title.includes('tokyo') ||
    title.includes('tulum') ||
    title.includes('los angeles')
  )
    return WS.periwinkle;
  if (
    title.includes('launch') ||
    title.includes('testflight') ||
    title.includes('release') ||
    title.includes('milestone') ||
    title.includes('honeymoon')
  )
    return WS.golden;
  return WS.sage;
}

function WeekAheadCard({ content }: { content: WeeklySummaryContent }) {
  const weekAhead = content.weekAhead ?? {
    introduction: '',
    highlights: [],
    busyDayWarnings: [],
    totalEventCount: 0,
  };
  const remainingCount = weekAhead.totalEventCount - weekAhead.highlights.length;

  // ── Day-by-day expand state ──────────────────────────────────────────────
  const [expanded, setExpanded] = useState(false);

  const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const DAY_SHORT: Record<string, string> = {
    Monday: 'Mon',
    Tuesday: 'Tue',
    Wednesday: 'Wed',
    Thursday: 'Thu',
    Friday: 'Fri',
    Saturday: 'Sat',
    Sunday: 'Sun',
  };

  // Group highlights by day name
  const highlightsByDay = useMemo(() => {
    const grouped: Record<string, typeof weekAhead.highlights> = {};
    for (const h of weekAhead.highlights) {
      const dayKey = DAY_ORDER.find((d) => d.toLowerCase() === h.day.toLowerCase()) ?? h.day;
      if (!grouped[dayKey]) grouped[dayKey] = [];
      grouped[dayKey].push(h);
    }
    return grouped;
  }, [weekAhead.highlights]);

  // Days that have at least one highlight
  const daysWithEvents = useMemo(() => new Set(Object.keys(highlightsByDay)), [highlightsByDay]);

  // Auto-select first day with highlights when expanding
  const [selectedDay, setSelectedDay] = useState<string>(() => {
    const first = DAY_ORDER.find((d) => highlightsByDay[d]?.length);
    return first ?? 'Monday';
  });

  const handleToggleExpand = useCallback(() => {
    triggerLight();
    setExpanded((prev) => {
      if (!prev) {
        // When opening, auto-select first day with events
        const first = DAY_ORDER.find((d) => highlightsByDay[d]?.length);
        if (first) setSelectedDay(first);
      }
      return !prev;
    });
  }, [highlightsByDay]);

  const handleDaySelect = useCallback((day: string) => {
    triggerLight();
    setSelectedDay(day);
  }, []);

  const selectedDayHighlights = highlightsByDay[selectedDay] ?? [];

  return (
    <Animated.View entering={FadeInUp.duration(300).delay(100)} style={wsStyles.card}>
      {/* Header */}
      <View style={waStyles.header}>
        <Calendar size={20} color={WS.periwinkle} strokeWidth={2} />
        <Text style={wsStyles.cardTitle}>Week Ahead</Text>
      </View>

      {/* Introduction */}
      <Text style={waStyles.introduction}>{weekAhead.introduction ?? ''}</Text>

      {/* ── Collapsed: highlight list ──────────────────────────────────────── */}
      {!expanded && (
        <>
          {weekAhead.highlights.length > 0 && (
            <View style={waStyles.highlightsContainer}>
              {weekAhead.highlights.map((highlight, i) => (
                <Animated.View
                  key={i}
                  entering={FadeInUp.duration(250).delay(100 + i * 80)}
                  style={[
                    waStyles.eventRow,
                    i < weekAhead.highlights.length - 1 && waStyles.eventRowBorder,
                    { borderLeftColor: getEventAccentColor(highlight) },
                  ]}
                >
                  <View style={waStyles.eventDayBadge}>
                    <Text style={waStyles.eventDayText}>
                      {highlight.day.slice(0, 3).toUpperCase()}
                    </Text>
                  </View>
                  <View style={waStyles.eventDetail}>
                    <Text style={waStyles.eventTitle} numberOfLines={2}>
                      {highlight.eventTitle}
                    </Text>
                    {highlight.time ? (
                      <Text style={waStyles.eventTime}>{highlight.time}</Text>
                    ) : null}
                    {highlight.prepNudge ? (
                      <Text style={waStyles.eventPrepNudge}>↳ {highlight.prepNudge}</Text>
                    ) : null}
                    {highlight.context ? (
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'flex-start',
                          gap: 4,
                          marginTop: 2,
                        }}
                      >
                        <Lightbulb
                          size={14}
                          color={WS.textSubtle}
                          strokeWidth={1.5}
                          style={{ marginTop: 2 }}
                        />
                        <Text style={[waStyles.eventContext, { flex: 1 }]}>
                          {highlight.context}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </Animated.View>
              ))}
            </View>
          )}

          {/* Busy Day Warnings */}
          {weekAhead.busyDayWarnings.length > 0 && (
            <Animated.View
              entering={FadeInUp.duration(300).delay(100 + weekAhead.highlights.length * 80 + 100)}
              style={waStyles.warningSection}
            >
              <View style={waStyles.warningHeader}>
                <AlertTriangle size={16} color={WS.golden} />
                <Text style={waStyles.warningTitle}>Heads Up</Text>
              </View>
              {weekAhead.busyDayWarnings.map((warning, i) => (
                <View key={i} style={waStyles.warningRow}>
                  <Text style={waStyles.warningDay}>{warning.day}:</Text>
                  <Text style={waStyles.warningComment}>{warning.comment}</Text>
                </View>
              ))}
            </Animated.View>
          )}
        </>
      )}

      {/* ── Expanded: day-by-day view ──────────────────────────────────────── */}
      {expanded && (
        <Animated.View entering={FadeInDown.duration(300)} layout={Layout.springify()}>
          {/* Day pills */}
          <View style={waStyles.dayPillRow}>
            {DAY_ORDER.map((day) => {
              const isSelected = day === selectedDay;
              const hasEvents = daysWithEvents.has(day);
              return (
                <Pressable
                  key={day}
                  onPress={() => handleDaySelect(day)}
                  style={({ pressed }) => [
                    waStyles.dayPill,
                    isSelected && waStyles.dayPillSelected,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={[waStyles.dayPillText, isSelected && waStyles.dayPillTextSelected]}>
                    {DAY_SHORT[day]}
                  </Text>
                  {hasEvents && !isSelected && <View style={waStyles.dayPillDot} />}
                </Pressable>
              );
            })}
          </View>

          {/* Events for selected day */}
          <View style={waStyles.dayEventsContainer}>
            {selectedDayHighlights.length > 0 ? (
              selectedDayHighlights.map((highlight, i) => (
                <Animated.View
                  key={`${selectedDay}-${i}`}
                  entering={FadeInUp.duration(200).delay(i * 60)}
                  style={[
                    waStyles.dayEventRow,
                    i < selectedDayHighlights.length - 1 && waStyles.dayEventRowBorder,
                    { borderLeftColor: getEventAccentColor(highlight) },
                  ]}
                >
                  <View style={waStyles.eventDetail}>
                    <Text style={waStyles.eventTitle} numberOfLines={2}>
                      {highlight.eventTitle}
                    </Text>
                    {highlight.time ? (
                      <Text style={waStyles.eventTime}>{highlight.time}</Text>
                    ) : null}
                    {highlight.prepNudge ? (
                      <Text style={waStyles.eventPrepNudge}>↳ {highlight.prepNudge}</Text>
                    ) : null}
                    {highlight.context ? (
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'flex-start',
                          gap: 4,
                          marginTop: 2,
                        }}
                      >
                        <Lightbulb
                          size={14}
                          color={WS.textSubtle}
                          strokeWidth={1.5}
                          style={{ marginTop: 2 }}
                        />
                        <Text style={[waStyles.eventContext, { flex: 1 }]}>
                          {highlight.context}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </Animated.View>
              ))
            ) : (
              <Animated.View entering={FadeIn.duration(200)} style={waStyles.dayEmptyState}>
                <Text style={waStyles.dayEmptyText}>
                  Nothing highlighted for {DAY_SHORT[selectedDay]}
                </Text>
              </Animated.View>
            )}
          </View>

          {/* Busy day warnings (if selected day has one) */}
          {weekAhead.busyDayWarnings
            .filter((w) => w.day.toLowerCase() === selectedDay.toLowerCase())
            .map((warning, i) => (
              <Animated.View
                key={`warn-${i}`}
                entering={FadeInUp.duration(250).delay(200)}
                style={waStyles.dayWarningBadge}
              >
                <AlertTriangle size={14} color={WS.golden} />
                <Text style={waStyles.dayWarningText}>{warning.comment}</Text>
              </Animated.View>
            ))}
        </Animated.View>
      )}

      {/* ── Toggle trigger ─────────────────────────────────────────────────── */}
      {(weekAhead.highlights.length > 0 || weekAhead.totalEventCount > 0) && (
        <Pressable
          onPress={handleToggleExpand}
          style={({ pressed }) => [waStyles.expandToggle, pressed && { opacity: 0.7 }]}
        >
          <Text style={waStyles.expandToggleText}>{expanded ? 'Collapse' : 'Day by day'}</Text>
          {expanded ? (
            <ChevronUp size={16} color={WS.sageDark} strokeWidth={2} />
          ) : (
            <ChevronDown size={16} color={WS.sageDark} strokeWidth={2} />
          )}
        </Pressable>
      )}

      {/* Remaining count (collapsed only) */}
      {!expanded && remainingCount > 0 && (
        <Text style={waStyles.totalEvents}>+ {remainingCount} other events</Text>
      )}
    </Animated.View>
  );
}

const waStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  introduction: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: WS.text,
    lineHeight: 24,
    marginBottom: 20,
  },
  highlightsContainer: {
    backgroundColor: WS.cardBg,
    borderRadius: BRAND.radius.lg,
    borderWidth: 1,
    borderColor: WS.border,
    paddingHorizontal: 4,
    marginBottom: 20,
  },
  eventRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    paddingLeft: 12,
    alignItems: 'flex-start',
  },
  eventRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: WS.border,
  },
  eventDayBadge: {
    width: 48,
    height: 28,
    borderRadius: BRAND.radius.sm,
    backgroundColor: WS.sageLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  eventDayText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    color: WS.sageDark,
    textTransform: 'uppercase',
  },
  eventDetail: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    color: WS.text,
  },
  eventTime: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: WS.textSubtle,
    marginTop: 2,
  },
  eventPrepNudge: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: WS.sageDark,
    lineHeight: 18,
    marginTop: 4,
    backgroundColor: WS.sageGlow,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    overflow: 'hidden',
  },
  eventContext: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: WS.textMuted,
    lineHeight: 19,
    marginTop: 2,
    fontStyle: 'italic',
  },
  warningSection: {
    backgroundColor: 'rgba(224, 196, 122, 0.08)',
    borderRadius: BRAND.radius.lg,
    padding: 16,
    marginBottom: 16,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  warningTitle: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: WS.text,
  },
  warningRow: {
    flexDirection: 'row',
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  warningDay: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: WS.text,
    marginRight: 4,
  },
  warningComment: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: WS.textSubtle,
    flex: 1,
  },
  totalEvents: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: WS.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },

  // ── Day-by-day expand ────────────────────────────────────────────────────
  dayPillRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 4,
  },
  dayPill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: BRAND.radius.md,
    backgroundColor: WS.sageLight,
    position: 'relative',
  },
  dayPillSelected: {
    backgroundColor: WS.sageDark,
  },
  dayPillText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: WS.textSubtle,
  },
  dayPillTextSelected: {
    color: '#FFFFFF',
  },
  dayPillDot: {
    position: 'absolute',
    bottom: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: WS.periwinkle,
  },
  dayEventsContainer: {
    backgroundColor: WS.cardBg,
    borderRadius: BRAND.radius.lg,
    borderWidth: 1,
    borderColor: WS.border,
    paddingHorizontal: 12,
    marginBottom: 12,
    minHeight: 48,
  },
  dayEventRow: {
    paddingVertical: 12,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    paddingLeft: 12,
  },
  dayEventRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: WS.border,
  },
  dayEmptyState: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  dayEmptyText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: WS.textMuted,
  },
  dayWarningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(224, 196, 122, 0.08)',
    borderRadius: BRAND.radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  dayWarningText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: WS.textSubtle,
    flex: 1,
  },
  expandToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 4,
    alignSelf: 'center',
  },
  expandToggleText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: WS.sageDark,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Progress dots
// ─────────────────────────────────────────────────────────────────────────────

function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <View style={wsStyles.dotsContainer}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            wsStyles.dot,
            i === current && wsStyles.dotActive,
            i < current && wsStyles.dotCompleted,
          ]}
        />
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────

export default function WeeklySummaryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<NativeStackScreenProps<RootStackParamList, 'WeeklySummary'>['route']>();
  const insets = useSafeAreaInsets();
  const weekStartParam = route.params?.weekStartDate;
  const currentWeekSummary = useCurrentWeekSummary();
  const paramSummary = useGremlyStore((state) =>
    weekStartParam ? selectSummaryByWeek(state, weekStartParam) : undefined,
  );
  const summary = paramSummary ?? currentWeekSummary;
  const content = summary?.content;

  // Detect v2 summary format (has cards array) and redirect
  const isV2Format = content && 'cards' in content && Array.isArray((content as any).cards);

  useEffect(() => {
    if (isV2Format) {
      navigation.replace('WeeklySummaryV2', { weekStartDate: weekStartParam });
    }
  }, [isV2Format, navigation, weekStartParam]);

  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const { submit: mindDropSubmit } = useMindDropSubmit();

  // ── Mind Drop handler for Gremly Recommends ──────────────────────────
  const handleOpenMindDrop = useCallback(
    async (prefillText: string) => {
      await mindDropSubmit(prefillText, { source: 'minddrop' });
      navigation.goBack();
    },
    [mindDropSubmit, navigation],
  );

  // ── Mark as viewed on mount ──────────────────────────────────────────
  useEffect(() => {
    if (summary?.id && !summary.viewed) {
      useGremlyStore.getState().markSummaryViewed(summary.id);
    }
  }, [summary?.id, summary?.viewed]);

  // ── Build cards array ────────────────────────────────────────────────
  const cards = useMemo((): CardType[] => {
    if (!content || isV2Format) return [];
    const result: CardType[] = [];

    // 1. Mood opener — the fortune cookie
    if (content.mood) {
      result.push({
        type: 'mood',
        mood: content.mood,
        weekType: content.weekType,
        weekTypeShort: content.weekTypeShort,
      });
    }

    // 2. Week in Review
    result.push({ type: 'weekInReview', content });

    // 3. Magic Moments card — only if AI returned any
    const moments = content.magicMoments ?? [];
    if (moments.length > 0) {
      result.push({ type: 'magicMoments', moments, weekType: content.weekType });
    }

    // 4. Split insights: stale_cleanup gets its own card, everything else stacks
    const staleInsight = content.insights.find((i) => i.type === 'stale_cleanup');
    const nonStaleInsights = content.insights.filter((i) => i.type !== 'stale_cleanup');

    if (nonStaleInsights.length > 0) {
      result.push({ type: 'insightsStack', insights: nonStaleInsights });
    }
    if (staleInsight) {
      result.push({ type: 'insight', insight: staleInsight, index: 0 });
    }

    // Gremly Suggests — temporarily hidden, revisit later
    // const recommendations = content.recommendations ?? [];
    // if (recommendations.length > 0) {
    //   result.push({ type: 'recommends', recommendations });
    // }

    // 5. Week Ahead
    result.push({ type: 'weekAhead', content });
    return result;
  }, [content, isV2Format]);

  // ── Navigation handlers ──────────────────────────────────────────────
  const handlePrevious = useCallback(() => {
    if (currentCardIndex <= 0) return;
    triggerLight();
    const prevIndex = currentCardIndex - 1;
    setCurrentCardIndex(prevIndex);
    flatListRef.current?.scrollToIndex({ index: prevIndex, animated: true });
  }, [currentCardIndex]);

  const handleNext = useCallback(() => {
    if (currentCardIndex < cards.length - 1) {
      triggerLight();
      const nextIndex = currentCardIndex + 1;
      setCurrentCardIndex(nextIndex);
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    }
  }, [currentCardIndex, cards.length]);

  const handleDone = useCallback(async () => {
    triggerSuccess();
    if (summary?.id) {
      await useGremlyStore.getState().markSummaryFlowCompleted(summary.id);
    }
    // Brief delay for haptic to register, then close
    setTimeout(() => {
      navigation.goBack();
    }, 200);
  }, [summary?.id, navigation]);

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

  // Don't render v1 UI while redirecting to v2
  if (isV2Format) {
    return <View style={{ flex: 1, backgroundColor: WS.bg }} />;
  }

  // ── Empty state ──────────────────────────────────────────────────────
  if (!summary || !content) {
    return (
      <View style={wsStyles.screen}>
        <View style={[wsStyles.header, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <X size={22} color={WS.text} strokeWidth={2} />
          </Pressable>
        </View>
        <View style={wsStyles.emptyContainer}>
          <Text style={wsStyles.emptyText}>Your weekly summary hasn't been generated yet.</Text>
          <Text style={wsStyles.emptySubtext}>Check back Sunday evening!</Text>
        </View>
      </View>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────
  return (
    <View style={wsStyles.screen}>
      {/* Header */}
      <View style={[wsStyles.header, { paddingTop: insets.top + 12 }]}>
        {/* Left — Back (hidden on first card) */}
        <View style={wsStyles.headerSide}>
          {currentCardIndex > 0 ? (
            <Pressable onPress={handlePrevious} hitSlop={12}>
              <ChevronLeft size={22} color={WS.sageDark} strokeWidth={2} />
            </Pressable>
          ) : (
            <View style={{ width: 22 }} />
          )}
        </View>

        {/* Center — Progress */}
        <View style={wsStyles.headerCenter}>
          <Text style={wsStyles.cardCountText}>
            {currentCardIndex + 1} of {cards.length}
          </Text>
          <ProgressDots total={cards.length} current={currentCardIndex} />
          {content?.weekTypeShort ? (
            <Text
              style={{
                fontSize: 10,
                fontFamily: 'Inter-Regular',
                color: WS.textMuted,
                textAlign: 'center',
                marginTop: 2,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
              }}
            >
              {content.weekTypeShort}
            </Text>
          ) : null}
        </View>

        {/* Right — Close */}
        <View style={wsStyles.headerSide}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <X size={22} color={WS.textSubtle} strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      {/* Card Flow */}
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
              style={wsStyles.cardScroll}
              contentContainerStyle={wsStyles.cardScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {item.type === 'mood' && (
                <MoodOpenerCard
                  mood={item.mood}
                  weekType={item.weekType}
                  weekTypeShort={item.weekTypeShort}
                />
              )}
              {item.type === 'weekInReview' && (
                <WeekInReviewCard
                  content={item.content}
                  stats={(summary?.stats_snapshot ?? {}) as Record<string, unknown>}
                  weekStart={summary?.week_start_date ?? ''}
                  weekEnd={summary?.week_end_date ?? ''}
                />
              )}
              {item.type === 'magicMoments' && (
                <MagicMomentsCard moments={item.moments} weekType={item.weekType} />
              )}
              {item.type === 'insightsStack' && (
                <InsightsStackCard insights={item.insights} navigation={navigation} />
              )}
              {item.type === 'insight' && item.insight.type === 'stale_cleanup' && (
                <StaleCleanupCard insight={item.insight} />
              )}
              {item.type === 'insight' && item.insight.type !== 'stale_cleanup' && (
                <InsightCard insight={item.insight} index={item.index} navigation={navigation} />
              )}
              {item.type === 'recommends' && (
                <GremlyRecommendsCard
                  recommendations={item.recommendations}
                  onOpenMindDrop={handleOpenMindDrop}
                />
              )}
              {item.type === 'weekAhead' && <WeekAheadCard content={item.content} />}
            </ScrollView>
          </View>
        )}
      />

      {/* Footer */}
      <View style={[wsStyles.footer, { paddingBottom: insets.bottom + 8 }]}>
        {currentCardIndex < cards.length - 1 ? (
          <Animated.View style={buttonAnimStyle}>
            <Pressable
              style={wsStyles.nextButton}
              onPress={handleNext}
              onPressIn={handleButtonPressIn}
              onPressOut={handleButtonPressOut}
            >
              <Text style={wsStyles.nextButtonText}>Next</Text>
              <ChevronRight size={18} color="#FFFFFF" strokeWidth={2.5} />
            </Pressable>
          </Animated.View>
        ) : (
          <Animated.View style={buttonAnimStyle}>
            <Pressable
              style={wsStyles.doneButton}
              onPress={handleDone}
              onPressIn={handleButtonPressIn}
              onPressOut={handleButtonPressOut}
            >
              <Check size={18} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={wsStyles.doneButtonText}>Done</Text>
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

const wsStyles = StyleSheet.create({
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
