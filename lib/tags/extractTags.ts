/**
 * Tag Extraction v3 (Gremly-Tuned)
 *
 * Extracts 3-6 high-quality tags from user text.
 * Follows strict rules for meaningful nouns only.
 *
 * CP-TAG-2: Now extracts @person and @place tags alongside topic tags
 *
 * Compatible with:
 * - normalizeToTagKey
 * - sanitizeSuggestedTags
 * - mergeLogTags
 * - Mind Drop todo/habit/log pipeline
 * - Habit tag filters
 * - Journal emotion prioritization
 *
 * Output: array of tags with @ prefix for people/places, plain slugs for topics
 * Examples: ["@jeff", "@gym", "meditation", "dentist", "dinner"]
 */

/**
 * Helper to normalize a word into a tag slug (without # prefix)
 */
function toTagSlug(word: string): string {
  return word
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '');
}

/**
 * Words/patterns to NEVER include as tags
 */
const EXCLUDED_VERBS = new Set([
  'know',
  'knows',
  'knowing',
  'knew',
  'want',
  'wants',
  'wanting',
  'wanted',
  'think',
  'thinks',
  'thinking',
  'thought',
  'go',
  'goes',
  'going',
  'went',
  'gone',
  'feel',
  'feels',
  'feeling',
  'felt',
  'need',
  'needs',
  'needing',
  'needed',
  'should',
  "shouldn't",
  'could',
  "couldn't",
  'would',
  "wouldn't",
  'get',
  'gets',
  'getting',
  'got',
  'gotten',
  'make',
  'makes',
  'making',
  'made',
  'take',
  'takes',
  'taking',
  'took',
  'taken',
  'see',
  'sees',
  'seeing',
  'saw',
  'seen',
  'give',
  'gives',
  'giving',
  'gave',
  'given',
  'find',
  'finds',
  'finding',
  'found',
  'tell',
  'tells',
  'telling',
  'told',
  'ask',
  'asks',
  'asking',
  'asked',
  'work',
  'works',
  'working',
  'worked',
  'seem',
  'seems',
  'seeming',
  'seemed',
  'try',
  'tries',
  'trying',
  'tried',
  'leave',
  'leaves',
  'leaving',
  'left',
  'put',
  'puts',
  'putting',
  'email',
  'emails',
  'emailing',
  'emailed',
  'start',
  'starts',
  'starting',
  'started',
  'do',
  'does',
  'doing',
  'did',
  'done',
  'been',
  'being',
  'are',
  'is',
  'was',
  'were',
  'have',
  'has',
  'having',
  'had',
  'happens',
  'happen',
  'happening',
  'happened',
  'buy',
  'buys',
  'buying',
  'bought',
  'call',
  'calls',
  'calling',
  'called',
  'come',
  'comes',
  'coming',
  'came',
  'use',
  'uses',
  'using',
  'used',
  'keep',
  'keeps',
  'keeping',
  'kept',
  'let',
  'lets',
  'letting',
  'begin',
  'begins',
  'beginning',
  'began',
  'begun',
  'help',
  'helps',
  'helping',
  'helped',
  'talk',
  'talks',
  'talking',
  'talked',
  'turn',
  'turns',
  'turning',
  'turned',
  'become',
  'becomes',
  'becoming',
  'became',
  'show',
  'shows',
  'showing',
  'showed',
  'shown',
  'hear',
  'hears',
  'hearing',
  'heard',
  'play',
  'plays',
  'playing',
  'played',
  'run',
  'runs',
  'running',
  'ran',
  'move',
  'moves',
  'moving',
  'moved',
  'live',
  'lives',
  'living',
  'lived',
  'believe',
  'believes',
  'believing',
  'believed',
  'bring',
  'brings',
  'bringing',
  'brought',
  'write',
  'writes',
  'writing',
  'wrote',
  'written',
  'provide',
  'provides',
  'providing',
  'provided',
  'sit',
  'sits',
  'sitting',
  'sat',
  'stand',
  'stands',
  'standing',
  'stood',
  'lose',
  'loses',
  'losing',
  'lost',
  'pay',
  'pays',
  'paying',
  'paid',
  'meet',
  'meets',
  'meeting',
  'met',
  'include',
  'includes',
  'including',
  'included',
  'continue',
  'continues',
  'continuing',
  'continued',
  'set',
  'sets',
  'setting',
  'learn',
  'learns',
  'learning',
  'learned',
  'learnt',
  'change',
  'changes',
  'changing',
  'changed',
  'lead',
  'leads',
  'leading',
  'led',
  'understand',
  'understands',
  'understanding',
  'understood',
  'watch',
  'watches',
  'watching',
  'watched',
  'follow',
  'follows',
  'following',
  'followed',
  'stop',
  'stops',
  'stopping',
  'stopped',
  'create',
  'creates',
  'creating',
  'created',
  'speak',
  'speaks',
  'speaking',
  'spoke',
  'spoken',
  'read',
  'reads',
  'reading',
  'spend',
  'spends',
  'spending',
  'spent',
  'grow',
  'grows',
  'growing',
  'grew',
  'grown',
  'open',
  'opens',
  'opening',
  'opened',
  'walk',
  'walks',
  'walking',
  'walked',
  'win',
  'wins',
  'winning',
  'won',
  'offer',
  'offers',
  'offering',
  'offered',
  'remember',
  'remembers',
  'remembering',
  'remembered',
  'love',
  'loves',
  'loving',
  'loved',
  'consider',
  'considers',
  'considering',
  'considered',
  'appear',
  'appears',
  'appearing',
  'appeared',
  'actually',
  'buy',
  'carry',
  'carries',
  'carrying',
  'carried',
  'add',
  'adds',
  'adding',
  'added',
  'expect',
  'expects',
  'expecting',
  'expected',
  'mention',
  'mentions',
  'mentioning',
  'mentioned',
]);

