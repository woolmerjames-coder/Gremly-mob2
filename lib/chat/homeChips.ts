/**
 * The chat home's chips: a few things to ask Gremly, above the box, that
 * change with the part of the day. Morning leans to planning the day, the day
 * to thinking things through, the evening to wrapping the day up. Pure, so the
 * Chat page (AskGremlyScreen) and the shared box (CatchAllNotepad) agree.
 */

export type HomePhase = 'morning' | 'day' | 'evening';

export type HomeChipKey =
  | 'plan_day'
  | 'this_week'
  | 'think'
  | 'habits'
  | 'wrap_up'
  | 'tomorrow'
  | 'questions';

export type HomeChipIcon = 'sun' | 'calendar' | 'sparkles' | 'target' | 'moon' | 'question';

export type HomeChip = {
  key: HomeChipKey;
  label: string;
  icon: HomeChipIcon;
  /** Drawn in the evening colour (wrapping up the day) */
  evening?: boolean;
  /** Drawn in the colour of Gremly's questions, with how many wait */
  count?: number;
};

/**
 * When the evening starts: 5pm. The evening's nudges start here (the dot, the
 * line, the notification). The workers use the same hour
 * (workers/inngest-jobs/notifications/send.js). Keep the two in step.
 */
export const EVENING_START_HOUR = 17;

/** The part of the day from the minute of the day and the person's day boundary hour. */
export function homePhase(minutes: number, boundaryHour: number): HomePhase {
  const hour = Math.floor(minutes / 60);
  // before the day boundary it is still last night
  if (hour < boundaryHour) return 'evening';
  if (hour < 12) return 'morning';
  if (hour < EVENING_START_HOUR) return 'day';
  return 'evening';
}

const CHIPS: Record<HomeChipKey, HomeChip> = {
  plan_day: { key: 'plan_day', label: 'Plan my day', icon: 'sun' },
  this_week: { key: 'this_week', label: 'This week', icon: 'calendar' },
  think: { key: 'think', label: 'Think something through', icon: 'sparkles' },
  habits: { key: 'habits', label: 'My habits', icon: 'target' },
  wrap_up: { key: 'wrap_up', label: 'Wrap up today', icon: 'moon', evening: true },
  tomorrow: { key: 'tomorrow', label: 'Tomorrow', icon: 'calendar' },
  questions: { key: 'questions', label: 'Answer some Gremly questions', icon: 'question' },
};

/**
 * The chips for a part of the day. The first is the day's ritual, so the way
 * into each one is always there, whatever the hour: Plan my day in the morning
 * until today has a plan, then Wrap up today until the day is wrapped up
 * (lib/wrapup/teaser.ts, `start`), then Tomorrow. Answer some Gremly questions
 * comes before them all while it shows (data fabric stage 4f): only when one
 * needs an answer or several wait (lib/questions/askQuestions.ts).
 */
export function homeChipsFor(
  phase: HomePhase,
  day: {
    /** The wrap up can be started or picked up now */
    wrap: boolean;
    /** Today has a plan */
    planned: boolean;
    /** How many of Gremly's questions wait, when the way in shows; otherwise 0 */
    questions?: number;
  },
): HomeChip[] {
  const ritual: HomeChipKey =
    phase === 'morning' && !day.planned ? 'plan_day' : day.wrap ? 'wrap_up' : 'tomorrow';
  const rest: HomeChipKey[] =
    phase === 'morning'
      ? ['this_week', 'think']
      : phase === 'day'
        ? ['think', 'this_week']
        : ritual === 'wrap_up'
          ? ['tomorrow', 'think']
          : ['think', 'habits'];
  const chips = [ritual, ...rest].map((k) => CHIPS[k]);
  return day.questions && day.questions > 0
    ? [{ ...CHIPS.questions, count: day.questions }, ...chips]
    : chips;
}

/** What a chip sends to Gremly; null for the chips that open something instead. */
export function chipPrompt(key: HomeChipKey): string | null {
  switch (key) {
    case 'this_week':
      return "What's coming up this week?";
    case 'think':
      return 'Help me think through something';
    case 'habits':
      return 'How am I doing with my habits?';
    case 'tomorrow':
      return "What's on tomorrow?";
    default:
      return null;
  }
}
