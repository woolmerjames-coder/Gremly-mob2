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
 * - Swipe cues: Contextual based on item type (todos vs notes)
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
  Image,
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
  ArrowRightCircle,
  CheckSquare,
  Camera,
  RotateCcw,
  Plus,
} from 'lucide-react-native';
import { format, addDays, setHours, setMinutes } from 'date-fns';
import { Text, Button, Box } from '../../ui';
import { BRAND } from '../../design/brand';
import { toDayString, parseDayString } from '../../lib/date/computeDueDay';
import { useRepo } from '../../providers/RepoProvider';
import type { SweepCandidate, SweepCardMeta } from '../../lib/sweep/types';

// Gremly mascot avatar for card responses
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_AVATAR = require('../../assets/buttonforHP.png');

// Lock-in diamond icon for committed items
// eslint-disable-next-line @typescript-eslint/no-var-requires
const LOCKIN_ICON = require('../../assets/lockin icon.png');

// ─────────────────────────────────────────────────────────────────────────────
// CTA Types
// ─────────────────────────────────────────────────────────────────────────────

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
  /** Pre-computed display metadata */
  meta: SweepCardMeta;
  /** Current index (0-based) */
  index: number;
  /** Total number of candidates */
  total: number;
  /** Called when user wants to skip/defer the item to next sweep */
  onSkip: () => void;
  /** Called when user wants to clear/archive the item */
  onClear: () => void;
  /** Called when user wants to edit/fix the item (opens full overlay) */
  onOpenEdit: () => void;
  /** Called when user wants to convert log to todo (opens overlay in convert mode) */
  onConvertToTodo?: () => void;
  /** Called when user taps a quick date button (Tomorrow, 2 Days, Next Week) */
  onQuickDate?: (option: 'tomorrow' | '2days' | 'nextweek') => void;
  /** Called when user taps "Add to Space" for logs */
  onAddToSpace?: () => void;
  /** Called when user wants to save progress and exit early */
  onClose?: () => void;
  /** Feedback message to show in scrim (e.g. "BYE ✌️", "KEEPING IT") */
  feedbackMessage?: string;
  /** Which feedback type is active */
  feedbackType?: 'clear' | 'keep' | null;
  /** Hide the bottom save/exit section (when parent handles it) */
  hideBottomSaveExit?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get display label for todo status chip
 */
function getTodoStatusLabel(status: SweepCardMeta['todoStatus']): string | null {
  switch (status) {
    case 'unscheduled':
      return 'Unscheduled';
    case 'due_today':
      return 'Due today';
    case 'due_tomorrow':
      return 'Due tomorrow';
    case 'overdue':
      return 'Overdue';
    default:
      return null;
  }
}

/**
 * Get display label for log subtype chip
 */
function getLogSubtypeLabel(subtype: SweepCardMeta['logSubtype']): string | null {
  switch (subtype) {
    case 'idea':
      return 'Idea';
    case 'journal':
      return 'Journal';
    case 'general':
      return 'General';
    default:
      return null;
  }
}

/**
 * Get the title to display for a candidate.
 */
