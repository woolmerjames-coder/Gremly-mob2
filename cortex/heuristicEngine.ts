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

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'this',
  'that',
  'from',
  'about',
  'into',
  'have',
  'need',
  'make',
  'sure',
  'remember',
  'tomorrow',
  'today',
  'meeting',
  'idea',
  'list',
  'journal',
  'call',
  'email',
  'schedule',
  'going',
  'start',
  'feel',
  'feeling',
  'buy',
  'book',
  'every',
  'week',
  'daily',
  'weekly',
  'monthly',
  'habit',
  'note',
  'catchall',
  'task',
  'action',
]);

const EMOTION_WORDS = ['anxious', 'grateful', 'excited', 'overwhelmed', 'calm', 'stressed'];

const MONTH_MAP: Record<string, string> = {
  january: '01',
  jan: '01',
  february: '02',
  feb: '02',
  march: '03',
  mar: '03',
  april: '04',
  apr: '04',
  may: '05',
  june: '06',
  jun: '06',
  july: '07',
  jul: '07',
  august: '08',
  aug: '08',
  september: '09',
  sep: '09',
  sept: '09',
  october: '10',
  oct: '10',
  november: '11',
  nov: '11',
  december: '12',
  dec: '12',
};

const PEOPLE_STOPWORDS = new Set([
  'I',
  'We',
  'You',
  'He',
  'She',
  'They',
  'It',
  'A',
  'An',
  'Meeting',
  'Idea',
  'Note',
]);

const TYPE_TAG_PRIORITY: Array<'*journal' | '*list' | '*meeting' | '*idea'> = [
  '*journal',
  '*list',
  '*meeting',
  '*idea',
];

const containsAny = (s: string, arr: string[]) => arr.some((w) => s.includes(w));

const pad = (value: number) => String(value).padStart(2, '0');

function extractDateTag(text: string): string | null {
  const isoMatch = text.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (isoMatch) {
    const [, y, mRaw, dRaw] = isoMatch;
    const m = pad(Number(mRaw));
    const d = pad(Number(dRaw));
    return `#${y}-${m}-${d}`;
  }

  const monthMatch = text.match(
    /(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{2,4}))?/i,
  );
  if (monthMatch) {
    const [, monthRaw, dayRaw, yearRaw] = monthMatch;
    if (!yearRaw) return null;
    const monthKey = monthRaw.toLowerCase();
    const month = MONTH_MAP[monthKey];
    if (!month) return null;
    const day = pad(Number(dayRaw));
    let year = yearRaw.trim();
    if (year.length === 2) {
      year = year < '50' ? `20${year}` : `19${year}`;
    }
    if (!/\d{4}/.test(year)) return null;
    return `#${year}-${month}-${day}`;
  }

  return null;
}

function normalizePersonTag(candidate: string): string | null {
  const cleaned = candidate.replace(/[^A-Za-z]/g, '');
  if (!cleaned) return null;
  return `@${cleaned}`;
}

