/**
 * Phase 10.9: Micro Celebrate Toast
 *
 * Subtle top toast with Golden Pear accent that rotates through
 * encouraging microcopy without exclamation spam.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { lightTokens } from '../../../design/tokens';

export interface MicroCelebrateProps {
  message: string;
  onDismiss?: () => void;
  duration?: number;
}

export function MicroCelebrate({ message, onDismiss, duration = 1400 }: MicroCelebrateProps) {
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(-50));

  useEffect(() => {
    // Slide in and fade in
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto dismiss
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -50,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (onDismiss) {
          onDismiss();
        }
      });
    }, duration);

    return () => clearTimeout(timer);
  }, [fadeAnim, slideAnim, duration, onDismiss]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={styles.toast}>
        <Text style={styles.message}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60, // Below status bar
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
    pointerEvents: 'none',
  },
  toast: {
    backgroundColor: '#F4C430', // Golden Pear
    paddingHorizontal: lightTokens.spacing[4],
    paddingVertical: lightTokens.spacing[2],
    borderRadius: lightTokens.radius[3],
    ...lightTokens.elevation.md,
  },
  message: {
    fontSize: lightTokens.typography.size.sm,
    fontWeight: '600',
    color: lightTokens.colors.text,
  },
});
