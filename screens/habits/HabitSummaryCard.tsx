import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { ChevronDown, ChevronUp, Check } from 'lucide-react-native';
import { Text } from '../../ui/Text';
import { lightTokens } from '../../design/tokens';
import { getFrequencyDisplayLabel } from '../../lib/habits/frequencyUtils';
import { getDateService } from '../../lib/date/DateService';
import type { HabitBuilderResolvedFields, HabitBuilderMode } from '../../lib/types';

// ─── Design tokens ──────────────────────────────────────────────
const CARD_BG = '#2D3B2D';
const CREAM = '#F9F6F1';
const CREAM_MUTED = 'rgba(249, 246, 241, 0.55)';
const CREAM_SEPARATOR = 'rgba(249, 246, 241, 0.12)';
const AMBER = '#E0C47A';
const SAGE_CHECK = '#8FA88D';
const CONFIRMABLE_BORDER = 'rgba(224, 196, 122, 0.4)';

const { fontFamily } = lightTokens.typography;

// ─── Props ──────────────────────────────────────────────────────
interface HabitSummaryCardProps {
  resolved: HabitBuilderResolvedFields;
  mode: HabitBuilderMode | string | null;
  isCollapsed: boolean;
  onToggle: () => void;
  keyboardActive: boolean;
  messageCount: number;
}

// ─── Helpers ────────────────────────────────────────────────────
function formatFrequency(resolved: HabitBuilderResolvedFields): string | null {
  if (resolved.target) return resolved.target;
  return getFrequencyDisplayLabel(resolved.cadence, null);
}

function formatTimeWindow(tw: string | null | undefined): string | null {
  if (!tw || tw === 'anytime') return null;
  return tw.charAt(0).toUpperCase() + tw.slice(1) + 's';
}

function formatStartDate(startDate: string | null, readiness: string): string | null {
  if (readiness === 'exploring') return null;
  if (!startDate)
    return readiness === 'confirmable' || readiness === 'locked' ? 'Starts today' : null;
  try {
    const ds = getDateService();
    const d = new Date(startDate + 'T00:00:00');
    const todayStr = ds.today();
    const tomorrowStr = ds.tomorrow();

    if (startDate === todayStr) return 'Starts today';
    if (startDate === tomorrowStr) return 'Starts tomorrow';

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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
    const today = ds.now();
    const diffDays = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // Within the next 7 days: show day name
    if (diffDays > 0 && diffDays <= 7) {
      return `Starts ${days[d.getDay()]}`;
    }
    // Further out: show month + day
    return `Starts ${months[d.getMonth()]} ${d.getDate()}`;
  } catch {
    return `Starts ${startDate}`;
  }
}

