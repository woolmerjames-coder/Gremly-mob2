/**
 * Frequency detection for habit-related content.
 *
 * This module analyzes text to detect habit frequencies like "every day",
 * "weekly", "3 times a week", etc. Used by the saveable detection system
 * to identify and classify habits.
 *
 * @example
 * ```ts
 * detectFrequency("I want to meditate every morning");
 * // => { frequency: 'daily', raw: 'every morning', confidence: 0.95, details: { timeOfDay: 'morning' } }
 *
 * detectFrequency("I'll go to the gym 3 times a week");
 * // => { frequency: 'weekly', raw: '3 times a week', confidence: 0.9, details: { count: 3 } }
 *
 * detectFrequency("Let's meet on Mondays and Wednesdays");
 * // => { frequency: 'custom', raw: 'mondays and wednesdays', confidence: 0.85, details: { days: ['monday', 'wednesday'] } }
 * ```
 */

import { HabitFrequency } from './saveableTypes';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of frequency detection from text.
 */
export interface FrequencyResult {
  /**
   * The detected frequency category.
   */
  frequency: HabitFrequency;

  /**
   * The matched text that triggered the detection.
   */
  raw: string;

  /**
   * Confidence score from 0 to 1.
   * Higher values indicate stronger pattern matches.
   */
  confidence: number;

  /**
   * Additional details extracted from the text.
   */
  details?: {
    /**
     * Numeric count, e.g., 3 for "3 times a week".
     */
    count?: number;

    /**
     * Specific days mentioned, e.g., ["monday", "wednesday"].
     */
    days?: string[];

    /**
     * Time of day if specified, e.g., "morning", "evening".
     */
    timeOfDay?: string;
  };
}

// ============================================================================
// Pattern Definitions
// ============================================================================

/**
 * Patterns for daily frequency.
 * Matches: every day, every morning, every evening, every night, daily, each day
 */
export const DAILY_PATTERNS: RegExp[] = [
  /\bevery\s+(?:single\s+)?day\b/i,
  /\bevery\s+morning\b/i,
  /\bevery\s+evening\b/i,
  /\bevery\s+night\b/i,
  /\bdaily\b/i,
  /\beach\s+day\b/i,
  /\beach\s+morning\b/i,
  /\beach\s+evening\b/i,
  /\beach\s+night\b/i,
  /\bonce\s+a\s+day\b/i,
  /\bonce\s+daily\b/i,
  /\beveryday\b/i,
];

/**
 * Patterns for weekly frequency.
 * Matches: every week, weekly, once a week, twice a week, X times a week
 */
export const WEEKLY_PATTERNS: RegExp[] = [
  /\b(\d+)\s+times?\s+(?:a|per)\s+week\b/i,
  /\btwice\s+(?:a|per)\s+week\b/i,
  /\bonce\s+(?:a|per)\s+week\b/i,
  /\bevery\s+week\b/i,
  /\bweekly\b/i,
  /\beach\s+week\b/i,
];

/**
 * Patterns for weekday frequency.
 * Matches: weekdays, monday through friday, every weekday, on work days
 */
export const WEEKDAY_PATTERNS: RegExp[] = [
  /\bweekdays?\b/i,
  /\bmonday\s+(?:through|thru|to)\s+friday\b/i,
  /\bmon(?:day)?\s*[-–—]\s*fri(?:day)?\b/i,
  /\bevery\s+weekday\b/i,
  /\bon\s+work\s*days?\b/i,
  /\bwork\s*days?\s+only\b/i,
  /\bduring\s+the\s+week\b/i,
];

/**
 * Patterns for weekend frequency.
 * Matches: weekends, saturday and sunday, on the weekend
 */
export const WEEKEND_PATTERNS: RegExp[] = [
  /\bweekends?\b/i,
  /\bsaturday\s+(?:and|&)\s+sunday\b/i,
  /\bsat(?:urday)?\s*(?:and|&)\s*sun(?:day)?\b/i,
  /\bon\s+(?:the\s+)?weekends?\b/i,
  /\bevery\s+weekend\b/i,
];