const EXCLUDED_ADJECTIVES = new Set([
  'good',
  'better',
  'best',
  'bad',
  'worse',
  'worst',
  'amazing',
  'awesome',
  'great',
  'wonderful',
  'long',
  'short',
  'big',
  'small',
  'new',
  'old',
  'hard',
  'easy',
  'high',
  'low',
  'early',
  'late',
]);

const EXCLUDED_GENERIC = new Set([
  'task',
  'tasks',
  'habit',
  'habits',
  'routine',
  'routines',
  'daily',
  'weekly',
  'monthly',
  'appointment',
  'appointments',
  'meeting',
  'meetings',
  'stuff',
  'thing',
  'things',
  'time',
  'times',
  'day',
  'days',
  'life',
  'work', // Only when used as filler
  'every',
  'each',
  'all',
  'lot',
  'lots',
  'way',
  'ways',
  'practice', // Gerund form, not a meaningful noun
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'week',
  'month',
  'year',
  'today',
  'tomorrow',
  'yesterday',
  'place',
  'places',
]);

const EXCLUDED_META = new Set([
  'appointment',
  'appointments',
  'meeting',
  'meetings',
  'event',
  'events',
  'note',
  'notes',
  'reminder',
  'reminders',
]);

const EXCLUDED_FILLER = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'from',
  'by',
  'about',
  'as',
  'into',
  'like',
  'through',
  'after',
  'before',
  'between',
  'under',
  'over',
  'again',
  'further',
  'then',
  'once',
  'here',
  'there',
  'where',
  'when',
  'why',
  'how',
  'all',
  'each',
  'every',
  'some',
  'any',
  'few',
  'more',
  'most',
  'that',
  'this',
  'these',
  'those',
  'lately',
  'sometimes',
  'often',
  'always',
  'never',
  'very',
  'really',
  'quite',
  'just',
  'even',
  'still',
  'you',
  'your',
  'we',
  'our',
  'they',
  'their',
  'them',
  'if',
  'who',
  'what',
  'which',
]);

