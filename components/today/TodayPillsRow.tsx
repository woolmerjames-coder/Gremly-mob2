/**
 * TodayPillsRow - Horizontal row with Add to Today and Sweep pills
 *
 * Pure component (no data fetching).
 * Used on the Today/Now screen for quick actions.
 *
 * Layout (normal/moderate state):
 *   [ 🐸 Add to Today ]  [ ✨ Sweep is waiting | N things ]
 *
 * Layout (high state - bottom only shows Add):
 *   [ 🐸 Add to Today ]
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet, Image, ImageSourcePropType } from 'react-native';
import { Sparkles } from 'lucide-react-native';

// Gremly face button asset
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_BUTTON: ImageSourcePropType = require('../../assets/buttonforHP.png');

// Brand colors
const GOLDEN_PEAR = '#E0C47A';
const SAGE_MIST = '#BFD8C0';
const MOSS_GREEN = '#2E5540';

export type SweepLevel = 'none' | 'normal' | 'moderate' | 'high';

export interface TodayPillsRowProps {
  sweepLevel: SweepLevel;
  sweepLabel: string;
  sweepCountLabel: string;
  onSweepPress: () => void;
  onAddPress: () => void;
  /** Show only the Sweep pill (hide Add pill) */
  showSweepOnly?: boolean;
  /** Show only the Add pill (hide Sweep pill) */
  showAddOnly?: boolean;
  /** Use compact styling for header placement */
  compact?: boolean;
}

export default function TodayPillsRow({
  sweepLevel,
  sweepLabel,
  sweepCountLabel,
  onSweepPress,
  onAddPress,
  showSweepOnly = false,
  showAddOnly = false,
  compact = false,
}: TodayPillsRowProps) {
  // Determine if we need bolder title for moderate/high states
  const isBold = sweepLevel === 'moderate' || sweepLevel === 'high';

  // Determine which pills to show
  const showSweep = !showAddOnly;
  const showAdd = !showSweepOnly;

  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      {/* Add to Today Pill - LEFT */}
      {showAdd && (
        <Pressable
          style={({ pressed }) => [
            styles.pill,
            styles.addPill,
            compact && styles.pillCompact,
            // When showing only one pill, don't use flex: 1
            (showSweepOnly || showAddOnly) && styles.pillSingle,
            pressed && styles.pillPressed,
          ]}
          onPress={onAddPress}
          accessibilityRole="button"
          accessibilityLabel="Add to Today"
        >
          <Image
            source={GREMLY_BUTTON}
            style={[styles.gremlyIcon, compact && styles.gremlyIconCompact]}
            resizeMode="contain"
          />
          <Text style={[styles.addLabel, compact && styles.addLabelCompact]} numberOfLines={1}>
            Add to Today
          </Text>
        </Pressable>
      )}

      {/* Sweep Pill - RIGHT */}
      {showSweep && (
        <Pressable
          style={({ pressed }) => [
            styles.pill,
            styles.sweepPill,
            compact && styles.pillCompact,
            // When showing only one pill, don't use flex: 1
            (showSweepOnly || showAddOnly) && styles.pillSingle,
            pressed && styles.pillPressed,
          ]}
          onPress={onSweepPress}
          accessibilityRole="button"
          accessibilityLabel={`${sweepLabel}, ${sweepCountLabel}`}
        >
          <Sparkles size={compact ? 16 : 20} color={MOSS_GREEN} strokeWidth={2} />
          <View style={styles.sweepTextContainer}>
            <Text
              style={[
                styles.sweepLabel,
                compact && styles.sweepLabelCompact,
                isBold && styles.sweepLabelBold,
              ]}
              numberOfLines={1}
            >
              {sweepLabel}
            </Text>
            <Text
              style={[styles.sweepCountLabel, compact && styles.sweepCountLabelCompact]}
              numberOfLines={1}
            >
              {sweepCountLabel}
            </Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10, // Reduced from 14 for tighter layout
    flexWrap: 'wrap', // Allow wrapping on very small devices
    rowGap: 8, // Vertical gap if pills wrap to two rows
  },
  rowCompact: {
    gap: 0,
    flexWrap: 'nowrap', // Header pill should not wrap
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48, // Slightly reduced from 50
    paddingHorizontal: 14, // Slightly reduced from 16
    borderRadius: 9999,
    gap: 8, // Reduced from 10
    minWidth: 0, // Allow shrinking
  },
  pillCompact: {
    height: 36, // Reduced from 40 for tighter header fit
    paddingHorizontal: 10, // Reduced from 12
    gap: 5, // Reduced from 6
  },
  pillSingle: {
    flex: 0,
  },
  pillPressed: {
    opacity: 0.85,
  },
  // Sweep Pill
  sweepPill: {
    flex: 1,
    backgroundColor: GOLDEN_PEAR,
  },
  sweepTextContainer: {
    flexDirection: 'column',
    justifyContent: 'center',
    flexShrink: 1,
  },
  sweepLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: MOSS_GREEN,
    lineHeight: 18,
  },
  sweepLabelCompact: {
    fontSize: 13,
    lineHeight: 16,
  },
  sweepLabelBold: {
    fontWeight: '600',
  },
  sweepCountLabel: {
    fontSize: 12,
    fontWeight: '400',
    color: MOSS_GREEN,
    opacity: 0.8,
    lineHeight: 14,
  },
  sweepCountLabelCompact: {
    fontSize: 10,
    lineHeight: 12,
  },
  // Add Pill
  addPill: {
    flex: 1,
    backgroundColor: SAGE_MIST,
  },
  gremlyIcon: {
    width: 28,
    height: 28,
  },
  gremlyIconCompact: {
    width: 22,
    height: 22,
  },
  addLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: MOSS_GREEN,
  },
  addLabelCompact: {
    fontSize: 13,
  },
});
