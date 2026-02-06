/**
 * SweepMultiSplitStep.tsx
 *
 * Quick Split step for Evening Sweep flow.
 * Shows unresolved multi-drops and lets user split or keep as one.
 *
 * CRITICAL: Store action (onSplit/onKeepAsOne) is called AFTER animation completes,
 * not during. This prevents re-renders from cycling through cards automatically.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, ScrollView, Image } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
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
// Constants
// ───────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_ICON = require('../../assets/buttonforHP.png');

const CARD_WIDTH = 320;
const MAX_ITEM_LIST_HEIGHT = 240;

// Animation timing
const FADE_IN_DURATION = 200;
const HOLD_DURATION = 800;
const FADE_OUT_DURATION = 200;
const TOTAL_ANIMATION_TIME = FADE_IN_DURATION + HOLD_DURATION + FADE_OUT_DURATION + 100;

// ───────────────────────────────────────────────────────────────────────────────
// Component
// ───────────────────────────────────────────────────────────────────────────────

export function SweepMultiSplitStep({
  multiDrops,
  onSplit,
  onKeepAsOne,
  onComplete,
}: SweepMultiSplitStepProps) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [isAnimating, setIsAnimating] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);

  // Store pending action to execute AFTER animation completes
  const pendingActionRef = useRef<(() => void) | null>(null);

  // Track the current drop ID to prevent re-initialization during animation
  const currentDropIdRef = useRef<string | null>(null);

  // Animation value for confirmation overlay
  const confirmationOpacity = useSharedValue(0);

  // Always show the first drop in the array
  const currentDrop = multiDrops[0];

  // Initialize selection when a NEW drop appears (not during animation)
  useEffect(() => {
    if (currentDrop && currentDrop.localId !== currentDropIdRef.current && !isAnimating) {
      currentDropIdRef.current = currentDrop.localId;
      setSelectedIndices(new Set(currentDrop.items.map((_, i) => i)));
      setHasScrolledToBottom(false);
      // eslint-disable-next-line react-hooks/immutability
      confirmationOpacity.value = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDrop?.localId, isAnimating]);

  // Complete when no more drops (and not animating)
  useEffect(() => {
    if (multiDrops.length === 0 && !isAnimating) {
      onComplete();
    }
  }, [multiDrops.length, isAnimating, onComplete]);

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

  const handleScroll = useCallback(
    (event: {
      nativeEvent: {
        layoutMeasurement: { height: number };
        contentOffset: { y: number };
        contentSize: { height: number };
      };
    }) => {
      if (hasScrolledToBottom) return;
      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
      const isAtBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 20;
      if (isAtBottom) {
        setHasScrolledToBottom(true);
      }
    },
    [hasScrolledToBottom],
  );

  const triggerConfirmation = useCallback(
    (text: string, storeAction: () => void) => {
      setIsAnimating(true);
      setConfirmationText(text);

      // Store the action - DO NOT execute it yet
      pendingActionRef.current = storeAction;

      // Fade in confirmation overlay
      // eslint-disable-next-line react-hooks/immutability
      confirmationOpacity.value = withTiming(1, {
        duration: FADE_IN_DURATION,
        easing: Easing.out(Easing.cubic),
      });

      // After hold, execute store action and fade out
      setTimeout(() => {
        // Execute store action NOW - new card loads underneath
        if (pendingActionRef.current) {
          pendingActionRef.current();
          pendingActionRef.current = null;
        }

        // Then fade out to reveal the new card
        // eslint-disable-next-line react-hooks/immutability
        confirmationOpacity.value = withTiming(0, {
          duration: FADE_OUT_DURATION,
          easing: Easing.in(Easing.cubic),
        });
      }, FADE_IN_DURATION + HOLD_DURATION);

      // AFTER animation is fully complete, reset state
      setTimeout(() => {
        currentDropIdRef.current = null;
        setIsAnimating(false);
      }, TOTAL_ANIMATION_TIME);
    },
    [confirmationOpacity],
  );

  const handleSplit = useCallback(() => {
    if (isAnimating || !currentDrop) return;

    const selected = currentDrop.items.filter((_, i) => selectedIndices.has(i));
    if (selected.length === 0) return;

    // Capture values NOW, before any async stuff
    const dropId = currentDrop.localId;
    const selectedItems = [...selected];

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const cardText = selectedItems.length === 1 ? 'card' : 'cards';
    triggerConfirmation(`Split into ${selectedItems.length} ${cardText}`, () => {
      onSplit(dropId, selectedItems);
    });
  }, [currentDrop, selectedIndices, isAnimating, onSplit, triggerConfirmation]);

  const handleKeepAsOne = useCallback(() => {
    if (isAnimating || !currentDrop) return;

    // Capture value NOW
    const dropId = currentDrop.localId;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    triggerConfirmation('Kept as one', () => {
      onKeepAsOne(dropId);
    });
  }, [currentDrop, isAnimating, onKeepAsOne, triggerConfirmation]);

  const getKeepTogetherLabel = useCallback(() => {
    if (currentDrop?.dominantBucket === 'todo') return 'One Task';
    if (currentDrop?.dominantBucket === 'habit') return 'One Habit';
    if (currentDrop?.dominantBucket === 'log' && currentDrop?.dominantSubtype === 'journal')
      return 'Just Venting';
    if (currentDrop?.dominantBucket === 'log' && currentDrop?.dominantSubtype === 'idea')
      return 'Just Brainstorming';
    return 'One Item';
  }, [currentDrop]);

  // Animated style for confirmation overlay
  const confirmationAnimatedStyle = useAnimatedStyle(() => ({
    opacity: confirmationOpacity.value,
  }));

  const selectedCount = selectedIndices.size;
  const needsScroll = currentDrop && currentDrop.items.length > 4;

  // Don't render if no drops
  if (!currentDrop) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.preModalText}>Quick things before we sweep</Text>

      {/* Card wrapper for positioning */}
      <View style={styles.cardWrapper}>
        {/* Question Card */}
        <View style={styles.card}>
          <View style={styles.cardInner}>
            {/* YOU DROPPED */}
            <Text style={styles.droppedLabel}>YOU DROPPED</Text>
            <Text style={styles.originalText} numberOfLines={2}>
              "{currentDrop.originalText}"
            </Text>

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
                onScroll={needsScroll ? handleScroll : undefined}
                scrollEventThrottle={16}
              >
                {currentDrop.items.map((item, index) => (
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

              {/* Fade gradient for scroll hint */}
              {needsScroll && !hasScrolledToBottom && (
                <LinearGradient
                  colors={['rgba(255,255,255,0)', 'rgba(255,255,255,1)']}
                  style={styles.fadeGradient}
                  pointerEvents="none"
                />
              )}
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
        </View>

        {/* Confirmation Overlay - sits on top, covers card completely */}
        <Animated.View
          style={[styles.confirmationOverlay, confirmationAnimatedStyle]}
          pointerEvents="none"
        >
          <Image source={GREMLY_ICON} style={styles.confirmationIcon} />
          <Text style={styles.confirmationText}>{confirmationText}</Text>
        </Animated.View>
      </View>
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Styles
// ───────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.colors.linenCream,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  preModalText: {
    fontSize: 15,
    color: BRAND.colors.inkMuted,
    marginBottom: 20,
  },

  // Card wrapper for overlay positioning
  cardWrapper: {
    width: CARD_WIDTH,
    position: 'relative',
  },

  // Card
  card: {
    width: '100%',
    backgroundColor: BRAND.colors.surface,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  cardInner: {
    padding: 24,
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
    position: 'relative',
  },
  itemList: {},
  itemListContent: {
    paddingBottom: 4,
  },
  fadeGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
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

  // Confirmation overlay - covers the card completely
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

export default SweepMultiSplitStep;