/**
 * Allowed emotions (max 1 per extraction)
 */
const ALLOWED_EMOTIONS = new Set([
  'anxious',
  'overwhelmed',
  'stressed',
  'sad',
  'angry',
  'excited',
  'nervous',
  'calm',
  'grateful',
  'tired',
]);

/**
 * Location prepositions that signal a place follows
 */
const LOCATION_PREPS = new Set(['at', 'to', 'in', 'on', 'near', 'by', 'from', 'around']);

/**
 * Activity nouns that are allowed even though they're gerunds
 * These represent activities/hobbies/exercises that are meaningful tags
 */
const ACTIVITY_NOUNS = new Set([
  'running',
  'walking',
  'jogging',
  'swimming',
  'cycling',
  'hiking',
  'yoga',
  'meditation',
  'reading',
  'writing',
  'cooking',
  'baking',
  'painting',
  'drawing',
  'gardening',
  'cleaning',
  'studying',
  'training',
  'exercising',
  'stretching',
  'breathing',
  'dancing',
  'singing',
  'playing', // "playing" as in music/sports
  'climbing',
  'lifting',
  'boxing',
  'skating',
  'skiing',
]);

/**
 * Extract 3-6 high-quality tags from raw text
 *
 * CP-TAG-2: Now includes @person and @place tags alongside topic tags
 *
 * @param rawText - User's input text
 * @param subtype - Optional context hint ('journal', 'list', 'idea', 'catchall')
 * @returns Array of tags: @person, @place, and topic slugs (e.g., ["@jeff", "@gym", "dinner"])
 */
export function extractMeaningfulTags(rawText: string, subtype?: string): string[] {
  if (!rawText?.trim()) return [];

  const text = rawText.trim();
  const lowerText = text.toLowerCase();

  const tags: string[] = [];
  const foundEmotions: string[] = [];

  // Step 1: Extract people (names - capitalized words + family/role names)
  // CP-TAG-2: Returns @-prefixed tags (max 2)
  const people = extractPeople(text);
  tags.push(...people);

  // Step 2: Extract places (capitalized words after location prepositions)
  // CP-TAG-2: Returns @-prefixed tags (max 2)
  const places = extractPlaces(text, people);
  tags.push(...places);

  // Step 3: Extract concrete nouns and activities
  const topics = extractTopics(lowerText, subtype, people, places);
  tags.push(...topics);

  // Step 4: Extract emotions (max 1, only if explicit)
  if (subtype === 'journal' || isReflective(lowerText)) {
    const emotion = extractEmotion(lowerText);
    if (emotion) {
      foundEmotions.push(emotion);
    }
  }

  // Step 5: Prioritize and limit to 6 tags
  const prioritized = prioritizeTags(tags, foundEmotions);

  return prioritized.slice(0, 6);
}

/**
 * Extract people names from text
 * CP-TAG-2: Returns @-prefixed tags (e.g. ["@sarah", "@dr-smith", "@mom"])
 */
