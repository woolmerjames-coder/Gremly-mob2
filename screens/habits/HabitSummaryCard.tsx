import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import {
  ChevronDown,
  ChevronUp,
  Check,
  ArrowUp,
  X,
  Calendar,
  Clock,
  Repeat,
  Zap,
  Shield,
  Flag,
} from 'lucide-react-native';
import { Text } from '../../ui/Text';
import { lightTokens } from '../../design/tokens';
import { getFrequencyDisplayLabel } from '../../lib/habits/frequencyUtils';
import { getDateService } from '../../lib/date/DateService';
import type { HabitBuilderResolvedFields, HabitBuilderMode } from '../../lib/types';

// ─── Design tokens ──────────────────────────────────────────────
const SAGE = '#5C6B5A';
const SAGE_LIGHT = 'rgba(92, 107, 90, 0.10)';
const SAGE_MUTED = 'rgba(92, 107, 90, 0.45)';
const AMBER = '#C4922A';
const AMBER_LIGHT = 'rgba(196, 146, 42, 0.10)';
const AMBER_MUTED = 'rgba(196, 146, 42, 0.45)';
const GOLD_BORDER = 'rgba(212, 164, 74, 0.5)';
const DEFAULT_BORDER = 'rgba(0, 0, 0, 0.05)';
const CARD_BG = 'rgba(255, 255, 255, 0.94)';
const LOCKED_BG = 'rgba(92, 107, 90, 0.03)';

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
  if (!startDate) return readiness === 'confirmable' || readiness === 'locked' ? 'Today' : null;
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
    return `${months[d.getMonth()]} ${d.getDate()}`;
  } catch {
    return startDate;
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

// ─── AnimatedCheck ──────────────────────────────────────────────
function AnimatedCheck() {
  const scale = useSharedValue(0);

  useEffect(() => {
    scale.value = withDelay(150, withSpring(1, { damping: 12, stiffness: 200 }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.checkCircle, animStyle]}>
      <Check size={9} color="#FFFFFF" strokeWidth={3} />
    </Animated.View>
  );
}

// ─── PropertyRow ────────────────────────────────────────────────
interface PropertyRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  delay: number;
}

function PropertyRow({ icon, label, value, delay }: PropertyRowProps) {
  return (
    <Animated.View entering={FadeIn.duration(250).delay(delay)} style={styles.propertyRow}>
      {icon}
      <View style={styles.propertyContent}>
        <Text style={styles.propertyLabel}>{label}</Text>
        <Text style={styles.propertyValue}>{value}</Text>
      </View>
      <AnimatedCheck />
    </Animated.View>
  );
}

function RowSeparator() {
  return <View style={styles.rowSeparator} />;
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
        withTiming(1, { duration: 800, easing: Easing.out(Easing.ease) }),
      );
    }
    prevReadiness.current = resolved.readiness;
  }, [resolved.readiness, borderProgress]);

  const animatedBorderStyle = useAnimatedStyle(() => {
    if (resolved.readiness === 'locked') {
      return {
        borderColor: SAGE,
        borderWidth: 1.5,
        backgroundColor: LOCKED_BG,
      };
    }
    if (resolved.readiness === 'confirmable') {
      const p = borderProgress.value;
      return {
        borderColor: GOLD_BORDER,
        borderWidth: 1.5,
        shadowColor: '#D4A44A',
        shadowOpacity: p * 0.12,
        shadowRadius: p * 10,
        shadowOffset: { width: 0, height: 0 },
      };
    }
    return { borderColor: DEFAULT_BORDER, borderWidth: 1 };
  });

  // Hide entirely when exploring + keyboard active
  if (resolved.readiness === 'exploring' && keyboardActive) return null;

  const isBreak = resolved.habit_type === 'break';
  const dotColor = isBreak ? AMBER : SAGE;
  const freq = formatFrequency(resolved);

  // ── Collapsed ─────────────────────────────────────────────────
  if (isCollapsed) {
    return (
      <Animated.View
        accessibilityRole="summary"
        accessibilityLabel={buildAccessibilityLabel(resolved)}
        style={[styles.card, styles.cardCollapsed, animatedBorderStyle]}
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
            <Check size={13} color={SAGE} />
          ) : (
            <ChevronDown size={15} color="rgba(0, 0, 0, 0.2)" />
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // ── Expanded — Build property rows ────────────────────────────
  const timeWindow = formatTimeWindow(resolved.time_window);
  const startDate = formatStartDate(resolved.start_date, resolved.readiness);
  const weeks = weeksUntil(resolved.end_date);

  const rows: Array<{ icon: React.ReactNode; label: string; value: string }> = [];

  // Frequency / boundary rule
  const freqValue = isBreak && resolved.boundary_rule ? resolved.boundary_rule : freq;
  if (freqValue) {
    rows.push({
      icon: <Repeat size={13} color={SAGE_MUTED} />,
      label: 'Frequency',
      value: freqValue,
    });
  }

  // Time window
  if (timeWindow) {
    rows.push({
      icon: <Clock size={13} color={SAGE_MUTED} />,
      label: 'Time',
      value: timeWindow,
    });
  }

  // Start date
  if (startDate) {
    rows.push({
      icon: <Calendar size={13} color={SAGE_MUTED} />,
      label: 'Starts',
      value: startDate,
    });
  }

  // Break-specific: Trigger
  if (isBreak && resolved.trigger) {
    rows.push({
      icon: <Zap size={13} color={AMBER_MUTED} />,
      label: 'Trigger',
      value: resolved.trigger,
    });
  }

  // Break-specific: Replacement
  if (isBreak && resolved.replacement_behavior) {
    rows.push({
      icon: <Shield size={13} color={AMBER_MUTED} />,
      label: 'Instead',
      value: resolved.replacement_behavior,
    });
  }

  // Event-specific: Goal
  if (resolved.event_name) {
    const goalValue =
      weeks !== null
        ? `${resolved.event_name} · ${weeks} week${weeks !== 1 ? 's' : ''} to go`
        : resolved.event_name;
    rows.push({
      icon: <Flag size={13} color={SAGE_MUTED} />,
      label: 'Goal',
      value: goalValue,
    });
  }

  return (
    <Animated.View
      accessibilityRole="summary"
      accessibilityLabel={buildAccessibilityLabel(resolved)}
      style={[styles.card, animatedBorderStyle]}
    >
      {/* Header: type badge + collapse/locked */}
      <View style={styles.expandedHeader}>
        {resolved.habit_type ? (
          <View style={[styles.typeBadge, { backgroundColor: isBreak ? AMBER_LIGHT : SAGE_LIGHT }]}>
            {isBreak ? (
              <X size={11} color={AMBER} strokeWidth={2.5} />
            ) : (
              <ArrowUp size={11} color={SAGE} strokeWidth={2.5} />
            )}
            <Text style={[styles.typeBadgeText, { color: isBreak ? AMBER : SAGE }]}>
              {isBreak ? 'BREAK' : 'BUILD'}
            </Text>
          </View>
        ) : (
          <View />
        )}
        {resolved.readiness === 'locked' ? (
          <View style={styles.lockedCircle}>
            <Check size={12} color="#FFFFFF" />
          </View>
        ) : (
          <TouchableOpacity onPress={onToggle} hitSlop={12}>
            <ChevronUp size={15} color="rgba(0, 0, 0, 0.2)" />
          </TouchableOpacity>
        )}
      </View>

      {/* Habit name */}
      {resolved.name && (
        <Animated.View entering={FadeIn.duration(250)}>
          <Text style={styles.habitName}>{resolved.name}</Text>
        </Animated.View>
      )}

      {/* Property rows */}
      {rows.length > 0 && (
        <View style={styles.propertiesSection}>
          {rows.map((row, i) => (
            <React.Fragment key={row.label}>
              {i > 0 && <RowSeparator />}
              <PropertyRow icon={row.icon} label={row.label} value={row.value} delay={i * 60} />
            </React.Fragment>
          ))}
        </View>
      )}

      {/* Notes */}
      {resolved.notes && (
        <Animated.View entering={FadeIn.duration(250)}>
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
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardCollapsed: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  collapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  collapsedCenter: {
    flex: 1,
    marginLeft: 10,
  },
  collapsedName: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: lightTokens.colors.charcoal,
  },
  collapsedFreq: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: 'rgba(0, 0, 0, 0.4)',
  },
  collapsedPlaceholder: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: 'rgba(0, 0, 0, 0.4)',
  },
  expandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  typeBadgeText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  lockedCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: SAGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  habitName: {
    fontFamily: fontFamily.medium,
    fontSize: 17,
    fontWeight: '600',
    color: lightTokens.colors.charcoal,
    marginTop: 10,
    marginBottom: 2,
  },
  propertiesSection: {
    marginTop: 8,
  },
  propertyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  propertyContent: {
    flex: 1,
    marginLeft: 10,
  },
  propertyLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: 'rgba(0, 0, 0, 0.4)',
  },
  propertyValue: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: lightTokens.colors.charcoal,
  },
  checkCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: SAGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowSeparator: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    marginLeft: 33,
  },
  notesText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    fontStyle: 'italic',
    color: 'rgba(0, 0, 0, 0.4)',
    marginTop: 8,
  },
});
