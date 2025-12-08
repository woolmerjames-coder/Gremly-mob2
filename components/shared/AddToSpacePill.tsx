/**
 * AddToSpacePill - Add to Space button matching TodayPillsRow style
 *
 * Identical styling to the "Add to Today" pill from TodayPillsRow.
 * Uses the Gremly button asset and sage mist background.
 */

import React from 'react';
import { Pressable, Text, StyleSheet, Image, ImageSourcePropType } from 'react-native';

// Gremly face button asset
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_BUTTON: ImageSourcePropType = require('../../assets/buttonforHP.png');

// Brand colors (matching TodayPillsRow)
const MOSS_GREEN = '#2E5540';
const SAGE_MIST = '#E8F0EB'; // Light sage green background
const SAGE_MIST_PRESSED = '#D4E4D6';
const PILL_BG = '#F3F0EB'; // Slightly darker than LINEN for pill contrast

export interface AddToSpacePillProps {
  /** Callback when button is pressed */
  onPress: () => void;
  /** Use compact styling (smaller) */
  compact?: boolean;
  /** Optional test ID */
  testID?: string;
}

export function AddToSpacePill({
  onPress,
  compact = false,
  testID = 'add-to-space-pill',
}: AddToSpacePillProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.pill,
        compact && styles.pillCompact,
        pressed && styles.pillPressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Add to Space"
      testID={testID}
    >
      <Image
        source={GREMLY_BUTTON}
        style={[styles.gremlyIcon, compact && styles.gremlyIconCompact]}
        resizeMode="contain"
      />
      <Text style={[styles.label, compact && styles.labelCompact]}>Add to Space</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Matches TodayPillsRow pill + addPill styles
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 21,
    backgroundColor: SAGE_MIST,
    gap: 7,
    // Soft elevation shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
    alignSelf: 'flex-start', // Don't stretch full width
  },
  pillCompact: {
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  pillPressed: {
    backgroundColor: SAGE_MIST_PRESSED,
    opacity: 0.85,
  },
  // Matches TodayPillsRow gremlyIcon
  gremlyIcon: {
    width: 31,
    height: 31,
    flexShrink: 0,
    marginLeft: -4,
    marginRight: -4,
  },
  gremlyIconCompact: {
    width: 23,
    height: 23,
    marginLeft: -3,
    marginRight: -3,
  },
  // Matches TodayPillsRow addLabel
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: MOSS_GREEN,
    flexShrink: 1,
    flexWrap: 'wrap',
    textAlign: 'left',
  },
  labelCompact: {
    fontSize: 10,
  },
});

export default AddToSpacePill;
