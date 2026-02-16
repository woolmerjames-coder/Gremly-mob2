/**
 * GapRow - Displays a time gap between events with optional slot action.
 * Renders as a subtle dashed row showing available time.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Plus } from 'lucide-react-native';
import type { TimeGap } from '../../../../lib/timeGaps';

const COLORS = {
  gapText: '#AAAAAA',
  gapDash: '#DEDBD6',
  plusIcon: '#999999',
  plusBg: 'rgba(0,0,0,0.04)',
};

interface GapRowProps {
  gap: TimeGap;
  onSlotPress?: (gap: TimeGap) => void;
  /** Hide the + button (e.g., in read-only views) */
  hideAction?: boolean;
}

export function GapRow({ gap, onSlotPress, hideAction }: GapRowProps) {
  return (
    <View style={styles.container}>
      <View style={styles.dashLine} />
      <Text style={styles.label}>{gap.label}</Text>
      <View style={styles.dashLine} />
      {!hideAction && onSlotPress && (
        <Pressable
          style={styles.plusButton}
          onPress={() => onSlotPress(gap)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Plus size={14} color={COLORS.plusIcon} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  dashLine: {
    flex: 1,
    height: 0,
    borderBottomWidth: 1,
    borderColor: '#DEDBD6',
    borderStyle: 'dashed' as const,
  },
  label: {
    fontSize: 11,
    color: '#AAAAAA',
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  plusButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
});
