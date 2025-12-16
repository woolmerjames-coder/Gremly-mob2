/**
 * GremlyDot - Reusable Gremly face button for habit completion states
 *
 * Uses tintColor to show green (completed) or grey (incomplete) states
 */

import React from 'react';
import { TouchableOpacity, Image, View, StyleSheet, ImageSourcePropType } from 'react-native';
import { BRAND } from '../../design/brand';

// Use the mascot image and tint it
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_IMAGE: ImageSourcePropType = require('../../assets/mascot/gremly-mascot.png');

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
  // Green tint for completed, grey for incomplete
  const tintColor = isCompleted ? BRAND.colors.mossGreen : '#9CA3AF';

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
        source={GREMLY_IMAGE}
        style={[{ width: size, height: size, tintColor }]}
        resizeMode="contain"
      />
      {isToday && !isCompleted && (
        <View style={[styles.todayRing, { borderColor: BRAND.colors.mossGreen }]} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  future: {
    opacity: 0.4,
  },
  todayRing: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 999,
    borderWidth: 2,
  },
});