/**
 * Patterns for specific days.
 * Matches: every monday, every tuesday, mondays, tuesdays, etc.
 */
export const SPECIFIC_DAY_PATTERNS: RegExp[] = [
  /\bevery\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\bon\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/i,
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s\b/i,
  /\beach\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
];

/**
 * Pattern to extract multiple day names from text.
 */
export const MULTI_DAY_PATTERN =
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:s)?\b/gi;

/**
 * Patterns for monthly frequency.
 * Matches: every month, monthly, once a month
 */
export const MONTHLY_PATTERNS: RegExp[] = [
  /\bevery\s+month\b/i,
  /\bmonthly\b/i,
  /\bonce\s+(?:a|per)\s+month\b/i,
  /\beach\s+month\b/i,
  /\b(\d+)\s+times?\s+(?:a|per)\s+month\b/i,
];

/**
 * Patterns for custom/complex frequencies.
 * Matches: every X days, every X weeks, twice daily, every other day
 */
export const CUSTOM_PATTERNS: RegExp[] = [
  /\bevery\s+(\d+)\s+days?\b/i,
  /\bevery\s+(\d+)\s+weeks?\b/i,
  /\bevery\s+other\s+day\b/i,
  /\btwice\s+(?:a\s+)?daily\b/i,
  /\b(\d+)\s+times?\s+(?:a|per)\s+day\b/i,
  /\balternate\s+days?\b/i,
  /\bevery\s+few\s+days?\b/i,
  /\bbiweekly\b/i,
  /\bbi-weekly\b/i,
  /\bfortnightly\b/i,
];

/**
 * Patterns to detect time of day.
 */
const TIME_OF_DAY_PATTERNS: Array<{ pattern: RegExp; timeOfDay: string }> = [
  { pattern: /\b(?:in\s+the\s+)?morning\b/i, timeOfDay: 'morning' },
  { pattern: /\b(?:in\s+the\s+)?afternoon\b/i, timeOfDay: 'afternoon' },
  { pattern: /\b(?:in\s+the\s+)?evening\b/i, timeOfDay: 'evening' },
  { pattern: /\b(?:at\s+)?night\b/i, timeOfDay: 'night' },
  { pattern: /\bbefore\s+bed\b/i, timeOfDay: 'night' },
  { pattern: /\bfirst\s+thing\b/i, timeOfDay: 'morning' },
  { pattern: /\bwhen\s+(?:i\s+)?wake\s+up\b/i, timeOfDay: 'morning' },
  { pattern: /\bbefore\s+(?:i\s+)?sleep\b/i, timeOfDay: 'night' },
];

/**
 * Quick patterns to check if text likely contains frequency info.
 */
