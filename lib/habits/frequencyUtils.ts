/**
 * FREQUENCY UTILITIES - SINGLE SOURCE OF TRUTH
 *
 * All frequency parsing and display logic should use these functions.
 * This ensures consistency across:
 * - MindDrop cards (CatchAllNotepad.tsx)
 * - Today page habit rows (useWeeklyHabitStats.ts)
 * - Sweep cards (habitHelpers.ts)
 * - Overlay (UnifiedOverlayV2.tsx)
 * - Phase 2 enrichment (phase2.ts)
 *
 * CANONICAL FIELDS (source of truth):
 * - cadence: 'daily' | 'weekly' | 'monthly'
 * - target_per_period: number (e.g., 3 for "3x/week")
 *
 * DISPLAY FIELD (derived):
 * - frequency: string (e.g., "3x/week") - kept for debugging/legacy
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type Cadence = 'daily' | 'weekly' | 'monthly';

export interface FrequencyCanonical {
  cadence: Cadence;
  target_per_period: number;
}

export interface FrequencyJson {
  type: 'simple' | 'custom';
  value?: string; // For simple: 'daily', 'weekly', 'monthly'
  count?: number; // For custom: e.g., 3
  unit?: 'day' | 'week' | 'month'; // For custom: e.g., 'week'
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsing: String → Canonical
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize cadence string to valid enum value.
 * Handles variations like 'week', 'weekly', 'month', 'monthly', etc.
 */
export function normalizeCadence(cadence: string | null | undefined): Cadence {
  if (!cadence) return 'daily';
  const lower = cadence.toLowerCase().trim();

  if (lower === 'weekly' || lower === 'week') return 'weekly';
  if (lower === 'monthly' || lower === 'month') return 'monthly';
  return 'daily';
}

/**
 * Parse a frequency string into canonical fields.
 *
 * @param frequency - Human-readable string like "3x/week", "daily", "2 times a month"
 * @returns Canonical fields { cadence, target_per_period }
 *
 * @example
 * parseFrequencyString("3x/week") → { cadence: 'weekly', target_per_period: 3 }
 * parseFrequencyString("daily") → { cadence: 'daily', target_per_period: 1 }
 * parseFrequencyString("2 times a month") → { cadence: 'monthly', target_per_period: 2 }
 */
