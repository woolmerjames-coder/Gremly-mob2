/**
 * TaskItem
 *
 * Renders a single task row in Morning Brief.
 * - Tap row → opens TimeBlockPicker
 * - Tap time estimate → opens TimeEstimatePicker
 *
 * When isPrioritizing is true, shows a checkbox + optional second-line
 * with contextual chips (streak, due, assign, lock).
 *
 * AnimatedTaskItem wraps TaskItem with exit animation support.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import { Check, Circle, Diamond, Repeat } from 'lucide-react-native';
import { BRAND } from '../../../../design/brand';
import type { TimeBlock } from '../../../../lib/capacity';

const COLORS = {
  linenCream: '#F9F6F1',
  mossGreen: '#2E5540',
  charcoalInk: '#0E1116',
  inkMuted: '#666666',
  inkSoft: 'rgba(34,34,34,0.45)',
  divider: '#E8E6E1',
  surface: '#FFFFFF',
  metaNeutral: '#999999',
  metaGentle: '#C9956C',
  metaWarm: '#C27A6B',
  metaDone: '#6B9E7E',
};

export interface TaskItemData {
  id: string;
  type: 'todo' | 'habit';
  title: string;
  timeWindow?: TimeBlock | 'any' | null;
  isLockedIn: boolean;
  estimatedMinutes?: number;
  /** Contextual metadata shown as secondary text (e.g., "last: yesterday", "due tmrw") */
  metadata?: {
    label: string;
    tone: 'neutral' | 'gentle' | 'warm' | 'done';
  } | null;
  /** Habit streak count — used for contextual chips in prioritization mode */
  streakCount?: number;
  /** Due status — used for contextual chips in prioritization mode */
  dueStatus?: 'overdue' | 'today' | 'tomorrow' | null;
  /** Resolved space name for filtering/display */
  spaceName?: string;
}

export interface TaskPrioritizationProps {
  isPrioritizing?: boolean;
  isSelected?: boolean;
  isLocked?: boolean;
  lockCount?: number;
  maxLocks?: number;
  onToggleSelect?: (task: TaskItemData) => void;
  onToggleLock?: (task: TaskItemData) => void;
  onAssignPress?: (task: TaskItemData) => void;
}

interface TaskItemProps extends TaskPrioritizationProps {
  task: TaskItemData;
  onPress: (task: TaskItemData) => void;
  onTimePress?: (task: TaskItemData) => void;
  showEstimate?: boolean;
  dimmed?: boolean;
}

/* ─── Internal chip sub-component ────────────────────────── */

interface TaskChipProps {
  label: string;
  active?: boolean;
  color?: string;
  activeColor?: string;
  activeBg?: string;
  onPress?: () => void;
}

function TaskChip({
  label,
  active = false,
  color = 'rgba(34,34,34,0.22)',
  activeColor,
  activeBg,
  onPress,
}: TaskChipProps) {
  const textColor = active && activeColor ? activeColor : color;
  const bgColor = active && activeBg ? activeBg : 'rgba(0,0,0,0.03)';
  const fontWeight: '500' | '600' = active ? '600' : '500';

  const chipContent = (
    <View style={[chipStyles.chip, { backgroundColor: bgColor }]}>
      <Text style={[chipStyles.chipText, { color: textColor, fontWeight }]}>{label}</Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}>
        {chipContent}
      </Pressable>
    );
  }
  return chipContent;
}

const chipStyles = StyleSheet.create({
  chip: {
    paddingVertical: 1.5,
    paddingHorizontal: 7,
    borderRadius: 4,
  },
  chipText: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
  },
});

/* ─── TaskItem ───────────────────────────────────────────── */

