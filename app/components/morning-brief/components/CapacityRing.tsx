/**
 * CapacityRing
 *
 * Circular SVG ring showing capacity usage percentage.
 * Replaces the horizontal CapacityBar with a compact donut gauge.
 *
 * Color thresholds (based on % used):
 *   0-50%  → sage green (lots of room)
 *  51-75%  → warm amber (filling up)
 *  76-90%  → orange (getting tight)
 *  91-100% → coral (nearly full)
 *   >100%  → red (over capacity)
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface CapacityRingProps {
  /** Percentage of capacity used (0-100+). Values > 100 indicate over-capacity. */
  percentage: number;
  /** Outer diameter of the ring. Default 48. */
  size?: number;
  /** Stroke width of the ring. Default 4. */
  strokeWidth?: number;
}

function getRingColor(pct: number): string {
  if (pct > 100) return '#9E3B3B'; // red — over capacity
  if (pct >= 91) return '#C27A6B'; // coral — nearly full
  if (pct >= 76) return '#D4874D'; // orange — getting tight
  if (pct >= 51) return '#C9956C'; // warm amber — filling up
  return '#6A7D76'; // sage green — lots of room
}

export function CapacityRing({ percentage, size = 48, strokeWidth = 4 }: CapacityRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedPct = Math.min(percentage, 100);
  const strokeDashoffset = circumference - (clampedPct / 100) * circumference;
  const center = size / 2;
  const ringColor = getRingColor(percentage);
  const displayPct = Math.round(percentage);

  return (
    <View style={[localStyles.wrapper, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {/* Background track */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke="rgba(0,0,0,0.06)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Foreground arc */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={ringColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation={-90}
          origin={`${center}, ${center}`}
        />
      </Svg>
      {/* Center label */}
      <View style={localStyles.labelContainer}>
        <Text style={[localStyles.pctNumber, { color: ringColor }]}>{displayPct}</Text>
        <Text style={[localStyles.pctSymbol, { color: ringColor }]}>%</Text>
      </View>
    </View>
  );
}

const localStyles = StyleSheet.create({
  wrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  labelContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pctNumber: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 15,
  },
  pctSymbol: {
    fontSize: 8,
    fontWeight: '600',
    lineHeight: 10,
    marginTop: -1,
  },
});