export function parseFrequencyString(frequency: string | null | undefined): FrequencyCanonical {
  if (!frequency) {
    return { cadence: 'daily', target_per_period: 1 };
  }

  const freq = frequency.toLowerCase().trim();

  // ─── Daily patterns ───
  if (
    freq === 'daily' ||
    freq === 'day' ||
    freq === 'every day' ||
    freq === 'everyday' ||
    freq === 'every night'
  ) {
    return { cadence: 'daily', target_per_period: 1 };
  }

  // ─── Weekly patterns (1x) ───
  if (
    freq === 'weekly' ||
    freq === 'week' ||
    freq === 'once a week' ||
    freq === '1x/week' ||
    freq === '1x per week' ||
    freq === '1 time a week'
  ) {
    return { cadence: 'weekly', target_per_period: 1 };
  }

  // ─── Monthly patterns (1x) ───
  if (
    freq === 'monthly' ||
    freq === 'month' ||
    freq === 'once a month' ||
    freq === '1x/month' ||
    freq === '1x per month' ||
    freq === '1 time a month'
  ) {
    return { cadence: 'monthly', target_per_period: 1 };
  }

  // ─── Nx/week patterns ───
  // Matches: "3x/week", "3x per week", "3 times a week", "3 times/week", "3x week"
  const nxWeekMatch = freq.match(
    /(\d+)\s*(?:x\s*(?:\/|per|a)?\s*|times?\s*(?:\/|per|a)?\s*)?week/i,
  );
  if (nxWeekMatch) {
    return {
      cadence: 'weekly',
      target_per_period: parseInt(nxWeekMatch[1], 10) || 1,
    };
  }

  // ─── Nx/month patterns ───
  // Matches: "2x/month", "2x per month", "2 times a month"
  const nxMonthMatch = freq.match(
    /(\d+)\s*(?:x\s*(?:\/|per|a)?\s*|times?\s*(?:\/|per|a)?\s*)?month/i,
  );
  if (nxMonthMatch) {
    return {
      cadence: 'monthly',
      target_per_period: parseInt(nxMonthMatch[1], 10) || 1,
    };
  }

  // ─── Nx/day patterns (rare) ───
  // Matches: "2x/day", "2 times a day"
  const nxDayMatch = freq.match(/(\d+)\s*(?:x\s*(?:\/|per|a)?\s*|times?\s*(?:\/|per|a)?\s*)?day/i);
  if (nxDayMatch) {
    return {
      cadence: 'daily',
      target_per_period: parseInt(nxDayMatch[1], 10) || 1,
    };
  }

  // Default to daily
  return { cadence: 'daily', target_per_period: 1 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Display: Canonical → String
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert canonical fields to a display label.
 * This is the SINGLE function all UI components should use.
 *
 * @param cadence - The cadence field from the habit
 * @param targetPerPeriod - The target_per_period field from the habit
 * @param frequencyString - Optional legacy frequency string (used as hint, not source of truth)
 * @returns Human-readable label like "3x/week", "Daily", "Weekly"
 *
 * @example
 * getFrequencyDisplayLabel('weekly', 3) → "3x/week"
 * getFrequencyDisplayLabel('daily', 1) → "Daily"
 * getFrequencyDisplayLabel('weekly', 1) → "Weekly"
 * getFrequencyDisplayLabel('monthly', 2) → "2x/month"
 */
export function getFrequencyDisplayLabel(
  cadence: string | null | undefined,
  targetPerPeriod: number | null | undefined,
  frequencyString?: string | null, // Raw frequency string from Phase 2 enrichment (e.g., "3x/week", "daily")
): string | null {
  // If frequency is 'pending', return null to hide the chip
  // This is a placeholder value used during bucket change before Phase 2 runs
  if (frequencyString === 'pending') {
    return null;
  }

  // If no cadence and no frequency string, return null to hide the chip
  // This prevents showing "Daily" as a default before Phase 2 enrichment runs
  if (!cadence && !frequencyString) {
    return null;
  }

  // If we have a raw frequency string AND no canonical cadence, use the frequency string
  // This is the case for pending drops where Phase 2 returned extracted_frequency but
  // cadence/target_per_period aren't set yet
  if (frequencyString && !cadence) {
    // Normalize common frequency strings to proper display format
    const lower = frequencyString.toLowerCase().trim();
    if (lower === 'daily' || lower === '1x/day' || lower === 'every day') return 'Daily';
    if (lower === 'weekly' || lower === '1x/week' || lower === 'every week') return 'Weekly';
    if (lower === 'monthly' || lower === '1x/month' || lower === 'every month') return 'Monthly';
    // Return the raw string if it's already formatted (e.g., "3x/week", "2x/day")
    if (frequencyString.includes('/') || frequencyString.includes('x')) {
      return frequencyString;
    }
    // Otherwise capitalize first letter
    return frequencyString.charAt(0).toUpperCase() + frequencyString.slice(1);
  }

  const normalizedCadence = normalizeCadence(cadence);
  const target = targetPerPeriod ?? 1;

  switch (normalizedCadence) {
    case 'daily':
      if (target === 1) return 'Daily';
      return `${target}x/day`;

    case 'weekly':
      if (target === 1) return 'Weekly';
      if (target === 7) return 'Daily'; // 7x/week is effectively daily
      return `${target}x/week`;

    case 'monthly':
      if (target === 1) return 'Monthly';
      return `${target}x/month`;

    default:
      return 'Daily';
  }
}

/**
 * Alternative display format with "per" instead of "/"
 * Used by Today page habit rows.
 *
 * @example
 * getFrequencyDisplayLabelLong('weekly', 3) → "3x per week"
 */
export function getFrequencyDisplayLabelLong(
  cadence: string | null | undefined,
  targetPerPeriod: number | null | undefined,
): string {
  const normalizedCadence = normalizeCadence(cadence);
  const target = targetPerPeriod ?? 1;

  switch (normalizedCadence) {
    case 'daily':
      return 'Daily';

    case 'weekly':
      if (target === 1) return 'Weekly';
      if (target === 7) return 'Daily';
      return `${target}x per week`;

    case 'monthly':
      if (target === 1) return 'Monthly';
      return `${target}x per month`;

    default:
      return 'Daily';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Overlay Conversion: Canonical ↔ FrequencyJson
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert canonical fields to FrequencyJson for overlay state.
 *
 * @example
 * canonicalToFrequencyJson('weekly', 3) → { type: 'custom', count: 3, unit: 'week' }
 * canonicalToFrequencyJson('daily', 1) → { type: 'simple', value: 'daily' }
 */
export function canonicalToFrequencyJson(
  cadence: string | null | undefined,
  targetPerPeriod: number | null | undefined,
): FrequencyJson {
  const normalizedCadence = normalizeCadence(cadence);
  const target = targetPerPeriod ?? 1;

  // Simple frequency (1x per period)
  if (target === 1) {
    return {
      type: 'simple',
      value: normalizedCadence,
    };
  }

  // Custom frequency (Nx per period)
  return {
    type: 'custom',
    count: target,
    unit:
      normalizedCadence === 'weekly' ? 'week' : normalizedCadence === 'monthly' ? 'month' : 'day',
  };
}

/**
 * Convert FrequencyJson to canonical fields for DB save.
 *
 * @example
 * frequencyJsonToCanonical({ type: 'custom', count: 3, unit: 'week' }) → { cadence: 'weekly', target_per_period: 3 }
 * frequencyJsonToCanonical({ type: 'simple', value: 'daily' }) → { cadence: 'daily', target_per_period: 1 }
 */
export function frequencyJsonToCanonical(
  frequencyJson: FrequencyJson | null | undefined,
): FrequencyCanonical {
  if (!frequencyJson) {
    return { cadence: 'daily', target_per_period: 1 };
  }

  // Simple type
  if (frequencyJson.type === 'simple') {
    const value = frequencyJson.value?.toLowerCase();
    return {
      cadence: value === 'weekly' ? 'weekly' : value === 'monthly' ? 'monthly' : 'daily',
      target_per_period: 1,
    };
  }

  // Custom type
  const unit = frequencyJson.unit;
  const count = frequencyJson.count ?? 1;

  return {
    cadence: unit === 'week' ? 'weekly' : unit === 'month' ? 'monthly' : 'daily',
    target_per_period: count,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers for Habit Objects
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get frequency display label from a habit-like object.
 * Convenience wrapper that extracts canonical fields.
 *
 * @param habit - Object with cadence and target_per_period fields
 * @returns Human-readable label
 */
export function getHabitFrequencyLabel(habit: {
  cadence?: string | null;
  target_per_period?: number | null;
  frequency?: string | null;
}): string | null {
  return getFrequencyDisplayLabel(habit.cadence, habit.target_per_period);
}

/**
 * Get frequency display label (long format) from a habit-like object.
 */
export function getHabitFrequencyLabelLong(habit: {
  cadence?: string | null;
  target_per_period?: number | null;
}): string {
  return getFrequencyDisplayLabelLong(habit.cadence, habit.target_per_period);
}