function weeksUntil(endDate: string | null | undefined): number | null {
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

// ─── Main Card ──────────────────────────────────────────────────
export function HabitSummaryCard({
  resolved,
  mode: _mode,
  isCollapsed,
  onToggle,
  keyboardActive,
  messageCount: _messageCount,
}: HabitSummaryCardProps) {
  const prevReadiness = useRef(resolved.readiness);
  const borderProgress = useSharedValue(resolved.readiness === 'confirmable' ? 1 : 0);

  useEffect(() => {
    if (resolved.readiness === 'confirmable' && prevReadiness.current !== 'confirmable') {
      borderProgress.value = withSequence(
        withTiming(0, { duration: 0 }),
        withTiming(1, { duration: 600, easing: Easing.out(Easing.ease) }),
      );
    }
    prevReadiness.current = resolved.readiness;
  }, [resolved.readiness, borderProgress]);

  const animatedBorderStyle = useAnimatedStyle(() => {
    if (resolved.readiness === 'locked') {
      return { borderColor: SAGE_CHECK, borderWidth: 1 };
    }
    if (resolved.readiness === 'confirmable') {
      return {
        borderColor: CONFIRMABLE_BORDER,
        borderWidth: borderProgress.value,
      };
    }
    return { borderColor: 'transparent', borderWidth: 0 };
  });

  // Hide entirely when exploring + keyboard active
  if (resolved.readiness === 'exploring' && keyboardActive) return null;

  const isBreak = resolved.habit_type === 'break';
  const freq = formatFrequency(resolved);

  // ── Collapsed ─────────────────────────────────────────────────
  if (isCollapsed) {
    const dotColor = isBreak ? AMBER : SAGE_CHECK;

    return (
      <Animated.View
        accessibilityRole="summary"
        accessibilityLabel={buildAccessibilityLabel(resolved)}
        style={[styles.card, animatedBorderStyle]}
      >
        <TouchableOpacity onPress={onToggle} style={styles.collapsedRow} activeOpacity={0.7}>
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
          <View style={styles.collapsedCenter}>
            {resolved.name ? (
              <Text style={styles.collapsedName} numberOfLines={1}>
                {resolved.name}
                {freq ? <Text style={styles.collapsedFreq}>{` · ${freq}`}</Text> : null}
              </Text>
            ) : (
              <Text style={styles.collapsedPlaceholder}>Shaping your habit...</Text>
            )}
          </View>
          {resolved.readiness === 'locked' ? (
            <Check size={14} color={CREAM} />
          ) : (
            <ChevronDown size={14} color={CREAM_MUTED} />
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // ── Expanded — build metadata segments ────────────────────────
  const timeWindow = formatTimeWindow(resolved.time_window);
  const startDate = formatStartDate(resolved.start_date, resolved.readiness);
  const weeks = weeksUntil(resolved.end_date);

  const metaSegments: string[] = [];
  if (resolved.habit_type) {
    metaSegments.push(resolved.habit_type === 'break' ? 'BREAK' : 'BUILD');
  }
  const freqValue = isBreak && resolved.boundary_rule ? resolved.boundary_rule : freq;
  if (freqValue) metaSegments.push(freqValue);
  if (timeWindow) metaSegments.push(timeWindow);
  if (startDate) metaSegments.push(startDate);
  if (weeks !== null) {
    metaSegments.push(`${weeks} week${weeks !== 1 ? 's' : ''} to go`);
  }

  const metaLine = metaSegments.length > 0 ? metaSegments.join(' · ') : null;

  // Break trigger/replacement line
  const breakLine =
    isBreak && resolved.trigger && resolved.replacement_behavior
      ? `When ${resolved.trigger} → ${resolved.replacement_behavior}`
      : null;

  const hasSubstantiveFields =
    resolved.name && (formatFrequency(resolved) || resolved.time_window || resolved.start_date);
  const hasNotes = hasSubstantiveFields && (!!resolved.notes || !!breakLine);

  return (
    <Animated.View
      accessibilityRole="summary"
      accessibilityLabel={buildAccessibilityLabel(resolved)}
      style={[styles.card, animatedBorderStyle]}
    >
      {/* Row 1: Name + chevron */}
      <View style={styles.expandedHeader}>
        <View style={styles.nameContainer}>
          {resolved.name ? (
            <Text style={styles.habitName} numberOfLines={2}>
              {resolved.name}
            </Text>
          ) : (
            <Text style={styles.namePlaceholder}>Shaping your habit...</Text>
          )}
        </View>
        {resolved.readiness === 'locked' ? (
          <Check size={14} color={CREAM} />
        ) : (
          <TouchableOpacity onPress={onToggle} hitSlop={12}>
            <ChevronUp size={14} color={CREAM_MUTED} />
          </TouchableOpacity>
        )}
      </View>

      {/* Row 2: Metadata line */}
      {metaLine && (
        <Animated.View entering={FadeIn.duration(200)} key={metaLine}>
          <Text style={styles.metaLine}>{metaLine}</Text>
        </Animated.View>
      )}

      {/* Row 3: Separator (only if notes exist) */}
      {hasNotes && <View style={styles.separator} />}

      {/* Row 4: Break trigger/replacement */}
      {hasSubstantiveFields && breakLine && (
        <Animated.View entering={FadeIn.duration(200)}>
          <Text style={styles.breakLine}>{breakLine}</Text>
        </Animated.View>
      )}

      {/* Row 4: Notes */}
      {hasSubstantiveFields && resolved.notes && (
        <Animated.View entering={FadeIn.duration(200)}>
          <Text style={styles.notesText}>{resolved.notes}</Text>
        </Animated.View>
      )}
    </Animated.View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  collapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  collapsedCenter: {
    flex: 1,
    marginLeft: 10,
  },
  collapsedName: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: CREAM,
  },
  collapsedFreq: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: CREAM_MUTED,
  },
  collapsedPlaceholder: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: CREAM_MUTED,
  },
  expandedHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  nameContainer: {
    flex: 1,
    marginRight: 12,
  },
  habitName: {
    fontFamily: fontFamily.medium,
    fontSize: 16,
    fontWeight: '600',
    color: CREAM,
  },
  namePlaceholder: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    color: CREAM_MUTED,
  },
  metaLine: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: CREAM_MUTED,
    fontWeight: '500',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  separator: {
    height: 1,
    backgroundColor: CREAM_SEPARATOR,
    marginVertical: 8,
  },
  breakLine: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: AMBER,
    marginBottom: 2,
  },
  notesText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: CREAM_MUTED,
  },
});
