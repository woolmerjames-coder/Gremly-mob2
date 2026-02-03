/**
 * SweepMultiSplitStep.tsx
 *
 * Shows the multi-split modal in the sweep flow.
 * Uses the exact same design as MultiSplitModal.
 * Adds: progress tracking for multiple drops, toast on confirmation.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, ScrollView, Image } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { Text } from '../../ui';
import { BRAND } from '../../design/brand';
import type { MultiDropItem } from '../../lib/minddrop/types';

// ───────────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────────

export interface UnresolvedMultiDrop {
  localId: string;
  originalText: string;
  items: MultiDropItem[];
  summaryTitle: string;
  dominantBucket?: string | null;
  dominantSubtype?: string | null;
}

export interface SweepMultiSplitStepProps {
  multiDrops: UnresolvedMultiDrop[];
  onSplit: (localId: string, selectedItems: MultiDropItem[]) => void;
  onKeepAsOne: (localId: string) => void;
  onComplete: () => void;
}

// ───────────────────────────────────────────────────────────────────────────────
// Assets
// ───────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_ICON = require('../../assets/buttonforHP.png');

// ───────────────────────────────────────────────────────────────────────────────
// Toast
// ───────────────────────────────────────────────────────────────────────────────

function ConfirmationToast({ visible, count }: { visible: boolean; count: number }) {
  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(100)}
      style={styles.toastContainer}
    >
      <View style={styles.toastContent}>
        <Text style={styles.toastText}>
          {count === 1 ? '1 card added' : `${count} cards added`}
        </Text>
      </View>
    </Animated.View>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Component
// ───────────────────────────────────────────────────────────────────────────────

export function SweepMultiSplitStep({
  multiDrops,
  onSplit,
  onKeepAsOne,
  onComplete,
}: SweepMultiSplitStepProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [showToast, setShowToast] = useState(false);
  const [toastCount, setToastCount] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const currentDrop = multiDrops[currentIndex];
  const totalCount = multiDrops.length;

  // Edge case: auto-complete if no multi-drops
  useEffect(() => {
    if (!currentDrop || multiDrops.length === 0) {
      onComplete();
    }
  }, [currentDrop, multiDrops.length, onComplete]);

  // Reset selection when current drop changes
  useEffect(() => {
    if (currentDrop) {
      setSelectedIndices(new Set(currentDrop.items.map((_, i) => i)));
    }
  }, [currentIndex, currentDrop?.localId]);

  const toggleItem = useCallback((index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const proceedToNext = useCallback(() => {
    setShowToast(false);
    setIsAnimating(false);

    if (currentIndex >= totalCount - 1) {
      onComplete();
    } else {
      setCurrentIndex((prev) => prev + 1);
    }
  }, [currentIndex, totalCount, onComplete]);

  const handleSplit = useCallback(() => {
    if (isAnimating || !currentDrop) return;

    const selected = currentDrop.items.filter((_, i) => selectedIndices.has(i));
    if (selected.length === 0) return;

    setIsAnimating(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    setToastCount(selected.length);
    setShowToast(true);

    onSplit(currentDrop.localId, selected);

    setTimeout(proceedToNext, 800);
  }, [currentDrop, selectedIndices, isAnimating, onSplit, proceedToNext]);

  const handleKeepAsOne = useCallback(() => {
    if (isAnimating || !currentDrop) return;

    setIsAnimating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    setToastCount(1);
    setShowToast(true);

    onKeepAsOne(currentDrop.localId);

    setTimeout(proceedToNext, 800);
  }, [currentDrop, isAnimating, onKeepAsOne, proceedToNext]);

  const getKeepTogetherLabel = () => {
    if (currentDrop?.dominantBucket === 'todo') return 'One Task';
    if (currentDrop?.dominantBucket === 'habit') return 'One Habit';
    if (currentDrop?.dominantBucket === 'log' && currentDrop?.dominantSubtype === 'journal')
      return 'Just Venting';
    if (currentDrop?.dominantBucket === 'log' && currentDrop?.dominantSubtype === 'idea')
      return 'Just Brainstorming';
    return 'One Item';
  };

  // Truncate original text for display
  const getTruncatedText = (text: string, maxLength = 40) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  };

  const selectedCount = selectedIndices.size;

  // Early return after hooks
  if (!currentDrop || multiDrops.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Text above modal */}
      <Text style={styles.preModalText}>Quick things before we sweep</Text>

      {/* Modal card */}
      <View style={styles.card}>
        {/* "YOU DROPPED" section at top */}
        <Text style={styles.droppedLabel}>YOU DROPPED</Text>
        {currentDrop.originalText && (
          <Text style={styles.originalText}>"{getTruncatedText(currentDrop.originalText)}"</Text>
        )}
        <View style={styles.divider} />

        {/* Gremly row below divider */}
        <View style={styles.headerRow}>
          <Image source={GREMLY_ICON} style={styles.gremlyIcon} />
          <Text style={styles.header}>
            Looks like multiple things. Want to <Text style={styles.headerBold}>split</Text> or{' '}
            <Text style={styles.headerBold}>keep as one</Text>?
          </Text>
        </View>

        {/* Item list with checkboxes */}
        <ScrollView style={styles.itemList} contentContainerStyle={styles.itemListContent}>
          {currentDrop.items.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.itemRow, selectedIndices.has(index) && styles.itemRowSelected]}
              onPress={() => toggleItem(index)}
              activeOpacity={0.7}
              disabled={isAnimating}
            >
              {/* Checkbox */}
              <View
                style={[styles.checkbox, selectedIndices.has(index) && styles.checkboxSelected]}
              >
                {selectedIndices.has(index) && <Text style={styles.checkmark}>✓</Text>}
              </View>

              {/* Item details */}
              <View style={styles.itemContent}>
                <Text style={styles.itemTitle} numberOfLines={2}>
                  {item.smart_title || item.preview_title || item.text}
                </Text>
                <Text style={styles.itemBucket}>
                  {item.bucket === 'todo' ? 'Todo' : item.bucket === 'habit' ? 'Habit' : 'Note'}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Action buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleKeepAsOne}
            disabled={isAnimating}
          >
            <Text style={styles.secondaryButtonText}>{getKeepTogetherLabel()}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, selectedCount === 0 && styles.buttonDisabled]}
            onPress={handleSplit}
            disabled={selectedCount === 0 || isAnimating}
          >
            <Text style={styles.primaryButtonText}>
              Split{selectedCount > 0 ? ` (${selectedCount})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Toast */}
      <ConfirmationToast visible={showToast} count={toastCount} />
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Styles
// ───────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Container - matches app background
  container: {
    flex: 1,
    backgroundColor: BRAND.colors.linenCream,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  // Text above modal
  preModalText: {
    fontSize: 15,
    color: BRAND.colors.inkMuted,
    marginBottom: 16,
  },
  // Card with elevated shadow
  card: {
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.lg,
    padding: 28,
    width: '100%',
    maxWidth: 340,
    // Elevated shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  // Header row - same as MultiSplitModal
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  gremlyIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 12,
  },
  header: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    flex: 1,
  },
  headerBold: {
    fontWeight: '600',
  },
  // Dropped label
  droppedLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: BRAND.colors.inkSubtle,
    marginBottom: 6,
  },
  // Original text
  originalText: {
    fontSize: 16,
    ...BRAND.typography.body,
    color: BRAND.colors.charcoalInk,
  },
  // Divider
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.colors.borderSubtle,
    marginVertical: 16,
  },
  // Item list - same as MultiSplitModal
  itemList: {
    marginBottom: 24,
    maxHeight: 300,
  },
  itemListContent: {
    paddingBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginBottom: 10,
    minHeight: 72,
    borderRadius: BRAND.radius.md,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
  },
  itemRowSelected: {
    backgroundColor: 'rgba(191, 216, 192, 0.2)',
    borderColor: BRAND.colors.sageMist,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: BRAND.radius.sm,
    borderWidth: 2,
    borderColor: BRAND.colors.sageMist,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: BRAND.colors.mossGreen,
    borderColor: BRAND.colors.mossGreen,
  },
  checkmark: {
    color: BRAND.colors.surface,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
    textAlign: 'center',
  },
  itemContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
  },
  itemTitle: {
    fontSize: 15,
    ...BRAND.typography.bodyMedium,
    color: BRAND.colors.charcoalInk,
    flexShrink: 1,
  },
  itemBucket: {
    fontSize: 12,
    ...BRAND.typography.bodyMedium,
    color: '#4A7C59',
    textTransform: 'capitalize',
    marginLeft: 8,
    marginRight: 4,
  },
  // Buttons - same as MultiSplitModal
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BRAND.radius.md,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    ...BRAND.typography.bodyMedium,
    color: BRAND.colors.inkMuted,
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BRAND.radius.md,
    backgroundColor: BRAND.colors.sageMist,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontSize: 15,
    ...BRAND.typography.bodyMedium,
    color: BRAND.colors.mossGreen,
  },
  // Toast
  toastContainer: {
    position: 'absolute',
    bottom: 60,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  toastContent: {
    backgroundColor: BRAND.colors.charcoalInk,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: BRAND.radius.pill,
  },
  toastText: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.colors.surface,
  },
});

export default SweepMultiSplitStep;
