/**
 * Habit Builder Chip Map
 *
 * Context-aware chip selection. Uses server-computed `next_field` as the
 * primary signal, but also scans the AI's response for keywords to detect
 * when it's asking about optional fields (time_window, days) so chips
 * match what the AI is actually asking.
 */

export interface ChipConfig {
  chips: string[];
  /** If true, tapping a chip sends it as a message. If false, it's a local action. */
  sendsMessage: boolean;
}

// Only match when the AI is ASKING about time preference, not just mentioning a time
const TIME_KEYWORDS = [
  'time of day in mind',
  'particular time of day',
  'specific time of day',
  'what time of day',
  'morning or evening',
  'evening or morning',
  'morning, afternoon, or evening',
  'tie it to a specific time',
  'tie your',
  'when during the day',
  'prefer to do this',
  'prefer to do it',
];

const DAY_KEYWORDS = [
  'which days of the week',
  'specific days of the week',
  'certain days of the week',
  'what days would',
  'what days do',
  'every day or certain days',
  'every day or just',
];

const CONFIRM_KEYWORDS = [
  "here's what i've got",
  "here's what i have",
  "here's your habit",
  'want to lock this in',
  'ready to lock',
  'tweak anything',
  'sound right',
  'look right',
  'good to go',
];

const START_KEYWORDS = [
  'when do you want to start',
  'when would you like to start',
  'when do you want to begin',
  'when would you like to begin',
  'want to start tracking',
  'want to begin tracking',
  'ready to start',
];

/**
 * Get chip options based on conversation context.
 *
 * Priority:
 * 1. Detect confirmation card in AI response → confirm chips
 * 2. Detect time-of-day question in AI response → time chips
 * 3. Detect specific-days question in AI response → day chips
 * 4. Detect start-date question in AI response → start date chips
 * 5. Fall back to next_field for required fields (cadence, target)
 * 6. Return null for name/habit_type (better answered in natural language)
 */
export function getChipsForField(
  nextField: string | null,
  aiResponse?: string,
): ChipConfig | null {
  const lower = (aiResponse || '').toLowerCase();

  // 1. Confirmation card detected
  if (CONFIRM_KEYWORDS.some((k) => lower.includes(k))) {
    return {
      chips: ['Lock it in ✓', 'Let me tweak something'],
      sendsMessage: true,
    };
  }

  // 2. AI is asking about time of day
  if (TIME_KEYWORDS.some((k) => lower.includes(k))) {
    return {
      chips: ['Morning', 'Evening', 'Anytime'],
      sendsMessage: true,
    };
  }

  // 3. AI is asking about specific days
  if (DAY_KEYWORDS.some((k) => lower.includes(k))) {
    return {
      chips: ['Weekdays', 'Mon / Wed / Fri', 'Pick my own'],
      sendsMessage: true,
    };
  }

  // 4. AI is asking about start date
  if (START_KEYWORDS.some((k) => lower.includes(k))) {
    return {
      chips: ['Today', 'Tomorrow', 'Next Monday'],
      sendsMessage: true,
    };
  }

  // 5. Fall back to next_field for required fields
  if (!nextField) return null;

  switch (nextField) {
    case 'cadence':
      return {
        chips: ['Every day', 'A few times a week', 'Once a week'],
        sendsMessage: true,
      };

    case 'target':
      return {
        chips: ['2x per week', '3x per week', '4x per week', '5x per week'],
        sendsMessage: true,
      };

    case 'start_date':
      return {
        chips: ['Today', 'Tomorrow', 'Next Monday'],
        sendsMessage: true,
      };

    case 'confirm':
      return {
        chips: ['Lock it in ✓', 'Let me tweak something'],
        sendsMessage: true,
      };

    // Fields better answered in natural language — no chips
    case 'name':
    case 'habit_type':
      return null;

    default:
      return null;
  }
}
