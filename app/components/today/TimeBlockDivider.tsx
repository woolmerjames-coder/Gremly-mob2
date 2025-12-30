/**
 * TimeBlockDivider - Subtle divider for Morning/Day/Evening/Whenever sections
 *
 * Layout: ───────────── LABEL ─────────────
 * Only renders between time blocks when items exist in both.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BRAND } from '../../../design/brand';

interface TimeBlockDividerProps {
  label: 'Morning' | 'Day' | 'Evening' | 'Whenever';
}

export function TimeBlockDivider({ label }: TimeBlockDividerProps) {
  return (
    <View style={styles.container}>
      <View style={styles.line} />
      <Text style={styles.label}>{label}</Text>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 16,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: BRAND.colors.borderSubtle,
  },
  label: {
    paddingHorizontal: 12,
    fontSize: 11,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
