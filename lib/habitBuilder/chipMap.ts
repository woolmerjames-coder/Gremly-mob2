/**
 * Habit Builder Chip Map
 *
 * Maps the server-computed `next_field` value to tappable chip options.
 * These are deterministic — no AI involvement. The server tells us which
 * field is being asked about, and we show the relevant quick-select options.
 */

export interface ChipConfig {
  chips: string[];
  /** If true, tapping a chip sends it as a message. If false, it's a local action. */
  sendsMessage: boolean;
}

/**
 * Get chip options for the current next_field.
 * Returns null if no chips should be shown (e.g., for name or habit_type,
 * which are better answered in natural language).
 */
export function getChipsForField(nextField: string | null): ChipConfig | null {
  if (!nextField) return null;

  switch (nextField) {
    case 'cadence':
      return {
        chips: ['Every day', 'A few times a week', 'Once a week'],
        sendsMessage: true,
      };

    case 'target':
      // Target is usually inferred from cadence server-side.
      // If it shows up as next_field, the cadence is probably weekly
      // and we need specifics.
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

/**
 * Optional time window chips — shown after all required fields
 * are resolved but before confirmation, IF the AI asks about timing.
 * The screen can check for keywords in the AI response to decide.
 */
export const TIME_WINDOW_CHIPS: ChipConfig = {
  chips: ['Morning', 'Afternoon', 'Evening', 'Anytime'],
  sendsMessage: true,
};
