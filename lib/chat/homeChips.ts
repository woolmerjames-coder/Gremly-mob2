/**
 * The chat home's chips: a few things to ask Gremly, above the box, that
 * change with the part of the day. Morning leans to planning the day, the day
 * to thinking things through, the evening to wrapping the day up. Pure, so the
 * Chat page (AskGremlyScreen) and the shared box (CatchAllNotepad) agree.
 */

export type HomePhase = 'morning' | 'day' | 'evening';

export type HomeChipKey = 'plan_day' | 'this_week' | 'think' | 'habits' | 'wrap_up' | 'tomorrow';

export type HomeChipIcon = 'sun' | 'calendar' | 'sparkles' | 'target' | 'moon';

export type HomeChip = {
  key: HomeChipKey;
  label: string;
  icon: HomeChipIcon;
  /** Drawn in the evening colour (wrapping up the day) */
  evening?: boolean;
};

/** The part of the day from the minute of the day and the person's day boundary hour. */
export function homePhase(minutes: number, boundaryHour: number): HomePhase {
  const hour = Math.floor(minutes / 60);
  // before the day boundary it is still last night
  if (hour < boundaryHour) return 'evening';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'day';
  return 'evening';
}

const CHIPS: Record<HomeChipKey, HomeChip> = {
  plan_day: { key: 'plan_day', label: 'Plan my day', icon: 'sun' },
  this_week: { key: 'this_week', label: 'This week', icon: 'calendar' },
  think: { key: 'think', label: 'Think something through', icon: 'sparkles' },
  habits: { key: 'habits', label: 'My habits', icon: 'target' },
  wrap_up: { key: 'wrap_up', label: 'Wrap up today', icon: 'moon', evening: true },
  tomorrow: { key: 'tomorrow', label: 'Tomorrow', icon: 'calendar' },
};

/**
 * The chips for a part of the day. Wrap up today shows in the evening only
 * when something is waiting for a decision.
 */
export function homeChipsFor(phase: HomePhase, toDecide: number): HomeChip[] {
  const keys: HomeChipKey[] =
    phase === 'morning'
      ? ['plan_day', 'this_week', 'think']
      : phase === 'day'
        ? ['think', 'this_week', 'habits']
        : toDecide > 0
          ? ['wrap_up', 'tomorrow', 'think']
          : ['tomorrow', 'think', 'habits'];
  return keys.map((k) => CHIPS[k]);
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
