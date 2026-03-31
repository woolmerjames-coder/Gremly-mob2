import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { ChevronDown, ChevronUp, Check, ArrowUp, X } from 'lucide-react-native';
import { Text } from '../../ui/Text';
import { lightTokens } from '../../design/tokens';
import type { HabitBuilderResolvedFields, HabitBuilderMode } from '../../lib/types';
import { getDateService } from '../../lib/date/DateService';
import { getFrequencyDisplayLabel } from '../../lib/habits/frequencyUtils';

interface HabitSummaryCardProps {
  resolved: HabitBuilderResolvedFields;
  mode: HabitBuilderMode | string | null;
  isCollapsed: boolean;
  onToggle: () => void;
  keyboardActive: boolean;
  messageCount: number;
}

const SAGE = '#5C6B5A';
const AMBER = '#C4922A';
const GOLD_BORDER = 'rgba(212, 164, 74, 0.5)';
const DEFAULT_BORDER = 'rgba(0, 0, 0, 0.06)';
const { fontFamily, size } = lightTokens.typography;

function formatFrequency(resolved: HabitBuilderResolvedFields): string | null {
  if (resolved.target) return resolved.target;
  return getFrequencyDisplayLabel(resolved.cadence, null);
}

function formatTimeWindow(tw: string | null): string | null {
  if (!tw || tw === 'anytime') return null;
  return tw.charAt(0).toUpperCase() + tw.slice(1) + 's';
}

