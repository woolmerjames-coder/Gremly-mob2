import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { BRAND } from '../../../design/brand';

interface FedToastProps {
  /** Which fed day this is (1, 2, or 3). Display value, already incremented optimistically. */
  fedDayNumber: number;
  /** Called when the toast is dismissed (auto or manual) */
  onDismiss: () => void;
}

const TOAST_DURATION = 4000; // Auto-dismiss after 4 seconds
const SLIDE_OUT_DURATION = 250; // Slide out animation
const TOAST_TOP_OFFSET = 60; // Below status bar

export function FedToast({ fedDayNumber, onDismiss }: FedToastProps) {
  // Start at entrance target (component mounts visible, dismisses with slide-out)
  const translateY = useSharedValue(TOAST_TOP_OFFSET);
  const opacity = useSharedValue(1);
  const isClosingRef = useRef(false);
  const autoDismissTimer = useRef<NodeJS.Timeout | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  // Clamp fedDayNumber to 1-3
  const dayNumber = Math.min(Math.max(fedDayNumber, 1), 3);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  // Haptic + auto-dismiss timer on mount
  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    const slideOut = () => {
      if (isClosingRef.current) return;
      isClosingRef.current = true;

      translateY.value = withTiming(-120, {
        duration: SLIDE_OUT_DURATION,
        easing: Easing.in(Easing.cubic),
      });
      opacity.value = withTiming(0, { duration: SLIDE_OUT_DURATION }, (finished) => {
        if (finished) {
          runOnJS(onDismissRef.current)();
        }
      });
    };

    autoDismissTimer.current = setTimeout(slideOut, TOAST_DURATION);

    return () => {
      if (autoDismissTimer.current) {
        clearTimeout(autoDismissTimer.current);
      }
    };
  }, [translateY, opacity]);

  const handlePress = () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    if (autoDismissTimer.current) {
      clearTimeout(autoDismissTimer.current);
      autoDismissTimer.current = null;
    }

    // eslint-disable-next-line react-hooks/immutability
    translateY.value = withTiming(-120, {
      duration: SLIDE_OUT_DURATION,
      easing: Easing.in(Easing.cubic),
    });
    // eslint-disable-next-line react-hooks/immutability
    opacity.value = withTiming(0, { duration: SLIDE_OUT_DURATION }, (finished) => {
      if (finished) {
        runOnJS(onDismissRef.current)();
      }
    });
  };

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <Pressable style={styles.toast} onPress={handlePress}>
        {/* Headline */}
        <Text style={styles.headline}>All offloaded.</Text>

        {/* Subtitle */}
        <Text style={styles.subtitle}>That's the stuff. Day {dayNumber} of 3.</Text>

        {/* Fed-day dots */}
        <View style={styles.dotsRow}>
          {[1, 2, 3].map((day) => (
            <View
              key={day}
              style={[styles.dot, day <= dayNumber ? styles.dotFilled : styles.dotEmpty]}
            />
          ))}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
    pointerEvents: 'box-none',
  },
  toast: {
    backgroundColor: BRAND.colors.mossGreen,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 16,
    marginHorizontal: 24,
    alignItems: 'center',
    // Subtle shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  headline: {
    fontSize: 17,
    fontFamily: 'PlusJakartaSans-Bold',
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
    marginBottom: 12,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotFilled: {
    backgroundColor: '#FFFFFF',
  },
  dotEmpty: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
});
