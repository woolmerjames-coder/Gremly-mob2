/**
 * SweepCard Component
 *
 * Sage-toned, full-screen decision view for Evening Sweep.
 * Designed to feel meditative and intentional - a calm ritual.
 *
 * Features:
 * - Sage Mist background (inherited from parent container)
 * - Title with pencil icon at end of row
 * - Left-aligned underline below title (40% width)
 * - Type chip + timestamp metadata below underline
 * - Primary action pill (context-aware based on item type)
 * - Swipe cues: "← Done with this" / "Keep in my world →"
 * - Swipe gestures: left = clear, right = keep
 */

import React, { useCallback, useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Pressable,
  Modal,
  Platform,
  Switch,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  runOnUI,
  interpolate,
  Extrapolation,
  interpolateColor,
} from 'react-native-reanimated';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  Pencil,
  Archive,
  Check,
  Calendar,
  ArrowRight,
  Repeat,
  CheckSquare,
  BookOpen,
  MoreHorizontal,
} from 'lucide-react-native';
import { format, addDays, setHours, setMinutes } from 'date-fns';
import { Text, Button, Box } from '../../ui';
import { BRAND } from '../../design/brand';
import { toDayString, parseDayString } from '../../lib/date/computeDueDay';
import { useRepo } from '../../providers/RepoProvider';
import type { SweepCandidate, SweepPrimaryActionConfig } from '../../lib/sweep/types';
import { getPrimaryActionForCandidate } from '../../lib/sweep/types';

// ─────────────────────────────────────────────────────────────────────────────
// CTA Types
// ─────────────────────────────────────────────────────────────────────────────

export type SweepCtaKind =
  | 'todo_add_due_date'
  | 'todo_adjust_due_date'
  | 'habit_add_start_date'
  | 'habit_adjust_start_date'
  | 'log_convert_to_todo'
  | 'none';

// Preset time options for time picker
const PRESET_TIMES = [
  { label: '9:00 AM', hour: 9, minute: 0, key: '9:00-AM' },
  { label: '12:00 PM', hour: 12, minute: 0, key: '12:00-PM' },
  { label: '3:00 PM', hour: 15, minute: 0, key: '3:00-PM' },
  { label: '6:00 PM', hour: 18, minute: 0, key: '6:00-PM' },
  { label: '9:00 PM', hour: 21, minute: 0, key: '9:00-PM' },
] as const;

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const SWIPE_THRESHOLD = 100; // Reduced for card-based swiping
const SWIPE_OUT_DISTANCE = SCREEN_WIDTH; // Animate card off to the side
const VELOCITY_THRESHOLD = 400; // Velocity that can trigger swipe even if threshold not met
const CARD_WIDTH = SCREEN_WIDTH * 0.84; // 84% of screen width - leaves room for edge labels

