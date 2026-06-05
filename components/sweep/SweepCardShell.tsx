import React, { useCallback, useState, useEffect } from 'react';
import { View, StyleSheet, Dimensions, Pressable, Image, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  runOnJS,
  runOnUI,
  interpolate,
  Extrapolation,
  interpolateColor,
  Easing as ReanimatedEasing,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import { Text } from '../../ui';
import { BRAND } from '../../design/brand';
import { GremlyMenuButton, GremlyPopupMenu } from './GremlyPopupMenu';
import type { SweepCandidate, SweepCandidateNote, SweepCardMeta } from '../../lib/sweep/types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = 100;
const SWIPE_OUT_DISTANCE = SCREEN_WIDTH;
const VELOCITY_THRESHOLD = 400;
const CARD_EXIT_DELAY = 350;
const CARD_WIDTH = SCREEN_WIDTH * 0.84;

const CLEAR_MESSAGES = ['DONE', 'CLEARED', 'GONE', 'ARCHIVED'];
const KEEP_MESSAGES = ['SAVED', 'KEEPING IT', 'ON IT', 'NOTED'];

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_FACE = require('../../assets/buttonforHP.png');

// Test environment detection — only used in SweepCardShell to skip animations.
// All other components should be unaware of test environment.
const isTestEnv =
  typeof globalThis !== 'undefined' &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((globalThis as any).__TEST__ === true || typeof jest !== 'undefined');

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function getCandidateTitle(candidate: SweepCandidate): string {
  switch (candidate.kind) {
    case 'todo':
      return candidate.raw.name || 'Untitled task';
    case 'note':
      return candidate.raw.title || 'Untitled note';
    case 'habit':
      return candidate.raw.name || 'Untitled habit';
  }
}

function normalizeForComparison(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

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

function animateCardExit(
  direction: 'left' | 'right',
  translateX: SharedValue<number>,
  cardOpacity: SharedValue<number>,
  callback: () => void,
) {
  if (isTestEnv) {
    callback();
    return;
  }
  const toValue = direction === 'right' ? SWIPE_OUT_DISTANCE : -SWIPE_OUT_DISTANCE;
  const delayedCallback = () => setTimeout(callback, CARD_EXIT_DELAY);
  translateX.value = withSpring(
    toValue,
    { damping: 15, stiffness: 120, overshootClamping: true },
    (finished) => {
      if (finished) {
        runOnJS(delayedCallback)();
      }
    },
  );
  cardOpacity.value = withTiming(0, { duration: 300 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type BadgeConfig = {
  text: string;
  color: string;
  backgroundColor: string;
  borderColor: string;
  icon?: React.ReactNode;
};

type SweepCardShellProps = {
  candidate: SweepCandidate;
  meta: SweepCardMeta;
  typeWhisper: string;
  typeIcon: React.ReactNode;
  badge?: BadgeConfig;
  children: React.ReactNode;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  onGremlyMenuItem: (key: 'help' | 'chat' | 'details' | 'wrongtype') => void;
  isConverted?: boolean;
  isClarified?: boolean;
  onRequestPhotoPreview?: (url: string) => void;
  hideGremlyMenu?: boolean;
  onWorldPress?: () => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function SweepCardShell({
  candidate,
  meta,
  typeWhisper,
  typeIcon,
  badge,
  children,
  onSwipeRight,
  onSwipeLeft,
  onGremlyMenuItem,
  isConverted,
  isClarified,
  onRequestPhotoPreview,
  hideGremlyMenu,
  onWorldPress,
}: SweepCardShellProps) {
  // ── Local state ──
  const [menuVisible, setMenuVisible] = useState(false);
  const [clearMessage] = useState(
    () => CLEAR_MESSAGES[Math.floor(Math.random() * CLEAR_MESSAGES.length)],
  );
  const [keepMessage] = useState(
    () => KEEP_MESSAGES[Math.floor(Math.random() * KEEP_MESSAGES.length)],
  );

  // ── Shared values ──
  const translateX = useSharedValue(0);
  const cardOpacity = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const borderOpacity = useSharedValue(0);
  const hasTriggeredHaptic = useSharedValue(false);
  const letGoScale = useSharedValue(1);
  const keepScale = useSharedValue(1);
  const entryScale = useSharedValue(0.96);

  // Reset on candidate change — animate in
  useEffect(() => {
    translateX.value = 0;
    entryScale.value = 0.96;
    cardOpacity.value = 0;
    const timer = setTimeout(() => {
      entryScale.value = withTiming(1, {
        duration: 250,
        easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
      });
      cardOpacity.value = withTiming(1, { duration: 250 });
    }, 50);
    return () => clearTimeout(timer);
  }, [candidate.id, translateX, cardOpacity, entryScale]);

  // ── Conversion flip animation ──
  const flipRotation = useSharedValue(0);
  const flipScale = useSharedValue(1);
  const shouldAnimateFlip = isConverted || isClarified;

  useEffect(() => {
    if (shouldAnimateFlip) {
      flipRotation.value = withTiming(360, {
        duration: 800,
        easing: ReanimatedEasing.inOut(ReanimatedEasing.cubic),
      });
      flipScale.value = withSequence(
        withTiming(0.95, { duration: 200 }),
        withTiming(1.02, { duration: 300 }),
        withTiming(1, { duration: 300 }),
      );
    }
  }, [shouldAnimateFlip, flipRotation, flipScale]);

  const convertAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1200 },
      { rotateY: `${flipRotation.value}deg` },
      { scale: flipScale.value },
    ],
  }));

  // ── Haptic helpers ──
  const triggerHaptic = useCallback((type: 'light' | 'medium' | 'success') => {
    if (type === 'success') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (type === 'medium') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const triggerDragStartHaptic = useCallback(() => {
    Haptics.selectionAsync();
  }, []);

  // ── Swipe completion handlers ──
  const handleSwipeRightWithDelay = useCallback(() => {
    setTimeout(() => onSwipeRight(), CARD_EXIT_DELAY);
  }, [onSwipeRight]);

  const handleSwipeLeftWithDelay = useCallback(() => {
    setTimeout(() => onSwipeLeft(), CARD_EXIT_DELAY);
  }, [onSwipeLeft]);

  // ── Pan gesture ──
  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onStart(() => {
      isDragging.value = true;
      runOnJS(setMenuVisible)(false);
      runOnJS(triggerDragStartHaptic)();
      borderOpacity.value = withTiming(1, { duration: 150 });
    })
    .onUpdate((event) => {
      translateX.value = event.translationX;

      const progress = Math.abs(event.translationX) / SWIPE_THRESHOLD;
      if (progress >= 0.8 && !hasTriggeredHaptic.value) {
        hasTriggeredHaptic.value = true;
        runOnJS(triggerHaptic)('light');
      } else if (progress < 0.5) {
        hasTriggeredHaptic.value = false;
      }
    })
    .onEnd((event) => {
      isDragging.value = false;
      borderOpacity.value = withTiming(0, { duration: 200 });
      const { translationX, velocityX } = event;

      const swipedRight =
        translationX > SWIPE_THRESHOLD || (translationX > 50 && velocityX > VELOCITY_THRESHOLD);
      const swipedLeft =
        translationX < -SWIPE_THRESHOLD || (translationX < -50 && velocityX < -VELOCITY_THRESHOLD);

      if (swipedRight) {
        runOnJS(triggerHaptic)('success');
        translateX.value = withSpring(
          SWIPE_OUT_DISTANCE,
          { damping: 15, stiffness: 120, overshootClamping: true },
          (finished) => {
            if (finished) runOnJS(handleSwipeRightWithDelay)();
          },
        );
        cardOpacity.value = withTiming(0, { duration: 300 });
      } else if (swipedLeft) {
        runOnJS(triggerHaptic)('medium');
        translateX.value = withSpring(
          -SWIPE_OUT_DISTANCE,
          { damping: 15, stiffness: 120, overshootClamping: true },
          (finished) => {
            if (finished) runOnJS(handleSwipeLeftWithDelay)();
          },
        );
        cardOpacity.value = withTiming(0, { duration: 300 });
      } else {
        translateX.value = withSpring(0, { damping: 15, stiffness: 150 });
      }
    })
    .onFinalize(() => {
      isDragging.value = false;
      hasTriggeredHaptic.value = false;
      borderOpacity.value = withTiming(0, { duration: 200 });
    });

  // ── Animated styles ──
  const animatedCardContainerStyle = useAnimatedStyle(() => ({
    borderColor: BRAND.colors.mossGreen,
    borderWidth: interpolate(borderOpacity.value, [0, 1], [0, 1], Extrapolation.CLAMP),
  }));

  const animatedCardStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD],
      [-3, 0, 3],
      Extrapolation.CLAMP,
    );
    const scale = interpolate(
      Math.abs(translateX.value),
      [0, SWIPE_THRESHOLD],
      [1, 0.97],
      Extrapolation.CLAMP,
    );
    const backgroundColor = interpolateColor(
      translateX.value,
      [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD],
      ['#E0C47A', '#F9F6F1', '#BFD8C0'],
    );
    return {
      transform: [
        { translateX: translateX.value },
        { rotate: `${rotate}deg` },
        { scale: scale * entryScale.value },
      ],
      opacity: cardOpacity.value,
      backgroundColor,
    };
  });

  const animatedConfirmationStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      Math.abs(translateX.value),
      [0, SWIPE_THRESHOLD * 0.5, SWIPE_THRESHOLD],
      [0, 0.5, 1],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  const animatedKeepTextStyle = useAnimatedStyle(() => ({
    opacity: translateX.value > 0 ? 1 : 0,
  }));

  const animatedGremlyFaceStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD * 0.5, SWIPE_THRESHOLD],
      [0, 0.5, 1],
      Extrapolation.CLAMP,
    );
    const scale = interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD],
      [0.5, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity: translateX.value > 0 ? opacity : 0,
      transform: [{ scale }],
    };
  });

  const animatedClearTextStyle = useAnimatedStyle(() => ({
    opacity: translateX.value < 0 ? 1 : 0,
  }));

  const letGoAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: letGoScale.value }],
  }));

  const keepAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: keepScale.value }],
  }));

  // ── Button handlers ──
  const handleKeepPress = useCallback(() => {
    animateCardExit('right', translateX, cardOpacity, onSwipeRight);
  }, [onSwipeRight, translateX, cardOpacity]);

  const handleLetGoPress = useCallback(() => {
    animateCardExit('left', translateX, cardOpacity, onSwipeLeft);
  }, [onSwipeLeft, translateX, cardOpacity]);

  // ── Derived display ──
  const title = getCandidateTitle(candidate);
  const previewText =
    candidate.kind === 'note'
      ? candidate.raw.body
      : candidate.kind === 'todo'
        ? candidate.raw.body
        : null;
  const hidePreview = shouldHidePreview(title, previewText);

  const noteCandidate = candidate.kind === 'note' ? (candidate as SweepCandidateNote) : null;
  const hasAttachments = noteCandidate?.attachments && noteCandidate.attachments.length > 0;
  const firstAttachment = hasAttachments ? noteCandidate!.attachments![0] : null;
  const attachmentCount = hasAttachments ? noteCandidate!.attachments!.length : 0;

  return (
    <View style={styles.cardWrapper}>
      <View style={styles.cardCenteringContainer}>
        {/* Behind-card confirmation */}
        <Animated.View style={[styles.confirmationCard, animatedConfirmationStyle]}>
          <Animated.View style={[styles.gremlyConfirmContainer, animatedGremlyFaceStyle]}>
            <Image source={GREMLY_FACE} style={styles.gremlyConfirmFace} resizeMode="contain" />
          </Animated.View>
          <Animated.Text style={[styles.confirmationCardText, animatedKeepTextStyle]}>
            {keepMessage}
          </Animated.Text>
          <Animated.Text
            style={[
              styles.confirmationCardText,
              styles.confirmationCardTextClear,
              animatedClearTextStyle,
            ]}
          >
            {clearMessage}
          </Animated.Text>
        </Animated.View>

        {/* Swipeable card */}
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              styles.swipeCardContainer,
              animatedCardContainerStyle,
              animatedCardStyle,
              convertAnimatedStyle,
            ]}
          >
            {/* Top inner shadow */}
            <LinearGradient
              colors={['rgba(34,34,34,0.06)', 'rgba(34,34,34,0)']}
              locations={[0, 1]}
              style={styles.innerShadowTop}
              pointerEvents="none"
            />

            {/* Card content */}
            <View style={styles.contentContainer}>
              {/* Gremly menu button */}
              {!hideGremlyMenu && (
                <View style={styles.gremlyButtonPosition}>
                  <GremlyMenuButton onPress={() => setMenuVisible(true)} />
                </View>
              )}
              <View style={styles.menuPosition}>
                <GremlyPopupMenu
                  visible={menuVisible}
                  onClose={() => setMenuVisible(false)}
                  onSelectItem={onGremlyMenuItem}
                />
              </View>

              {/* Type whisper row */}
              <View style={styles.typeWhisperRow}>
                {typeIcon}
                <Text style={styles.typeWhisperText}>{typeWhisper}</Text>
                {badge ? (
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor: badge.backgroundColor,
                        borderColor: badge.borderColor,
                      },
                    ]}
                  >
                    {badge.icon ? (
                      <View style={styles.badgeIconRow}>
                        {badge.icon}
                        <Text style={[styles.badgeText, { color: badge.color }]}>{badge.text}</Text>
                      </View>
                    ) : (
                      <Text style={[styles.badgeText, { color: badge.color }]}>{badge.text}</Text>
                    )}
                  </View>
                ) : null}
                {meta.world && (
                  <Pressable
                    onPress={onWorldPress}
                    style={({ pressed }) => [styles.worldPill, pressed && { opacity: 0.55 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`World: ${meta.world.name}. Tap to change.`}
                  >
                    <View style={[styles.worldDot, { backgroundColor: meta.world.accentColor }]} />
                    <Text style={styles.worldPillText} numberOfLines={1}>
                      {meta.world.name}
                      {meta.world.extraCount > 0 ? ` +${meta.world.extraCount}` : ''}
                    </Text>
                  </Pressable>
                )}
              </View>

              {/* Title */}
              <Text style={styles.title} numberOfLines={hasAttachments ? 2 : 3}>
                {title}
              </Text>

              {/* Subtitle */}
              {!hidePreview && previewText ? (
                <Text style={styles.subtitle} numberOfLines={2}>
                  {previewText}
                </Text>
              ) : null}

              {/* Photo hero for notes with attachments */}
              {hasAttachments && firstAttachment && (
                <TouchableOpacity
                  style={styles.photoHero}
                  onPress={() => onRequestPhotoPreview?.(firstAttachment.url)}
                  activeOpacity={0.9}
                  accessibilityLabel="Tap to view full photo"
                >
                  <Image
                    source={{ uri: firstAttachment.url }}
                    style={styles.photoHeroImage}
                    resizeMode="cover"
                  />
                  {attachmentCount > 1 && (
                    <View style={styles.photoCountBadge}>
                      <Text style={styles.photoCountText}>+{attachmentCount - 1}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* Flexible spacer */}
            <View style={styles.spacer} />

            {/* Action zone (children) */}
            {children}

            {/* Bottom padding to keep content above borderRadius clip zone */}
            <View style={{ paddingBottom: 24 }} />
          </Animated.View>
        </GestureDetector>
      </View>

      {/* Buttons sit BELOW the card, not inside it — never clipped by borderRadius */}
      <View style={styles.buttonsContainer}>
        {/* Let go button */}
        <View style={styles.buttonColumn}>
          <Animated.View style={letGoAnimatedStyle}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Let go of this item"
              onPressIn={() => {
                letGoScale.value = withTiming(1.08, { duration: 120 });
              }}
              onPressOut={() => {
                letGoScale.value = withTiming(1.0, { duration: 120 });
              }}
              onPress={handleLetGoPress}
            >
              <View style={styles.letGoCircle}>
                <LinearGradient
                  colors={['rgba(224,196,122,0.15)', 'rgba(224,196,122,0.06)']}
                  start={{ x: 0.25, y: 0 }}
                  end={{ x: 0.75, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <ArrowLeft size={22} strokeWidth={2.5} color="#E0C47A" />
              </View>
            </Pressable>
          </Animated.View>
          <Text style={styles.letGoLabel}>LET GO</Text>
        </View>

        {/* Keep button */}
        <View style={styles.buttonColumn}>
          <Animated.View style={keepAnimatedStyle}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Keep this item"
              onPressIn={() => {
                keepScale.value = withTiming(1.08, { duration: 120 });
              }}
              onPressOut={() => {
                keepScale.value = withTiming(1.0, { duration: 120 });
              }}
              onPress={handleKeepPress}
            >
              <View style={styles.keepCircle}>
                <LinearGradient
                  colors={['#BFD8C0', 'rgba(191,216,192,0.7)']}
                  start={{ x: 0.25, y: 0 }}
                  end={{ x: 0.75, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <ArrowRight size={22} strokeWidth={2.5} color="#2E5540" />
              </View>
            </Pressable>
          </Animated.View>
          <Text style={styles.keepLabel}>KEEP</Text>
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  cardWrapper: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#FFFFFF',
    overflow: 'visible',
  },
  cardCenteringContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 2,
    overflow: 'visible',
  },

  // Confirmation card (behind)
  confirmationCard: {
    position: 'absolute',
    top: 250,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 0,
  },
  confirmationCardText: {
    position: 'absolute',
    fontSize: 32,
    fontWeight: '800',
    color: BRAND.colors.sageMist,
    letterSpacing: 3,
    textTransform: 'uppercase',
    top: 100,
  },
  confirmationCardTextClear: {
    color: BRAND.colors.goldenPear,
    top: 40,
  },
  gremlyConfirmContainer: {
    position: 'absolute',
    top: -20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gremlyConfirmFace: {
    width: 90,
    height: 90,
  },

  // Swipeable card
  swipeCardContainer: {
    width: CARD_WIDTH,
    maxWidth: 400,
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(191,216,192,0.2)',
  },
  innerShadowTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 10,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    zIndex: 1,
  },

  // Content
  contentContainer: {
    paddingHorizontal: 22,
    paddingTop: 22,
    position: 'relative',
  },
  gremlyButtonPosition: {
    position: 'absolute',
    top: 18,
    right: 18,
    zIndex: 10,
  },
  menuPosition: {
    position: 'absolute',
    top: 60,
    right: 18,
    zIndex: 100,
  },
  typeWhisperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  typeWhisperText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(46,85,64,0.55)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontFamily: 'Inter-Medium',
  },
  badge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeText: {
    fontSize: 9.5,
    fontWeight: '600',
  },
  worldPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
  },
  worldDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  worldPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(46,85,64,0.55)',
    fontFamily: 'Inter-Medium',
    // normal casing — no textTransform, no letterSpacing (this is a name, not a label)
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1a1a1a',
    lineHeight: 32,
    letterSpacing: -0.6,
    fontFamily: 'PlusJakartaSans-Bold',
    paddingRight: 52,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '400' as const,
    color: 'rgba(34,34,34,0.4)',
    marginTop: 6,
    lineHeight: 19,
    fontFamily: 'Inter-Regular',
  },

  // Spacer
  spacer: {
    flex: 1,
    minHeight: 16,
  },

  // Bottom buttons (outside the card)
  buttonsContainer: {
    marginTop: 'auto',
    paddingTop: 12,
    paddingBottom: 4,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 28,
    alignItems: 'center',
  },
  buttonColumn: {
    alignItems: 'center',
    gap: 6,
  },
  letGoCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2.5,
    borderColor: '#E0C47A',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  letGoLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#E0C47A',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  keepCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2.5,
    borderColor: '#8BB896',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keepLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2E5540',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  photoHero: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 12,
    backgroundColor: 'rgba(191,216,192,0.15)',
  },
  photoHeroImage: {
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
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  photoCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
