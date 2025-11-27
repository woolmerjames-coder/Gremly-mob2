/**
 * Frequency Builder Helpers
 * Maps between UI selections and the frequency_json storage format
 */

export type FrequencyMode = 'simple' | 'days' | 'custom';

export type SimpleFrequency = 'daily' | 'weekly' | 'monthly';

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // Sunday = 0, Monday = 1, etc.

export type CustomFrequency = {
  count: number;
  unit: 'day' | 'week' | 'month';
};

export type FrequencyConfig =
  | { mode: 'simple'; value: SimpleFrequency }
  | { mode: 'days'; days: DayOfWeek[] }
  | { mode: 'custom'; value: CustomFrequency };

/**
 * Converts FrequencyConfig to frequency_json storage format
 */
export function frequencyToJson(config: FrequencyConfig): any {
  switch (config.mode) {
    case 'simple':
      return { type: 'simple', value: config.value };
    case 'days':
      return { type: 'days', days: config.days };
    case 'custom':
      return { type: 'custom', count: config.value.count, unit: config.value.unit };
  }
}

/**
 * Converts frequency_json storage format to FrequencyConfig
 */
export function jsonToFrequency(json: any): FrequencyConfig {
  if (!json || typeof json !== 'object') {
    // Default to daily
    return { mode: 'simple', value: 'daily' };
  }

  if (json.type === 'simple') {
    return { mode: 'simple', value: json.value || 'daily' };
  }

  if (json.type === 'days' && Array.isArray(json.days)) {
    return { mode: 'days', days: json.days };
  }

  if (json.type === 'custom') {
    return {
      mode: 'custom',
      value: {
        count: json.count || 1,
        unit: json.unit || 'day',
      },
    };
  }

  // Fallback
  return { mode: 'simple', value: 'daily' };
}

/**
 * Converts FrequencyConfig to frequency string (for backward compatibility)
 */
export function frequencyToString(config: FrequencyConfig): string {
  switch (config.mode) {
    case 'simple':
      return config.value;
    case 'days':
      return 'custom';
    case 'custom':
      return 'custom';
  }
}

/**
 * Generates human-readable label from FrequencyConfig
 */
export function getFrequencyLabel(config: FrequencyConfig): string {
  switch (config.mode) {
    case 'simple':
      return config.value.charAt(0).toUpperCase() + config.value.slice(1);

    case 'days': {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const sortedDays = [...config.days].sort((a, b) => a - b);

      // Check for daily (all 7 days)
      if (sortedDays.length === 7) {
        return 'Daily';
      }

      // Check for weekdays (Mon-Fri)
      const weekdays = [1, 2, 3, 4, 5];
      if (sortedDays.length === 5 && sortedDays.every((d, i) => d === weekdays[i])) {
        return 'Weekdays';
      }

      // Check for weekends (Sat, Sun)
      const weekends = [0, 6];
      if (sortedDays.length === 2 && sortedDays.every((d, i) => d === weekends[i])) {
        return 'Weekends';
      }

      // Show day abbreviations
      return sortedDays.map((d) => dayNames[d]).join(', ');
    }

    case 'custom': {
      const { count, unit } = config.value;
      const unitLabel = unit === 'day' ? 'day' : unit === 'week' ? 'week' : 'month';
      return `${count}x/${unitLabel}`;
    }
  }
}

/**
 * Day of week labels for UI
 */
export const DAY_LABELS = [
  { day: 1 as DayOfWeek, short: 'M', long: 'Monday' },
  { day: 2 as DayOfWeek, short: 'T', long: 'Tuesday' },
  { day: 3 as DayOfWeek, short: 'W', long: 'Wednesday' },
  { day: 4 as DayOfWeek, short: 'T', long: 'Thursday' },
  { day: 5 as DayOfWeek, short: 'F', long: 'Friday' },
  { day: 6 as DayOfWeek, short: 'S', long: 'Saturday' },
  { day: 0 as DayOfWeek, short: 'S', long: 'Sunday' },
];
