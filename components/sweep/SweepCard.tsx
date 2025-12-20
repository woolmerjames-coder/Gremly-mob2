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
  Animated as RNAnimated,
  Easing,
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
  Calendar,
  ArrowRightCircle,
  CheckSquare,
  Camera,
  RotateCcw,
  Plus,
} from 'lucide-react-native';
import { format, addDays, setHours, setMinutes } from 'date-fns';
import * as Haptics from 'expo-haptics';
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

// Behind-card confirmation messages (revealed as card moves)
const CLEAR_MESSAGES = ['DONE', 'CLEARED', 'GONE', 'ARCHIVED'];
const KEEP_MESSAGES = ['SAVED', 'KEEPING IT', 'ON IT', 'NOTED'];

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
  /** Called when user swipes right with a quick date selected */
  onConfirmQuickDate?: (option: 'tomorrow' | '2days' | 'nextweek') => void;
  /** Called when user taps "Add to Space" for logs */
  onAddToSpace?: () => void;
  /** Called when user wants to save progress and exit early */
  onClose?: () => void;
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

/**
 * Normalize a string for comparison: lowercase, trim, remove punctuation, collapse whitespace.
 * Used to detect if the preview text is redundant with the title.
 */
function normalizeForComparison(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' '); // Collapse whitespace
}

/**
 * Determine if the user preview should be hidden (redundant with title).
 * Returns true if:
 * - Preview is empty/null
 * - Normalized preview === normalized title
 * - Normalized title is contained within normalized preview (or vice versa)
 */
