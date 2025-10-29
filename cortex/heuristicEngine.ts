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

// Strong indicators for todos (high confidence)
const STRONG_TODO_PATTERNS = [
  'remember to ',
  "don't forget to ",
  'need to ',
  'make sure to ',
  'remind me to ',
  'i should ',
  'i must ',
  'have to ',
  'pickup ',
  'pick up ',
  'submit ',
  'send ',
  'pay ',
  'return ',
  'check on ',
  'follow up ',
];

// Temporal markers that suggest todos
const TEMPORAL_TODO_MARKERS = [
  'tomorrow',
  'today',
  'tonight',
  'this week',
  'next week',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'by ',
  'before ',
  'after ',
];

// Question patterns - usually notes, not todos
const QUESTION_PATTERNS = ['what if', 'why do', 'how can', 'should i', 'could i', 'would it'];

// Reflection/thought patterns - strong note indicators
const REFLECTION_PATTERNS = [
  'i think',
  'i feel',
  'realized that',
  'noticed that',
  'wondering if',
  'thoughts on',
  'idea:',
  'note:',
];
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

    // Check for questions first - these are rarely todos
    if (t.split(' ').some((word) => word.endsWith('?')) || containsAny(t, QUESTION_PATTERNS)) {
      return {
        type: 'note',
        subtype: 'catchall',
        aiPlaced: true,
        whyString: 'Questions are typically notes for reflection.',
      };
    }

    // Check for reflection patterns - strong note indicator
    if (containsAny(t, REFLECTION_PATTERNS)) {
      return {
        type: 'note',
        subtype: 'journal',
        aiPlaced: true,
        whyString: 'Detected reflection or thought pattern.',
      };
    }

    // Check for strong todo patterns
    if (containsAny(t, STRONG_TODO_PATTERNS)) {
      return {
        type: 'todo',
        undefinedDue: true,
        aiPlaced: true,
        whyString: 'Strong action phrase detected.',
      };
    }

    // Check for temporal markers combined with verbs (likely todo)
    if (containsAny(t, TEMPORAL_TODO_MARKERS) && containsAny(t, TODO_WORDS)) {
      return {
        type: 'todo',
        undefinedDue: true,
        aiPlaced: true,
        whyString: 'Action with time reference detected.',
      };
    }

    // Todo if it looks actionable
    if (containsAny(t, TODO_WORDS)) {
      return {
        type: 'todo',
        undefinedDue: true,
        aiPlaced: true,
        whyString: 'Action verb detected.',
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