function extractPeople(text: string): string[] {
  const people: string[] = [];
  const tokens = text.split(/\s+/);
  const capitalizedRegex = /^[A-Z][a-z]{2,}$/;

  // CP-TAG-2: Family and role names that count as people even if lowercase
  const familyRoleNames = new Set([
    'mum',
    'mom',
    'dad',
    'grandma',
    'grandpa',
    'granddad',
    'grandad',
    'boss',
    'manager',
  ]);

  // Skip excluded names
  const excludedNames = new Set([
    'I',
    'The',
    'A',
    'An',
    'This',
    'That',
    'These',
    'Those',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]);

  for (let i = 0; i < tokens.length && people.length < 2; i++) {
    const token = tokens[i].replace(/[^A-Za-z]/g, '');
    if (!token || excludedNames.has(token)) continue;

    const tokenLower = token.toLowerCase();

    // CP-TAG-2: Check for family/role names (e.g., "mom", "boss") even if lowercase
    if (familyRoleNames.has(tokenLower)) {
      people.push(`@${toTagSlug(tokenLower)}`);
      continue;
    }

    // Must be capitalized for proper names
    if (!capitalizedRegex.test(token)) continue;

    // Don't extract excluded words as people, even if capitalized
    if (isExcludedWord(tokenLower)) continue;

    // Check for "Dr. Smith" pattern
    const prevToken = i > 0 ? tokens[i - 1] : '';
    if (prevToken.match(/^Dr\.?$/i)) {
      people.push(`@${toTagSlug(`dr-${tokenLower}`)}`);
      continue;
    }

    // Check for two-word names "Sarah Jones"
    const nextToken = tokens[i + 1]?.replace(/[^A-Za-z]/g, '') ?? '';
    if (nextToken && capitalizedRegex.test(nextToken)) {
      const nextLower = nextToken.toLowerCase();
      if (!isExcludedWord(nextLower)) {
        people.push(`@${toTagSlug(`${tokenLower}-${nextLower}`)}`);
        i++; // Skip next token
        continue;
      }
    }

    // Single name (common: Mom, Dad, Sarah, etc.)
    // CP-TAG-2: Minimum length 3 for capitalized names (was already >= 3)
    if (token.length >= 3) {
      people.push(`@${toTagSlug(tokenLower)}`);
    }
  }

  return people;
}

/**
 * Extract places from text
 * CP-TAG-2: Returns @-prefixed tags (e.g. ["@oak-street", "@gym", "@london"])
 */
function extractPlaces(text: string, excludePeople: string[]): string[] {
  const places: string[] = [];
  const tokens = text.split(/\s+/);
  const capitalizedRegex = /^[A-Z][a-z]{2,}$/;

  // CP-TAG-2: excludePeople now contains @-prefixed tags, need to strip @ for comparison
  const peopleSet = new Set(excludePeople.map((p) => p.replace(/^@/, '')));

  for (let i = 1; i < tokens.length && places.length < 2; i++) {
    const token = tokens[i].replace(/[^A-Za-z]/g, '');
    if (!token) continue;

    const tokenLower = token.toLowerCase();
    if (peopleSet.has(tokenLower)) continue;

    const prevToken = tokens[i - 1]?.toLowerCase().replace(/[^a-z]/g, '');

    // Check if previous token is a location preposition
    if (prevToken && LOCATION_PREPS.has(prevToken)) {
      // After location preposition, accept lowercase words (like "gym") or capitalized
      const nextToken = tokens[i + 1]?.replace(/[^A-Za-z]/g, '') ?? '';
      if (nextToken && capitalizedRegex.test(nextToken)) {
        // Multi-word place: "Oak Street" → @oak-street
        places.push(`@${toTagSlug(`${tokenLower}-${nextToken.toLowerCase()}`)}`);
        i++; // Skip next token
        continue;
      } else if (token.length >= 3 && !isExcludedWord(tokenLower)) {
        // Single place word (must not be an excluded word like "know")
        places.push(`@${toTagSlug(tokenLower)}`);
        continue;
      }
    }

    // Check for capitalized multi-word places (without preposition)
    if (capitalizedRegex.test(token)) {
      const nextToken = tokens[i + 1]?.replace(/[^A-Za-z]/g, '') ?? '';
      if (nextToken && capitalizedRegex.test(nextToken)) {
        places.push(`@${toTagSlug(`${tokenLower}-${nextToken.toLowerCase()}`)}`);
        i++; // Skip next token
        continue;
      }

      // Standalone capitalized word (4+ chars) likely a place (e.g., "London", "Starbucks")
      if (token.length >= 4) {
        places.push(`@${toTagSlug(tokenLower)}`);
      }
    }
  }

  return places;
}

/**
 * Extract concrete nouns and activities
 * Returns lowercase slugs (e.g. ["meditation", "groceries", "presentation"])
 */