export function TaskItem({
  task,
  onPress,
  onTimePress,
  showEstimate = true,
  dimmed = false,
  // Prioritization props
  isPrioritizing = false,
  isSelected = false,
  isLocked = false,
  lockCount = 0,
  maxLocks = 3,
  onToggleSelect,
  onToggleLock,
  onAssignPress,
}: TaskItemProps) {
  // ── Standard mode (no prioritization) ──
  if (!isPrioritizing) {
    const Icon = task.isLockedIn ? Diamond : task.type === 'habit' ? Repeat : Circle;
    const iconColor = task.isLockedIn ? COLORS.mossGreen : COLORS.inkMuted;

    const timeDisplay = task.estimatedMinutes
      ? task.estimatedMinutes >= 60
        ? `${Math.floor(task.estimatedMinutes / 60)}h${task.estimatedMinutes % 60 > 0 ? ` ${task.estimatedMinutes % 60}m` : ''}`
        : `${task.estimatedMinutes}m`
      : null;

    const handleTimePress = () => {
      if (onTimePress) onTimePress(task);
    };

    return (
      <View style={[styles.container, dimmed && styles.containerDimmed]}>
        <Pressable style={styles.mainContent} onPress={() => onPress(task)}>
          <Icon size={16} color={iconColor} style={styles.icon} />
          <Text style={[styles.title, dimmed && styles.titleDimmed]} numberOfLines={1}>
            {task.title}
          </Text>
        </Pressable>

        <View style={styles.rightSide}>
          {task.metadata && task.metadata.label !== 'due today' && (
            <Text
              style={[
                styles.metadataText,
                task.metadata.tone === 'gentle' && { color: COLORS.metaGentle },
                task.metadata.tone === 'warm' && { color: COLORS.metaWarm },
                task.metadata.tone === 'done' && { color: COLORS.metaDone },
              ]}
              numberOfLines={1}
            >
              {task.metadata.label}
            </Text>
          )}
          {showEstimate && (
            <Pressable onPress={handleTimePress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.time, !timeDisplay && styles.timeEmpty]}>
                {timeDisplay ?? '+ time'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  // ── Prioritization mode ──

  const timeDisplay = task.estimatedMinutes
    ? task.estimatedMinutes >= 60
      ? `${Math.floor(task.estimatedMinutes / 60)}h${task.estimatedMinutes % 60 > 0 ? ` ${task.estimatedMinutes % 60}m` : ''}`
      : `${task.estimatedMinutes}m`
    : null;

  const handleToggleSelect = () => {
    if (onToggleSelect) onToggleSelect(task);
  };

  const canLock = isLocked || lockCount < maxLocks;

  const handleToggleLock = () => {
    if (canLock && onToggleLock) onToggleLock(task);
  };

  const handleAssign = () => {
    if (onAssignPress) onAssignPress(task);
  };

  // ── Deselected: fully readable single line ──
  if (!isSelected) {
    const blockLabel =
      task.timeWindow && task.timeWindow !== 'any'
        ? task.timeWindow.charAt(0).toUpperCase() + task.timeWindow.slice(1)
        : null;

    return (
      <Pressable onPress={handleToggleSelect} style={pStyles.deselectedRow}>
        {/* Unchecked checkbox */}
        <View style={pStyles.checkboxUnchecked} />
        <Text style={pStyles.deselectedTitle} numberOfLines={1}>
          {task.title}
        </Text>
        {blockLabel && (
          <View style={pStyles.blockBadge}>
            <Text style={pStyles.blockBadgeText}>{blockLabel}</Text>
          </View>
        )}
        {showEstimate && (
          <Pressable
            onPress={() => {
              if (onTimePress) onTimePress(task);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[pStyles.deselectedTime, !timeDisplay && pStyles.timeEmpty]}>
              {timeDisplay ?? '+ time'}
            </Text>
          </Pressable>
        )}
      </Pressable>
    );
  }

  // ── Selected: two-line with chips ──
  const selectedBlockLabel =
    task.timeWindow && task.timeWindow !== 'any'
      ? task.timeWindow.charAt(0).toUpperCase() + task.timeWindow.slice(1)
      : null;

  return (
    <Pressable onPress={handleToggleSelect} style={pStyles.selectedRow}>
      {/* Checked checkbox – vertically centred */}
      <View style={pStyles.checkboxChecked}>
        <Check size={9} color="#FFFFFF" strokeWidth={3} />
      </View>
      <View style={pStyles.selectedContent}>
        {/* Line 1 */}
        <View style={pStyles.line1}>
          <Text style={pStyles.selectedTitle} numberOfLines={1}>
            {task.title}
          </Text>
          {showEstimate && (
            <Pressable
              onPress={() => {
                if (onTimePress) onTimePress(task);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[pStyles.selectedTime, !timeDisplay && pStyles.timeEmpty]}>
                {timeDisplay ?? '+ time'}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Line 2: contextual chips + action chips */}
        <View style={pStyles.line2}>
          {/* Block badge */}
          {selectedBlockLabel && (
            <TaskChip
              label={selectedBlockLabel}
              active
              activeColor="#6B7C8A"
              activeBg="rgba(107,124,138,0.10)"
            />
          )}
          {/* Contextual chips */}
          {task.type === 'habit' && (task.streakCount ?? 0) > 0 && (
            <TaskChip
              label={`${task.streakCount}-day streak`}
              active
              activeColor="#7BAF8B"
              activeBg="rgba(107,158,126,0.12)"
            />
          )}
          {task.dueStatus === 'overdue' && (
            <TaskChip
              label="overdue"
              active
              activeColor={COLORS.metaWarm}
              activeBg="rgba(194,122,107,0.1)"
            />
          )}

          {/* Spacer pushes action chips to right */}
          <View style={pStyles.chipSpacer} />

          {/* Action chips */}
          <TaskChip label={`assign ›`} onPress={handleAssign} />
          {isLocked ? (
            <TaskChip
              label={`\u25C6 locked`}
              active
              activeColor={COLORS.mossGreen}
              activeBg="rgba(46,85,64,0.08)"
              onPress={handleToggleLock}
            />
          ) : (
            <TaskChip
              label="lock in"
              color={canLock ? 'rgba(34,34,34,0.22)' : 'rgba(34,34,34,0.12)'}
              onPress={canLock ? handleToggleLock : undefined}
            />
          )}
        </View>
      </View>
    </Pressable>
  );
}

/* ─── Standard mode styles ───────────────────────────────── */

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  containerDimmed: {
    opacity: 0.5,
  },
  mainContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 12,
  },
  title: {
    flex: 1,
    fontSize: 15,
    color: COLORS.charcoalInk,
  },
  titleDimmed: {
    color: COLORS.inkMuted,
  },
  timeButton: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  time: {
    fontSize: 13,
    color: COLORS.inkMuted,
    fontWeight: '500',
  },
  timeEmpty: {
    color: COLORS.mossGreen,
    fontStyle: 'italic',
  },
  rightSide: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    flexShrink: 0,
    gap: 8,
  },
  metadataText: {
    fontSize: 12,
    color: '#999999',
  },
});

/* ─── Prioritization mode styles ─────────────────────────── */

const pStyles = StyleSheet.create({
  /* Deselected row */
  deselectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3.5,
    paddingHorizontal: 12,
    opacity: 1,
  },
  checkboxUnchecked: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(34,34,34,0.25)',
    backgroundColor: 'transparent',
    marginRight: 10,
  },
  deselectedTitle: {
    flex: 1,
    fontSize: 13.5,
    color: COLORS.charcoalInk,
    fontFamily: 'Inter-Regular',
  },
  deselectedTime: {
    fontSize: 12,
    color: COLORS.charcoalInk,
    marginLeft: 8,
    fontFamily: 'Inter-Regular',
  },
  blockBadge: {
    backgroundColor: 'rgba(46,85,64,0.08)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginLeft: 6,
  },
  blockBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7C8A',
    textTransform: 'capitalize',
  },

  /* Selected row */
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.06)',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  selectedContent: {
    flex: 1,
  },
  line1: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxChecked: {
    width: 16,
    height: 16,
    borderRadius: 4,
    backgroundColor: BRAND.colors.mossGreen,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  selectedTitle: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '400',
    color: COLORS.charcoalInk,
    fontFamily: 'Inter-Regular',
  },
  selectedTime: {
    fontSize: 12,
    color: COLORS.inkMuted,
    marginLeft: 8,
    fontFamily: 'Inter-Regular',
  },
  timeEmpty: {
    color: '#2E5540',
    fontStyle: 'italic',
  },

  /* Line 2: chips */
  line2: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2.5,
    gap: 5,
    flexWrap: 'wrap',
  },
  chipSpacer: {
    flex: 1,
  },
});

