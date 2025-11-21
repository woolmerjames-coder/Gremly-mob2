/**
 * Tag Quality Filters
 *
 * Prevents junk tokens from becoming tags (e.g., #has, #lately, #been).
 * Used in both initial tag generation (buildFallbackTags) and background AI enrichment.
 */

/**
 * Low-quality words that should never become tags
 * These are common filler words, auxiliary verbs, and vague descriptors
 */
const LOW_QUALITY_TAGS = new Set([
  // Auxiliary verbs & modals
  'has',
  'have',
  'had',
  'been',
  'being',
  'could',
  'would',
  'should',
  'might',
  'will',
  'shall',
  'can',
  'may',
  'must',
  'ought',

  // Common action verbs (too generic)
  'start',
  'started',
  'starting',
  'starts',
  'stop',
  'stopped',
  'stopping',
  'stops',
  'make',
  'made',
  'making',
  'makes',
  'take',
  'took',
  'taking',
  'takes',
  'give',
  'gave',
  'giving',
  'gives',
  'keep',
  'kept',
  'keeping',
  'keeps',
  'need',
  'needed',
  'needing',
  'needs',
  'want',
  'wanted',
  'wanting',
  'wants',
  'doing',
  'done',
  'does',

  // Vague descriptors
  'lot',
  'lots',
  'stuff',
  'lately',
  'really',
  'very',
  'quite',
  'just',
  'like',
  'thing',
  'things',
  'kind',
  'sort',
  'way',
  'ways',
  'about',
  'around',
  'maybe',
  'perhaps',
  'somehow',
  'something',
  'anything',
  'everything',
  'nothing',
  'more',

  // Low-signal emotional/state words (too vague to be useful tags)
  'feeling',
  'feels',
  'felt',
  'feel',
  'off',
  'good',
  'bad',
  'okay',
  'fine',
  'better',
  'worse',
  'nice',
  'great',
  'terrible',
  'weird',
  'strange',

  // Time words (too generic to be useful as tags)
  'every',
  'always',
  'never',
  'sometimes',
  'often',
  'morning',
  'afternoon',
  'evening',
  'night',
  'tonight',
  'today',
  'yesterday',
  'tomorrow',
  'daily',
  'weekly',
  'monthly',

  // Conjunctions & prepositions
  'since',
  'while',
  'though',
  'although',
  'whereas',
  'whether',
  'because',
  'unless',
  'until',
  'after',
  'before',
  'when',
  'where',
  'which',
  'what',
  'that',
  'this',
  'these',
  'those',
  'with',
  'from',
  'into',
  'onto',
  'over',
  'under',
]);

/**
 * Short tags that are allowed despite being < 3 characters
 * These are common, useful tags like #tax, #gym, #job
 */
const SHORT_TAG_WHITELIST = new Set(['tax', 'gym', 'job', 'car', 'dr', 'apt', 'am', 'pm']);

/**
 * Protected meaningful tags that should never be filtered
 * These are core life domains and important categories
 */
const PROTECTED_TAGS = new Set([
  'journal',
  'idea',
  'list',
  'reflection',
  'insight',
  'decision',
  'work',
  'health',
  'money',
  'exercise',
  'sleep',
  'relationships',
  'family',
  'friends',
  'finance',
  'career',
  'learning',
  'goals',
  'habits',
  'productivity',
  'home',
  'travel',
  'food',
  'cooking',
  'reading',
  'writing',
  'music',
  'art',
  'meditation',
  'mindfulness',
  'therapy',
  'doctor',
  'appointment',
  'meeting',
  'deadline',
  'project',
  'email',
  'call',
  'phone',
  'message',
  'urgent',
  'important',
  'running',
  'walking',
  'cycling',
  'swimming',
  'yoga',
  'strength',
  'cardio',
  'diet',
  'nutrition',
  'hydration',
  'breakfast',
  'lunch',
  'dinner',
  'groceries',
  'shopping',
  'cleaning',
  'laundry',
  'maintenance',
  'repair',
  'bills',
  'budget',
  'savings',
  'investment',
  'taxes',
  'insurance',
  'rent',
  'mortgage',
  'utilities',
]);

/**
 * Check if a tag token is high-quality enough to keep
 *
 * Filters out:
 * - Explicitly banned low-quality words (has, been, lot, stuff, lately, etc.)
 * - Very short tokens (< 3 chars) unless whitelisted
 * - Star tags and mentions always pass (they use different validation)
 *
 * @param tag - Raw tag string (may include #, *, @ prefix)
 * @returns true if tag should be kept, false if it's junk
 */
export function isGoodTokenTag(tag: string): boolean {
  if (!tag) return false;

  // Star tags (*journal, *idea, *list) and mentions (@Person) use their own validation
  if (tag.startsWith('*') || tag.startsWith('@')) {
    return true;
  }

  // Normalize: strip leading "#" and lowercase
  const normalized = tag.replace(/^#/, '').toLowerCase().trim();
  if (!normalized) return false;

  // Always keep protected meaningful tags (work, health, running, etc.)
  if (PROTECTED_TAGS.has(normalized)) return true;

  // Explicitly banned tokens (feeling, off, has, been, etc.)
  if (LOW_QUALITY_TAGS.has(normalized)) return false;

  // Short tokens are usually junk, but allow whitelisted ones
  if (normalized.length < 3 && !SHORT_TAG_WHITELIST.has(normalized)) {
    return false;
  }

  return true;
}

/**
 * Apply quality filter to a list of tags
 * Removes duplicates and filters out low-quality tags
 *
 * @param tags - Array of tags (may be null/undefined)
 * @returns Cleaned array of high-quality tags
 */
export function applyTagQualityFilter(tags: string[] | null | undefined): string[] {
  if (!tags || !tags.length) return [];
  const unique = Array.from(new Set(tags));
  return unique.filter(isGoodTokenTag);
}
