import { parseDue } from './entities/datetime';

export interface TodoFieldResult {
  title: string;
  due?: string;
  dueDay?: string; // YYYY-MM-DD date component only
  dueTime?: string; // HH:MM time component, only if explicitly provided
  removedDue: boolean;
  inferredDue?: string;
  explicitTime: boolean; // true if user explicitly specified a time
}

export interface TodoFieldOptions {
  /**
   * When true (default), attempt to infer due date from the source text if none provided explicitly.
   */
  inferDueFromText?: boolean;
}

export function tidyWhitespace(text: string): string {
  return text
    .replace(/[\s\u00A0]+/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/\s+\./g, '.')
    .replace(/\s+\?/g, '?')
    .replace(/\s+!/g, '!')
    .replace(/\s+: /g, ': ')
    .replace(/\s+;/g, ';')
    .trim();
}

export function finalizeTitle(
  text: string,
  opts: { removeLeadingPreposition?: boolean } = {},
): string {
  let cleaned = tidyWhitespace(text);

  if (opts.removeLeadingPreposition && cleaned) {
    cleaned = cleaned.replace(/^(for|on|by|at|due)\b[, ]*/i, '').trim();
    if (/^[a-z]/.test(cleaned)) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
  }

  return cleaned;
}

export function buildTodoFields(
  source: string,
  existingDue?: string | null,
  options: TodoFieldOptions = {},
): TodoFieldResult {
  const { inferDueFromText = true } = options;
  const parsed = parseDue(source);
  const hasParsedText = Boolean(
    parsed && parsed.textWithoutWhen && parsed.textWithoutWhen !== source,
  );
  const dueFromText =
    inferDueFromText && parsed && parsed.confidence >= 0.7 ? parsed.iso : undefined;
  const due = existingDue ?? dueFromText ?? undefined;
  const baseText = hasParsedText && parsed ? parsed.textWithoutWhen : source;
  const title = finalizeTitle(baseText || source, { removeLeadingPreposition: hasParsedText });

  // Extract date and time components from parsed result
  const explicitTime = parsed?.explicitTime ?? false;
  const dueDay = parsed?.date ?? undefined;
  // Only set dueTime if user explicitly provided a time
  const dueTime = explicitTime && parsed?.time ? parsed.time : undefined;

  return {
    title: title || 'Untitled',
    due,
    dueDay,
    dueTime,
    removedDue: hasParsedText,
    inferredDue: dueFromText,
    explicitTime,
  };
}

export interface HabitFieldResult {
  name: string;
  freq: 'daily' | 'weekly' | 'custom';
  frequencyValue?: number;
  frequencyDays?: string[];
  removedCadence: boolean;
}

// Day name mappings for parsing
const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_ABBREVS: Record<string, string> = {
  mon: 'monday',
  tue: 'tuesday',
  tues: 'tuesday',
  wed: 'wednesday',
  thu: 'thursday',
  thur: 'thursday',
  thurs: 'thursday',
  fri: 'friday',
  sat: 'saturday',
  sun: 'sunday',
};

// Word-to-number mappings
const WORD_TO_NUMBER: Record<string, number> = {
  once: 1,
  twice: 2,
  thrice: 3,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
};

/**
 * Extract frequency value from text (e.g., "3x per week" → 3)
 */
function extractFrequencyValue(text: string): number | null {
  const lower = text.toLowerCase();

  // Match "Nx per/a week/day/month" or "N times per/a week/day/month"
  const nxMatch = lower.match(/\b(\d+)\s*x?\s*(times?)?\s*(a|per)\s+(week|day|month)\b/i);
  if (nxMatch) {
    return parseInt(nxMatch[1], 10);
  }

  // Match "twice/thrice a day/week"
  const wordMatch = lower.match(/\b(once|twice|thrice)\s+(a|per)\s+(day|week|month)\b/i);
  if (wordMatch) {
    return WORD_TO_NUMBER[wordMatch[1]] ?? null;
  }

  // Match "twice daily", "three times daily"
  const dailyMatch = lower.match(
    /\b(once|twice|thrice|one|two|three|four|five|six|seven|\d+)\s*(times?)?\s*daily\b/i,
  );
  if (dailyMatch) {
    const val = dailyMatch[1];
    return WORD_TO_NUMBER[val] ?? (parseInt(val, 10) || null);
  }

  // Match "twice weekly", "three times weekly"
  const weeklyMatch = lower.match(
    /\b(once|twice|thrice|one|two|three|four|five|six|seven|\d+)\s*(times?)?\s*weekly\b/i,
  );
  if (weeklyMatch) {
    const val = weeklyMatch[1];
    return WORD_TO_NUMBER[val] ?? (parseInt(val, 10) || null);
  }

  return null;
}

/**
 * Extract specific days from text (e.g., "every Monday Wednesday Friday" → ['monday', 'wednesday', 'friday'])
 */
