/**
 * GremlyDot - Reusable Gremly face button for habit completion states
 *
 * Shows the buttonforHP.png image - full color when completed, greyed out when not
 */

import React from 'react';
import { TouchableOpacity, Image, StyleSheet, ImageSourcePropType } from 'react-native';

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
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || isFuture}
      style={[styles.container, { width: size, height: size }, isFuture && styles.future]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isCompleted }}
      accessibilityLabel={isToday ? 'Today' : undefined}
    >
      <Image
        source={GREMLY_BUTTON_IMAGE}
        style={[styles.image, { width: size, height: size }, !isCompleted && styles.notCompleted]}
        resizeMode="contain"
      />
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