function extractTopics(
  lowerText: string,
  subtype?: string,
  people: string[] = [],
  places: string[] = [],
): string[] {
  const topics: string[] = [];
  const usedWords = new Set<string>(); // Track words used in multi-word tags

  // CP-TAG-2: Create a set of already-extracted words (from people/places) to avoid duplicates
  // Strip @ prefix since people/places now have @ prefix but we're comparing against raw words
  const alreadyExtracted = new Set<string>(
    [...people, ...places].map((tag) => tag.replace(/^@/, '')),
  );

  // For lists, check for common list items
  if (subtype === 'list' || lowerText.match(/[-*•]\s/)) {
    if (lowerText.match(/\b(milk|eggs|bread|butter|cheese)\b/)) {
      topics.push('groceries');
    }
  }

  // Extract multi-word nouns (e.g., "tax letter")
  // Only combine if neither word was already extracted as person/place
  const tokens = lowerText.split(/\s+/);
  for (let i = 0; i < tokens.length - 1; i++) {
    const word1 = tokens[i].replace(/[^a-z]/g, '');
    const word2 = tokens[i + 1].replace(/[^a-z]/g, '');

    if (word1.length < 3 || word2.length < 3) continue;
    if (isExcludedWord(word1) || isExcludedWord(word2)) continue;

    // Don't combine if either word is a person or place
    if (alreadyExtracted.has(word1) || alreadyExtracted.has(word2)) continue;

    const candidate = toTagSlug(`${word1}-${word2}`);
    if (candidate && !topics.includes(candidate)) {
      topics.push(candidate);
      usedWords.add(word1);
      usedWords.add(word2);
    }
  }

  // Extract meaningful single-word nouns (frequency-based)
  const words = lowerText.split(/[^a-z]+/).filter((w) => w.length >= 3);
  const frequency = new Map<string, number>();

  for (const word of words) {
    if (isExcludedWord(word)) continue;
    if (usedWords.has(word)) continue;

    frequency.set(word, (frequency.get(word) || 0) + 1);
  }

  // Get top 3 by frequency
  const sorted = Array.from(frequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word]) => toTagSlug(word));

  topics.push(...sorted);

  return topics;
}

/**
 * Check if a word should be excluded from tags
 */
function isExcludedWord(word: string): boolean {
  // Allow activity nouns even if they're gerunds
  if (ACTIVITY_NOUNS.has(word)) return false;

  return (
    EXCLUDED_VERBS.has(word) ||
    EXCLUDED_ADJECTIVES.has(word) ||
    EXCLUDED_GENERIC.has(word) ||
    EXCLUDED_META.has(word) ||
    EXCLUDED_FILLER.has(word) ||
    ALLOWED_EMOTIONS.has(word) // Emotions handled separately
  );
}

/**
 * Extract emotion tag (max 1)
 * Only if explicitly mentioned
 */
function extractEmotion(lowerText: string): string | null {
  for (const emotion of ALLOWED_EMOTIONS) {
    if (lowerText.includes(emotion)) {
      return toTagSlug(emotion);
    }
  }
  return null;
}

/**
 * Check if text is reflective/journal-like
 */
function isReflective(lowerText: string): boolean {
  const reflectionPatterns = [
    /\bfeeling\b/,
    /\bfelt\b/,
    /\btoday was\b/,
    /\btoday i\b/,
    /\bthinking about\b/,
    /\breflecting on\b/,
  ];

  return reflectionPatterns.some((pattern) => pattern.test(lowerText));
}

/**
 * Prioritize tags by category
 * Priority: People > Places > Topics > Emotions (max 1)
 */
function prioritizeTags(tags: string[], emotions: string[]): string[] {
  const result = [...tags];

  // Add at most 1 emotion at the end
  if (emotions.length > 0) {
    result.push(emotions[0]);
  }

  // Remove duplicates while preserving order
  return Array.from(new Set(result));
}
