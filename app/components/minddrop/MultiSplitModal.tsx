/**
 * MultiSplitModal - Modal for handling multi-entity Mind Drops
 *
 * When a user enters multiple items in one drop (e.g., "buy milk and start running habit"),
 * this modal lets them:
 * - Keep as a single note
 * - Split into separate entities
 * - Select which items to split
 *
 * Design matches SweepMultiSplitStep with confirmation overlay animation.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Image,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';
import type { MultiDropItem } from '../../../lib/minddrop/types';

// ───────────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────────

export interface MultiSplitModalProps {
  visible: boolean;
  items: MultiDropItem[];
  summaryTitle: string;
  originalText?: string;
  dominantBucket?: string | null;
  dominantSubtype?: string | null;
  onClose: () => void;
  onKeepAsNote: () => void;
  onSplitSelected: (selectedItems: MultiDropItem[]) => void;
}

// ───────────────────────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_ICON = require('../../../assets/buttonforHP.png');

const CARD_WIDTH = 320;
const MAX_ITEM_LIST_HEIGHT = 240;

// Animation timing
const FADE_IN_DURATION = 200;
const HOLD_DURATION = 800;
const FADE_OUT_DURATION = 200;

// ───────────────────────────────────────────────────────────────────────────────
// Component
// ───────────────────────────────────────────────────────────────────────────────

export function MultiSplitModal({
  visible,
  items,
  summaryTitle,
  originalText,
  dominantBucket,
  dominantSubtype,
  onClose,
  onKeepAsNote,
  onSplitSelected,
}: MultiSplitModalProps) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    () => new Set(items.map((_, i) => i)),
  );
  const [isAnimating, setIsAnimating] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');

  // Store pending action
  const pendingActionRef = useRef<(() => void) | null>(null);

  // Animation value for confirmation overlay
  const confirmationOpacity = useSharedValue(0);

  // Reset selection when item count changes
  const itemCount = items.length;
  const [prevItemCount, setPrevItemCount] = useState(itemCount);
  if (itemCount !== prevItemCount) {
    setPrevItemCount(itemCount);
    setSelectedIndices(new Set(items.map((_, i) => i)));
  }

  const toggleItem = useCallback(
    (index: number) => {
      if (isAnimating) return;
      setSelectedIndices((prev) => {
        const next = new Set(prev);
        if (next.has(index)) {
          next.delete(index);
        } else {
          next.add(index);
        }
        return next;
      });
    },
    [isAnimating],
  );

  const triggerConfirmation = useCallback(
    (text: string, storeAction: () => void) => {
      setIsAnimating(true);
      setConfirmationText(text);
      pendingActionRef.current = storeAction;

      // Fade in confirmation overlay
      // eslint-disable-next-line react-hooks/immutability
      confirmationOpacity.value = withTiming(1, {
        duration: FADE_IN_DURATION,
        easing: Easing.out(Easing.cubic),
      });

      // After hold, execute action and fade out
      setTimeout(() => {
        if (pendingActionRef.current) {
          pendingActionRef.current();
          pendingActionRef.current = null;
        }

        // eslint-disable-next-line react-hooks/immutability
        confirmationOpacity.value = withTiming(0, {
          duration: FADE_OUT_DURATION,
          easing: Easing.in(Easing.cubic),
        });
      }, FADE_IN_DURATION + HOLD_DURATION);

      // After fade out, close modal
      setTimeout(
        () => {
          setIsAnimating(false);
          onClose();
        },
        FADE_IN_DURATION + HOLD_DURATION + FADE_OUT_DURATION + 50,
      );
    },
    [confirmationOpacity, onClose],
  );

  const handleSplit = useCallback(() => {
    if (isAnimating) return;

    const selected = items.filter((_, i) => selectedIndices.has(i));
    if (selected.length === 0) return;

    const selectedItems = [...selected];
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const cardText = selectedItems.length === 1 ? 'card' : 'cards';
    triggerConfirmation(`Split into ${selectedItems.length} ${cardText}`, () => {
      onSplitSelected(selectedItems);
    });
  }, [items, selectedIndices, isAnimating, onSplitSelected, triggerConfirmation]);

  const handleKeepAsOne = useCallback(() => {
    if (isAnimating) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    triggerConfirmation('Kept as one', () => {
      onKeepAsNote();
    });
  }, [isAnimating, onKeepAsNote, triggerConfirmation]);

  const getKeepTogetherLabel = useCallback(() => {
    if (dominantBucket === 'todo') return 'One Task';
    if (dominantBucket === 'habit') return 'One Habit';
    if (dominantBucket === 'log' && dominantSubtype === 'journal') return 'Just Venting';
    if (dominantBucket === 'log' && dominantSubtype === 'idea') return 'Just Brainstorming';
    return 'One Item';
  }, [dominantBucket, dominantSubtype]);

  // Animated style for confirmation overlay
  const confirmationAnimatedStyle = useAnimatedStyle(() => ({
    opacity: confirmationOpacity.value,
  }));

  const selectedCount = selectedIndices.size;
  const needsScroll = items.length > 4;

  // Truncate text for display
  const displayText =
    originalText && originalText.length > 60 ? originalText.slice(0, 60) + '...' : originalText;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Backdrop */}
      <Pressable style={styles.overlay} onPress={isAnimating ? undefined : onClose}>
        {/* Card wrapper */}
        <Pressable style={styles.cardWrapper} onPress={(e) => e?.stopPropagation?.()}>
          {/* Main Card */}
          <View style={styles.card}>
            {/* YOU DROPPED */}
            <Text style={styles.droppedLabel}>YOU DROPPED</Text>
            {displayText && (
              <Text style={styles.originalText} numberOfLines={2}>
                "{displayText}"
              </Text>
            )}

            <View style={styles.divider} />

            {/* Gremly question */}
            <View style={styles.gremlyRow}>
              <Image source={GREMLY_ICON} style={styles.gremlyIcon} />
              <Text style={styles.gremlyText}>
                Looks like multiple things. Want to <Text style={styles.gremlyTextBold}>split</Text>{' '}
                or <Text style={styles.gremlyTextBold}>keep as one</Text>?
              </Text>
            </View>

            {/* Item list */}
            <View style={styles.itemListContainer}>
              <ScrollView
                style={[styles.itemList, needsScroll && { maxHeight: MAX_ITEM_LIST_HEIGHT }]}
                contentContainerStyle={styles.itemListContent}
                showsVerticalScrollIndicator={false}
                scrollEnabled={needsScroll}
              >
                {items.map((item, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[styles.itemRow, selectedIndices.has(index) && styles.itemRowSelected]}
                    onPress={() => toggleItem(index)}
                    activeOpacity={0.7}
                    disabled={isAnimating}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        selectedIndices.has(index) && styles.checkboxSelected,
                      ]}
                    >
                      {selectedIndices.has(index) && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <View style={styles.itemContent}>
                      <Text style={styles.itemTitle} numberOfLines={2}>
                        {item.smart_title || item.preview_title || item.text}
                      </Text>
                      <Text style={styles.itemBucket}>
                        {item.bucket === 'todo'
                          ? 'Todo'
                          : item.bucket === 'habit'
                            ? 'Habit'
                            : 'Note'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Buttons */}
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleKeepAsOne}
                disabled={isAnimating}
                activeOpacity={0.7}
              >
                <Text style={styles.secondaryButtonText}>{getKeepTogetherLabel()}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, selectedCount === 0 && styles.buttonDisabled]}
                onPress={handleSplit}
                disabled={selectedCount === 0 || isAnimating}
                activeOpacity={0.7}
              >
                <Text style={styles.primaryButtonText}>
                  Split{selectedCount > 0 ? ` (${selectedCount})` : ''}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirmation Overlay */}
          <Animated.View
            style={[styles.confirmationOverlay, confirmationAnimatedStyle]}
            pointerEvents="none"
          >
            <Image source={GREMLY_ICON} style={styles.confirmationIcon} />
            <Text style={styles.confirmationText}>{confirmationText}</Text>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Styles
