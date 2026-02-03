/**
 * SweepMultiSplitStep - Pre-sweep step for resolving multi-entity Mind Drops
 *
 * This step appears at step 0.25 (between intro and lock-in checkpoint)
 * when there are unresolved multi-drops that need splitting decisions.
 *
 * Users can either:
 * - Split: Create separate entities from detected segments
 * - Keep as one: Treat the entire drop as a single entity
 */

import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeIn,
  FadeInUp,
  FadeOut,
} from 'react-native-reanimated';
import { Check, Scissors, FileStack, ChevronRight } from 'lucide-react-native';
import { Text } from '../../ui';
import { BRAND } from '../../design/brand';
import { triggerLight, triggerSuccess } from '../../lib/haptics';
import type { PendingDrop, PendingDropSegment } from '../../lib/store/useGremlyStore';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SweepMultiSplitStepProps {
  /** Multi-drops that need resolution */
  multiDrops: PendingDrop[];
  /** Called when user chooses to split a multi-drop */
  onSplit: (dropId: string, segments: PendingDropSegment[]) => void;
  /** Called when user keeps multi-drop as one entity */
  onKeepAsOne: (dropId: string) => void;
  /** Called when all multi-drops are resolved */
  onComplete: () => void;
  /** Called when user closes/cancels */
  onClose?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

// Bucket colors for segment chips
const BUCKET_COLORS: Record<string, string> = {
  todo: BRAND.colors.mossGreen,
  habit: BRAND.colors.periwinkleSmoke,
  log: BRAND.colors.goldenPear,
};

const BUCKET_LABELS: Record<string, string> = {
  todo: 'Todo',
  habit: 'Habit',
  log: 'Note',
};

// ─────────────────────────────────────────────────────────────────────────────
// Confirmation Toast Component
// ─────────────────────────────────────────────────────────────────────────────

interface ConfirmationToastProps {
  message: string;
  visible: boolean;
  type: 'split' | 'kept';
}

function ConfirmationToast({ message, visible, type }: ConfirmationToastProps) {
  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeInUp.duration(200)}
      exiting={FadeOut.duration(150)}
      style={styles.toast}
    >
      <View style={styles.toastIconContainer}>
        {type === 'split' ? (
          <Scissors size={16} color={BRAND.colors.mossGreen} />
        ) : (
          <FileStack size={16} color={BRAND.colors.mossGreen} />
        )}
      </View>
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-Drop Card Component
// ─────────────────────────────────────────────────────────────────────────────

interface MultiDropCardProps {
  drop: PendingDrop;
  onSplit: (segments: PendingDropSegment[]) => void;
  onKeepAsOne: () => void;
  isActive: boolean;
}

function MultiDropCard({ drop, onSplit, onKeepAsOne, isActive }: MultiDropCardProps) {
  const [selectedSegments, setSelectedSegments] = useState<Set<number>>(
    new Set(drop.multiSegments?.map((_, i) => i) ?? []),
  );

  // Animation values
  const cardScale = useSharedValue(isActive ? 1 : 0.95);
  const cardOpacity = useSharedValue(isActive ? 1 : 0.6);

  useEffect(() => {
    cardScale.value = withSpring(isActive ? 1 : 0.95, { damping: 15 });
    cardOpacity.value = withTiming(isActive ? 1 : 0.6, { duration: 200 });
  }, [isActive, cardScale, cardOpacity]);

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
    opacity: cardOpacity.value,
  }));

  const toggleSegment = useCallback((index: number) => {
    triggerLight();
    setSelectedSegments((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const handleSplit = useCallback(() => {
    if (!drop.multiSegments) return;
    triggerSuccess();
    const segments = drop.multiSegments.filter((_, i) => selectedSegments.has(i));
    onSplit(segments);
  }, [drop.multiSegments, selectedSegments, onSplit]);

  const handleKeepAsOne = useCallback(() => {
    triggerLight();
    onKeepAsOne();
  }, [onKeepAsOne]);

  const segments = drop.multiSegments ?? [];
  const hasSelection = selectedSegments.size > 0;

  return (
    <Animated.View style={[styles.multiCard, cardAnimatedStyle]}>
      {/* Header */}
      <View style={styles.multiCardHeader}>
        <Text style={styles.multiCardTitle}>{drop.multiSummary || 'Multiple items detected'}</Text>
        <View style={styles.multiCardBadge}>
          <Text style={styles.multiCardBadgeText}>{segments.length} items</Text>
        </View>
      </View>

      {/* Original text */}
      <Text style={styles.originalText} numberOfLines={3}>
        "{drop.text}"
      </Text>

      {/* Segments list */}
      <View style={styles.segmentsList}>
        <Text style={styles.segmentsLabel}>Detected items:</Text>
        {segments.map((segment, index) => {
          const isSelected = selectedSegments.has(index);
          const bucketColor = BUCKET_COLORS[segment.bucket] || BRAND.colors.charcoalInk;

          return (
            <TouchableOpacity
              key={index}
              style={[styles.segmentRow, isSelected && styles.segmentRowSelected]}
              onPress={() => toggleSegment(index)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.segmentCheckbox,
                  isSelected && { backgroundColor: BRAND.colors.mossGreen },
                ]}
              >
                {isSelected && <Check size={14} color="white" strokeWidth={3} />}
              </View>
              <View style={styles.segmentContent}>
                <Text style={styles.segmentText} numberOfLines={2}>
                  {segment.smartTitle || segment.text}
                </Text>
                <View style={[styles.bucketChip, { backgroundColor: `${bucketColor}20` }]}>
                  <Text style={[styles.bucketChipText, { color: bucketColor }]}>
                    {BUCKET_LABELS[segment.bucket] || segment.bucket}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Action buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[styles.splitButton, !hasSelection && styles.buttonDisabled]}
          onPress={handleSplit}
          disabled={!hasSelection}
          activeOpacity={0.8}
        >
          <Scissors size={18} color="white" />
          <Text style={styles.splitButtonText}>Split ({selectedSegments.size})</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.keepButton} onPress={handleKeepAsOne} activeOpacity={0.8}>
          <FileStack size={18} color={BRAND.colors.charcoalInk} />
          <Text style={styles.keepButtonText}>Keep as one</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function SweepMultiSplitStep({
  multiDrops,
  onSplit,
  onKeepAsOne,
  onComplete,
  onClose: _onClose,
}: SweepMultiSplitStepProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [resolvedCount, setResolvedCount] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: 'split' | 'kept' } | null>(null);

  // Progress animation
  const progressWidth = useSharedValue(0);

  useEffect(() => {
    const progress = multiDrops.length > 0 ? (resolvedCount / multiDrops.length) * 100 : 0;
    progressWidth.value = withSpring(progress, { damping: 15 });
  }, [resolvedCount, multiDrops.length, progressWidth]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  // Auto-advance to next or complete
  const advanceToNext = useCallback(() => {
    if (currentIndex + 1 < multiDrops.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      // All resolved - complete after a brief delay
      setTimeout(() => {
        onComplete();
      }, 500);
    }
  }, [currentIndex, multiDrops.length, onComplete]);

  // Handle split
  const handleSplit = useCallback(
    (dropId: string, segments: PendingDropSegment[]) => {
      onSplit(dropId, segments);
      setResolvedCount((prev) => prev + 1);
      setToast({ message: `Split into ${segments.length} items`, type: 'split' });

      // Clear toast and advance
      setTimeout(() => {
        setToast(null);
        advanceToNext();
      }, 1200);
    },
    [onSplit, advanceToNext],
  );

  // Handle keep as one
  const handleKeepAsOne = useCallback(
    (dropId: string) => {
      onKeepAsOne(dropId);
      setResolvedCount((prev) => prev + 1);
      setToast({ message: 'Kept as single item', type: 'kept' });

      // Clear toast and advance
      setTimeout(() => {
        setToast(null);
        advanceToNext();
      }, 1200);
    },
    [onKeepAsOne, advanceToNext],
  );

  const currentDrop = multiDrops[currentIndex];

  // Edge case: auto-complete if no multi-drops
  useEffect(() => {
    if (multiDrops.length === 0) {
      onComplete();
    }
  }, [multiDrops.length, onComplete]);

  // Early return after hooks
  if (multiDrops.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <Animated.View entering={FadeIn.duration(300)} style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>Quick Split</Text>
          <Text style={styles.headerSubtitle}>
            {resolvedCount} of {multiDrops.length} resolved
          </Text>
        </View>

        {/* Progress bar */}
        <View style={styles.progressBar}>
          <Animated.View style={[styles.progressFill, progressStyle]} />
        </View>
      </Animated.View>

      {/* Instructions */}
      <Animated.View entering={FadeInUp.delay(100).duration(300)} style={styles.instructions}>
        <Text style={styles.instructionsText}>
          We detected multiple items in your Mind Drop.{'\n'}
          Would you like to split them up?
        </Text>
      </Animated.View>

      {/* Current card */}
      <ScrollView
        style={styles.cardContainer}
        contentContainerStyle={styles.cardContent}
        showsVerticalScrollIndicator={false}
      >
        {currentDrop && (
          <MultiDropCard
            key={currentDrop.localId}
            drop={currentDrop}
            onSplit={(segments) => handleSplit(currentDrop.localId, segments)}
            onKeepAsOne={() => handleKeepAsOne(currentDrop.localId)}
            isActive={true}
          />
        )}
      </ScrollView>

      {/* Skip all button */}
      {multiDrops.length > 1 && resolvedCount < multiDrops.length - 1 && (
        <Animated.View entering={FadeIn.delay(500).duration(300)} style={styles.skipAllContainer}>
          <TouchableOpacity style={styles.skipAllButton} onPress={onComplete} activeOpacity={0.7}>
            <Text style={styles.skipAllText}>Keep all as-is</Text>
            <ChevronRight size={16} color={BRAND.colors.inkMuted} />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Toast */}
      <ConfirmationToast
        message={toast?.message ?? ''}
        visible={!!toast}
        type={toast?.type ?? 'split'}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.colors.linenCream,
    paddingHorizontal: 20,
  },

  // Header
  header: {
    paddingTop: 12,
    marginBottom: 16,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: 'PlusJakartaSans-Bold',
    color: BRAND.colors.charcoalInk,
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: BRAND.colors.inkMuted,
  },
  progressBar: {
    height: 4,
    backgroundColor: BRAND.colors.borderSubtle,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: BRAND.colors.mossGreen,
    borderRadius: 2,
  },

  // Instructions
  instructions: {
    marginBottom: 20,
  },
  instructionsText: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    color: BRAND.colors.inkSubtle,
    lineHeight: 22,
    textAlign: 'center',
  },

  // Card container
  cardContainer: {
    flex: 1,
  },
  cardContent: {
    paddingBottom: 40,
  },

  // Multi card
  multiCard: {
    backgroundColor: 'white',
    borderRadius: BRAND.radius.lg,
    padding: 20,
    ...BRAND.elevation.two,
  },
  multiCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  multiCardTitle: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans-SemiBold',
    color: BRAND.colors.charcoalInk,
    flex: 1,
  },
  multiCardBadge: {
    backgroundColor: `${BRAND.colors.mossGreen}15`,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BRAND.radius.pill,
    marginLeft: 12,
  },
  multiCardBadgeText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: BRAND.colors.mossGreen,
  },

  // Original text
  originalText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: BRAND.colors.inkSubtle,
    fontStyle: 'italic',
    marginBottom: 16,
    lineHeight: 20,
  },

  // Segments
  segmentsList: {
    marginBottom: 20,
  },
  segmentsLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: BRAND.colors.inkMuted,
    marginBottom: 10,
  },
  segmentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: BRAND.radius.md,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
    backgroundColor: 'white',
  },
  segmentRowSelected: {
    borderColor: BRAND.colors.mossGreen,
    backgroundColor: `${BRAND.colors.mossGreen}08`,
  },
  segmentCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: BRAND.colors.borderSubtle,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentContent: {
    flex: 1,
  },
  segmentText: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    color: BRAND.colors.charcoalInk,
    marginBottom: 6,
    lineHeight: 21,
  },
  bucketChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BRAND.radius.sm,
  },
  bucketChipText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // Action buttons
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  splitButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND.colors.mossGreen,
    paddingVertical: 14,
    borderRadius: BRAND.radius.md,
    gap: 8,
  },
  splitButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    color: 'white',
  },
  keepButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND.colors.borderSubtle,
    paddingVertical: 14,
    borderRadius: BRAND.radius.md,
    gap: 8,
  },
  keepButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    color: BRAND.colors.charcoalInk,
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  // Skip all
  skipAllContainer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  skipAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 4,
  },
  skipAllText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: BRAND.colors.inkMuted,
  },

  // Toast
  toast: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: BRAND.colors.charcoalInk,
    borderRadius: BRAND.radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...BRAND.elevation.two,
  },
  toastIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  toastText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: 'white',
    flex: 1,
  },
});
