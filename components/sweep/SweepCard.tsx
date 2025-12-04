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
 * - Action center: date control pill + skip button grouped together
 * - Swipe cues at bottom: "← Not needed anymore" / "Keep for later →"
 * - Swipe gestures with subtle color hint backgrounds
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
import { Pencil, Calendar, Clock } from 'lucide-react-native';
import { format, addDays, setHours, setMinutes } from 'date-fns';
import { Text, Button, Box } from '../../ui';
import { BRAND } from '../../design/brand';
import { toDayString, parseDayString } from '../../lib/date/computeDueDay';
import { useRepo } from '../../providers/RepoProvider';
import type { SweepCandidate } from '../../lib/sweep/types';

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
const SWIPE_THRESHOLD = 120; // Fixed px threshold for triggering action
const SWIPE_OUT_DISTANCE = 500; // Distance to animate card off-screen
const VELOCITY_THRESHOLD = 500; // Velocity that can trigger swipe even if threshold not met

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
  /** Called when user wants to skip until next sweep */
  onSkip: () => void;
  /** Called when user wants to edit/fix the item (opens full overlay) */
  onOpenEdit: () => void;
  /** Called when user wants to convert log to todo (opens overlay in convert mode) */
  onConvertToTodo?: () => void;
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
        return { kind: 'todo_add_due_date', label: 'Add due date' };
      }
      return { kind: 'todo_adjust_due_date', label: 'Adjust due date' };
    }

    case 'habit': {
      // Check if habit has a start_date
      const hasStartDate = !!candidate.raw.start_date;
      if (!hasStartDate) {
        return { kind: 'habit_add_start_date', label: 'Add start date' };
      }
      return { kind: 'habit_adjust_start_date', label: 'Adjust start date' };
    }

    case 'note': {
      // Check if it's a journal log - journals have no main CTA
      const subtype = candidate.raw.subtype;
      const canonicalType = candidate.raw.canonical_type;

      // Journal detection: subtype='journal' or canonical_type contains 'journal'
      const isJournal =
        subtype === 'journal' ||
        canonicalType === 'journal' ||
        (canonicalType && canonicalType.includes('journal'));

      if (isJournal) {
        return { kind: 'none', label: '' };
      }

      // General logs or idea logs can be converted to todo
      return { kind: 'log_convert_to_todo', label: 'Turn into a to-do' };
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
  onSkip,
  onOpenEdit,
  onConvertToTodo,
}: SweepCardProps) {
  const repo = useRepo();
  const typeLabel = getTypeChipLabel(candidate);
  const title = getCandidateTitle(candidate);
  const body = getCandidateBody(candidate);
  const timestamp = formatCreatedTimestamp(candidate.createdAt);

  // Compute CTA kind and label based on candidate type
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
            },
          });
        } else if (candidate.kind === 'habit') {
          await repo.update({
            id: candidate.id,
            patch: {
              start_date: null,
            },
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
            },
          });
        } else if (candidate.kind === 'habit') {
          await repo.update({
            id: candidate.id,
            patch: {
              start_date: dueDay,
            },
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

  // Pan gesture for swiping
  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10]) // Only activate for horizontal movement
    .failOffsetY([-15, 15]) // Fail if vertical movement is dominant
    .onUpdate((event) => {
      translateX.value = event.translationX;
    })
    .onEnd((event) => {
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
      [1, 0.98],
      Extrapolation.CLAMP,
    );

    return {
      transform: [{ translateX: translateX.value }, { rotate: `${rotate}deg` }, { scale }],
      opacity: cardOpacity.value,
    };
  });

  // Animated style for left hint background (Clear) - Periwinkle gradient feel
  const leftHintBackgroundStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD * 1.5, -SWIPE_THRESHOLD * 0.5, 0],
      [0.95, 0.6, 0],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  // Animated style for right hint background (Keep) - Sage to Moss gradient feel
  const rightHintBackgroundStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD * 0.5, SWIPE_THRESHOLD * 1.5],
      [0, 0.6, 0.95],
      Extrapolation.CLAMP,
    );
    return { opacity };
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
      {/* Swipe hint backgrounds (visible during swipe) - Full screen */}
      <Animated.View
        style={[styles.swipeHintBackground, styles.swipeHintLeft, leftHintBackgroundStyle]}
        pointerEvents="none"
      />
      <Animated.View
        style={[styles.swipeHintBackground, styles.swipeHintRight, rightHintBackgroundStyle]}
        pointerEvents="none"
      />

      {/* Swipeable Full-Screen Area wrapped in GestureDetector */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.swipeableArea, animatedCardStyle]}>
          {/* Content Area - Scrollable */}
          <ScrollView
            style={styles.contentScrollView}
            contentContainerStyle={styles.contentScrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* Top Spacer - Pushes content down slightly */}
            <View style={styles.topSpacer} />

            {/* Title Section with Pencil - Hero, left-aligned */}
            <View style={styles.titleSection}>
              <View style={styles.titleRow}>
                <Text style={styles.titleText} numberOfLines={4}>
                  {title}
                </Text>
                {/* Edit Button - At end of title */}
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={onOpenEdit}
                  accessibilityLabel="Fix this item"
                  accessibilityRole="button"
                  activeOpacity={0.7}
                >
                  <Pencil size={14} color={BRAND.colors.mossGreen} />
                </TouchableOpacity>
              </View>

              {/* Body Preview - Directly under title, above divider */}
              {bodyPreview && (
                <View style={styles.bodySection}>
                  <Text style={styles.bodyText} numberOfLines={3}>
                    {bodyPreview}
                  </Text>
                </View>
              )}
            </View>

            {/* Bottom Horizontal Line - Shorter, left-aligned */}
            <View style={styles.titleUnderline} />

            {/* Metadata Row - Type chip and timestamp */}
            <View style={styles.metadataRow}>
              <View style={styles.typeChip}>
                <Text style={styles.typeChipText}>{typeLabel.toUpperCase()}</Text>
              </View>
              <Text style={styles.timestamp}>{timestamp}</Text>
            </View>

            {/* Spacer - Pushes action center to ~2/3 down the page */}
            <View style={styles.actionSpacer} />

            {/* Action Center - Date control + Skip grouped together */}
            <View style={styles.actionCenter}>
              {/* Combined Date Control - For todos and habits only */}
              {(ctaKind === 'todo_add_due_date' ||
                ctaKind === 'todo_adjust_due_date' ||
                ctaKind === 'habit_add_start_date' ||
                ctaKind === 'habit_adjust_start_date') && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={handleMainCtaPress}
                  accessibilityLabel={ctaLabel}
                  accessibilityRole="button"
                  activeOpacity={0.7}
                >
                  <View style={styles.actionButtonLine1}>
                    <Calendar size={16} color={BRAND.colors.linenCream} />
                    <Text style={styles.actionButtonText}>
                      {candidate.kind === 'todo'
                        ? candidate.raw.due_day || candidate.raw.due_date
                          ? `Due ${formatDueDay(candidate.raw.due_day || candidate.raw.due_date)}`
                          : 'Add due date'
                        : candidate.raw.start_date
                          ? `Starts ${formatDueDay(candidate.raw.start_date)}`
                          : 'Add start date'}
                    </Text>
                  </View>
                  <Text style={styles.actionButtonSubtext}>Edit</Text>
                </TouchableOpacity>
              )}

              {/* Convert to Todo CTA - Only for logs */}
              {ctaKind === 'log_convert_to_todo' && (
                <TouchableOpacity
                  style={styles.mainCtaButton}
                  onPress={handleMainCtaPress}
                  activeOpacity={0.85}
                  accessibilityLabel={ctaLabel}
                  accessibilityRole="button"
                >
                  <Text style={styles.mainCtaText}>{ctaLabel.toUpperCase()}</Text>
                </TouchableOpacity>
              )}

              {/* Skip Button - Two line layout */}
              <TouchableOpacity
                style={styles.actionButton}
                onPress={onSkip}
                accessibilityLabel="Skip until next Sweep"
                accessibilityRole="button"
                activeOpacity={0.7}
              >
                <View style={styles.actionButtonLine1}>
                  <Clock size={16} color={BRAND.colors.linenCream} />
                  <Text style={styles.actionButtonText}>Skip</Text>
                </View>
                <Text style={styles.actionButtonSubtext}>until next Sweep</Text>
              </TouchableOpacity>
            </View>

            {/* Bottom spacer for swipe cues */}
            <View style={styles.bottomSpacer} />
          </ScrollView>

          {/* Swipe Cues - Fixed at very bottom */}
          <View style={styles.swipeCuesContainer}>
            <View style={styles.swipeCuesRow}>
              <TouchableOpacity
                style={styles.swipeCue}
                onPress={() => handleButtonPress('left', onClear)}
                accessibilityLabel="Clear this item"
                accessibilityRole="button"
              >
                <Text style={styles.swipeCueText}>← Not needed anymore</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.swipeCue}
                onPress={() => handleButtonPress('right', onKeep)}
                accessibilityLabel="Keep this item"
                accessibilityRole="button"
              >
                <Text style={styles.swipeCueText}>Keep for later →</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </GestureDetector>

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
// Styles - Sage-toned Full-Screen Layout
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Card Wrapper - Full screen container
  cardWrapper: {
    flex: 1,
    position: 'relative',
  },

  // Swipe Hint Backgrounds - Full screen, visible during swipe
  swipeHintBackground: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  swipeHintLeft: {
    // Periwinkle tint for clear
    backgroundColor: 'rgba(156, 166, 224, 0.25)', // Periwinkle @ 25%
  },
  swipeHintRight: {
    // Lighter sage tint for keep
    backgroundColor: 'rgba(191, 216, 192, 0.35)', // Sage Mist @ 35%
  },

  // Swipeable Area - Full screen
  swipeableArea: {
    flex: 1,
  },

  // Content Scroll
  contentScrollView: {
    flex: 1,
  },
  contentScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },

  // Top Spacer - Increased for more breathing room from header
  topSpacer: {
    height: 64,
  },

  // Title Section - Hero with pencil inline at end
  titleSection: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  titleText: {
    flex: 1,
    fontSize: 26,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    lineHeight: 34,
    letterSpacing: -0.3,
  },

  // Edit Button - Smaller pencil, inline with title
  editButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BRAND.radius.sm,
    backgroundColor: 'rgba(46, 85, 64, 0.1)', // Moss Green @ 10%
    marginLeft: 8,
    marginTop: 4,
  },

  // Body Section - Smaller, softer text under title
  bodySection: {
    marginTop: 12,
  },
  bodyText: {
    fontSize: 14,
    fontWeight: '400',
    color: 'rgba(34, 34, 34, 0.55)', // Charcoal @ 55% - softer
    lineHeight: 20,
  },

  // Title Underline - Shorter, left-aligned
  titleUnderline: {
    height: 2,
    width: '40%',
    backgroundColor: BRAND.colors.mossGreen,
    opacity: 0.4,
    marginBottom: 16,
  },

  // Metadata Row - Type chip and timestamp
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  // Type Chip - Periwinkle style
  typeChip: {
    backgroundColor: 'rgba(130, 130, 200, 0.2)', // Periwinkle @ 20%
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BRAND.radius.sm,
  },
  typeChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(100, 100, 180, 1)', // Periwinkle
    letterSpacing: 1,
  },
  // Timestamp
  timestamp: {
    fontSize: 13,
    fontWeight: '400',
    color: 'rgba(34, 34, 34, 0.6)', // Charcoal @ 60%
  },

  // Spacer - Pushes action center to ~2/3 down the page
  actionSpacer: {
    flex: 1,
    minHeight: 80,
  },

  // Action Center - Groups date control and skip
  actionCenter: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 24,
    paddingHorizontal: 16,
  },

  // Unified Action Button Style - Darker than bg, cream text, visible shadow
  actionButton: {
    flex: 1,
    maxWidth: 160,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: BRAND.radius.lg,
    backgroundColor: 'rgba(46, 85, 64, 0.25)', // Moss Green @ 25% - darker than sage bg
    borderWidth: 1,
    borderColor: 'rgba(46, 85, 64, 0.15)', // Subtle border
    // Visible shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  actionButtonLine1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.colors.linenCream, // Cream text
  },
  actionButtonSubtext: {
    fontSize: 12,
    fontWeight: '400',
    color: 'rgba(249, 246, 241, 0.75)', // Linen Cream @ 75%
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

  // Skip Button - Legacy style (replaced by actionButton)
  skipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: BRAND.radius.pill,
    backgroundColor: 'rgba(249, 246, 241, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(46, 85, 64, 0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  skipButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
  },

  // Bottom Spacer - Space before swipe cues
  bottomSpacer: {
    height: 24,
  },

  // Swipe Cues Container - Fixed at bottom
  swipeCuesContainer: {
    paddingHorizontal: 24,
    paddingBottom: 28,
    paddingTop: 8,
  },
  swipeCuesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  swipeCue: {
    paddingVertical: 8,
  },
  swipeCueText: {
    fontSize: 15,
    fontWeight: '700',
    color: BRAND.colors.linenCream, // Full cream for visibility
    letterSpacing: 0.3,
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