const FREQUENCY_INDICATOR_PATTERNS: RegExp[] = [
  /\bevery\b/i,
  /\bdaily\b/i,
  /\bweekly\b/i,
  /\bmonthly\b/i,
  /\bweekday/i,
  /\bweekend/i,
  /\btimes?\s+(?:a|per)\b/i,
  /\bonce\s+(?:a|per)\b/i,
  /\btwice\b/i,
  /\beach\s+(?:day|week|month|morning|evening|night)\b/i,
  /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/i,
  /\bregularly\b/i,
  /\broutine\b/i,
  /\bhabit\b/i,
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract time of day from text.
 *
 * @param text - Text to analyze
 * @returns Time of day string or null if not detected
 *
 * @example
 * extractTimeOfDay("I want to meditate every morning");
 * // => "morning"
 *
 * extractTimeOfDay("Read before bed");
 * // => "night"
 */
export function extractTimeOfDay(text: string): string | null {
  for (const { pattern, timeOfDay } of TIME_OF_DAY_PATTERNS) {
    if (pattern.test(text)) {
      return timeOfDay;
    }
  }
  return null;
}

/**
 * Quick check if text likely contains frequency information.
 *
 * Use this for early filtering before running full detection.
 *
 * @param text - Text to check
 * @returns True if text likely contains frequency info
 *
 * @example
 * hasFrequencyIndicator("I want to exercise every day");
 * // => true
 *
 * hasFrequencyIndicator("What's for dinner?");
 * // => false
 */
export function hasFrequencyIndicator(text: string): boolean {
  return FREQUENCY_INDICATOR_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Extract all day names from text.
 *
 * @param text - Text to analyze
 * @returns Array of lowercase day names
 */
function extractDays(text: string): string[] {
  const matches = text.match(MULTI_DAY_PATTERN);
  if (!matches) return [];

  // Dedupe and lowercase
  const days = [...new Set(matches.map((d) => d.toLowerCase().replace(/s$/, '')))];
  return days;
}

/**
 * Extract a number from a regex match.
 *
 * @param match - Regex match result
 * @returns Extracted number or undefined
 */
function extractNumber(match: RegExpMatchArray): number | undefined {
  // Check capture groups for numbers
  for (let i = 1; i < match.length; i++) {
    const num = parseInt(match[i], 10);
    if (!isNaN(num)) return num;
  }
  return undefined;
}

/**
 * Try to match text against a pattern array.
 *
 * @param text - Text to match
 * @param patterns - Array of patterns to try
 * @returns Match result or null
 */
function tryMatch(text: string, patterns: RegExp[]): RegExpMatchArray | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match;
  }
  return null;
}

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * Detect habit frequency from text.
 *
 * Analyzes text to identify frequency patterns and returns structured
 * information about the detected frequency.
 *
 * @param text - Text to analyze
 * @returns FrequencyResult or null if no frequency detected
 *
 * @example
 * detectFrequency("I want to meditate every morning");
 * // => {
 * //   frequency: 'daily',
 * //   raw: 'every morning',
 * //   confidence: 0.95,
 * //   details: { timeOfDay: 'morning' }
 * // }
 *
 * @example
 * detectFrequency("I'll go to the gym 3 times a week");
 * // => {
 * //   frequency: 'weekly',
 * //   raw: '3 times a week',
 * //   confidence: 0.9,
 * //   details: { count: 3 }
 * // }
 */