// Check if we're in test environment
const isTestEnv =
  typeof globalThis !== 'undefined' &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((globalThis as any).__TEST__ === true || typeof jest !== 'undefined');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SweepCardProps {
  /** The sweep candidate to display */
  candidate: SweepCandidate;
  /** Current index (0-based) */
  index: number;
  /** Total number of candidates */
  total: number;
  /** Called when user wants to keep the item */
  onKeep: () => void;
  /** Called when user wants to clear/archive the item */
  onClear: () => void;
  /** Called when user wants to edit/fix the item (opens full overlay) */
  onOpenEdit: () => void;
  /** Called when user taps the primary action button (e.g., add date, review habit) */
  onPrimaryAction?: (config: SweepPrimaryActionConfig, candidate: SweepCandidate) => void;
  /** Called when user wants to convert log to todo (opens overlay in convert mode) */
  onConvertToTodo?: () => void;
  /** Called when user wants to save progress and exit early */
  onClose?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the CTA kind and label based on candidate type and fields.
 */
function computeCtaInfo(candidate: SweepCandidate): { kind: SweepCtaKind; label: string } {
  switch (candidate.kind) {
    case 'todo': {
      // Check if todo has a due date (due_day is canonical)
      const hasDueDate = !!candidate.raw.due_day || !!candidate.raw.due_date;
      if (!hasDueDate) {
        return { kind: 'todo_add_due_date', label: 'Add date' };
      }
      return { kind: 'todo_adjust_due_date', label: 'Review date' };
    }

    case 'habit': {
      // Check if habit has a start_date
      const hasStartDate = !!candidate.raw.start_date;
      if (!hasStartDate) {
        return { kind: 'habit_add_start_date', label: 'Review habit' };
      }
      return { kind: 'habit_adjust_start_date', label: 'Review habit' };
    }

    case 'note': {
      // Check if it's a journal log - journals show "Add reminder"
      const subtype = candidate.raw.subtype;
      const canonicalType = candidate.raw.canonical_type;

      // Journal detection: subtype='journal' or canonical_type contains 'journal'
      const isJournal =
        subtype === 'journal' ||
        canonicalType === 'journal' ||
        (canonicalType && canonicalType.includes('journal'));

      if (isJournal) {
        return { kind: 'none', label: 'Add reminder' };
      }

      // General logs or idea logs can be converted to todo
      return { kind: 'log_convert_to_todo', label: 'Convert to to-do' };
    }

    default:
      return { kind: 'none', label: '' };
  }
}

/**
 * Get the display label for the type chip based on candidate kind.
 */
function getTypeChipLabel(candidate: SweepCandidate): string {
  switch (candidate.kind) {
    case 'todo':
      return 'To-Do';
    case 'habit':
      return 'Habit';
    case 'note': {
      // Check if it's a log/journal type from the raw data
      const noteRaw = candidate.raw;
      if (noteRaw.subtype === 'journal' || noteRaw.subtype === 'log') {
        return 'Log';
      }
      return 'Note';
    }
  }
}

/**
 * Get the title to display for a candidate.
 */
function getCandidateTitle(candidate: SweepCandidate): string {
  switch (candidate.kind) {
    case 'todo':
      return candidate.raw.name || 'Untitled task';
    case 'habit':
      return candidate.raw.name || 'Untitled habit';
    case 'note':
      return candidate.raw.title || 'Untitled note';
  }
}

/**
 * Get the body/description preview for a candidate.
 */
function getCandidateBody(candidate: SweepCandidate): string | null {
  switch (candidate.kind) {
    case 'todo':
      return candidate.raw.notes || null;
    case 'habit':
      return candidate.raw.notes || candidate.raw.why_string || null;
    case 'note':
      return candidate.raw.body || null;
  }
}

/**
 * Format the created timestamp for display - minimal style.
 * Shows "Added today", "Added yesterday", or "Added Dec 1"
 */
function formatCreatedTimestamp(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return 'Added today';
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isYesterday) {
    return 'Added yesterday';
  }

  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return `Added ${dateStr}`;
}

/**
 * Format a due day (YYYY-MM-DD) for display.
 */
