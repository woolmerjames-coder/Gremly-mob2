/**
 * GremlyDot - Reusable Gremly face button for habit completion states
 *
 * Shows the buttonforHP.png image - full color when completed, greyed out when not
 * Includes pulse animation and haptic feedback on completion
 */

import React, { useRef, useMemo } from 'react';
import { TouchableOpacity, Image, StyleSheet, ImageSourcePropType, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';

// Use the buttonforHP image for the habit dots
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_BUTTON_IMAGE: ImageSourcePropType = require('../../assets/buttonforHP.png');

interface GremlyDotProps {
  isCompleted: boolean;
  isToday: boolean;
  isFuture: boolean;
  onPress: () => void;
  disabled?: boolean;
  size?: number; // Default 28
}

export function GremlyDot({
  isCompleted,
  isToday,
  isFuture,
  onPress,
  disabled,
  size = 28,
}: GremlyDotProps) {
  // Use useMemo to create the Animated.Value once (stable across renders)
  const scaleAnim = useMemo(() => new Animated.Value(1), []);
  const scaleAnimRef = useRef(scaleAnim);

  const handlePress = () => {
    // Only animate and haptic when completing (going from incomplete to complete)
    if (!isCompleted) {
      // Haptic feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Pulse animation: scale up then back down
      Animated.sequence([
        Animated.timing(scaleAnimRef.current, {
          toValue: 1.3,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnimRef.current, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start();
    }

    onPress();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled || isFuture}
      style={[styles.container, { width: size, height: size }, isFuture && styles.future]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isCompleted }}
      accessibilityLabel={isToday ? 'Today' : undefined}
    >
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Image
          source={GREMLY_BUTTON_IMAGE}
          style={[styles.image, { width: size, height: size }, !isCompleted && styles.notCompleted]}
          resizeMode="contain"
        />
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    // No tint by default - shows full color Gremly
  },
  future: {
    opacity: 0.3,
  },
  notCompleted: {
    // Grey out incomplete habits
    opacity: 0.4,
  },
});
