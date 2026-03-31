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
import {
  ArrowUp,
  X,
  Repeat,
  Calendar,
  Sunrise,
  Sun,
  Moon,
  Clock,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
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

// ─── Metadata Chip ──────────────────────────────────────────────
function MetadataChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <View style={metaStyles.chip}>
      {icon}
      <Text style={metaStyles.label}>{label}</Text>
    </View>
  );
}

const metaStyles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    gap: 2,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: CREAM_MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
});

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

  // ── Expanded — build metadata ─────────────────────────────────
  const startDate = formatStartDate(resolved.start_date, resolved.readiness);

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

      {/* Row 2: Metadata chips */}
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 6 }}>
        {resolved.habit_type && (
          <MetadataChip
            icon={
              resolved.habit_type === 'break' ? (
                <X size={14} color={CREAM_MUTED} strokeWidth={2} />
              ) : (
                <ArrowUp size={14} color={CREAM_MUTED} strokeWidth={2} />
              )
            }
            label={resolved.habit_type === 'break' ? 'Break' : 'Build'}
          />
        )}
        {freq && (
          <MetadataChip
            icon={<Repeat size={14} color={CREAM_MUTED} strokeWidth={2} />}
            label={freq}
          />
        )}
        {resolved.time_window && resolved.time_window !== 'anytime' && (
          <MetadataChip
            icon={
              resolved.time_window === 'morning' ? (
                <Sunrise size={14} color={CREAM_MUTED} strokeWidth={2} />
              ) : resolved.time_window === 'afternoon' ? (
                <Sun size={14} color={CREAM_MUTED} strokeWidth={2} />
              ) : resolved.time_window === 'evening' ? (
                <Moon size={14} color={CREAM_MUTED} strokeWidth={2} />
              ) : (
                <Clock size={14} color={CREAM_MUTED} strokeWidth={2} />
              )
            }
            label={resolved.time_window.charAt(0).toUpperCase() + resolved.time_window.slice(1)}
          />
        )}
        {startDate && (
          <MetadataChip
            icon={<Calendar size={14} color={CREAM_MUTED} strokeWidth={2} />}
            label={startDate.replace('Starts ', '')}
          />
        )}
      </View>

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