export function detectFrequency(text: string): FrequencyResult | null {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const normalizedText = text.toLowerCase();
  const timeOfDay = extractTimeOfDay(text);
  const days = extractDays(text);

  // Check patterns in order of specificity

  // 1. Custom patterns (most specific)
  let match = tryMatch(normalizedText, CUSTOM_PATTERNS);
  if (match) {
    const count = extractNumber(match);
    const details: FrequencyResult['details'] = {};

    if (count !== undefined) details.count = count;
    if (timeOfDay) details.timeOfDay = timeOfDay;

    // Special case: "twice daily" or "X times a day" is actually daily variant
    if (/times?\s+(?:a|per)\s+day|twice\s+(?:a\s+)?daily/i.test(match[0])) {
      return {
        frequency: 'daily',
        raw: match[0],
        confidence: 0.9,
        details: Object.keys(details).length > 0 ? details : undefined,
      };
    }

    return {
      frequency: 'custom',
      raw: match[0],
      confidence: 0.85,
      details: Object.keys(details).length > 0 ? details : undefined,
    };
  }

  // 2. Weekday patterns
  match = tryMatch(normalizedText, WEEKDAY_PATTERNS);
  if (match) {
    return {
      frequency: 'weekdays',
      raw: match[0],
      confidence: 0.95,
      details: timeOfDay ? { timeOfDay } : undefined,
    };
  }

  // 3. Weekend patterns
  match = tryMatch(normalizedText, WEEKEND_PATTERNS);
  if (match) {
    return {
      frequency: 'weekends',
      raw: match[0],
      confidence: 0.95,
      details: timeOfDay ? { timeOfDay } : undefined,
    };
  }

  // 4. Monthly patterns
  match = tryMatch(normalizedText, MONTHLY_PATTERNS);
  if (match) {
    const count = extractNumber(match);
    return {
      frequency: 'monthly',
      raw: match[0],
      confidence: 0.9,
      details: count !== undefined ? { count } : undefined,
    };
  }

  // 5. Specific day patterns (before weekly, since "every Monday" is more specific)
  match = tryMatch(normalizedText, SPECIFIC_DAY_PATTERNS);
  if (match) {
    // If multiple days mentioned, treat as custom
    if (days.length > 1) {
      return {
        frequency: 'custom',
        raw: days.join(' and '),
        confidence: 0.85,
        details: { days, timeOfDay: timeOfDay || undefined },
      };
    }

    // Single day is effectively weekly
    return {
      frequency: 'weekly',
      raw: match[0],
      confidence: 0.9,
      details: { days, timeOfDay: timeOfDay || undefined },
    };
  }

  // 6. Weekly patterns
  match = tryMatch(normalizedText, WEEKLY_PATTERNS);
  if (match) {
    const count = extractNumber(match);
    const details: FrequencyResult['details'] = {};

    if (count !== undefined) details.count = count;
    if (timeOfDay) details.timeOfDay = timeOfDay;
    if (days.length > 0) details.days = days;

    // "twice a week" is count 2
    if (/twice\s+(?:a|per)\s+week/i.test(match[0])) {
      details.count = 2;
    }

    return {
      frequency: 'weekly',
      raw: match[0],
      confidence: 0.9,
      details: Object.keys(details).length > 0 ? details : undefined,
    };
  }

  // 7. Daily patterns (most common, check last)
  match = tryMatch(normalizedText, DAILY_PATTERNS);
  if (match) {
    return {
      frequency: 'daily',
      raw: match[0],
      confidence: 0.95,
      details: timeOfDay ? { timeOfDay } : undefined,
    };
  }

  // 8. Check for multiple days mentioned without explicit frequency
  if (days.length >= 2) {
    return {
      frequency: 'custom',
      raw: days.join(' and '),
      confidence: 0.7,
      details: { days, timeOfDay: timeOfDay || undefined },
    };
  }

  return null;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get a human-readable description of a frequency.
 *
 * @param frequency - The frequency to describe
 * @param details - Optional details for more specific description
 * @returns Human-readable string
 */
export function describeFrequency(
  frequency: HabitFrequency,
  details?: FrequencyResult['details'],
): string {
  if (frequency === null) return 'No frequency';

  switch (frequency) {
    case 'daily':
      if (details?.timeOfDay) {
        return `Every ${details.timeOfDay}`;
      }
      if (details?.count && details.count > 1) {
        return `${details.count} times a day`;
      }
      return 'Daily';

    case 'weekly':
      if (details?.days?.length) {
        const capitalizedDays = details.days.map((d) => d.charAt(0).toUpperCase() + d.slice(1));
        return `Every ${capitalizedDays.join(', ')}`;
      }
      if (details?.count === 1) {
        return 'Once a week';
      }
      if (details?.count) {
        return `${details.count} times a week`;
      }
      return 'Weekly';

    case 'weekdays':
      return 'Weekdays';

    case 'weekends':
      return 'Weekends';

    case 'monthly':
      if (details?.count && details.count > 1) {
        return `${details.count} times a month`;
      }
      return 'Monthly';

    case 'custom':
      if (details?.days?.length) {
        const capitalizedDays = details.days.map((d) => d.charAt(0).toUpperCase() + d.slice(1));
        return capitalizedDays.join(' & ');
      }
      return 'Custom schedule';

    default:
      return 'Custom';
  }
}
