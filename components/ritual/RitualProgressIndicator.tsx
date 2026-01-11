/**
 * RitualProgressIndicator Component
 *
 * Displays Gremly's age and daily ritual progress (drops + sweeps).
 * Used in Mind Drop screen and potentially other surfaces.
 *
 * Ritual: Drop 3 thoughts + Sweep 3 cards = Gremly ages by 1 day
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../../ui';
import { Check } from 'lucide-react-native';
import { BRAND } from '../../design/brand';

interface RitualProgressIndicatorProps {
  /** Number of drops completed today (0-3+) */
  dropsCount: number;
  /** Number of sweeps completed today (0-3+) */
  sweepsCount: number;
  /** Gremly's current age in days */
  gremlyAge: number;
  /** Use compact layout for smaller displays */
  compact?: boolean;
  /** Hide the age text (when shown separately) */
  hideAge?: boolean;
}

const REQUIRED_COUNT = 3;
const DOT_SIZE = 6;
const DOT_GAP = 4;
const SECTION_GAP = 12;

/**
 * Renders a row of progress dots for drops or sweeps
 */
function ProgressDots({
  count,
  showCheckWhenComplete,
}: {
  count: number;
  showCheckWhenComplete?: boolean;
}) {
  const isComplete = count >= REQUIRED_COUNT;

  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: REQUIRED_COUNT }).map((_, index) => {
        const isFilled = count > index;

        // Show check icon for last dot when all complete (sweeps only)
        if (showCheckWhenComplete && isComplete && index === REQUIRED_COUNT - 1) {
          return (
            <View key={index} style={styles.checkContainer}>
              <Check size={10} color={BRAND.colors.mossGreen} strokeWidth={3} />
            </View>
          );
        }

        return (
          <View key={index} style={[styles.dot, isFilled ? styles.dotFilled : styles.dotEmpty]} />
        );
      })}
    </View>
  );
}

export default function RitualProgressIndicator({
  dropsCount,
  sweepsCount,
  gremlyAge,
  compact = false,
  hideAge = false,
}: RitualProgressIndicatorProps) {
  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {/* Age display */}
      {!hideAge && (
        <Text style={[styles.ageText, compact && styles.ageTextCompact]}>
          {gremlyAge} {gremlyAge === 1 ? 'Day' : 'Days'}
        </Text>
      )}

      {/* Progress row */}
      <View style={styles.progressRow}>
        {/* Drops section */}
        <View style={styles.section}>
          <ProgressDots count={dropsCount} />
          <Text style={styles.label}>drops</Text>
        </View>

        {/* Sweeps section */}
        <View style={styles.section}>
          <ProgressDots count={sweepsCount} showCheckWhenComplete />
          <Text style={styles.label}>swept</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 6,
  },
  containerCompact: {
    gap: 4,
  },
  ageText: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },
  ageTextCompact: {
    fontSize: 11,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SECTION_GAP,
  },
  section: {
    alignItems: 'center',
    gap: 2,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: DOT_GAP,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  dotFilled: {
    backgroundColor: BRAND.colors.mossGreen,
  },
  dotEmpty: {
    backgroundColor: BRAND.colors.borderSubtle,
  },
  checkContainer: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    color: BRAND.colors.inkSubtle,
  },
});
