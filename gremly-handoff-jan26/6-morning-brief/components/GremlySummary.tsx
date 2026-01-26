/**
 * GremlySummary
 *
 * Displays Gremly mascot with capacity-based message.
 * Shows how task load compares to available time.
 */

import React, { useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { BRAND } from '../../../../design/brand';
import { useCapacitySummary } from '../../../../lib/store/capacitySelectors';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const MORNING_BRIEF_GREMLY = require('../../../../assets/mascot/morningbriefgremly.png');

interface GremlySummaryProps {
  /** Total estimated minutes of tasks for today */
  taskMinutes: number;
}

export function GremlySummary({ taskMinutes }: GremlySummaryProps) {
  const [showInstructions, setShowInstructions] = useState(false);
  const summary = useCapacitySummary(taskMinutes);

  // Tone-based styling
  const toneColor = {
    positive: BRAND.colors.mossGreen,
    cautious: BRAND.colors.goldenPear,
    warning: BRAND.colors.periwinkleSmoke,
  }[summary.tone];

  return (
    <View style={styles.container}>
      <View style={styles.summaryRow}>
        <Image source={MORNING_BRIEF_GREMLY} style={styles.mascot} resizeMode="contain" />
        <View style={styles.messageContainer}>
          <Text style={[styles.message, { color: toneColor }]}>{summary.message}</Text>
        </View>
        <Pressable
          style={styles.helpButton}
          onPress={() => setShowInstructions(!showInstructions)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.helpIcon}>?</Text>
        </Pressable>
      </View>

      {showInstructions && (
        <View style={styles.instructionsContainer}>
          <Text style={styles.instructionsText}>
            Here's your day at a glance! Tap any task to assign it to a time block, or leave it
            flexible. Everything here is already on today's list.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.md,
    marginHorizontal: 16,
    marginVertical: 8,
    ...BRAND.elevation.one,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mascot: {
    width: 48,
    height: 48,
    marginRight: 12,
  },
  messageContainer: {
    flex: 1,
  },
  message: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  helpButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: BRAND.colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  helpIcon: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
  },
  instructionsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.borderSubtle,
  },
  instructionsText: {
    fontSize: 14,
    color: BRAND.colors.inkSubtle,
    lineHeight: 20,
  },
});
