/**
 * Overwhelm Button Component
 * Floating action button for when users feel stuck
 */

import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from '../../ui';

interface OverwhelmButtonProps {
  onPress: () => void;
}

export function OverwhelmButton({ onPress }: OverwhelmButtonProps) {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <Text style={styles.text}>😮‍💨</Text>
      <Text style={styles.label}>Feeling stuck?</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 80,
    right: 16,
    backgroundColor: '#FF9800',
    borderRadius: 28,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  text: {
    fontSize: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
