/**
 * NOW Sweep Bar Component
 * Fixed bottom bar for evening sweep access
 */

import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Box, Text } from '../../ui';

interface NowSweepBarProps {
  hasYesterdayCarryOver: boolean;
  onPress: () => void;
}

export function NowSweepBar({ hasYesterdayCarryOver, onPress }: NowSweepBarProps) {
  const message = hasYesterdayCarryOver ? '✨ Time to Sweep!' : '🧹 Sweep available';

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.9}>
      <Box style={styles.button}>
        <Text style={styles.buttonText}>{message}</Text>
      </Box>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  button: {
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