// ───────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cardWrapper: {
    width: CARD_WIDTH,
    position: 'relative',
  },
  card: {
    width: '100%',
    backgroundColor: BRAND.colors.surface,
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },

  // YOU DROPPED
  droppedLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    color: BRAND.colors.inkSubtle,
    marginBottom: 8,
  },
  originalText: {
    fontSize: 17,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
    lineHeight: 24,
  },
  divider: {
    height: 1,
    backgroundColor: BRAND.colors.borderSubtle,
    marginVertical: 16,
  },

  // Gremly row
  gremlyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  gremlyIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
    marginTop: 2,
  },
  gremlyText: {
    flex: 1,
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    lineHeight: 20,
  },
  gremlyTextBold: {
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },

  // Item list
  itemListContainer: {
    marginBottom: 16,
  },
  itemList: {},
  itemListContent: {
    paddingBottom: 4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
    borderRadius: BRAND.radius.md,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
    backgroundColor: BRAND.colors.surface,
  },
  itemRowSelected: {
    backgroundColor: 'rgba(191, 216, 192, 0.15)',
    borderColor: BRAND.colors.sageMist,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: BRAND.colors.borderSubtle,
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
    lineHeight: 14,
  },
  itemContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
    marginRight: 8,
  },
  itemBucket: {
    fontSize: 12,
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
  },

  // Buttons
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
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BRAND.radius.md,
    backgroundColor: BRAND.colors.sageMist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  // Confirmation overlay
  confirmationOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: BRAND.colors.surface,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  confirmationIcon: {
    width: 88,
    height: 88,
    marginBottom: 20,
  },
  confirmationText: {
    fontSize: 20,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
  },
});

export default MultiSplitModal;
