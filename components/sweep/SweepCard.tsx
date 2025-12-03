/**
 * SweepCard Component
 *
 * Displays a single sweep candidate in a card format.
 * Used in the Evening Sweep decision step to review items.
 *
 * Features:
 * - Type chip showing item kind (To-Do, Habit, Note)
 * - Timestamp showing when item was created
 * - Title and body preview
 * - Swipe gestures: right to Keep, left to Clear
 * - Action buttons: Keep, Clear, Skip, Fix This
 */

import React, { useRef, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { Text, Button } from '../../ui';
import { BRAND } from '../../design/brand';
import type { SweepCandidate } from '../../lib/sweep/types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25; // 25% of screen width to trigger action
const SWIPE_OUT_DURATION = 250;

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
  /** Called when user wants to edit/fix the item */
  onOpenEdit: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

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
 * Format the created timestamp for display.
 * Shows "Added today at 4:12 PM" or "Added Dec 1 at 10:30 AM"
 */
function formatCreatedTimestamp(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  if (isToday) {
    return `Added today at ${timeStr}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isYesterday) {
    return `Added yesterday at ${timeStr}`;
  }

  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return `Added ${dateStr} at ${timeStr}`;
}

/**
 * Get the primary button label based on candidate kind.
 */
function getPrimaryButtonLabel(candidate: SweepCandidate): string {
  switch (candidate.kind) {
    case 'todo':
      return 'Review to-do details';
    case 'habit':
      return 'Review habit settings';
    case 'note':
      return 'Review note details';
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
}: SweepCardProps) {
  const typeLabel = getTypeChipLabel(candidate);
  const title = getCandidateTitle(candidate);
  const body = getCandidateBody(candidate);
  const timestamp = formatCreatedTimestamp(candidate.createdAt);
  const primaryLabel = getPrimaryButtonLabel(candidate);

  // Truncate body preview to ~100 chars
  const bodyPreview = body && body.length > 100 ? `${body.slice(0, 100)}…` : body;

  // ─────────────────────────────────────────────────────────────────────────
  // Swipe Gesture Handling
  // ─────────────────────────────────────────────────────────────────────────
  const translateX = useMemo(() => new Animated.Value(0), []);
  const cardOpacity = useMemo(() => new Animated.Value(1), []);
  const isAnimatingOut = useRef(false);

  // Check if we're in test environment (animations don't work well in Jest)
  const isTestEnv = typeof jest !== 'undefined';

  // Reset animation state when candidate changes (new card)
  React.useEffect(() => {
    isAnimatingOut.current = false;
    translateX.setValue(0);
    cardOpacity.setValue(1);
  }, [candidate.id, translateX, cardOpacity]);

  // Animate card off-screen and trigger callback
  const animateOut = useCallback(
    (direction: 'left' | 'right', callback: () => void) => {
      if (isAnimatingOut.current) return;
      isAnimatingOut.current = true;

      // In test environment, skip animation and call callback immediately
      if (isTestEnv) {
        callback();
        return;
      }

      const toValue = direction === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5;

      Animated.parallel([
        Animated.timing(translateX, {
          toValue,
          duration: SWIPE_OUT_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(cardOpacity, {
          toValue: 0,
          duration: SWIPE_OUT_DURATION,
          useNativeDriver: true,
        }),
      ]).start(() => {
        callback();
      });
    },
    [translateX, cardOpacity, isTestEnv],
  );

  // Snap back to center
  const snapBack = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      friction: 6,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [translateX]);

  // Pan responder for swipe gestures
  /* eslint-disable react-hooks/refs -- PanResponder.create is called once and ref is stable */
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only activate for horizontal gestures, not vertical scrolling
        return (
          Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
        );
      },
      onPanResponderGrant: () => {
        // Stop any ongoing animations
        translateX.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        translateX.setValue(gestureState.dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > SWIPE_THRESHOLD) {
          // Swiped right past threshold → Keep
          animateOut('right', onKeep);
        } else if (gestureState.dx < -SWIPE_THRESHOLD) {
          // Swiped left past threshold → Clear
          animateOut('left', onClear);
        } else {
          // Didn't cross threshold → snap back
          snapBack();
        }
      },
      onPanResponderTerminate: () => {
        snapBack();
      },
    }),
  ).current;
  /* eslint-enable react-hooks/refs */

  // Rotation based on swipe direction - useMemo ensures interpolation is only created once
  const rotate = useMemo(
    () =>
      translateX.interpolate({
        inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
        outputRange: ['-8deg', '0deg', '8deg'],
        extrapolate: 'clamp',
      }),
    [translateX],
  );

  // Calculate background color hints based on swipe direction - useMemo for lint compliance
  const leftHintOpacity = useMemo(
    () =>
      translateX.interpolate({
        inputRange: [-SWIPE_THRESHOLD, 0],
        outputRange: [0.15, 0],
        extrapolate: 'clamp',
      }),
    [translateX],
  );

  const rightHintOpacity = useMemo(
    () =>
      translateX.interpolate({
        inputRange: [0, SWIPE_THRESHOLD],
        outputRange: [0, 0.15],
        extrapolate: 'clamp',
      }),
    [translateX],
  );

  // Button handlers with animation
  const handleKeepPress = useCallback(() => {
    animateOut('right', onKeep);
  }, [animateOut, onKeep]);

  const handleClearPress = useCallback(() => {
    animateOut('left', onClear);
  }, [animateOut, onClear]);

  return (
    <View style={styles.cardContainer}>
      {/* Swipe hint backgrounds (visible during swipe) */}
      <Animated.View
        style={[styles.swipeHint, styles.swipeHintLeft, { opacity: leftHintOpacity }]}
        pointerEvents="none"
      >
        <Text style={styles.swipeHintText}>Clear</Text>
      </Animated.View>
      <Animated.View
        style={[styles.swipeHint, styles.swipeHintRight, { opacity: rightHintOpacity }]}
        pointerEvents="none"
      >
        <Text style={styles.swipeHintText}>Keep</Text>
      </Animated.View>

      {/* Swipeable Card */}
      <Animated.View
        style={[
          styles.card,
          {
            transform: [{ translateX }, { rotate }],
            opacity: cardOpacity,
          },
        ]}
        // eslint-disable-next-line react-hooks/refs -- panResponder ref is stable
        {...panResponder.panHandlers}
      >
        {/* Metadata Row */}
        <View style={styles.metadataRow}>
          <View style={styles.metadataLeft}>
            {/* Type Chip */}
            <View style={styles.typeChip}>
              <Text style={styles.typeChipText}>{typeLabel}</Text>
            </View>
            {/* Timestamp */}
            <Text variant="subtle" style={styles.timestamp}>
              {timestamp}
            </Text>
          </View>
          {/* Fix This Button */}
          <TouchableOpacity
            style={styles.fixButton}
            onPress={onOpenEdit}
            accessibilityLabel="Fix this item"
            accessibilityRole="button"
          >
            <Text style={styles.fixButtonText}>✏️ Fix</Text>
          </TouchableOpacity>
        </View>

        {/* Main Content */}
        <View style={styles.content}>
          <Text variant="body" style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {bodyPreview && (
            <Text variant="subtle" style={styles.bodyPreview} numberOfLines={3}>
              {bodyPreview}
            </Text>
          )}
        </View>

        {/* Primary Action Button */}
        <View style={styles.primaryAction}>
          <Button title={primaryLabel} variant="neutral" onPress={onOpenEdit} size="md" />
        </View>

        {/* Skip Text Button */}
        <TouchableOpacity
          style={styles.skipButton}
          onPress={onSkip}
          accessibilityLabel="Skip until next Sweep"
          accessibilityRole="button"
        >
          <Text style={styles.skipButtonText}>Skip until next Sweep</Text>
        </TouchableOpacity>

        {/* Action Buttons Row */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionButton, styles.clearButton]}
            onPress={handleClearPress}
            accessibilityLabel="Clear this item"
            accessibilityRole="button"
          >
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.keepButton]}
            onPress={handleKeepPress}
            accessibilityLabel="Keep this item"
            accessibilityRole="button"
          >
            <Text style={styles.keepButtonText}>Keep</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Card Container (for swipe hints positioning)
  cardContainer: {
    position: 'relative',
  },

  // Swipe Hints (visible during swipe)
  swipeHint: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BRAND.radius.lg,
  },
  swipeHintLeft: {
    backgroundColor: 'rgba(200, 80, 80, 0.3)', // Subtle red for clear
  },
  swipeHintRight: {
    backgroundColor: BRAND.colors.sageMist, // Green tint for keep
  },
  swipeHintText: {
    fontSize: 18,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    textTransform: 'uppercase',
    letterSpacing: 1,
    opacity: 0.8,
  },

  // Card
  card: {
    backgroundColor: BRAND.colors.linenCream,
    borderRadius: BRAND.radius.lg,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
    padding: 16,
    ...BRAND.elevation.one,
  },

  // Metadata Row
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  metadataLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  typeChip: {
    backgroundColor: BRAND.colors.sageMist,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BRAND.radius.pill,
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timestamp: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    flex: 1,
  },
  fixButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BRAND.radius.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
  },
  fixButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: BRAND.colors.inkSubtle,
  },

  // Content
  content: {
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    marginBottom: 6,
  },
  bodyPreview: {
    fontSize: 14,
    lineHeight: 20,
    color: BRAND.colors.inkSubtle,
  },

  // Primary Action
  primaryAction: {
    marginBottom: 12,
  },

  // Skip Button
  skipButton: {
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 16,
  },
  skipButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.inkSubtle,
    textDecorationLine: 'underline',
  },

  // Action Row
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BRAND.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  clearButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.colors.inkSubtle,
  },
  keepButton: {
    backgroundColor: BRAND.colors.sageMist,
  },
  keepButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
});

export default SweepCard;
