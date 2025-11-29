/**
 * TodayPillsRow - Horizontal row with Add to Today and Sweep pills
 *
 * Pure component (no data fetching).
 * Used on the Today/Now screen for quick actions.
 *
 * Layout (normal/moderate state):
 *   [ 🐸 Add to Today ]  [ ✨ Sweep | N things waiting ]
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
const MOSS_GREEN = '#2E5540';
const LINEN = '#F9F6F1'; // Soft off-white background for pills
const SAGE_MIST = '#E8F0EB'; // Very light sage for subtle accent
const PILL_BG = '#F3F0EB'; // Slightly darker than LINEN for pill contrast

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
          <Text style={[styles.addLabel, compact && styles.addLabelCompact]}>Add to Today</Text>
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
          <View style={styles.sweepIconContainer}>
            <Sparkles size={compact ? 16 : 20} color={GOLDEN_PEAR} strokeWidth={2} />
          </View>
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
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
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
    alignItems: 'stretch', // Pills fill the row height evenly
    paddingHorizontal: 16, // Horizontal padding for the container
    columnGap: 12, // Generous gap between pills
  },
  rowCompact: {
    paddingHorizontal: 12,
    columnGap: 8, // Tighter gap for header placement
  },
  pill: {
    flex: 1, // Share space evenly
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center', // Center content horizontally
    minHeight: 56, // Minimum height for comfortable touch
    paddingHorizontal: 16, // Generous horizontal padding
    paddingVertical: 10, // Vertical padding for breathing room
    borderRadius: 28,
    backgroundColor: PILL_BG, // Slightly darker than page background
    gap: 10,
    // Soft elevation shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1, // Android equivalent
  },
  pillCompact: {
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  pillSingle: {
    flex: 0,
  },
  pillPressed: {
    opacity: 0.85,
  },
  // Sweep Pill
  sweepPill: {
    // Background inherited from base pill style (LINEN)
  },
  sweepIconContainer: {
    flexShrink: 0, // Icon never shrinks
  },
  sweepTextContainer: {
    flexDirection: 'column',
    justifyContent: 'center',
    flex: 1, // Take remaining space
    minWidth: 0, // Required for text truncation
  },
  sweepLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: MOSS_GREEN,
    lineHeight: 19,
  },
  sweepLabelCompact: {
    fontSize: 13,
    lineHeight: 16,
  },
  sweepLabelBold: {
    fontWeight: '700',
  },
  sweepCountLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: GOLDEN_PEAR, // Use Golden Pear for secondary text accent
    lineHeight: 15,
    marginTop: 2,
  },
  sweepCountLabelCompact: {
    fontSize: 10,
    lineHeight: 13,
  },
  // Add Pill
  addPill: {
    // Background inherited from base pill style (LINEN)
  },
  gremlyIcon: {
    width: 32,
    height: 32,
    flexShrink: 0, // Icon never shrinks
  },
  gremlyIconCompact: {
    width: 24,
    height: 24,
  },
  addLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: MOSS_GREEN,
    flexShrink: 1, // Allow label to shrink if needed
    flexWrap: 'wrap', // Allow text to wrap to two lines
    textAlign: 'left',
  },
  addLabelCompact: {
    fontSize: 13,
  },
});
