/**
 * Deterministic Tag Extraction (Fallback)
 *
 * Pattern-based tag extraction when AI is unavailable or fails.
 * Uses heuristics to identify meaningful tags from text.
 *
 * Extracts:
 * - Proper nouns (capitalized tokens)
 * - Activities (run, meditate, email, cook)
 * - Concrete objects (passport, receipt, laptop)
 * - Places (airport, dentist, cafe)
 *
 * Excludes:
 * - Emotions (overwhelmed, stressed, sad)
 * - Generic words (thing, stuff, day, someone)
 * - Verbs like "think", "want", "know"
 * - Entire sentences
 */

// Common activity words worth tagging
const ACTIVITY_WORDS = new Set([
  'run',
  'running',
  'walk',
  'walking',
  'exercise',
  'workout',
  'meditate',
  'meditation',
  'yoga',
  'swim',
  'swimming',
  'bike',
  'biking',
  'hike',
  'hiking',
  'email',
  'call',
  'meeting',
  'appointment',
  'dentist',
  'doctor',
  'cook',
  'cooking',
  'bake',
  'baking',
  'read',
  'reading',
  'write',
  'writing',
  'shop',
  'shopping',
  'groceries',
  'laundry',
  'clean',
  'cleaning',
  'buy',
  'buying',
  'purchase',
  'order',
  'ordering',
  'code',
  'coding',
  'design',
  'designing',
  'review',
  'study',
  'studying',
]);

// Places and specific locations
const PLACE_WORDS = new Set([
  'airport',
  'station',
  'gym',
  'office',
  'home',
  'park',
  'cafe',
  'coffee',
  'restaurant',
  'store',
  'market',
  'bank',
  'hospital',
  'clinic',
  'dentist',
  'school',
  'library',
  'church',
  'temple',
  'beach',
  'mountain',
]);

// Concrete objects worth tagging
const OBJECT_WORDS = new Set([
  'passport',
  'ticket',
  'receipt',
  'invoice',
  'laptop',
  'phone',
  'charger',
  'keys',
  'wallet',
  'bag',
  'backpack',
  'car',
  'bike',
  'bicycle',
  'book',
  'document',
  'file',
  'report',
  'presentation',
]);

// Words to NEVER tag (emotions, generic, filler)
const EXCLUDE_WORDS = new Set([
  // Emotions
  'overwhelmed',
  'stressed',
  'sad',
  'happy',
  'anxious',
  'worried',
  'excited',
  'frustrated',
  'angry',
  'grateful',
  'thankful',
  'calm',
  'nervous',
  // Generic/vague
  'thing',
  'stuff',
  'day',
  'someone',
  'something',
  'anything',
  'everything',
  'anyone',
  'everyone',
  'somewhere',
  'anywhere',
  'everywhere',
  'good',
  'bad',
  'great',
  'amazing',
  'terrible',
  'awful',
  'nice',
  'fine',
  // Common verbs to exclude
  'think',
  'thinking',
  'want',
  'wanting',
  'know',
  'knowing',
  'feel',
  'feeling',
  'believe',
  'wish',
  'hope',
  'need',
  'needing',
  'try',
  'trying',
  // Time words
  'today',
  'tomorrow',
  'yesterday',
  'morning',
  'evening',
  'night',
  'afternoon',
  'week',
  'month',
  'year',
  'time',
  'hour',
  'minute',
  // Prepositions/conjunctions
  'about',
  'after',
  'before',
  'with',
  'without',
  'from',
  'into',
  'onto',
  'and',
  'but',
  'or',
  'so',
  'because',
  'when',
  'where',
  'how',
  'why',
]);

/**
 * Check if a word is a proper noun (capitalized, not at sentence start).
 */
function isProperNoun(word: string, index: number, words: string[]): boolean {
  // Must start with capital letter
  if (!/^[A-Z]/.test(word)) return false;

  // Don't count first word
  if (index === 0) return false;

  // Check if previous word ends with sentence-ending punctuation
  if (index > 0) {
    const prevWord = words[index - 1];
    if (/[.!?]$/.test(prevWord)) return false;
  }

  return true;
}

/**
 * Normalize and validate a tag candidate.
 */
function normalizeTag(word: string): string | null {
  // Lowercase and trim
  let normalized = word.toLowerCase().trim();

  // Strip punctuation except hyphens
  normalized = normalized.replace(/[^\w-]/g, '');

  // Remove trailing 's' for plurals (simple heuristic)
  if (normalized.length > 4 && normalized.endsWith('s') && !normalized.endsWith('ss')) {
    const singular = normalized.slice(0, -1);
    // Check if singular form is in our known words
    if (ACTIVITY_WORDS.has(singular) || PLACE_WORDS.has(singular) || OBJECT_WORDS.has(singular)) {
      normalized = singular;
    }
  }

  // Must be at least 3 characters
  if (normalized.length < 3) return null;

  // Must not be in exclude list
  if (EXCLUDE_WORDS.has(normalized)) return null;

  return normalized;
}

/**
 * Extract tags using deterministic pattern matching.
 *
 * @param text - The text to extract tags from
 * @returns Array of extracted tags (3-6 max)
 */
export function extractTagsFallback(text: string): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const candidates: Array<{ tag: string; priority: number }> = [];

  // Split into words
  const words = text.split(/\s+/);

  words.forEach((word, index) => {
    const normalized = normalizeTag(word);
    if (!normalized) return;

    // Score based on type
    let priority = 0;

    // Highest priority: Proper nouns
    if (isProperNoun(word, index, words)) {
      priority = 4;
      candidates.push({ tag: normalized, priority });
      return;
    }

    // High priority: Activities
    if (ACTIVITY_WORDS.has(normalized)) {
      priority = 3;
      candidates.push({ tag: normalized, priority });
      return;
    }

    // Medium priority: Objects
    if (OBJECT_WORDS.has(normalized)) {
      priority = 2;
      candidates.push({ tag: normalized, priority });
      return;
    }

    // Low priority: Places
    if (PLACE_WORDS.has(normalized)) {
      priority = 1;
      candidates.push({ tag: normalized, priority });
      return;
    }
  });

  // Sort by priority (highest first)
  candidates.sort((a, b) => b.priority - a.priority);

  // Deduplicate
  const seen = new Set<string>();
  const uniqueTags: string[] = [];

  for (const { tag } of candidates) {
    if (!seen.has(tag)) {
      seen.add(tag);
      uniqueTags.push(tag);
    }
  }

  // Limit to 3-6 tags (prefer 3-4 for fallback)
  return uniqueTags.slice(0, 4);
}
