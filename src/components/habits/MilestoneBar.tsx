/**
 * MilestoneBar – Small progress bar showing progress toward next streak milestone.
 *
 * Pure visual component — receives all data via props, no store access or side effects.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { BRAND } from '../../../design/brand';

// ─── Color tokens ────────────────────────────────────────────────────────────
const TRACK_GREEN = 'rgba(46,85,64,0.08)';
const TRACK_AMBER = 'rgba(199,158,95,0.08)';
const FILL_GREEN = BRAND.colors.mossGreen;
const FILL_AMBER = '#C79E5F';

// ─── Props ───────────────────────────────────────────────────────────────────
export interface MilestoneBarProps {
  /** Current streak count */
  current: number;
  /** Next milestone target */
  target: number;
  /** Color theme */
  color: 'green' | 'amber';
}

// ─── Component ───────────────────────────────────────────────────────────────
export function MilestoneBar({ current, target, color }: MilestoneBarProps) {
  const isGreen = color === 'green';
  const trackBg = isGreen ? TRACK_GREEN : TRACK_AMBER;
  const fillBg = isGreen ? FILL_GREEN : FILL_AMBER;
  const pct = target > 0 ? Math.min(current / target, 1) * 100 : 0;

  return (
    <View style={[styles.track, { backgroundColor: trackBg }]}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: fillBg }]} />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  track: {
    height: 6,
    borderRadius: 99,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 99,
  },
});