function generateTags(
  text: string,
  resultType: 'habit' | 'todo' | 'note',
  maybeSubtype?: string,
): string[] {
  if (!text?.trim()) return [];

  const finalTags: string[] = [];
  const seen = new Set<string>();
  const lower = text.toLowerCase();
  const peopleRoots = new Set<string>();
  const addTag = (tag: string | null | undefined) => {
    if (!tag) return;
    if (seen.has(tag)) return;
    seen.add(tag);
    finalTags.push(tag);
  };

  const peopleCandidates = new Set<string>();
  const doctorMatches = text.match(/Dr\.?\s+[A-Z][A-Za-z]+/g);
  if (doctorMatches) {
    for (const match of doctorMatches) {
      const normalized = match.replace(/\s+/g, '');
      const root = normalized.replace(/[^A-Za-z]/g, '').toLowerCase();
      if (root) peopleRoots.add(root);
      const tag = normalizePersonTag(normalized);
      if (tag) addTag(tag);
    }
  }

  const words = text.split(/[^A-Za-z]+/).filter(Boolean);
  for (const word of words) {
    if (word.length < 3) continue;
    if (!/^[A-Z][a-z]+$/.test(word)) continue;
    if (PEOPLE_STOPWORDS.has(word)) continue;
    peopleCandidates.add(word);
  }
  for (const candidate of peopleCandidates) {
    peopleRoots.add(candidate.toLowerCase());
    addTag(normalizePersonTag(candidate));
  }

  const lines = text.split(/\r?\n/);
  const hasList = lines.some((line) =>
    LIST_MARKERS.some((marker) => line.trim().startsWith(marker.trim())),
  );

  const typePriority: Array<'*journal' | '*list' | '*meeting' | '*idea'> = [];
  if (
    maybeSubtype === 'journal' ||
    containsAny(lower, JOURNAL_WORDS) ||
    containsAny(lower, REFLECTION_PATTERNS)
  ) {
    typePriority.push('*journal');
  }
  if (maybeSubtype === 'list' || hasList) {
    typePriority.push('*list');
  }
  if (/\b(meeting with|met with|talked with|discussed)\b/i.test(text)) {
    typePriority.push('*meeting');
  }
  if (/idea:\s*|what if/i.test(text)) {
    typePriority.push('*idea');
  }

  let chosenTypeTag: string | null = null;
  let bestPriority = TYPE_TAG_PRIORITY.length;
  for (const candidate of typePriority) {
    const idx = TYPE_TAG_PRIORITY.indexOf(candidate);
    if (idx === -1) continue;
    if (idx < bestPriority) {
      chosenTypeTag = candidate;
      bestPriority = idx;
    }
  }
  if (chosenTypeTag) addTag(chosenTypeTag);

  const dateTag = extractDateTag(text);
  if (dateTag) addTag(dateTag);

  if (resultType === 'note' && (maybeSubtype === 'journal' || containsAny(lower, JOURNAL_WORDS))) {
    for (const emotion of EMOTION_WORDS) {
      if (lower.includes(emotion)) {
        addTag(`#${emotion}`);
      }
    }
  }

  const topicCandidates: string[] = [];
  for (const token of text.split(/[^A-Za-z0-9]+/)) {
    if (!token) continue;
    const word = token.toLowerCase();
    if (word.length < 3) continue;
    if (STOPWORDS.has(word)) continue;
    if (/^\d+$/.test(word)) continue;
    if (peopleRoots.has(word)) continue;
    topicCandidates.push(word);
  }

  const uniqueTopics: string[] = [];
  for (const word of topicCandidates) {
    if (uniqueTopics.includes(word)) continue;
    uniqueTopics.push(word);
    if (uniqueTopics.length >= 3) break;
  }

  for (const word of uniqueTopics) {
    const normalized = `#${word.replace(/\s+/g, '_')}`;
    addTag(normalized);
  }

  return finalTags;
}

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
      const tags = generateTags(text, 'habit');
      return {
        type: 'habit',
        frequency,
        aiPlaced: true,
        whyString: `Matched habit keywords; guessed frequency = ${frequency}.`,
        tags,
      };
    }

    // Journal vs List vs Catchall (Note)
    if (containsAny(t, JOURNAL_WORDS)) {
      const tags = generateTags(text, 'note', 'journal');
      return {
        type: 'note',
        subtype: 'journal',
        aiPlaced: true,
        whyString: 'Matched journal keywords.',
        tags,
      };
    }
    if (t.split('\n').some((line) => LIST_MARKERS.some((m) => line.startsWith(m)))) {
      const tags = generateTags(text, 'note', 'list');
      return {
        type: 'note',
        subtype: 'list',
        aiPlaced: true,
        whyString: 'Detected list markers (- or *).',
        tags,
      };
    }

    // Check for questions first - these are rarely todos
    if (t.split(' ').some((word) => word.endsWith('?')) || containsAny(t, QUESTION_PATTERNS)) {
      const tags = generateTags(text, 'note', 'catchall');
      return {
        type: 'note',
        subtype: 'catchall',
        aiPlaced: true,
        whyString: 'Questions are typically notes for reflection.',
        tags,
      };
    }

    // Check for reflection patterns - strong note indicator
    if (containsAny(t, REFLECTION_PATTERNS)) {
      const tags = generateTags(text, 'note', 'journal');
      return {
        type: 'note',
        subtype: 'journal',
        aiPlaced: true,
        whyString: 'Detected reflection or thought pattern.',
        tags,
      };
    }

    // Check for strong todo patterns
    if (containsAny(t, STRONG_TODO_PATTERNS)) {
      const tags = generateTags(text, 'todo');
      return {
        type: 'todo',
        undefinedDue: true,
        aiPlaced: true,
        whyString: 'Strong action phrase detected.',
        tags,
      };
    }

    // Check for temporal markers combined with verbs (likely todo)
    if (containsAny(t, TEMPORAL_TODO_MARKERS) && containsAny(t, TODO_WORDS)) {
      const tags = generateTags(text, 'todo');
      return {
        type: 'todo',
        undefinedDue: true,
        aiPlaced: true,
        whyString: 'Action with time reference detected.',
        tags,
      };
    }

    // Todo if it looks actionable
    if (containsAny(t, TODO_WORDS)) {
      const tags = generateTags(text, 'todo');
      return {
        type: 'todo',
        undefinedDue: true,
        aiPlaced: true,
        whyString: 'Action verb detected.',
        tags,
      };
    }

    // Default: Catch All note
    const tags = generateTags(text, 'note', 'catchall');
    return {
      type: 'note',
      subtype: 'catchall',
      aiPlaced: false,
      whyString: 'No strong signal; storing in Catch All.',
      tags,
    };
  }
}

export const heuristicEngine = new HeuristicEngine();
