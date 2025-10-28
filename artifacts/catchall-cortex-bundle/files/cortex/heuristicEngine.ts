import type { ICortexEngine, CortexInput, CortexOutput } from './ICortexEngine';

// ultra-light rules for Phase 3 to unblock UI/tests.
// Never auto-assign "today" here — just suggest type and rationale.
const HABIT_WORDS = [
  'every day',
  'daily',
  'each morning',
  'every week',
  'weekly',
  'monthly',
  'habit:',
];
const TODO_WORDS = ['todo:', 'to-do:', 'buy ', 'call ', 'email ', 'book ', 'schedule '];
const JOURNAL_WORDS = ['journal:', 'diary:', 'reflection:'];
const LIST_MARKERS = ['- ', '* '];

const containsAny = (s: string, arr: string[]) => arr.some((w) => s.includes(w));

export class HeuristicEngine implements ICortexEngine {
  async classify({ text }: CortexInput): Promise<CortexOutput> {
    const DEBUG = (process.env.EXPO_PUBLIC_DEBUG_CORTEX ?? 'false') === 'true';
    const logPayload: CortexInput = { text };
    if (DEBUG) console.log('[CORTEX][HEURISTIC] classify input:', logPayload);

    const t = text.trim().toLowerCase();

    // Habit detection
    if (containsAny(t, HABIT_WORDS)) {
      let frequency: 'daily' | 'weekly' | 'monthly' = 'daily';
      if (t.includes('weekly')) frequency = 'weekly';
      if (t.includes('monthly')) frequency = 'monthly';
      return {
        type: 'habit',
        frequency,
        aiPlaced: true,
        whyString: `Matched habit keywords; guessed frequency = ${frequency}.`,
      };
    }

    // Journal vs List vs Catchall (Note)
    if (containsAny(t, JOURNAL_WORDS)) {
      return {
        type: 'note',
        subtype: 'journal',
        aiPlaced: true,
        whyString: 'Matched journal keywords.',
      };
    }
    if (t.split('\n').some((line) => LIST_MARKERS.some((m) => line.startsWith(m)))) {
      return {
        type: 'note',
        subtype: 'list',
        aiPlaced: true,
        whyString: 'Detected list markers (- or *).',
      };
    }

    // Todo if it looks actionable
    if (containsAny(t, TODO_WORDS)) {
      return {
        type: 'todo',
        undefinedDue: true,
        aiPlaced: true,
        whyString: 'Action verb detected; leaving date undefined.',
      };
    }

    // Default: Catch All note
    return {
      type: 'note',
      subtype: 'catchall',
      aiPlaced: false,
      whyString: 'No strong signal; storing in Catch All.',
    };
  }
}

export const heuristicEngine = new HeuristicEngine();
