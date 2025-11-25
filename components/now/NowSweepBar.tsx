/**
 * NOW Sweep Bar Component
 * Fixed bottom bar for evening sweep access with gradient styling
 */

import React, { useEffect, useMemo } from 'react';
import { Animated, TouchableOpacity } from 'react-native';
import { Box, Text } from '../../ui';
import { makeStyles } from '../../design/makeStyles';
import { gentlePulse } from '../../lib/today/motion';
import { useReducedMotion } from '../../design/animations';

interface NowSweepBarProps {
  hasYesterdayCarryOver: boolean;
  onPress: () => void;
}

const useStyles = makeStyles((t) => ({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: t.colors.surface,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    padding: t.spacing[4],
    ...t.elevation.md,
  },
  button: {
    paddingVertical: t.spacing[3],
    paddingHorizontal: t.spacing[5],
    borderRadius: t.radius[4], // 20px - full pill
    alignItems: 'center',
  },
  buttonUrgent: {
    backgroundColor: t.colors.deepForest, // Deep Forest for urgent sweeps
  },
  buttonNormal: {
    backgroundColor: t.colors.mossGreen, // Moss Green for available sweeps
  },
  buttonText: {
    fontSize: t.typography.size.md, // 16px
    fontFamily: t.typography.fontFamily.medium,
    color: '#FFFFFF',
  },
}));

export function NowSweepBar({ hasYesterdayCarryOver, onPress }: NowSweepBarProps) {
  const styles = useStyles();
  const reducedMotion = useReducedMotion();
  const scale = useMemo(() => new Animated.Value(1), []);
  const message = hasYesterdayCarryOver ? '✨ Time to Sweep!' : '🧹 Sweep available';

  useEffect(() => {
    if (hasYesterdayCarryOver) {
      // Gentle pulse for 3 cycles when urgent
      gentlePulse(scale, 3, reducedMotion);
    }
  }, [hasYesterdayCarryOver, scale, reducedMotion]);

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.9}>
      <Animated.View
        style={[
          styles.button,
          hasYesterdayCarryOver ? styles.buttonUrgent : styles.buttonNormal,
          { transform: [{ scale }] },
        ]}
      >
        <Text style={styles.buttonText}>{message}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}
