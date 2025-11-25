/**
 * NOW Progress Dots Component
 * Displays progress as dots, dense dots, or progress bar
 */

import React, { useEffect, useMemo } from 'react';
import { Animated, View, Easing } from 'react-native';
import { Box, Text } from '../../ui';
import { makeStyles } from '../../design/makeStyles';
import { useReducedMotion } from '../../design/animations';
import type { NowProgressState } from '../../lib/now/nowTypes';

interface NowProgressDotsProps {
  progressState: NowProgressState;
}

const useStyles = makeStyles((t) => ({
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: t.spacing[2],
  },
  barContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing[3],
    paddingVertical: t.spacing[2],
  },
  barBackground: {
    flex: 1,
    height: 8,
    backgroundColor: t.colors.sageMist,
    borderRadius: t.radius[1], // 6px
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: t.colors.mossGreen,
  },
  percentText: {
    fontSize: t.typography.size.xs, // 12px
    fontFamily: t.typography.fontFamily.medium,
    color: t.colors.subtle,
  },
}));

export function NowProgressDots({ progressState }: NowProgressDotsProps) {
  const styles = useStyles();
  const reducedMotion = useReducedMotion();
  const { mode, percent, completedCount, totalEligibleCount, dots } = progressState;
  const animatedWidth = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    if (mode === 'bar') {
      if (reducedMotion) {
        animatedWidth.setValue(percent);
      } else {
        Animated.timing(animatedWidth, {
          toValue: percent,
          duration: 300,
          easing: Easing.out(Easing.ease),
          useNativeDriver: false, // width can't use native driver
        }).start();
      }
    }
  }, [percent, mode, reducedMotion, animatedWidth]);

  if (mode === 'bar') {
    const widthInterpolated = animatedWidth.interpolate({
      inputRange: [0, 100],
      outputRange: ['0%', '100%'],
    });

    return (
      <Box style={styles.barContainer}>
        <View style={styles.barBackground}>
          <Animated.View style={[styles.barFill, { width: widthInterpolated }]} />
        </View>
        <Text style={styles.percentText}>
          {completedCount} of {totalEligibleCount}
        </Text>
      </Box>
    );
  }

  const displayDots = dots || [];
  const dotSize = mode === 'denseDots' ? 6 : 8;
  const dotSpacing = mode === 'denseDots' ? 4 : 6;

  return (
    <Box style={styles.dotsContainer}>
      {displayDots.map((completed, index) => (
        <View
          key={index}
          style={{
            width: dotSize,
            height: dotSize,
            marginRight: index < displayDots.length - 1 ? dotSpacing : 0,
            backgroundColor: completed ? '#2E5540' : '#BFD8C0', // mossGreen : sageMist
            borderRadius: 999,
          }}
        />
      ))}
    </Box>
  );
}
