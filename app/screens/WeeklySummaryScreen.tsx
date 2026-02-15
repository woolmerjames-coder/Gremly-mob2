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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
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
} from 'lucide-react-native';
import { BRAND } from '../../design/brand';
import { useCurrentWeekSummary } from '../../lib/store/selectors';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { addDays, nextMonday, format } from 'date-fns';
import { triggerLight, triggerSuccess } from '../../lib/haptics';
import { getDateService } from '../../lib/date';
import type { WeeklySummaryContent, WeeklySummaryInsight } from '../../lib/types';

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

      {/* Divider */}
      {statItems.length > 0 && <View style={wirStyles.sectionDivider} />}

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
  const [allCleared, setAllCleared] = useState(false);

  type StaleEntity = {
    id: string;
    entityType: 'todo' | 'habit';
    name?: string;
    title?: string;
    created_at?: string;
    sweep_reschedule_count?: number;
  };

  const staleItems: StaleEntity[] = useMemo(() => {
    return staleItemIds
      .map((id) => {
        const todo = todos.find((t) => t.id === id);
        if (todo) return { ...todo, entityType: 'todo' as const };
        const habit = habits.find((h) => h.id === id);
        if (habit) return { ...habit, entityType: 'habit' as const };
        return null;
      })
      .filter((item): item is StaleEntity => item !== null);
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
      const created = new Date(item.created_at);
      const ageDays = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24));
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

                  {/* Confirmed date chip (shown after reschedule pick) */}
                  {confirmedDate ? (
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
                              const tomorrow = addDays(new Date(), 1);
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
                              const monday = nextMonday(new Date());
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
                              const twoWeeks = addDays(new Date(), 14);
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
  const insets = useSafeAreaInsets();
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
              {item.type === 'weekInReview' && (
                <WeekInReviewCard
                  content={item.content}
                  stats={(summary?.stats_snapshot ?? {}) as Record<string, unknown>}
                  weekStart={summary?.week_start_date ?? ''}
                  weekEnd={summary?.week_end_date ?? ''}
                />
              )}
              {item.type === 'insight' && item.insight.type === 'stale_cleanup' && (
                <StaleCleanupCard insight={item.insight} />
              )}
              {item.type === 'insight' && item.insight.type !== 'stale_cleanup' && (
                <InsightCard insight={item.insight} index={item.index} navigation={navigation} />
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