function getCandidateTitle(candidate: SweepCandidate): string {
  switch (candidate.kind) {
    case 'todo':
      return candidate.raw.name || 'Untitled task';
    case 'note':
      return candidate.raw.title || 'Untitled note';
  }
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
  meta,
  index: _index,
  total: _total,
  onSkip,
  onClear,
  onOpenEdit,
  onConvertToTodo,
  onQuickDate,
  onAddToSpace,
  onClose,
  feedbackMessage: _feedbackMessage,
  feedbackType,
  hideBottomSaveExit,
}: SweepCardProps) {
  const repo = useRepo();
  const title = getCandidateTitle(candidate);

  // Photo attachments for note candidates
  const hasAttachments =
    candidate.kind === 'note' && candidate.attachments && candidate.attachments.length > 0;
  const firstAttachment = hasAttachments ? candidate.attachments![0] : null;
  const attachmentCount = hasAttachments ? candidate.attachments!.length : 0;

  // ─────────────────────────────────────────────────────────────────────────
  // Photo Preview State
  // ─────────────────────────────────────────────────────────────────────────
  const [isPhotoPreviewOpen, setIsPhotoPreviewOpen] = useState(false);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // Inline Date Picker State
  // ─────────────────────────────────────────────────────────────────────────
  const [showDatePicker, setShowDatePicker] = useState(false);
  // Track if date picker was triggered by Keep action on undated todo
  const [keepAfterDatePick, setKeepAfterDatePick] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    // Pre-fill with existing date if adjusting
    if (candidate.kind === 'todo' && candidate.raw.due_day) {
      const parsed = parseDayString(candidate.raw.due_day);
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
    setKeepAfterDatePick(false);
    // Pre-fill date based on candidate
    if (candidate.kind === 'todo' && candidate.raw.due_day) {
      const parsed = parseDayString(candidate.raw.due_day);
      setSelectedDate(parsed || new Date());
    } else {
      setSelectedDate(new Date());
    }
  }, [candidate.id, candidate.kind, candidate.raw]);

  // ─────────────────────────────────────────────────────────────────────────
  // Photo Preview Handlers
  // ─────────────────────────────────────────────────────────────────────────
  const handleOpenPhotoPreview = useCallback((url: string) => {
    setPreviewPhotoUrl(url);
    setIsPhotoPreviewOpen(true);
  }, []);

  const handleClosePhotoPreview = useCallback(() => {
    setIsPhotoPreviewOpen(false);
    setPreviewPhotoUrl(null);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Quick Date Button Handlers
  // ─────────────────────────────────────────────────────────────────────────
  const handleTomorrow = useCallback(() => {
    if (onQuickDate) {
      onQuickDate('tomorrow');
    }
  }, [onQuickDate]);

  const handleIn2Days = useCallback(() => {
    if (onQuickDate) {
      onQuickDate('2days');
    }
  }, [onQuickDate]);

  const handleNextWeek = useCallback(() => {
    if (onQuickDate) {
      onQuickDate('nextweek');
    }
  }, [onQuickDate]);

  const handlePickDate = useCallback(() => {
    setShowDatePicker(true);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Log Action Handlers
  // ─────────────────────────────────────────────────────────────────────────
  const handleNextSweep = useCallback(() => {
    onSkip();
  }, [onSkip]);

  const handleAddToSpace = useCallback(() => {
    if (onAddToSpace) {
      onAddToSpace();
    }
  }, [onAddToSpace]);

  const handleMakeTodo = useCallback(() => {
    if (onConvertToTodo) {
      onConvertToTodo();
    }
  }, [onConvertToTodo]);

  // ─────────────────────────────────────────────────────────────────────────
  // Date Picker Handlers
  // ─────────────────────────────────────────────────────────────────────────
  const handleDateConfirm = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      if (candidate.kind !== 'todo') {
        // Only todos have date pickers in Sweep
        return;
      }

      if (clearDateFlag) {
        // Clear the date
        await repo.update({
          id: candidate.id,
          patch: {
            due_day: null,
            due_date: null,
          } as any, // Todo-specific fields
        });
      } else {
        // Set the date
        const dueDay = toDayString(selectedDate);
        await repo.update({
          id: candidate.id,
          patch: {
            due_day: dueDay,
            due_date: dueDay, // Also set due_date for backward compat
          } as any, // Todo-specific fields
        });
      }

      // If this was triggered by Skip action on undated todo, call onSkip now
      if (keepAfterDatePick) {
        setKeepAfterDatePick(false);
        setShowDatePicker(false);
        setClearDateFlag(false);
        setIsSaving(false);
        onSkip();
        return;
      }
    } catch (error) {
      console.error('[SweepCard] Failed to update date:', error);
    } finally {
      setIsSaving(false);
      setShowDatePicker(false);
      setClearDateFlag(false);
    }
  }, [candidate, selectedDate, clearDateFlag, isSaving, repo, keepAfterDatePick, onSkip]);

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
        // Just proceed - don't block with date picker (user can add date via button if they want)
        animateOut('right', onSkip);
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

  // Animated style for left scrim (mossGreen, archive action)
  const animatedLeftScrimStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, -50, 0],
      [0.95, 0.5, 0],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  // Animated style for right scrim (Golden Pear, keep action)
  const animatedRightScrimStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [0, 50, SWIPE_THRESHOLD],
      [0, 0.5, 0.95],
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
    // Just proceed - don't block with date picker (user can add date via button if they want)
    // In test mode, call directly without animation
    if (isTestEnv) {
      onSkip();
      return;
    }
    translateX.value = withSpring(
      SWIPE_OUT_DISTANCE,
      { damping: 20, stiffness: 200, overshootClamping: true },
      (finished) => {
        if (finished) runOnJS(onSkip)();
      },
    );
    cardOpacity.value = withTiming(0, { duration: 200 });
  }, [onSkip, translateX, cardOpacity]);

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
      {/* Left Scrim - Moss Green (archive/clear action) */}
      <Animated.View style={[styles.swipeScrimLeft, animatedLeftScrimStyle]} pointerEvents="none">
        {!feedbackType && (
          <Animated.View style={[styles.swipeScrimIcon, animatedLeftIconStyle]}>
            <Archive size={32} color="rgba(255, 255, 255, 0.9)" strokeWidth={1.5} />
          </Animated.View>
        )}
      </Animated.View>

      {/* Right Scrim - Golden Pear (keep action) */}
      <Animated.View style={[styles.swipeScrimRight, animatedRightScrimStyle]} pointerEvents="none">
        {!feedbackType && (
          <Animated.View style={[styles.swipeScrimIcon, animatedRightIconStyle]}>
            <Check size={32} color="rgba(255, 255, 255, 0.9)" strokeWidth={2} />
          </Animated.View>
        )}
      </Animated.View>

      {/* Swipe Cue Labels - ABOVE the card (contextual based on item type) */}
      <View style={styles.swipeCueRow} pointerEvents="none">
        <Animated.View style={animatedLeftLabelStyle}>
          <Text style={styles.swipeCueText}>
            {candidate.kind === 'todo'
              ? meta.isLockedIn
                ? '← Let it go'
                : '← Done with this'
              : '← Remove this'}
          </Text>
        </Animated.View>
        <Animated.View style={animatedRightLabelStyle}>
          <Text style={styles.swipeCueText}>
            {candidate.kind === 'todo'
              ? meta.isLockedIn
                ? 'Keep commitment →'
                : 'Still matters →'
              : 'Save this →'}
          </Text>
        </Animated.View>
      </View>

      {/* Centered Card Container - Swipeable */}
      <View style={styles.cardCenteringContainer}>
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              styles.swipeCardContainer,
              animatedCardContainerStyle,
              animatedCardStyle,
              meta.isLockedIn && styles.cardLockedIn,
              meta.todoStatus === 'overdue' && styles.cardOverdue,
            ]}
          >
            {/* Inner Shadow - Top only, creates lifted sheet effect */}
            <LinearGradient
              colors={[
                'rgba(34, 34, 34, 0.06)', // Charcoal Ink @ 6% at top
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
              {/* Locked-in diamond icon */}
              {meta.isLockedIn && (
                <View style={styles.lockedInIconContainer}>
                  <Image
                    source={LOCKIN_ICON}
                    style={styles.lockedInIcon}
                    accessibilityLabel="Locked in commitment"
                  />
                </View>
              )}

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

              {/* CHIPS ROW - All chips on one line */}
              <View style={styles.chipsRow}>
                {/* Type chip: Todo or Log */}
                <View style={styles.chip}>
                  <Text style={styles.chipText}>{meta.typeChip}</Text>
                </View>

                {/* Status chip: varies by type */}
                {meta.todoStatus && (
                  <View style={[styles.chip, meta.todoStatus === 'overdue' && styles.chipOverdue]}>
                    <Text
                      style={[
                        styles.chipText,
                        meta.todoStatus === 'overdue' && styles.chipTextOverdue,
                      ]}
                    >
                      {getTodoStatusLabel(meta.todoStatus)}
                    </Text>
                  </View>
                )}
                {meta.logSubtype && (
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>{getLogSubtypeLabel(meta.logSubtype)}</Text>
                  </View>
                )}

                {/* Time chip: New! or Resurfacing */}
                <Text style={styles.chipTimeText}>
                  · {meta.isNew ? 'New!' : `Resurfacing · ${meta.resurfacingDate}`}
                </Text>

                {/* Space chip if assigned */}
                {meta.spaceName && (
                  <View style={styles.chipSpace}>
                    <Text style={styles.chipSpaceText}>◇ {meta.spaceName}</Text>
                  </View>
                )}

                {/* Photo indicator */}
                {hasAttachments && (
                  <View style={styles.photoIndicator}>
                    <Camera size={12} color="rgba(34, 34, 34, 0.5)" strokeWidth={2} />
                  </View>
                )}
              </View>

              {/* Photo Preview - Large image at top for note candidates with attachments */}
              {hasAttachments && firstAttachment && (
                <TouchableOpacity
                  style={styles.photoContainer}
                  onPress={() => handleOpenPhotoPreview(firstAttachment.url)}
                  activeOpacity={0.9}
                  accessibilityLabel="Tap to view full photo"
                  accessibilityRole="imagebutton"
                >
                  <Image
                    source={{ uri: firstAttachment.url }}
                    style={styles.photoImage}
                    resizeMode="cover"
                  />
                  {attachmentCount > 1 && (
                    <View style={styles.photoCountBadge}>
                      <Text style={styles.photoCountText}>+{attachmentCount - 1}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}

              {/* USER TEXT - Large, prominent */}
              <View style={styles.titleSection}>
                <Text style={styles.titleText} numberOfLines={4}>
                  {title}
                </Text>
              </View>

              {/* GREMLY RESPONSE - Avatar + contextual message */}
              <View style={styles.gremlyResponseSection}>
                <Image
                  source={GREMLY_AVATAR}
                  style={styles.gremlyAvatar}
                  accessibilityLabel="Gremly mascot"
                />
                <Text style={styles.gremlyResponseText}>{meta.gremlyResponse}</Text>
              </View>

              {/* Spacer - Pushes action block to bottom of card */}
              <View style={styles.actionSpacer} />

              {/* Divider above action row */}
              <View style={styles.actionDividerContainer}>
                <View style={styles.actionDivider} />
              </View>

              {/* ACTION BUTTONS - 4-column grid, different for todos vs logs */}
              <View style={styles.actionButtonsSection}>
                {candidate.kind === 'todo' ? (
                  <>
                    {/* Todo hint text */}
                    <Text style={styles.actionHintText}>Set a due date, then swipe right</Text>

                    {/* Todo buttons: Tomorrow, 2 Days, Next Week, Pick Date */}
                    <View style={styles.buttonGrid}>
                      <TouchableOpacity
                        style={[styles.gridButton, styles.gridButtonPrimary]}
                        onPress={handleTomorrow}
                        accessibilityLabel="Set due tomorrow"
                        activeOpacity={0.7}
                      >
                        <ArrowRightCircle
                          size={16}
                          color={BRAND.colors.linenCream}
                          strokeWidth={2}
                        />
                        <Text style={[styles.gridButtonLabel, styles.gridButtonLabelPrimary]}>
                          Tomorrow
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.gridButton}
                        onPress={handleIn2Days}
                        accessibilityLabel="Set due in 2 days"
                        activeOpacity={0.7}
                      >
                        <ArrowRightCircle
                          size={16}
                          color={BRAND.colors.mossGreen}
                          strokeWidth={2}
                        />
                        <Text style={styles.gridButtonLabel}>2 Days</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.gridButton}
                        onPress={handleNextWeek}
                        accessibilityLabel="Set due next week"
                        activeOpacity={0.7}
                      >
                        <Calendar size={16} color={BRAND.colors.mossGreen} strokeWidth={2} />
                        <Text style={styles.gridButtonLabel}>Next Week</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.gridButton}
                        onPress={handlePickDate}
                        accessibilityLabel="Pick a date"
                        activeOpacity={0.7}
                      >
                        <Calendar size={16} color={BRAND.colors.mossGreen} strokeWidth={2} />
                        <Text style={styles.gridButtonLabel}>Pick Date</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    {/* Log buttons: Next Sweep, Pick Date, Add to Space, Make Todo */}
                    <View style={styles.buttonGrid}>
                      <TouchableOpacity
                        style={[styles.gridButton, styles.gridButtonPrimary]}
                        onPress={handleNextSweep}
                        accessibilityLabel="Save for next sweep"
                        activeOpacity={0.7}
                      >
                        <RotateCcw size={16} color={BRAND.colors.linenCream} strokeWidth={2} />
                        <Text style={[styles.gridButtonLabel, styles.gridButtonLabelPrimary]}>
                          Next Sweep
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.gridButton}
                        onPress={handlePickDate}
                        accessibilityLabel="Pick a date"
                        activeOpacity={0.7}
                      >
                        <Calendar size={16} color={BRAND.colors.mossGreen} strokeWidth={2} />
                        <Text style={styles.gridButtonLabel}>Pick Date</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.gridButton}
                        onPress={handleAddToSpace}
                        accessibilityLabel="Add to space"
                        activeOpacity={0.7}
                      >
                        <Plus size={16} color={BRAND.colors.mossGreen} strokeWidth={2} />
                        <Text style={styles.gridButtonLabel}>Add to Space</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.gridButton}
                        onPress={handleMakeTodo}
                        accessibilityLabel="Convert to todo"
                        activeOpacity={0.7}
                      >
                        <CheckSquare size={16} color={BRAND.colors.mossGreen} strokeWidth={2} />
                        <Text style={styles.gridButtonLabel}>Make Todo</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            </ScrollView>
          </Animated.View>
        </GestureDetector>
      </View>

      {/* Save & Exit - Single centered text link at bottom (hidden when parent handles it) */}
      {!hideBottomSaveExit && (
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
      )}

      {/* Hidden Test Buttons - Only rendered in test environment for accessibility testing */}
      {isTestEnv && (
        <View style={{ position: 'absolute', opacity: 0, pointerEvents: 'box-none' }}>
          <TouchableOpacity
            onPress={onSkip}
            accessibilityLabel="Skip this item"
            accessibilityRole="button"
          >
            <Text>Skip</Text>
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
                {candidate.kind === 'todo' ? 'Set due date' : 'Set start date'}
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
              {!clearDateFlag && candidate.kind === 'todo' && (
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
                    setKeepAfterDatePick(false);
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

      {/* Photo Preview Modal - Full-screen image viewer */}
      <Modal
        visible={isPhotoPreviewOpen}
        transparent
        animationType="fade"
        onRequestClose={handleClosePhotoPreview}
      >
        <Pressable style={styles.photoPreviewBackdrop} onPress={handleClosePhotoPreview}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            {previewPhotoUrl && (
              <Image
                source={{ uri: previewPhotoUrl }}
                style={styles.photoPreviewImage}
                resizeMode="contain"
                accessibilityLabel="Full size photo"
              />
            )}
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
  // Card Wrapper - Full screen container with white background
  cardWrapper: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#FFFFFF',
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
    backgroundColor: BRAND.colors.linenCream, // Linen cream card
    borderRadius: 16,
    overflow: 'hidden',
    // Strong shadow all around for physical card feel
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
  },

  // Card background variants
  cardLockedIn: {
    backgroundColor: BRAND.colors.goldenPear,
  },
  cardOverdue: {
    backgroundColor: '#E8D4C4', // Dusty terracotta
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

  // Locked-in Icon
  lockedInIconContainer: {
    position: 'absolute',
    top: 16,
    right: 56, // Position to left of edit icon (edit is at right: 16, width 36)
    zIndex: 10,
  },
  lockedInIcon: {
    width: 24,
    height: 24,
  },

  // Photo Preview Container - Large image at top of card
  photoContainer: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: 'rgba(191, 216, 192, 0.15)', // Sage Mist placeholder
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoCountBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  photoCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Camera icon indicator in metadata row
  photoIndicator: {
    marginLeft: 6,
    opacity: 0.7,
  },

  // Chips Row - All chips on one line
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
    paddingRight: 40, // Space for edit icon
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(46, 85, 64, 0.1)',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
  },
  chipOverdue: {
    backgroundColor: 'rgba(185, 28, 28, 0.12)',
  },
  chipTextOverdue: {
    color: '#B91C1C',
  },
  chipTimeText: {
    fontSize: 12,
    color: BRAND.colors.mossGreen,
    opacity: 0.55,
  },
  chipSpace: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
    backgroundColor: 'rgba(46, 85, 64, 0.08)',
  },
  chipSpaceText: {
    fontSize: 12,
    color: BRAND.colors.mossGreen,
    opacity: 0.65,
  },
  // Photo Preview Modal
  photoPreviewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPreviewImage: {
    width: Dimensions.get('window').width * 0.9,
    height: Dimensions.get('window').height * 0.7,
    borderRadius: 8,
  },

  // Title Section - Hero, airy vertical rhythm
  titleSection: {
    paddingTop: 0,
    paddingBottom: 0,
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

  // Gremly Response Section
  gremlyResponseSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 32,
    marginBottom: 32,
  },
  gremlyAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    flexShrink: 0,
  },
  gremlyResponseText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    color: BRAND.colors.mossGreen,
    opacity: 0.85,
    paddingTop: 4,
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

  // Action Buttons Section - 4-column grid
  actionButtonsSection: {
    marginBottom: 16,
  },
  actionHintText: {
    fontSize: 12,
    color: BRAND.colors.mossGreen,
    opacity: 0.5,
    marginBottom: 12,
  },
  buttonGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  gridButton: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(46, 85, 64, 0.1)',
    gap: 4,
  },
  gridButtonPrimary: {
    backgroundColor: BRAND.colors.mossGreen,
  },
  gridButtonIcon: {
    fontSize: 16,
    color: BRAND.colors.mossGreen,
    fontWeight: '600',
  },
  gridButtonLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
    textAlign: 'center',
    lineHeight: 14,
  },
  gridButtonLabelPrimary: {
    color: BRAND.colors.linenCream,
  },

  // Swipe Scrims - Behind the card, fade in during drag
  swipeScrimLeft: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BRAND.colors.mossGreen, // Gremly brand green
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1, // Behind card (cardCenteringContainer has zIndex: 2)
  },
  swipeScrimRight: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#E0C47A', // Golden Pear - Gremly brand warm color
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1, // Behind card (cardCenteringContainer has zIndex: 2)
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
    backgroundColor: '#FFFFFF',
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
