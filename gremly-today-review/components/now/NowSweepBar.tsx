/**
 * NOW Sweep Bar Component
 * Fixed bottom bar for evening sweep access with gradient styling
 */

import React, { useEffect, useMemo } from 'react';
import { Animated, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../ui';
import { Icon } from '../ui/Icon';
import { makeStyles, useTokens } from '../../design/makeStyles';
import { gentlePulse } from '../../lib/today/motion';
import { useReducedMotion } from '../../design/animations';

interface NowSweepBarProps {
  hasYesterdayCarryOver: boolean;
  onPress: () => void;
}

const useStyles = makeStyles((t) => ({
  wrapper: {
    position: 'absolute',
    left: t.spacing[3],
    right: t.spacing[3],
    borderTopLeftRadius: t.radius[3],
    borderTopRightRadius: t.radius[3],
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    ...t.elevation.md,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: t.spacing[2],
    paddingHorizontal: t.spacing[4],
    gap: t.spacing[2],
  },
  barAvailable: {
    backgroundColor: t.colors.sageMist,
  },
  barUrgent: {
    backgroundColor: t.colors.mossGreen,
  },
  text: {
    fontSize: t.typography.size.sm,
    fontFamily: t.typography.fontFamily.medium,
  },
  textAvailable: {
    color: t.colors.mossGreen,
  },
  textUrgent: {
    color: t.colors.onPrimary,
  },
}));

export function NowSweepBar({ hasYesterdayCarryOver, onPress }: NowSweepBarProps) {
  const styles = useStyles();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const scale = useMemo(() => new Animated.Value(1), []);
  const message = hasYesterdayCarryOver ? 'Time to Sweep!' : 'Sweep available';

  useEffect(() => {
    if (hasYesterdayCarryOver) {
      // Gentle pulse for 3 cycles when urgent
      gentlePulse(scale, 3, reducedMotion);
    }
  }, [hasYesterdayCarryOver, scale, reducedMotion]);

  const barStateStyle = hasYesterdayCarryOver ? styles.barUrgent : styles.barAvailable;
  const textStateStyle = hasYesterdayCarryOver ? styles.textUrgent : styles.textAvailable;
  const iconColor = hasYesterdayCarryOver ? tokens.colors.onPrimary : tokens.colors.mossGreen;

  return (
    <TouchableOpacity
      style={[styles.wrapper, { bottom: insets.bottom + 12 }]}
      onPress={onPress}
      activeOpacity={0.9}
      testID="sweep-bar"
    >
      <Animated.View style={[styles.bar, barStateStyle, { transform: [{ scale }] }]}>
        <Icon name="Sparkles" size="sm" color={iconColor} />
        <Text style={[styles.text, textStateStyle]}>{message}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}