/* ─── AnimatedTaskItem ───────────────────────────────────── */

/**
 * AnimatedTaskItem
 *
 * Wraps TaskItem with exit animation support for organize flow.
 * When isAnimatingOut is true, the card lifts slightly then slides down and fades out.
 */
interface AnimatedTaskItemProps extends TaskItemProps {
  isAnimatingOut?: boolean;
  animationDelay?: number;
}

export function AnimatedTaskItem({
  task,
  onPress,
  onTimePress,
  showEstimate = true,
  dimmed = false,
  isAnimatingOut = false,
  animationDelay = 0,
  // Prioritization passthrough
  isPrioritizing,
  isSelected,
  isLocked,
  lockCount,
  maxLocks,
  onToggleSelect,
  onToggleLock,
  onAssignPress,
}: AnimatedTaskItemProps) {
  // Using refs without destructuring .current to satisfy React Compiler
  const translateYRef = useRef(new Animated.Value(0));
  const opacityRef = useRef(new Animated.Value(1));
  const scaleRef = useRef(new Animated.Value(1));

  useEffect(() => {
    if (isAnimatingOut) {
      // Staggered exit animation: lift, then slide down and fade
      Animated.sequence([
        Animated.delay(animationDelay),
        // Lift slightly with scale
        Animated.parallel([
          Animated.timing(translateYRef.current, {
            toValue: -6,
            duration: 120,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(scaleRef.current, {
            toValue: 1.02,
            duration: 120,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        // Brief pause at top
        Animated.delay(80),
        // Slide down and fade out
        Animated.parallel([
          Animated.timing(translateYRef.current, {
            toValue: 40,
            duration: 280,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(opacityRef.current, {
            toValue: 0,
            duration: 280,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(scaleRef.current, {
            toValue: 0.95,
            duration: 280,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    } else {
      // Reset if not animating
      translateYRef.current.setValue(0);
      opacityRef.current.setValue(1);
      scaleRef.current.setValue(1);
    }
  }, [isAnimatingOut, animationDelay]);

  return (
    <Animated.View
      style={{
        transform: [{ translateY: translateYRef.current }, { scale: scaleRef.current }],
        opacity: opacityRef.current,
      }}
    >
      <TaskItem
        task={task}
        onPress={onPress}
        onTimePress={onTimePress}
        showEstimate={showEstimate}
        dimmed={dimmed}
        isPrioritizing={isPrioritizing}
        isSelected={isSelected}
        isLocked={isLocked}
        lockCount={lockCount}
        maxLocks={maxLocks}
        onToggleSelect={onToggleSelect}
        onToggleLock={onToggleLock}
        onAssignPress={onAssignPress}
      />
    </Animated.View>
  );
}