function formatStartDate(startDate: string | null, readiness: string): string | null {
  if (readiness !== 'shaping' && readiness !== 'confirmable' && readiness !== 'locked') return null;
  if (!startDate)
    return readiness === 'confirmable' || readiness === 'locked' ? 'Starting today' : null;
  try {
    const d = new Date(startDate);
    const months = [
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
    return `Starting ${months[d.getMonth()]} ${d.getDate()}`;
  } catch {
    return `Starting ${startDate}`;
  }
}

function weeksUntil(endDate: string | null): number | null {
  if (!endDate) return null;
  try {
    const end = new Date(endDate);
    const now = getDateService().now();
    const diff = end.getTime() - now.getTime();
    if (diff <= 0) return 0;
    return Math.ceil(diff / (7 * 24 * 60 * 60 * 1000));
  } catch {
    return null;
  }
}

function buildAccessibilityLabel(resolved: HabitBuilderResolvedFields): string {
  const parts: string[] = ['Habit summary'];
  if (resolved.habit_type)
    parts.push(resolved.habit_type === 'build' ? 'Build habit' : 'Break habit');
  if (resolved.name) parts.push(resolved.name);
  const freq = formatFrequency(resolved);
  if (freq) parts.push(freq);
  if (resolved.readiness) parts.push(`Status: ${resolved.readiness}`);
  return parts.join(', ');
}

export function HabitSummaryCard({
  resolved,
  mode: _mode,
  isCollapsed,
  onToggle,
  keyboardActive,
  messageCount: _messageCount,
}: HabitSummaryCardProps) {
  const prevReadiness = useRef(resolved.readiness);
  const borderOpacity = useSharedValue(resolved.readiness === 'confirmable' ? 1 : 0);

  useEffect(() => {
    if (resolved.readiness === 'confirmable' && prevReadiness.current !== 'confirmable') {
      borderOpacity.value = withSequence(
        withTiming(0, { duration: 0 }),
        withTiming(1, { duration: 600, easing: Easing.out(Easing.ease) }),
      );
    }
    prevReadiness.current = resolved.readiness;
  }, [resolved.readiness, borderOpacity]);

  const animatedBorderStyle = useAnimatedStyle(() => {
    if (resolved.readiness === 'locked') {
      return { borderColor: SAGE, borderWidth: 1 };
    }
    if (resolved.readiness === 'confirmable') {
      return {
        borderColor: GOLD_BORDER,
        borderWidth: 1.5,
        opacity: 0.4 + borderOpacity.value * 0.6,
      };
    }
    return { borderColor: DEFAULT_BORDER, borderWidth: 1 };
  });

  // Hide entirely when exploring + keyboard active
  if (resolved.readiness === 'exploring' && keyboardActive) return null;

  // Collapsed view
  if (isCollapsed) {
    return (
      <Animated.View
        accessibilityRole="summary"
        accessibilityLabel={buildAccessibilityLabel(resolved)}
        style={[styles.card, animatedBorderStyle]}
      >
        <TouchableOpacity onPress={onToggle} style={styles.collapsedRow} activeOpacity={0.7}>
          {resolved.name ? (
            <View style={styles.collapsedContent}>
              {resolved.habit_type === 'break' ? (
                <X size={14} color={AMBER} strokeWidth={2.5} />
              ) : (
                <ArrowUp size={14} color={SAGE} strokeWidth={2.5} />
              )}
              <Text style={styles.collapsedName} numberOfLines={1}>
                {resolved.name}
                {formatFrequency(resolved) ? ` · ${formatFrequency(resolved)}` : ''}
              </Text>
            </View>
          ) : (
            <Text style={styles.collapsedPlaceholder}>Shaping your habit...</Text>
          )}
          <ChevronDown size={18} color="rgba(0, 0, 0, 0.3)" />
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // Expanded view
  const freq = formatFrequency(resolved);
  const timeWindow = formatTimeWindow(resolved.time_window);
  const startDate = formatStartDate(resolved.start_date, resolved.readiness);
  const isBreak = resolved.habit_type === 'break';
  const weeks = weeksUntil(resolved.end_date);

  const freqLine =
    isBreak && resolved.boundary_rule
      ? resolved.boundary_rule
      : [freq, timeWindow].filter(Boolean).join(' · ') || null;

  return (
    <Animated.View
      accessibilityRole="summary"
      accessibilityLabel={buildAccessibilityLabel(resolved)}
      style={[styles.card, animatedBorderStyle]}
    >
      <View style={styles.expandedHeader}>
        <View style={{ flex: 1 }} />
        {resolved.readiness === 'locked' ? (
          <Check size={18} color={SAGE} />
        ) : (
          <TouchableOpacity onPress={onToggle} hitSlop={12}>
            <ChevronUp size={18} color="rgba(0, 0, 0, 0.3)" />
          </TouchableOpacity>
        )}
      </View>

      {resolved.habit_type && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.typeBadge}>
          {isBreak ? (
            <X size={12} color={AMBER} strokeWidth={2.5} />
          ) : (
            <ArrowUp size={12} color={SAGE} strokeWidth={2.5} />
          )}
          <Text style={[styles.typeBadgeText, { color: isBreak ? AMBER : SAGE }]}>
            {isBreak ? 'Break' : 'Build'}
          </Text>
        </Animated.View>
      )}

      {resolved.name && (
        <Animated.View entering={FadeIn.duration(200)}>
          <Text style={styles.habitName}>{resolved.name}</Text>
        </Animated.View>
      )}

      {freqLine && (
        <Animated.View entering={FadeIn.duration(200)}>
          <Text style={styles.detailText}>{freqLine}</Text>
        </Animated.View>
      )}

      {startDate && (
        <Animated.View entering={FadeIn.duration(200)}>
          <Text style={styles.detailText}>{startDate}</Text>
        </Animated.View>
      )}

      {resolved.notes && (
        <Animated.View entering={FadeIn.duration(200)}>
          <Text style={styles.notesText}>{resolved.notes}</Text>
        </Animated.View>
      )}

      {isBreak && resolved.trigger && (
        <Animated.View entering={FadeIn.duration(200)}>
          <Text style={styles.detailText}>Trigger: {resolved.trigger}</Text>
        </Animated.View>
      )}

      {isBreak && resolved.replacement_behavior && (
        <Animated.View entering={FadeIn.duration(200)}>
          <Text style={styles.detailText}>Instead: {resolved.replacement_behavior}</Text>
        </Animated.View>
      )}

      {resolved.event_name && (
        <Animated.View entering={FadeIn.duration(200)}>
          <Text style={styles.detailText}>Training for: {resolved.event_name}</Text>
          {resolved.end_date && weeks !== null && (
            <Text style={styles.detailText}>
              {resolved.end_date} · {weeks} week{weeks !== 1 ? 's' : ''} to go
            </Text>
          )}
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  collapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  collapsedContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  collapsedName: {
    fontFamily: fontFamily.medium,
    fontSize: size.sm,
    color: lightTokens.colors.charcoal,
    flex: 1,
  },
  collapsedPlaceholder: {
    fontFamily: fontFamily.regular,
    fontSize: size.sm,
    color: 'rgba(0, 0, 0, 0.4)',
    flex: 1,
  },
  expandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  typeBadgeText: {
    fontFamily: fontFamily.medium,
    fontSize: size.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  habitName: {
    fontFamily: fontFamily.medium,
    fontSize: 16,
    fontWeight: '600',
    color: lightTokens.colors.charcoal,
    marginBottom: 4,
  },
  detailText: {
    fontFamily: fontFamily.regular,
    fontSize: size.sm,
    color: 'rgba(0, 0, 0, 0.55)',
    marginBottom: 2,
  },
  notesText: {
    fontFamily: fontFamily.regular,
    fontSize: size.sm,
    fontStyle: 'italic',
    color: 'rgba(0, 0, 0, 0.45)',
    marginBottom: 2,
  },
});