function shouldHidePreview(title: string, preview: string | null | undefined): boolean {
  if (!preview || !preview.trim()) return true;

  const normalizedTitle = normalizeForComparison(title);
  const normalizedPreview = normalizeForComparison(preview);

  if (!normalizedPreview) return true;
  if (normalizedTitle === normalizedPreview) return true;
  if (normalizedTitle.includes(normalizedPreview)) return true;
  if (normalizedPreview.includes(normalizedTitle)) return true;

  return false;
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
  onConfirmQuickDate,
  onAddToSpace,
  onClose,
  hideBottomSaveExit,
}: SweepCardProps) {
  const repo = useRepo();
  const title = getCandidateTitle(candidate);

  // Get user's original input text for preview
  // For notes: body field contains user's original input
  // For todos: body field contains the full Mind Drop sentence
  const userOriginalText = useMemo(() => {
    if (candidate.kind === 'note') {
      return candidate.raw.body || null;
    } else if (candidate.kind === 'todo') {
      return candidate.raw.body || null;
    }
    return null;
  }, [candidate]);

  // Determine if we should show the user preview
  const showUserPreview = useMemo(() => {
    return !shouldHidePreview(title, userOriginalText);
  }, [title, userOriginalText]);

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
  // Behind-Card Confirmation Messages (randomized per card)
  // ─────────────────────────────────────────────────────────────────────────
  const [clearMessage] = useState(
    () => CLEAR_MESSAGES[Math.floor(Math.random() * CLEAR_MESSAGES.length)],
  );
  const [keepMessage] = useState(
    () => KEEP_MESSAGES[Math.floor(Math.random() * KEEP_MESSAGES.length)],
  );

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

  // Track which quick action button is selected (if any)
  // Default selection: Tomorrow for todos, Next Sweep for logs
  const getDefaultSelection = useCallback(() => {
    return candidate.kind === 'todo' ? 'tomorrow' : 'nextsweep';
  }, [candidate.kind]);

  const [selectedQuickAction, setSelectedQuickAction] = useState<
    'tomorrow' | '2days' | 'nextweek' | 'pickdate' | 'nextsweep' | null
  >(() => (candidate.kind === 'todo' ? 'tomorrow' : 'nextsweep'));

  // Track if user has manually changed selection (not just default)
  const [hasUserSelected, setHasUserSelected] = useState(false);

  // Animated hint arrow
  const hintArrowAnim = React.useRef(new RNAnimated.Value(0)).current;

  // Start animation when selection exists
  React.useEffect(() => {
    if (selectedQuickAction && selectedQuickAction !== 'pickdate') {
      // Subtle repeating animation
      const animation = RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.timing(hintArrowAnim, {
            toValue: 8,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          RNAnimated.timing(hintArrowAnim, {
            toValue: 0,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      animation.start();
      return () => animation.stop();
    }
  }, [selectedQuickAction, hintArrowAnim]);

  // Reset date picker state when candidate changes
  React.useEffect(() => {
    setShowDatePicker(false);
    setClearDateFlag(false);
    setShowTimePicker(false);
    setSelectedTimePreset(null);
    setKeepAfterDatePick(false);
    setSelectedQuickAction(getDefaultSelection());
    setHasUserSelected(false);
    // Pre-fill date based on candidate
    if (candidate.kind === 'todo' && candidate.raw.due_day) {
      const parsed = parseDayString(candidate.raw.due_day);
      setSelectedDate(parsed || new Date());
    } else {
      setSelectedDate(new Date());
    }
  }, [candidate.id, candidate.kind, candidate.raw, getDefaultSelection]);

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
  // Quick Date Button Handlers (selection only - confirmed on swipe)
  // ─────────────────────────────────────────────────────────────────────────
  const handleTomorrow = useCallback(() => {
    console.log('[SweepCard] Tomorrow tapped, setting selection');
    setSelectedQuickAction('tomorrow');
    setHasUserSelected(true);
  }, []);

  const handleIn2Days = useCallback(() => {
    console.log('[SweepCard] 2 Days tapped, setting selection');
    setSelectedQuickAction('2days');
    setHasUserSelected(true);
  }, []);

  const handleNextWeek = useCallback(() => {
    console.log('[SweepCard] Next Week tapped, setting selection');
    setSelectedQuickAction('nextweek');
    setHasUserSelected(true);
  }, []);

  const handlePickDate = useCallback(() => {
    setSelectedQuickAction('pickdate');
    setHasUserSelected(true);
    setShowDatePicker(true);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Log Action Handlers
  // ─────────────────────────────────────────────────────────────────────────
  const handleNextSweep = useCallback(() => {
    setSelectedQuickAction('nextsweep');
    setHasUserSelected(true);
  }, []);

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
  const hasTriggeredHaptic = useSharedValue(false); // Track haptic at threshold

  // Haptic feedback helper
  const triggerHaptic = useCallback((type: 'light' | 'medium' | 'success') => {
    if (type === 'success') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (type === 'medium') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  // Handle swipe right completion - called from worklet via runOnJS
  const handleSwipeRight = useCallback(() => {
    if (selectedQuickAction && selectedQuickAction !== 'pickdate' && onConfirmQuickDate) {
      // User selected a quick date, confirm it
      if (
        selectedQuickAction === 'tomorrow' ||
        selectedQuickAction === '2days' ||
        selectedQuickAction === 'nextweek'
      ) {
        onConfirmQuickDate(selectedQuickAction);
      } else {
        // nextsweep or other - just skip
        onSkip();
      }
    } else {
      // No selection, just keep/skip
      onSkip();
    }
  }, [selectedQuickAction, onConfirmQuickDate, onSkip]);

  // Handle swipe left completion - called from worklet via runOnJS
  const handleSwipeLeft = useCallback(() => {
    onClear();
  }, [onClear]);

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

      // Trigger haptic at 80% threshold (once)
      const progress = Math.abs(event.translationX) / SWIPE_THRESHOLD;
      if (progress >= 0.8 && !hasTriggeredHaptic.value) {
        hasTriggeredHaptic.value = true;
        runOnJS(triggerHaptic)('medium');
      } else if (progress < 0.5) {
        // Reset when user pulls back past halfway
        hasTriggeredHaptic.value = false;
      }
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
        // Success haptic on commit
        runOnJS(triggerHaptic)('success');
        // Swiped right past threshold → animate out and call JS handler
        translateX.value = withSpring(
          SWIPE_OUT_DISTANCE,
          { damping: 20, stiffness: 200, overshootClamping: true },
          (finished) => {
            if (finished) {
              runOnJS(handleSwipeRight)();
            }
          },
        );
        cardOpacity.value = withTiming(0, { duration: 200 });
      } else if (swipedLeft) {
        // Success haptic on commit
        runOnJS(triggerHaptic)('success');
        // Swiped left past threshold → animate out and call JS handler
        translateX.value = withSpring(
          -SWIPE_OUT_DISTANCE,
          { damping: 20, stiffness: 200, overshootClamping: true },
          (finished) => {
            if (finished) {
              runOnJS(handleSwipeLeft)();
            }
          },
        );
        cardOpacity.value = withTiming(0, { duration: 200 });
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
      hasTriggeredHaptic.value = false;
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

  // Animated style for the card - includes color transformation
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

    // Background color morphs based on direction (Full brand colors for satisfying feedback)
    // Left (clear/letting go): goldenPear - warm gold signals "releasing/archiving"
    // Center: linenCream (brand background)
    // Right (keep/positive): sageMist - sage green signals "keeping/saving"
    const backgroundColor = interpolateColor(
      translateX.value,
      [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD],
      [
        '#E0C47A', // goldenPear (left - releasing/archiving)
        '#F9F6F1', // linenCream (center - brand background)
        '#BFD8C0', // sageMist (right - keeping/saving)
      ],
    );

    return {
      transform: [{ translateX: translateX.value }, { rotate: `${rotate}deg` }, { scale }],
      opacity: cardOpacity.value,
      backgroundColor,
    };
  });

  // Animated style for behind-card confirmation text (LEFT - shown when swiping left)
  const animatedBehindLeftTextStyle = useAnimatedStyle(() => {
    // Only show when swiping left (negative translateX)
    const opacity = interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, -40, 0],
      [1, 0.5, 0],
      Extrapolation.CLAMP,
    );
    const scale = interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, 0],
      [1, 0.9],
      Extrapolation.CLAMP,
    );
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  // Animated style for behind-card confirmation text (RIGHT - shown when swiping right)
  const animatedBehindRightTextStyle = useAnimatedStyle(() => {
    // Only show when swiping right (positive translateX)
    const opacity = interpolate(
      translateX.value,
      [0, 40, SWIPE_THRESHOLD],
      [0, 0.5, 1],
      Extrapolation.CLAMP,
    );
    const scale = interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD],
      [0.9, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity,
      transform: [{ scale }],
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
        {/* Behind-Card Confirmation Text - Centered, shows based on swipe direction */}
        <View style={styles.behindCardTextContainer} pointerEvents="none">
          {/* Left message (shown when swiping left) */}
          <Animated.View style={[styles.behindCardTextWrapper, animatedBehindLeftTextStyle]}>
            <Text style={styles.behindCardText}>{clearMessage}</Text>
          </Animated.View>
          {/* Right message (shown when swiping right) */}
          <Animated.View style={[styles.behindCardTextWrapper, animatedBehindRightTextStyle]}>
            <Text style={styles.behindCardText}>{keepMessage}</Text>
          </Animated.View>
        </View>

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

              {/* CHIPS ROW - Lightweight metadata line */}
              <View style={styles.chipsRow}>
                <Text style={styles.chipText}>{meta.typeChip}</Text>

                {meta.todoStatus && (
                  <>
                    <Text style={styles.chipSeparator}>·</Text>
                    <Text
                      style={[
                        styles.chipText,
                        meta.todoStatus === 'overdue' && styles.chipTextOverdue,
                      ]}
                    >
                      {getTodoStatusLabel(meta.todoStatus)}
                    </Text>
                  </>
                )}
                {meta.logSubtype && (
                  <>
                    <Text style={styles.chipSeparator}>·</Text>
                    <Text style={styles.chipText}>{getLogSubtypeLabel(meta.logSubtype)}</Text>
                  </>
                )}

                <Text style={styles.chipSeparator}>·</Text>
                <Text style={styles.chipText}>
                  {meta.isNew ? 'New' : `Since ${meta.resurfacingDate}`}
                </Text>

                {meta.spaceName && (
                  <>
                    <Text style={styles.chipSeparator}>·</Text>
                    <Text style={styles.chipSpaceText}>◇ {meta.spaceName}</Text>
                  </>
                )}

                {hasAttachments && (
                  <View style={styles.photoIndicator}>
                    <Camera size={12} color="rgba(34, 34, 34, 0.4)" strokeWidth={2} />
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
                {/* User original input preview - 1 line, muted */}
                {showUserPreview && userOriginalText && (
                  <Text style={styles.userPreviewText} numberOfLines={1}>
                    {userOriginalText}
                  </Text>
                )}
              </View>

              {/* GREMLY RESPONSE - Avatar + speech bubble */}
              <View style={styles.gremlyResponseSection}>
                <Image
                  source={GREMLY_AVATAR}
                  style={styles.gremlyAvatar}
                  accessibilityLabel="Gremly mascot"
                />
                <View style={styles.speechBubble}>
                  <View style={styles.speechBubbleTail} />
                  <Text style={styles.gremlyResponseText}>{meta.gremlyResponse}</Text>
                </View>
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
                        style={[
                          styles.gridButton,
                          selectedQuickAction === 'tomorrow'
                            ? styles.gridButtonPrimary
                            : styles.gridButtonSecondary,
                        ]}
                        onPress={handleTomorrow}
                        accessibilityLabel="Set due tomorrow"
                        activeOpacity={0.7}
                      >
                        <ArrowRightCircle
                          size={16}
                          color={BRAND.colors.mossGreen}
                          strokeWidth={2}
                        />
                        <Text
                          style={[
                            styles.gridButtonLabel,
                            selectedQuickAction === 'tomorrow' && styles.gridButtonLabelPrimary,
                          ]}
                        >
                          Tomorrow
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.gridButton,
                          selectedQuickAction === '2days'
                            ? styles.gridButtonPrimary
                            : styles.gridButtonSecondary,
                        ]}
                        onPress={handleIn2Days}
                        accessibilityLabel="Set due in 2 days"
                        activeOpacity={0.7}
                      >
                        <ArrowRightCircle
                          size={16}
                          color={BRAND.colors.mossGreen}
                          strokeWidth={2}
                        />
                        <Text
                          style={[
                            styles.gridButtonLabel,
                            selectedQuickAction === '2days' && styles.gridButtonLabelPrimary,
                          ]}
                        >
                          2 Days
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.gridButton,
                          selectedQuickAction === 'nextweek'
                            ? styles.gridButtonPrimary
                            : styles.gridButtonSecondary,
                        ]}
                        onPress={handleNextWeek}
                        accessibilityLabel="Set due next week"
                        activeOpacity={0.7}
                      >
                        <Calendar size={16} color={BRAND.colors.mossGreen} strokeWidth={2} />
                        <Text
                          style={[
                            styles.gridButtonLabel,
                            selectedQuickAction === 'nextweek' && styles.gridButtonLabelPrimary,
                          ]}
                        >
                          Next Week
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.gridButton,
                          selectedQuickAction === 'pickdate'
                            ? styles.gridButtonPrimary
                            : styles.gridButtonSecondary,
                        ]}
                        onPress={handlePickDate}
                        accessibilityLabel="Pick a date"
                        activeOpacity={0.7}
                      >
                        <Calendar size={16} color={BRAND.colors.mossGreen} strokeWidth={2} />
                        <Text
                          style={[
                            styles.gridButtonLabel,
                            selectedQuickAction === 'pickdate' && styles.gridButtonLabelPrimary,
                          ]}
                        >
                          Pick Date
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Confirmation hint - shows after selection */}
                    {hasUserSelected &&
                      selectedQuickAction &&
                      selectedQuickAction !== 'pickdate' && (
                        <View style={styles.confirmationHint}>
                          <Text style={styles.confirmationHintText}>Swipe right to save</Text>
                          <RNAnimated.Text
                            style={[
                              styles.confirmationHintArrow,
                              { transform: [{ translateX: hintArrowAnim }] },
                            ]}
                          >
                            →
                          </RNAnimated.Text>
                        </View>
                      )}
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
                        <RotateCcw size={16} color={BRAND.colors.mossGreen} strokeWidth={2} />
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

                    {/* Confirmation hint for Next Sweep */}
                    {selectedQuickAction === 'nextsweep' && (
                      <Animated.View style={styles.confirmationHint}>
                        <Text style={styles.confirmationHintText}>
                          Swipe right to save for next sweep →
                        </Text>
                      </Animated.View>
                    )}
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
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 0,
    zIndex: 2,
  },

  // Swipe Card Container - The actual card that swipes
  swipeCardContainer: {
    width: CARD_WIDTH,
    maxWidth: 400,
    minHeight: 400,
    flex: 1,
    maxHeight: '100%',
    // backgroundColor controlled by animatedCardStyle for swipe color transformation
    borderRadius: 16,
    overflow: 'hidden',
    // Subtle shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4, // Android
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
    paddingHorizontal: 24,
    paddingTop: 52,
    paddingBottom: 32,
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
    marginBottom: 28,
    paddingRight: 40, // Space for edit icon
  },
  chip: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
    opacity: 0.7,
  },
  chipSeparator: {
    fontSize: 11,
    color: BRAND.colors.mossGreen,
    opacity: 0.4,
    marginHorizontal: 6,
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
    paddingBottom: 8,
    paddingRight: 44, // Space for edit icon
  },
  titleText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
    lineHeight: 34,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  // User original input preview - muted, smaller, single line
  userPreviewText: {
    fontSize: 14,
    fontWeight: '400',
    color: 'rgba(34, 34, 34, 0.50)', // Muted charcoal
    lineHeight: 20,
    marginTop: 4,
  },

  // Gremly Response Section
  gremlyResponseSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 28,
    marginBottom: 40,
  },
  gremlyAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    flexShrink: 0,
  },
  speechBubble: {
    flex: 1,
    backgroundColor: 'rgba(46, 85, 64, 0.05)',
    borderRadius: 16,
    borderTopLeftRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    position: 'relative',
  },
  speechBubbleTail: {
    position: 'absolute',
    left: -6,
    top: 12,
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderRightWidth: 8,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: 'rgba(46, 85, 64, 0.05)',
  },
  gremlyResponseText: {
    fontSize: 14,
    lineHeight: 20,
    color: BRAND.colors.mossGreen,
    opacity: 0.75,
  },

  // Spacer - Pushes action block to bottom of card
  actionSpacer: {
    flex: 1,
    minHeight: 40, // More breathing room before actions
  },

  // Divider above action row
  actionDividerContainer: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 20,
  },
  actionDivider: {
    width: '90%',
    height: 1,
    backgroundColor: 'rgba(191, 216, 192, 0.5)', // sageMistBorder
  },

  // Action Buttons Section - 4-column grid
  actionButtonsSection: {
    marginBottom: 16,
    alignItems: 'center',
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
    justifyContent: 'center',
    width: '100%',
  },
  gridButton: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(46, 85, 64, 0.1)',
    gap: 4,
    minWidth: 70,
  },
  gridButtonPrimary: {
    backgroundColor: BRAND.colors.sageMist,
  },
  gridButtonSecondary: {
    backgroundColor: 'rgba(46, 85, 64, 0.1)',
  },
  gridButtonIcon: {
    fontSize: 16,
    color: BRAND.colors.mossGreen,
    fontWeight: '600',
  },
  gridButtonLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
    textAlign: 'center',
    lineHeight: 12,
  },
  gridButtonLabelPrimary: {
    color: BRAND.colors.mossGreen,
  },

  // Confirmation hint - appears after quick action selection
  confirmationHint: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  confirmationHintText: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
    opacity: 0.7,
  },
  confirmationHintArrow: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
    opacity: 0.7,
  },

  // Swipe Cue Row - Above the card, aligned with card edges
  swipeCueRow: {
    position: 'absolute',
    top: 8,
    left: 24,
    right: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 3,
  },
  swipeCueText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(34, 34, 34, 0.55)', // Reduced prominence
    letterSpacing: 0.2,
  },

  // Behind-card confirmation text - centered behind the card
  behindCardTextContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 0, // Behind the card
  },
  behindCardTextWrapper: {
    position: 'absolute',
  },
  behindCardText: {
    fontSize: 32,
    fontWeight: '800',
    color: BRAND.colors.mossGreen,
    letterSpacing: 3,
    textTransform: 'uppercase',
    opacity: 0.5,
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