function extractFrequencyDays(text: string): string[] | null {
  const lower = text.toLowerCase();
  const days: string[] = [];

  // Check for full day names
  for (const day of DAY_NAMES) {
    if (lower.includes(day)) {
      days.push(day);
    }
  }

  // Check for abbreviations (only if not already found as full name)
  for (const [abbrev, fullDay] of Object.entries(DAY_ABBREVS)) {
    // Match abbreviation as a word boundary
    const regex = new RegExp(`\\b${abbrev}\\b`, 'i');
    if (regex.test(lower) && !days.includes(fullDay)) {
      days.push(fullDay);
    }
  }

  // Sort by day order
  days.sort((a, b) => DAY_NAMES.indexOf(a) - DAY_NAMES.indexOf(b));

  return days.length > 0 ? days : null;
}

/**
 * Detect "every other day" or "alternate days" pattern
 */
function isEveryOtherDay(text: string): boolean {
  const lower = text.toLowerCase();
  return /\b(every\s+other\s+day|alternate\s+days?|every\s+2(nd)?\s+day)\b/i.test(lower);
}

export function buildHabitFields(
  source: string,
  existingFreq?: 'daily' | 'weekly' | 'custom' | null,
): HabitFieldResult {
  const lower = source.toLowerCase();
  let freq = existingFreq ?? null;
  let frequencyValue: number | null = null;
  let frequencyDays: string[] | null = null;

  // Extract frequency value first (before determining freq type)
  frequencyValue = extractFrequencyValue(source);

  // Extract specific days
  frequencyDays = extractFrequencyDays(source);

  if (!freq) {
    // Check for "every other day" pattern → custom frequency
    if (isEveryOtherDay(lower)) {
      freq = 'custom';
      frequencyValue = frequencyValue ?? 1; // Once every other day
    }
    // Weekly patterns
    else if (
      /(every|each)\s+week\b/.test(lower) ||
      /weekly\b/.test(lower) ||
      /every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/.test(lower) ||
      /\b\d+\s*x?\s*(times?)?\s*(a|per)\s+week\b/i.test(lower) ||
      /\b(once|twice|thrice)\s+(a|per)\s+week\b/i.test(lower) ||
      /\b(once|twice|thrice|one|two|three|four|five|six|seven|\d+)\s*(times?)?\s*weekly\b/i.test(
        lower,
      ) ||
      (frequencyDays && frequencyDays.length > 0) // Has specific days → weekly
    ) {
      freq = 'weekly';
    }
    // Monthly patterns
    else if (/(monthly|every\s+month)/.test(lower)) {
      freq = 'custom';
    }
    // Daily patterns
    else if (
      /(daily|every\s+day|each\s+day|per\s+day|a\s+day|every\s+(morning|evening|night))/.test(
        lower,
      ) ||
      /\b(once|twice|thrice)\s+(a|per)\s+day\b/i.test(lower) ||
      /\b(once|twice|thrice|one|two|three|four|five|six|seven|\d+)\s*(times?)?\s*daily\b/i.test(
        lower,
      ) ||
      /\b\d+\s*x?\s*(times?)?\s*(a|per)\s+day\b/i.test(lower)
    ) {
      freq = 'daily';
    }
  }

  if (freq && freq !== 'daily' && freq !== 'weekly' && freq !== 'custom') {
    freq = 'custom';
  }

  const parsed = parseDue(source);
  const base = parsed && parsed.textWithoutWhen ? parsed.textWithoutWhen : source;

  // Clean cadence phrases from the name
  const cleanedBase = base
    .replace(/\b(daily)\b/gi, '')
    .replace(/\bper\s+day\b/gi, '')
    .replace(/\ba\s+day\b/gi, '')
    .replace(/\b(each|every)\s+day\b/gi, '')
    .replace(/\b(each|every)\s+(morning|evening|night)\b/gi, '')
    .replace(/\b(each|every)\s+week\b/gi, '')
    .replace(/\bweekly\b/gi, '')
    .replace(/\b\d+\s*x?\s*(times?)?\s*(a|per)\s+(week|day|month)\b/gi, '')
    .replace(/\b(once|twice|thrice)\s+(a|per)\s+(day|week|month)\b/gi, '')
    .replace(
      /\b(once|twice|thrice|one|two|three|four|five|six|seven|\d+)\s*(times?)?\s*(daily|weekly)\b/gi,
      '',
    )
    .replace(/\bevery\s+other\s+day\b/gi, '')
    .replace(/\balternate\s+days?\b/gi, '')
    .replace(
      /\bevery\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)(\s+(and|,)\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday))*/gi,
      '',
    )
    .trim();

  const name =
    finalizeTitle(cleanedBase || source, { removeLeadingPreposition: false }) || 'Untitled';
  const removedCadence = cleanedBase !== base;

  const result: HabitFieldResult = {
    name,
    freq: freq ?? 'daily',
    removedCadence,
  };

  // Only include optional fields if they have values
  if (frequencyValue !== null) {
    result.frequencyValue = frequencyValue;
  }
  if (frequencyDays !== null) {
    result.frequencyDays = frequencyDays;
  }

  return result;
}
