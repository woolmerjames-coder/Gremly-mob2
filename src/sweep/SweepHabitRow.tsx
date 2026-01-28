/**
 * SweepHabitRow - Wrapper component for habit rows in Evening Sweep
 *
 * Renders either SweepBuildHabitRow (swipe track) or SweepBreakHabitRow (hold circle)
 * based on the isBreakHabit prop.
 *
 * This provides backwards compatibility for existing code that imports SweepHabitRow.
 */

import React from 'react';
import { SweepBuildHabitRow } from '../../components/sweep/SweepBuildHabitRow';
import { SweepBreakHabitRow } from './SweepBreakHabitRow';

export interface SweepHabitRowProps {
  id: string;
  name: string;
  cadence: 'daily' | 'weekly' | 'monthly';

  // For daily habits: streak count
  streakDays?: number;

  // For weekly/monthly habits: progress toward target
  completedThisPeriod?: number;
  targetPerPeriod?: number;

  // True if habit has met/exceeded target for the period (weekly/monthly)
  isAheadOfTarget?: boolean;

  // Frequency display text (e.g., "Every day", "3x per week")
  frequencyLabel: string | null;

  // Is this habit visually completed? (controlled by parent)
  isCompleted: boolean;

  // Toggle callback - notifies parent of state change (doesn't commit to DB)
  onToggle: (id: string, completed: boolean) => void;

  // Show divider below?
  showDivider?: boolean;

  // NEW: True if this is a break habit (renders circle UI instead of track)
  isBreakHabit?: boolean;

  // NEW: Last time user completed this habit - ISO date (for "Last: X days ago")
  lastCompletedAt?: string | null;
}

export function SweepHabitRow(props: SweepHabitRowProps) {
  const { isBreakHabit = false, ...restProps } = props;

  if (isBreakHabit) {
    return <SweepBreakHabitRow {...restProps} />;
  }

  return <SweepBuildHabitRow {...restProps} />;
}

export default SweepHabitRow;
