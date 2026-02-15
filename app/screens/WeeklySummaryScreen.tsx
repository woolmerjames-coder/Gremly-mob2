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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import Animated, {
  FadeInUp,
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
  AlertTriangle,
  Lightbulb,
} from 'lucide-react-native';
import { BRAND } from '../../design/brand';
import { useCurrentWeekSummary } from '../../lib/store/selectors';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { triggerLight, triggerSuccess } from '../../lib/haptics';
import type { WeeklySummaryContent, WeeklySummaryInsight } from '../../lib/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────
// Weekly Summary color palette — warmer & calmer than the main app
// ─────────────────────────────────────────────────────────────────────────────

const WS = {
  bg: '#FFF6ED', // Warm cream background
  cardBg: '#FFFCF8', // Slightly warmer card
  sage: '#BFD8C0', // Accent (progress dots, highlights)
  sageDark: '#2E5540', // Text on sage backgrounds
  sageLight: 'rgba(191, 216, 192, 0.3)', // Subtle sage tint
  sageGlow: 'rgba(191, 216, 192, 0.15)', // Very subtle background tint
  text: '#222222', // Primary text (charcoalInk)
  textSubtle: 'rgba(34, 34, 34, 0.55)', // Secondary text
  textMuted: 'rgba(34, 34, 34, 0.35)', // Tertiary text
  border: 'rgba(0, 0, 0, 0.06)', // Card borders
  periwinkle: '#9CA6E0', // Used sparingly for calendar/event accents
  golden: '#E0C47A', // Used for highlight moment star
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Card type union
// ─────────────────────────────────────────────────────────────────────────────

type CardType =
  | { type: 'weekInReview'; content: WeeklySummaryContent }
  | { type: 'insight'; insight: WeeklySummaryInsight; index: number }
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
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
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
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: WS.text,
    lineHeight: 24,
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: WS.sageGlow,
    borderRadius: BRAND.radius.lg,
    paddingVertical: 16,
    paddingHorizontal: 8,
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  statNumber: {
    fontSize: 24,
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
    color: WS.textSubtle,
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

  if (journalEntries > 0) statItems.push({ value: journalEntries, label: 'journals' });
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

      {/* Stats row */}
      {statItems.length > 0 && (
        <Animated.View entering={FadeInUp.duration(300).delay(200)} style={wirStyles.statsRow}>
          {statItems.map((item, i) => (
            <Animated.View
              key={item.label}
              entering={FadeInUp.duration(250).delay(250 + i * 100)}
              style={wirStyles.statItem}
            >
              <View style={wirStyles.statValueRow}>
                <Text style={wirStyles.statNumber}>{item.value}</Text>
                {item.trend === 'up' && <Text style={wirStyles.trendUp}>↑</Text>}
                {item.trend === 'down' && <Text style={wirStyles.trendDown}>↓</Text>}
              </View>
              <Text style={wirStyles.statLabel}>{item.label}</Text>
            </Animated.View>
          ))}
        </Animated.View>
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

      {/* Mood */}
      {content.mood ? <Text style={wirStyles.mood}>Mood: {content.mood ?? ''}</Text> : null}
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
};

const INSIGHT_STYLE: Record<string, { accent: string; bg: string }> = {
  stale_cleanup: { accent: '#E0C47A', bg: 'rgba(224, 196, 122, 0.1)' },
  capture_ratio: { accent: '#9CA6E0', bg: 'rgba(156, 166, 224, 0.1)' },
  productivity_pattern: { accent: '#BFD8C0', bg: 'rgba(191, 216, 192, 0.1)' },
  space_activity: { accent: '#BFD8C0', bg: 'rgba(191, 216, 192, 0.1)' },
  balance: { accent: '#9CA6E0', bg: 'rgba(156, 166, 224, 0.1)' },
  habit_observation: { accent: '#A5F3C1', bg: 'rgba(165, 243, 193, 0.1)' },
  journal_encouragement: { accent: '#E0C47A', bg: 'rgba(224, 196, 122, 0.1)' },
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
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: WS.text,
    lineHeight: 24,
    marginBottom: 20,
  },
  cardAccent: {
    height: 3,
    borderTopLeftRadius: BRAND.radius['2xl'],
    borderTopRightRadius: BRAND.radius['2xl'],
    marginHorizontal: -24,
    marginTop: -24,
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
    height: 44,
    borderRadius: BRAND.radius.lg,
    borderWidth: 1.5,
  },
  actionButtonText: {
    fontSize: 15,
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
              { backgroundColor: style.bg, borderColor: style.accent },
              pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
            ]}
            onPress={() => handleInsightAction(insight)}
          >
            <Text style={[insStyles.actionButtonText, { color: style.accent }]}>
              {insight.actionLabel}
            </Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

function WeekAheadCard({ content }: { content: WeeklySummaryContent }) {
  const weekAhead = content.weekAhead ?? {
    introduction: '',
    highlights: [],
    busyDayWarnings: [],
    totalEventCount: 0,
  };
  const remainingCount = weekAhead.totalEventCount - weekAhead.highlights.length;

  return (
    <Animated.View entering={FadeInUp.duration(300).delay(100)} style={wsStyles.card}>
      {/* Header */}
      <View style={waStyles.header}>
        <Calendar size={20} color={WS.periwinkle} strokeWidth={2} />
        <Text style={wsStyles.cardTitle}>Week Ahead</Text>
      </View>

      {/* Introduction */}
      <Text style={waStyles.introduction}>{weekAhead.introduction ?? ''}</Text>

      {/* Event Highlights */}
      {weekAhead.highlights.length > 0 && (
        <View style={waStyles.highlightsContainer}>
          {weekAhead.highlights.map((highlight, i) => (
            <Animated.View
              key={i}
              entering={FadeInUp.duration(250).delay(100 + i * 80)}
              style={[
                waStyles.eventRow,
                i < weekAhead.highlights.length - 1 && waStyles.eventRowBorder,
              ]}
            >
              <View style={waStyles.eventDayBadge}>
                <Text style={waStyles.eventDayText}>{highlight.day.slice(0, 3).toUpperCase()}</Text>
              </View>
              <View style={waStyles.eventDetail}>
                <Text style={waStyles.eventTitle} numberOfLines={2}>
                  {highlight.eventTitle}
                </Text>
                {highlight.time ? <Text style={waStyles.eventTime}>{highlight.time}</Text> : null}
                {highlight.prepNudge ? (
                  <Text style={waStyles.eventPrepNudge}>↳ {highlight.prepNudge}</Text>
                ) : null}
                {highlight.context ? (
                  <View
                    style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 2 }}
                  >
                    <Lightbulb
                      size={14}
                      color={WS.textSubtle}
                      strokeWidth={1.5}
                      style={{ marginTop: 2 }}
                    />
                    <Text style={[waStyles.eventContext, { flex: 1 }]}>{highlight.context}</Text>
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

      {/* Total event count */}
      {remainingCount > 0 && (
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
    fontFamily: 'Inter-Regular',
    color: WS.sageDark,
    fontStyle: 'italic',
    marginTop: 4,
  },
  eventContext: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: WS.textSubtle,
    marginTop: 4,
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
  const summary = useCurrentWeekSummary();
  const content = summary?.content;

  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  // ── Mark as viewed on mount ──────────────────────────────────────────
  useEffect(() => {
    if (summary?.id && !summary.viewed) {
      useGremlyStore.getState().markSummaryViewed(summary.id);
    }
  }, [summary?.id, summary?.viewed]);

  // ── Build cards array ────────────────────────────────────────────────
  const cards = useMemo((): CardType[] => {
    if (!content) return [];
    const result: CardType[] = [];
    result.push({ type: 'weekInReview', content });
    content.insights.forEach((insight, i) => {
      result.push({ type: 'insight', insight, index: i });
    });
    result.push({ type: 'weekAhead', content });
    return result;
  }, [content]);

  // ── Navigation handlers ──────────────────────────────────────────────
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

  // ── Empty state ──────────────────────────────────────────────────────
  if (!summary || !content) {
    return (
      <SafeAreaView style={wsStyles.screen} edges={['top', 'bottom']}>
        <View style={wsStyles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <X size={22} color={WS.text} strokeWidth={2} />
          </Pressable>
        </View>
        <View style={wsStyles.emptyContainer}>
          <Text style={wsStyles.emptyText}>Your weekly summary hasn't been generated yet.</Text>
          <Text style={wsStyles.emptySubtext}>Check back Sunday evening!</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────
  return (
    <SafeAreaView style={wsStyles.screen} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={wsStyles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <X size={22} color={WS.text} strokeWidth={2} />
        </Pressable>
        <View style={wsStyles.headerCenter}>
          <Text style={wsStyles.cardCountText}>
            {currentCardIndex + 1} of {cards.length}
          </Text>
          <ProgressDots total={cards.length} current={currentCardIndex} />
        </View>
        <View style={{ width: 22 }} />
      </View>

      {/* Card Flow */}
      <FlatList
        ref={flatListRef}
        data={cards}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={{ width: SCREEN_WIDTH }}>
            <ScrollView
              style={wsStyles.cardScroll}
              contentContainerStyle={wsStyles.cardScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {item.type === 'weekInReview' && (
                <WeekInReviewCard
                  content={item.content}
                  stats={(summary?.stats_snapshot ?? {}) as Record<string, unknown>}
                  weekStart={summary?.week_start_date ?? ''}
                  weekEnd={summary?.week_end_date ?? ''}
                />
              )}
              {item.type === 'insight' && (
                <InsightCard insight={item.insight} index={item.index} navigation={navigation} />
              )}
              {item.type === 'weekAhead' && <WeekAheadCard content={item.content} />}
            </ScrollView>
          </View>
        )}
      />

      {/* Footer */}
      <View style={wsStyles.footer}>
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
    </SafeAreaView>
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
  headerCenter: {
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
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: WS.sageLight,
  },
  dotActive: {
    backgroundColor: WS.sage,
    width: 24,
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
    paddingBottom: 24,
  },
  card: {
    backgroundColor: WS.cardBg,
    borderRadius: BRAND.radius['2xl'],
    padding: 24,
    ...BRAND.elevation.one,
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