function formatDueDay(dueDay: string | null | undefined): string {
  if (!dueDay) return '';
  try {
    const parsed = parseDayString(dueDay);
    if (!parsed) return '';
    return format(parsed, 'MMM d');
  } catch {
    return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function SweepCard({
  candidate,
  index: _index,
  total: _total,
  onKeep,
  onClear,
  onOpenEdit,
  onPrimaryAction,
  onConvertToTodo,
  onClose,
}: SweepCardProps) {
  const repo = useRepo();
  const typeLabel = getTypeChipLabel(candidate);
  const title = getCandidateTitle(candidate);
  const body = getCandidateBody(candidate);
  const timestamp = formatCreatedTimestamp(candidate.createdAt);

  // Compute primary action config from the new centralized helper
  const primaryConfig = useMemo(() => getPrimaryActionForCandidate(candidate), [candidate]);

  // Legacy CTA kind and label - kept for date picker modal logic
  const { kind: ctaKind, label: ctaLabel } = useMemo(() => computeCtaInfo(candidate), [candidate]);

  // Truncate body preview to ~100 chars
  const bodyPreview = body && body.length > 100 ? `${body.slice(0, 100)}…` : body;

  // ─────────────────────────────────────────────────────────────────────────
  // Inline Date Picker State
  // ─────────────────────────────────────────────────────────────────────────
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    // Pre-fill with existing date if adjusting
    if (candidate.kind === 'todo' && candidate.raw.due_day) {
      const parsed = parseDayString(candidate.raw.due_day);
      return parsed || new Date();
    }
    if (candidate.kind === 'habit' && candidate.raw.start_date) {
      const parsed = parseDayString(candidate.raw.start_date);
      return parsed || new Date();
    }
    return new Date();
  });
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [selectedTimePreset, setSelectedTimePreset] = useState<string | null>(null);
  const [clearDateFlag, setClearDateFlag] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Reset date picker state when candidate changes
  React.useEffect(() => {
    setShowDatePicker(false);
    setClearDateFlag(false);
    setShowTimePicker(false);
    setSelectedTimePreset(null);
    // Pre-fill date based on candidate
    if (candidate.kind === 'todo' && candidate.raw.due_day) {
      const parsed = parseDayString(candidate.raw.due_day);
      setSelectedDate(parsed || new Date());
    } else if (candidate.kind === 'habit' && candidate.raw.start_date) {
      const parsed = parseDayString(candidate.raw.start_date);
      setSelectedDate(parsed || new Date());
    } else {
      setSelectedDate(new Date());
    }
  }, [candidate.id, candidate.kind, candidate.raw]);

  // ─────────────────────────────────────────────────────────────────────────
  // Primary Action Handler
  // ─────────────────────────────────────────────────────────────────────────
  const handlePrimaryActionPress = useCallback(() => {
    if (primaryConfig && onPrimaryAction) {
      onPrimaryAction(primaryConfig, candidate);
    }
  }, [primaryConfig, onPrimaryAction, candidate]);

  // ─────────────────────────────────────────────────────────────────────────
  // Date Picker Handlers
  // ─────────────────────────────────────────────────────────────────────────
  const handleMainCtaPress = useCallback(() => {
    if (ctaKind === 'log_convert_to_todo') {
      // Open overlay in convert mode
      if (onConvertToTodo) {
        onConvertToTodo();
      } else {
        // Fallback to regular edit if no convert handler
        onOpenEdit();
      }
    } else if (
      ctaKind === 'todo_add_due_date' ||
      ctaKind === 'todo_adjust_due_date' ||
      ctaKind === 'habit_add_start_date' ||
      ctaKind === 'habit_adjust_start_date'
    ) {
      setShowDatePicker(true);
    }
  }, [ctaKind, onConvertToTodo, onOpenEdit]);

  const handleDateConfirm = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      if (clearDateFlag) {
        // Clear the date
        if (candidate.kind === 'todo') {
          await repo.update({
            id: candidate.id,
            patch: {
              due_day: null,
              due_date: null,
            } as any, // Todo-specific fields
          });
        } else if (candidate.kind === 'habit') {
          await repo.update({
            id: candidate.id,
            patch: {
              start_date: null,
            } as any, // Habit-specific fields
          });
        }
      } else {
        // Set the date
        const dueDay = toDayString(selectedDate);
        if (candidate.kind === 'todo') {
          await repo.update({
            id: candidate.id,
            patch: {
              due_day: dueDay,
              due_date: dueDay, // Also set due_date for backward compat
            } as any, // Todo-specific fields
          });
        } else if (candidate.kind === 'habit') {
          await repo.update({
            id: candidate.id,
            patch: {
              start_date: dueDay,
            } as any, // Habit-specific fields
          });
        }
      }
    } catch (error) {
      console.error('[SweepCard] Failed to update date:', error);
    } finally {
      setIsSaving(false);
      setShowDatePicker(false);
      setClearDateFlag(false);
    }
  }, [candidate, selectedDate, clearDateFlag, isSaving, repo]);

  // ─────────────────────────────────────────────────────────────────────────
  // Reanimated Swipe Gesture Handling
  // ─────────────────────────────────────────────────────────────────────────
  const translateX = useSharedValue(0);
  const cardOpacity = useSharedValue(1);

  // Reset animation state when candidate changes (new card)
  React.useEffect(() => {
    translateX.value = 0;
    cardOpacity.value = 1;
  }, [candidate.id, translateX, cardOpacity]);

  // Animate card off-screen and trigger callback
  const animateOut = useCallback(
    (direction: 'left' | 'right', callback: () => void) => {
      'worklet';
      const toValue = direction === 'right' ? SWIPE_OUT_DISTANCE : -SWIPE_OUT_DISTANCE;

      translateX.value = withSpring(
        toValue,
        {
          damping: 20,
          stiffness: 200,
          overshootClamping: true,
        },
        (finished) => {
          if (finished) {
            runOnJS(callback)();
          }
        },
      );
      cardOpacity.value = withTiming(0, { duration: 200 });
    },
    [translateX, cardOpacity],
  );

  // Button press handler (calls animateOut from JS thread)
  const handleButtonPress = useCallback(
    (direction: 'left' | 'right', callback: () => void) => {
      // In test environment, skip animation and call callback immediately
      if (isTestEnv) {
        callback();
        return;
      }
      // Use runOnUI to call the worklet from JS thread
      runOnUI(animateOut)(direction, callback);
    },
    [animateOut],
  );

  // Track if card is being dragged for border effect
  const isDragging = useSharedValue(false);
  const borderOpacity = useSharedValue(0); // For smooth border fade

  // Pan gesture for swiping - now tracks drag state
  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10]) // Only activate for horizontal movement
    .failOffsetY([-15, 15]) // Fail if vertical movement is dominant
    .onStart(() => {
      isDragging.value = true;
      // Fade in border
      borderOpacity.value = withTiming(1, { duration: 150 });
    })
    .onUpdate((event) => {
      translateX.value = event.translationX;
    })
    .onEnd((event) => {
      isDragging.value = false;
      // Fade out border
      borderOpacity.value = withTiming(0, { duration: 200 });
      const { translationX, velocityX } = event;

      // Check if swipe passes threshold (by position or velocity)
      const swipedRight =
        translationX > SWIPE_THRESHOLD || (translationX > 50 && velocityX > VELOCITY_THRESHOLD);
      const swipedLeft =
        translationX < -SWIPE_THRESHOLD || (translationX < -50 && velocityX < -VELOCITY_THRESHOLD);

      if (swipedRight) {
        // Swiped right past threshold → Keep
        animateOut('right', onKeep);
      } else if (swipedLeft) {
        // Swiped left past threshold → Clear
        animateOut('left', onClear);
      } else {
        // Didn't cross threshold → spring back to center
        translateX.value = withSpring(0, {
          damping: 15,
          stiffness: 150,
        });
      }
    })
    .onFinalize(() => {
      isDragging.value = false;
      // Ensure border fades out on any gesture end
      borderOpacity.value = withTiming(0, { duration: 200 });
    });

  // Animated style for the card container border (fades in Moss Green when dragging)
  const animatedCardContainerStyle = useAnimatedStyle(() => {
    return {
      borderColor: BRAND.colors.mossGreen,
      borderWidth: interpolate(borderOpacity.value, [0, 1], [0, 1], Extrapolation.CLAMP),
    };
  });

  // Animated style for left scrim (grey, archive action)
  const animatedLeftScrimStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, -50, 0],
      [0.15, 0.08, 0],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  // Animated style for right scrim (sage/moss, keep action)
  const animatedRightScrimStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [0, 50, SWIPE_THRESHOLD],
      [0, 0.08, 0.15],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  // Animated style for left edge label ("← Clear")
  const animatedLeftLabelStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, -50, 0],
      [1, 0.85, 0.75],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  // Animated style for right edge label ("Keep →")
  const animatedRightLabelStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [0, 50, SWIPE_THRESHOLD],
      [0.75, 0.85, 1],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  // Animated style for left icon (archive)
  const animatedLeftIconStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, -80, 0],
      [1, 0.6, 0],
      Extrapolation.CLAMP,
    );
    const scale = interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, -80, 0],
      [1, 0.8, 0.5],
      Extrapolation.CLAMP,
    );
    return { opacity, transform: [{ scale }] };
  });

  // Animated style for right icon (checkmark)
  const animatedRightIconStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [0, 80, SWIPE_THRESHOLD],
      [0, 0.6, 1],
      Extrapolation.CLAMP,
    );
    const scale = interpolate(
      translateX.value,
      [0, 80, SWIPE_THRESHOLD],
      [0.5, 0.8, 1],
      Extrapolation.CLAMP,
    );
    return { opacity, transform: [{ scale }] };
  });

  // Animated style for the card
  const animatedCardStyle = useAnimatedStyle(() => {
    // Slight tilt during swipe (3 degrees at threshold)
    const rotate = interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD],
      [-3, 0, 3],
      Extrapolation.CLAMP,
    );

    // Scale down slightly during swipe for tactile feel
    const scale = interpolate(
      Math.abs(translateX.value),
      [0, SWIPE_THRESHOLD],
      [1, 0.97],
      Extrapolation.CLAMP,
    );

    return {
      transform: [{ translateX: translateX.value }, { rotate: `${rotate}deg` }, { scale }],
      opacity: cardOpacity.value,
    };
  });

  // Button handlers with animation
  const handleKeepPress = useCallback(() => {
    // In test mode, call directly without animation
    if (isTestEnv) {
      onKeep();
      return;
    }
    translateX.value = withSpring(
      SWIPE_OUT_DISTANCE,
      { damping: 20, stiffness: 200, overshootClamping: true },
      (finished) => {
        if (finished) runOnJS(onKeep)();
      },
    );
    cardOpacity.value = withTiming(0, { duration: 200 });
  }, [onKeep, translateX, cardOpacity]);

  const handleClearPress = useCallback(() => {
    // In test mode, call directly without animation
    if (isTestEnv) {
      onClear();
      return;
    }
    translateX.value = withSpring(
      -SWIPE_OUT_DISTANCE,
      { damping: 20, stiffness: 200, overshootClamping: true },
      (finished) => {
        if (finished) runOnJS(onClear)();
      },
    );
    cardOpacity.value = withTiming(0, { duration: 200 });
  }, [onClear, translateX, cardOpacity]);

  return (
    <View style={styles.cardWrapper}>
      {/* Left Scrim - Grey (archive/clear action) */}
      <Animated.View style={[styles.swipeScrimLeft, animatedLeftScrimStyle]} pointerEvents="none">
        <Animated.View style={[styles.swipeScrimIcon, animatedLeftIconStyle]}>
          <Archive size={32} color="rgba(80, 80, 80, 0.7)" strokeWidth={1.5} />
        </Animated.View>
      </Animated.View>

      {/* Right Scrim - Sage/Moss (keep action) */}
      <Animated.View style={[styles.swipeScrimRight, animatedRightScrimStyle]} pointerEvents="none">
        <Animated.View style={[styles.swipeScrimIcon, animatedRightIconStyle]}>
          <Check size={32} color={BRAND.colors.mossGreen} strokeWidth={2} />
        </Animated.View>
      </Animated.View>

      {/* Swipe Cue Labels - ABOVE the card */}
      <View style={styles.swipeCueRow} pointerEvents="none">
        <Animated.View style={animatedLeftLabelStyle}>
          <Text style={styles.swipeCueText}>← Done with this</Text>
        </Animated.View>
        <Animated.View style={animatedRightLabelStyle}>
          <Text style={styles.swipeCueText}>Keep in my world →</Text>
        </Animated.View>
      </View>

      {/* Centered Card Container - Swipeable */}
      <View style={styles.cardCenteringContainer}>
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[styles.swipeCardContainer, animatedCardContainerStyle, animatedCardStyle]}
          >
            {/* Gradient Background - Subtle sage tint for card separation */}
            <LinearGradient
              colors={[
                'rgba(191, 216, 192, 0.08)', // Top: Sage Mist @ 8% - slight tint
                'rgba(191, 216, 192, 0.22)', // Bottom: Sage Mist @ 22% - deeper fill
              ]}
              locations={[0, 1]}
              style={styles.cardGradient}
            />

            {/* Inner Shadow - Top only, creates lifted sheet effect */}
            <LinearGradient
              colors={[
                'rgba(34, 34, 34, 0.08)', // Charcoal Ink @ 8% at top
                'rgba(34, 34, 34, 0)', // Fade to transparent
              ]}
              locations={[0, 1]}
              style={styles.innerShadowTop}
              pointerEvents="none"
            />

            {/* Content Area - Scrollable */}
            <ScrollView
              style={styles.contentScrollView}
              contentContainerStyle={styles.contentScrollContent}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {/* Edit Icon - Top right corner */}
              <TouchableOpacity
                style={styles.cardEditIcon}
                onPress={onOpenEdit}
                accessibilityLabel="Edit details"
                accessibilityRole="button"
                activeOpacity={0.6}
              >
                <Pencil size={16} color={BRAND.colors.mossGreen} strokeWidth={1.8} />
              </TouchableOpacity>

              {/* 1. TITLE - Large, with space for edit icon */}
              <View style={styles.titleSection}>
                <Text style={styles.titleText} numberOfLines={4}>
                  {title}
                </Text>

                {/* Body Preview - Under title if present */}
                {bodyPreview && (
                  <Text style={styles.bodyText} numberOfLines={3}>
                    {bodyPreview}
                  </Text>
                )}
              </View>

              {/* 2. DIVIDER - Left-aligned, subtle */}
              <View style={styles.dividerContainer}>
                <View style={styles.cardDivider} />
              </View>

              {/* 3. META ROW - Type, timestamp, and optional overdue pill */}
              <View style={styles.metadataRow}>
                <Text style={styles.metaLineText}>
                  {typeLabel.toUpperCase()} · {timestamp}
                </Text>
                {candidate.isOverdue && (
                  <View style={styles.overduePill}>
                    <Text style={styles.overduePillText}>Overdue</Text>
                  </View>
                )}
              </View>

              {/* Spacer - Pushes action block to bottom of card */}
              <View style={styles.actionSpacer} />

              {/* Divider above action row */}
              <View style={styles.actionDividerContainer}>
                <View style={styles.actionDivider} />
              </View>

              {/* 4. PRIMARY ACTION PILL - Based on primaryConfig from centralized helper */}
              {primaryConfig && (
                <View style={styles.ctaPillRow}>
                  <TouchableOpacity
                    style={styles.primaryPill}
                    onPress={handlePrimaryActionPress}
                    accessibilityLabel={primaryConfig.label}
                    accessibilityRole="button"
                    activeOpacity={0.7}
                  >
                    {primaryConfig.icon === 'calendar' && (
                      <Calendar size={16} color={BRAND.colors.mossGreen} strokeWidth={2} />
                    )}
                    {primaryConfig.icon === 'habit' && (
                      <Repeat size={16} color={BRAND.colors.mossGreen} strokeWidth={2} />
                    )}
                    {primaryConfig.icon === 'todo' && (
                      <CheckSquare size={16} color={BRAND.colors.mossGreen} strokeWidth={2} />
                    )}
                    {primaryConfig.icon === 'journal' && (
                      <BookOpen size={16} color={BRAND.colors.mossGreen} strokeWidth={2} />
                    )}
                    {primaryConfig.icon === 'more' && (
                      <MoreHorizontal size={16} color={BRAND.colors.mossGreen} strokeWidth={2} />
                    )}
                    <Text style={styles.primaryPillText}>{primaryConfig.label}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </Animated.View>
        </GestureDetector>
      </View>

      {/* Save & Exit - Single centered text link at bottom */}
      <View style={styles.saveExitContainer}>
        {onClose && (
          <TouchableOpacity
            style={styles.saveExitButton}
            onPress={onClose}
            accessibilityLabel="Save and exit"
            accessibilityRole="button"
            activeOpacity={0.6}
          >
            <Text style={styles.saveExitText}>Need a break? Save and exit</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Hidden Test Buttons - Only rendered in test environment for accessibility testing */}
      {isTestEnv && (
        <View style={{ position: 'absolute', opacity: 0, pointerEvents: 'box-none' }}>
          <TouchableOpacity
            onPress={onKeep}
            accessibilityLabel="Keep this item"
            accessibilityRole="button"
          >
            <Text>Keep</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onClear}
            accessibilityLabel="Clear this item"
            accessibilityRole="button"
          >
            <Text>Clear</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Inline Date Picker Modal */}
      <Modal visible={showDatePicker} transparent animationType="fade">
        <Pressable
          style={styles.dateModalBackdrop}
          onPress={() => {
            setShowDatePicker(false);
            setClearDateFlag(false);
            setShowTimePicker(false);
            setSelectedTimePreset(null);
          }}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={styles.dateModalContent}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              bounces={true}
              contentContainerStyle={styles.dateModalScroll}
            >
              <Text style={styles.dateModalTitle}>
                {ctaKind === 'todo_add_due_date' || ctaKind === 'todo_adjust_due_date'
                  ? 'Set due date'
                  : 'Set start date'}
              </Text>

              {/* Quick date chips */}
              <Box mt={1}>
                <Box row gap={2} style={{ flexWrap: 'wrap' }}>
                  <Pressable
                    onPress={() => {
                      const today = new Date();
                      setSelectedDate(today);
                      setClearDateFlag(false);
                    }}
                    style={({ pressed }) => [
                      styles.dateChip,
                      pressed && styles.dateChipPressed,
                      !clearDateFlag &&
                        selectedDate.toDateString() === new Date().toDateString() &&
                        styles.dateChipSelected,
                    ]}
                  >
                    <Text style={styles.dateChipText}>Today</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      const tomorrow = addDays(new Date(), 1);
                      setSelectedDate(tomorrow);
                      setClearDateFlag(false);
                    }}
                    style={({ pressed }) => [
                      styles.dateChip,
                      pressed && styles.dateChipPressed,
                      !clearDateFlag &&
                        selectedDate.toDateString() === addDays(new Date(), 1).toDateString() &&
                        styles.dateChipSelected,
                    ]}
                  >
                    <Text style={styles.dateChipText}>Tomorrow</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setClearDateFlag(true);
                      setShowTimePicker(false);
                      setSelectedTimePreset(null);
                    }}
                    style={({ pressed }) => [
                      styles.dateChip,
                      pressed && styles.dateChipPressed,
                      clearDateFlag && styles.dateChipSelected,
                    ]}
                  >
                    <Text style={styles.dateChipText}>Clear</Text>
                  </Pressable>
                </Box>
              </Box>

              {/* Date Picker */}
              {!clearDateFlag && (
                <Box mt={3} mb={4}>
                  <DateTimePicker
                    value={selectedDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    onChange={(_event, date) => {
                      if (date) {
                        setSelectedDate(date);
                        setClearDateFlag(false);
                      }
                    }}
                    themeVariant="light"
                    accentColor={BRAND.colors.mossGreen}
                  />
                </Box>
              )}

              {/* Time toggle - only for todos */}
              {!clearDateFlag &&
                (ctaKind === 'todo_add_due_date' || ctaKind === 'todo_adjust_due_date') && (
                  <Box mt={3} mb={4}>
                    <Box row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={styles.timeToggleLabel}>Add time?</Text>
                      <Switch
                        value={showTimePicker}
                        onValueChange={(value) => {
                          setShowTimePicker(value);
                          if (value && !selectedTimePreset) {
                            setSelectedTimePreset(PRESET_TIMES[0].key);
                            const defaultTime = setHours(setMinutes(new Date(), 0), 9);
                            setSelectedTime(defaultTime);
                          } else if (!value) {
                            setSelectedTimePreset(null);
                          }
                        }}
                        trackColor={{ false: '#E0E0E0', true: BRAND.colors.mossGreen }}
                        thumbColor="#FFFFFF"
                      />
                    </Box>

                    {/* Preset Time Chips */}
                    {showTimePicker && (
                      <Box mt={3}>
                        <Box row style={{ flexWrap: 'wrap', rowGap: 8, columnGap: 8 }}>
                          {PRESET_TIMES.map((preset) => (
                            <Pressable
                              key={preset.key}
                              onPress={() => {
                                setSelectedTimePreset(preset.key);
                                const newTime = setHours(
                                  setMinutes(new Date(), preset.minute),
                                  preset.hour,
                                );
                                setSelectedTime(newTime);
                              }}
                              style={({ pressed }) => [
                                styles.dateChip,
                                pressed && styles.dateChipPressed,
                                selectedTimePreset === preset.key && styles.dateChipSelected,
                              ]}
                            >
                              <Text style={styles.dateChipText}>{preset.label}</Text>
                            </Pressable>
                          ))}
                        </Box>
                      </Box>
                    )}
                  </Box>
                )}

              {/* Action buttons */}
              <View style={styles.dateModalActions}>
                <Pressable
                  style={styles.dateModalCancelButton}
                  onPress={() => {
                    setShowDatePicker(false);
                    setClearDateFlag(false);
                    setShowTimePicker(false);
                    setSelectedTimePreset(null);
                  }}
                >
                  <Text style={styles.dateModalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.dateModalConfirmButton,
                    isSaving && styles.dateModalConfirmDisabled,
                  ]}
                  onPress={handleDateConfirm}
                  disabled={isSaving}
                >
                  <Text style={styles.dateModalConfirmText}>
                    {isSaving ? 'Saving…' : clearDateFlag ? 'Clear' : 'Set'}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles - Centered Card Layout
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Card Wrapper - Full screen container with cream background
  cardWrapper: {
    flex: 1,
    position: 'relative',
    backgroundColor: BRAND.colors.linenCream,
  },

  // Card Centering Container - Centers the card horizontally, positioned toward top
  cardCenteringContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 56,
    paddingBottom: 8,
    zIndex: 2,
  },

  // Swipe Card Container - The actual card that swipes
  swipeCardContainer: {
    width: CARD_WIDTH,
    maxWidth: 400,
    minHeight: 320,
    flex: 1,
    maxHeight: '95%',
    backgroundColor: BRAND.colors.linenCream, // Base color for gradient fallback
    borderRadius: 16,
    overflow: 'hidden',
    // Soft outer shadow - slightly stronger for tactile feel
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14, // Increased from 0.08
    shadowRadius: 16, // Slightly larger blur
    elevation: 5,
    // Subtle Moss Green outline for definition
    borderWidth: 1,
    borderColor: 'rgba(46, 85, 64, 0.12)', // Moss Green @ 12%
  },

  // Gradient Background - Fills card, behind content
  cardGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
  },

  // Inner Shadow - Top only, gradient-based for lifted sheet effect
  innerShadowTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 10, // 10px blur depth
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    zIndex: 1,
  },

  // Content Scroll
  contentScrollView: {
    flex: 1,
  },
  contentScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 40,
    position: 'relative',
  },

  // Edit Icon - Top right corner of card content
  cardEditIcon: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(191, 216, 192, 0.25)', // Sage Mist @ 25%
    zIndex: 10,
  },

  // Title Section - Hero, airy vertical rhythm
  titleSection: {
    paddingTop: 0,
    paddingBottom: 8,
    paddingRight: 44, // Space for edit icon
  },
  titleText: {
    fontSize: 24,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    lineHeight: 32,
    letterSpacing: -0.3,
    marginBottom: 12,
  },

  // Body Section - Smaller text under title
  bodyText: {
    fontSize: 14,
    fontWeight: '400',
    color: BRAND.colors.charcoalInk, // Full charcoal for readability
    lineHeight: 20,
  },

  // Divider Container - Left-aligned, tighter rhythm with meta
  dividerContainer: {
    alignItems: 'flex-start',
    paddingTop: 16,
    paddingBottom: 10,
  },
  cardDivider: {
    height: 1,
    width: '50%',
    backgroundColor: 'rgba(191, 216, 192, 0.6)', // sageMistBorder equiv
  },

  // Metadata Row - Type and timestamp combined
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8, // Tighter spacing
    gap: 8,
  },
  metaLineText: {
    fontSize: 13,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk, // Full charcoal for readability
    letterSpacing: 0.3,
  },

  // Overdue Pill - Muted coral/red accent, calm but attention-grabbing
  overduePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(196, 92, 74, 0.12)', // OVERDUE_ACCENT @ 12%
    borderWidth: 1,
    borderColor: 'rgba(196, 92, 74, 0.25)', // OVERDUE_ACCENT @ 25%
  },
  overduePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#C45C4A', // OVERDUE_ACCENT - matches OverdueSection
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },

  // CTA Pill Row - Context-aware action based on item type
  ctaPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  ctaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: 'rgba(191, 216, 192, 0.20)', // Sage Mist @ 20%
    borderWidth: 1,
    borderColor: 'rgba(191, 216, 192, 0.6)', // Sage Mist border
    // Slight shadow like mood chips
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  ctaPillText: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },

  // Primary Action Pill - Sage Mist fill, Moss Green text/icon
  primaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: 'rgba(191, 216, 192, 0.45)', // Sage Mist @ 45% - darker for contrast
    borderWidth: 1,
    borderColor: 'rgba(191, 216, 192, 0.8)', // Sage Mist border - stronger
    // Slight shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  primaryPillText: {
    fontSize: 15, // Increased from 14 for readability
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },

  // Spacer - Pushes action block to bottom of card
  actionSpacer: {
    flex: 1,
    minHeight: 24, // Reduced for tighter layout
  },

  // Divider above action row
  actionDividerContainer: {
    alignItems: 'center',
    paddingTop: 8, // Tighter spacing
    paddingBottom: 16,
  },
  actionDivider: {
    width: '90%',
    height: 1,
    backgroundColor: 'rgba(191, 216, 192, 0.5)', // sageMistBorder
  },

  // Action Pill - Small rounded pill button
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(191, 216, 192, 0.12)', // Very faint sage
    borderWidth: 1,
    borderColor: 'rgba(191, 216, 192, 0.5)', // Sage Mist border
  },
  actionPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },

  // Legacy date control styles (kept for reference)
  dateControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: BRAND.radius.pill,
    backgroundColor: BRAND.colors.linenCream,
    borderWidth: 1.5,
    borderColor: BRAND.colors.mossGreen,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  dateControlText: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
    letterSpacing: 0.3,
  },

  // Main CTA Button - For logs convert to todo
  mainCtaButton: {
    backgroundColor: BRAND.colors.mossGreen,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: BRAND.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainCtaText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 1,
  },

  // Swipe Scrims - Behind the card, fade in during drag
  swipeScrimLeft: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(100, 100, 100, 1)', // Grey
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 0,
  },
  swipeScrimRight: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(191, 216, 192, 1)', // Sage Mist
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 0,
  },
  swipeScrimIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Swipe Cue Row - Above the card, aligned with card edges
  swipeCueRow: {
    position: 'absolute',
    top: 16,
    left: 32,
    right: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 3,
  },
  swipeCueText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(34, 34, 34, 0.70)', // Charcoal Ink @ 70%
    letterSpacing: 0.2,
  },

  // Save & Exit Container - Single centered text link
  saveExitContainer: {
    paddingHorizontal: 24,
    paddingBottom: 28,
    paddingTop: 16,
    alignItems: 'center',
    backgroundColor: BRAND.colors.linenCream,
  },
  saveExitButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  saveExitText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(34, 34, 34, 0.65)', // charcoalInk @ 65%
    letterSpacing: 0.1,
  },

  // Date Modal Styles - Keep light themed
  dateModalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  dateModalContent: {
    width: '92%',
    maxWidth: 400,
    maxHeight: '85%',
    alignSelf: 'center',
    backgroundColor: BRAND.colors.linenCream,
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 20,
    borderRadius: BRAND.radius.xl,
    borderWidth: 1,
    borderColor: BRAND.colors.sageMist,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 32,
    elevation: 12,
  },
  dateModalScroll: {
    paddingBottom: 32,
    paddingTop: 4,
  },
  dateModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    marginBottom: 20,
    letterSpacing: -0.3,
  },
  dateChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: BRAND.radius.pill,
    backgroundColor: 'rgba(191, 216, 192, 0.2)', // Sage Mist @ 20%
    borderWidth: 1.5,
    borderColor: BRAND.colors.sageMist,
  },
  dateChipPressed: {
    backgroundColor: 'rgba(191, 216, 192, 0.35)',
  },
  dateChipSelected: {
    backgroundColor: BRAND.colors.sageMist,
    borderColor: BRAND.colors.mossGreen,
    borderWidth: 2,
  },
  dateChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },
  timeToggleLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  dateModalActions: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 20,
  },
  dateModalCancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: BRAND.radius.md,
    backgroundColor: 'rgba(34, 34, 34, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(34, 34, 34, 0.1)',
  },
  dateModalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.colors.inkSubtle,
  },
  dateModalConfirmButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: BRAND.radius.md,
    backgroundColor: BRAND.colors.mossGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateModalConfirmDisabled: {
    opacity: 0.6,
  },
  dateModalConfirmText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default SweepCard;
