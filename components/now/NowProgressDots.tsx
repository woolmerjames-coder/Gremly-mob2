/**
 * NOW Progress Dots Component
 * Displays progress as dots, dense dots, or progress bar
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Box, Text } from '../../ui';

interface NowProgressDotsProps {
  mode: 'dots' | 'denseDots' | 'bar';
  dots?: boolean[];
  percent: number;
}

export function NowProgressDots({ mode, dots, percent }: NowProgressDotsProps) {
  if (mode === 'bar') {
    return (
      <Box style={styles.barContainer}>
        <View style={styles.barBackground}>
          <View style={[styles.barFill, { width: `${percent}%` }]} />
        </View>
        <Text style={styles.percentText}>{percent}%</Text>
      </Box>
    );
  }

  const displayDots = dots || [true, false, true, false];
  const dotSize = mode === 'denseDots' ? 6 : 8;
  const dotSpacing = mode === 'denseDots' ? 4 : 6;

  return (
    <Box style={styles.dotsContainer}>
      {displayDots.map((completed, index) => (
        <View
          key={index}
          style={[
            styles.dot,
            {
              width: dotSize,
              height: dotSize,
              marginRight: index < displayDots.length - 1 ? dotSpacing : 0,
              backgroundColor: completed ? '#4CAF50' : '#E0E0E0',
            },
          ]}
        />
      ))}
    </Box>
  );
}

const styles = StyleSheet.create({
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  dot: {
    borderRadius: 999,
  },
  barContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  barBackground: {
    flex: 1,
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
  },
  percentText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
});
