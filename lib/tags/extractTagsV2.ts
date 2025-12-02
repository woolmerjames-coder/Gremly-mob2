/**
 * Tag Extraction Pipeline V2
 *
 * 4-stage pipeline:
 * 1. Name Detection → @mentions
 * 2. Keyword Extraction → #keywords
 * 3. Theme Tagging → #themes (rule-based, double-signal required)
 * 4. Quality Gate → filter all tags once at end
 */

// Stage 1: Name patterns
const NAME_CONTEXT_PATTERNS = [
  /\bwith\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g, // "with Sarah" or "with Sarah Jones"
  /\bfrom\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g, // "from Mike"
  /\bto\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g, // "to Jennifer"
  /\bfor\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g, // "for David"
  /\band\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g, // "and Lisa"
  /\b(?:Email|Call|Text|Message|Contact|Meet|Ping|Ask|Tell|Remind)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g, // "Email John", "Call Sarah"
  /\b(Dr\.?\s+[A-Z][a-z]+)\b/g, // "Dr. Smith"
  /\b(Mr\.?\s+[A-Z][a-z]+)\b/g, // "Mr. Johnson"
  /\b(Mrs\.?\s+[A-Z][a-z]+)\b/g, // "Mrs. Williams"
  /\b(Ms\.?\s+[A-Z][a-z]+)\b/g, // "Ms. Davis"
];

// Family/role names to treat as @mentions
const FAMILY_ROLE_NAMES = new Set([
  'mom',
  'dad',
  'mother',
  'father',
  'mum',
  'papa',
  'mama',
  'grandma',
  'grandpa',
  'grandmother',
  'grandfather',
  'boss',
  'manager',
  'coach',
  'therapist',
  'sister',
  'brother',
  'aunt',
  'uncle',
  'cousin',
  'wife',
  'husband',
  'partner',
  'spouse',
]);

// NOT names - exclude these
const NOT_NAMES = new Set([
  // Days
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
  // Months
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
  // Common words that get capitalized
  'Today',
  'Tomorrow',
  'Yesterday',
  'Morning',
  'Evening',
  'Night',
  'Week',
  'Month',
  'Year',
  'Day',
]);

// Stage 3: Theme definitions (require 2+ triggers)
const THEME_TRIGGERS: Record<string, string[]> = {
  exercise: [
    'run',
    'gym',
    'workout',
    'yoga',
    'swim',
    'cycle',
    'walk',
    'hike',
    'fitness',
    'exercise',
    'jog',
    'lift',
  ],
  work: [
    'work',
    'job',
    'office',
    'meeting',
    'deadline',
    'project',
    'client',
    'presentation',
    'boss',
    'coworker',
  ],
  health: [
    'doctor',
    'therapy',
    'meds',
    'dentist',
    'medical',
    'checkup',
    'clinic',
    'hospital',
    'appointment',
    'prescription',
  ],
  money: [
    'bills',
    'rent',
    'salary',
    'budget',
    'tax',
    'payment',
    'invoice',
    'savings',
    'bank',
    'money',
    'cost',
    'price',
  ],
  relationships: [
    'partner',
    'friend',
    'family',
    'dating',
    'spouse',
    'parents',
    'children',
    'mom',
    'dad',
    'wife',
    'husband',
  ],
};

// STRICT blocklist - never extract these as keywords
const KEYWORD_BLOCKLIST = new Set([
  // Pronouns
  'i',
  'me',
  'my',
  'mine',
  'you',
  'your',
  'yours',
  'he',
  'him',
  'his',
  'she',
  'her',
  'hers',
  'it',
  'its',
  'we',
  'us',
  'our',
  'ours',
  'they',
  'them',
  'their',
  'theirs',
  'myself',
  'yourself',
  'himself',
  'herself',
  'itself',
  'ourselves',
  'themselves',

  // Common verbs
  'is',
  'was',
  'were',
  'been',
  'being',
  'am',
  'are',
  'be',
  'has',
  'have',
  'had',
  'having',
  'do',
  'does',
  'did',
  'doing',
  'done',
  'make',
  'makes',
  'made',
  'making',
  'get',
  'gets',
  'got',
  'getting',
  'go',
  'goes',
  'went',
  'going',
  'gone',
  'come',
  'comes',
  'came',
  'coming',
  'take',
  'takes',
  'took',
  'taking',
  'taken',
  'give',
  'gives',
  'gave',
  'giving',
  'see',
  'sees',
  'saw',
  'seeing',
  'seen',
  'know',
  'knows',
  'knew',
  'knowing',
  'think',
  'thinks',
  'thought',
  'thinking',
  'want',
  'wants',
  'wanted',
  'wanting',
  'need',
  'needs',
  'needed',
  'needing',
  'feel',
  'feels',
  'felt',
  'feeling',
  'try',
  'tries',
  'tried',
  'trying',
  'put',
  'puts',
  'putting',
  'say',
  'says',
  'said',
  'saying',
  'tell',
  'tells',
  'told',
  'telling',
  'ask',
  'asks',
  'asked',
  'asking',
  'use',
  'uses',
  'used',
  'using',
  'find',
  'finds',
  'found',
  'finding',
  'keep',
  'keeps',
  'kept',
  'keeping',
  'let',
  'lets',
  'letting',
  'begin',
  'begins',
  'began',
  'beginning',
  'seem',
  'seems',
  'seemed',
  'seeming',
  'help',
  'helps',
  'helped',
  'helping',
  'show',
  'shows',
  'showed',
  'showing',
  'shown',

  // Action verbs (generic task verbs)
  'call',
  'calls',
  'called',
  'calling',
  'email',
  'emails',
  'emailed',
  'emailing',
  'meet',
  'meets',
  'met',
  'meeting',
  'schedule',
  'schedules',
  'scheduled',
  'scheduling',
  'send',
  'sends',
  'sent',
  'sending',
  'check',
  'checks',
  'checked',
  'checking',
  'buy',
  'buys',
  'bought',
  'buying',
  'pick',
  'picks',
  'picked',
  'picking',
  'discuss',
  'discusses',
  'discussed',
  'discussing',
  'mention',
  'mentions',
  'mentioned',
  'mentioning',
  'talk',
  'talks',
  'talked',
  'talking',
  'write',
  'writes',
  'wrote',
  'written',
  'writing',
  'read',
  'reads',
  'reading',
  'plan',
  'plans',
  'planned',
  'planning',
  'finish',
  'finishes',
  'finished',
  'finishing',
  'start',
  'starts',
  'started',
  'starting',
  'pay',
  'pays',
  'paid',
  'paying',
  'book',
  'books',
  'booked',
  'booking',
  'cancel',
  'cancels',
  'cancelled',
  'canceled',
  'cancelling',
  'canceling',
  'appointment',
  'appointments',

  // Work-related verbs
  'work',
  'works',
  'worked',
  'working',

  // Determiners & articles
  'the',
  'a',
  'an',
  'this',
  'that',
  'these',
  'those',
  'some',
  'any',
  'no',
  'every',
  'each',
  'all',
  'both',
  'few',
  'more',
  'most',
  'other',
  'such',
  'what',
  'which',
  'whose',
  'whatever',
  'whichever',

  // Prepositions
  'in',
  'on',
  'at',
  'to',
  'for',
  'with',
  'from',
  'by',
  'about',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'between',
  'under',
  'over',
  'out',
  'up',
  'down',
  'off',
  'away',
  'around',
  'per',

  // Conjunctions
  'and',
  'or',
  'but',
  'nor',
  'so',
  'yet',
  'because',
  'although',
  'while',
  'if',
  'when',
  'where',
  'unless',
  'until',
  'since',
  'though',

  // Time words (not specific enough)
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
  'times',
  'x',
  'day',
  'time',
  'now',
  'then',
  'always',
  'never',
  'soon',
  'later',
  'early',
  'late',
  'recently',
  'lately',
  // Days of week
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  // Months
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',

  // Hedging words
  'maybe',
  'probably',
  'perhaps',
  'might',
  'could',
  'would',
  'should',
  'possibly',
  'likely',
  'unlikely',

  // Quantifiers & misc
  'very',
  'really',
  'just',
  'also',
  'too',
  'enough',
  'much',
  'many',
  'little',
  'lot',
  'lots',
  'bit',
  'thing',
  'things',
  'stuff',
  'way',
  'something',
  'anything',
  'nothing',
  'everything',
  'someone',
  'anyone',
  'nobody',
  'everybody',
  'somewhere',
  'anywhere',
  'nowhere',
  'everywhere',

  // Contractions fragments
  'don',
  'doesn',
  'didn',
  'won',
  'wouldn',
  'couldn',
  'shouldn',
  'isn',
  'aren',
  'wasn',
  'weren',
  'hasn',
  'haven',
  'hadn',
  'can',
  'cannot',
  'll',
  've',
  're',
  'd',
  's',
  't',
  'm',
  'im',
  'ive',
  'id',
  'youre',
  'youve',
  'youd',
  'hes',
  'shes',
  'its',
  'weve',
  'theyre',
  'theyve',
  'theyd',
  'whos',
  'whats',
  'thats',
  'cant',
  'wont',
  'dont',
  'didnt',
  'isnt',
  'arent',
  'wasnt',
  'werent',

  // Common filler
  'like',
  'okay',
  'ok',
  'yeah',
  'yes',
  'no',
  'well',
  'um',
  'uh',
  'oh',
  'ah',
  'hmm',
  'huh',
  'wow',
  'hey',
  'hi',
  'hello',
  'bye',
  'please',
  'thanks',
  'idk',
  'kinda',
  'sorta',
  'gonna',
  'wanna',
  'gotta',
  'dunno',

  // Vague adjectives/descriptors
  'better',
  'worse',
  'good',
  'bad',
  'great',
  'nice',
  'weird',
  'strange',
  'odd',
  'fine',
  'different',
  'same',
  'new',
  'old',
  'big',
  'small',
  'long',
  'short',
  'hard',
  'easy',
  'simple',
  'complex',

  // Adverbs
  'even',
  'still',
  'ever',
  'already',
  'anymore',
  'yet',
  'only',
  'actually',
  'basically',
  'literally',
  'honestly',
  'seriously',
  'definitely',
]);

// Short words whitelist (allowed despite being <3 chars)
const SHORT_WORD_WHITELIST = new Set(['tax', 'gym', 'job', 'run', 'api', 'css', 'sql', 'app']);

export interface ExtractedTags {
  mentions: string[]; // @firstname or @firstname-lastname
  keywords: string[]; // #keyword
  themes: string[]; // #theme
  subtype?: string; // #journal, #idea, #general (for logs)
}

export interface TagExtractionOptions {
  logSubtype?: 'journal' | 'idea' | 'general';
  maxKeywords?: number;
}

/**
 * Stage 1: Extract names as @mentions
 */
function extractNames(text: string): string[] {
  const names: Set<string> = new Set();

  for (const pattern of NAME_CONTEXT_PATTERNS) {
    // Reset regex lastIndex
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1]?.trim();
      if (name && !NOT_NAMES.has(name)) {
        // Normalize: "Sarah Jones" → "sarah-jones", "Sarah" → "sarah"
        const normalized = name.toLowerCase().replace(/\s+/g, '-').replace(/\./g, '');
        if (normalized.length >= 2) {
          names.add(normalized);
        }
      }
    }
  }

  // Also extract family/role names from anywhere in text
  const lowerText = text.toLowerCase();
  const words = lowerText.split(/\s+/);
  for (const word of words) {
    const cleaned = word.replace(/[^a-z]/g, '');
    if (FAMILY_ROLE_NAMES.has(cleaned)) {
      names.add(cleaned);
    }
  }

  return Array.from(names);
}

/**
 * Stage 2: Extract keywords (nouns, activities)
 */
function extractKeywords(text: string, maxKeywords: number = 4): string[] {
  // Remove names we already extracted (don't double-count)
  const processed = text.toLowerCase();

  // Split into words
  const words = processed
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 || SHORT_WORD_WHITELIST.has(w))
    .filter((w) => !KEYWORD_BLOCKLIST.has(w))
    .filter((w) => !FAMILY_ROLE_NAMES.has(w)); // Don't extract as keywords - they become @mentions

  // Count frequency (crude keyword extraction)
  const freq = new Map<string, number>();
  for (const word of words) {
    freq.set(word, (freq.get(word) || 0) + 1);
  }

  // Sort by frequency, take top N
  const sorted = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);

  return sorted;
}

/**
 * Stage 3: Apply theme tags (rule-based, requires 2+ triggers)
 */
function extractThemes(text: string): string[] {
  const textLower = text.toLowerCase();
  const themes: string[] = [];

  for (const [theme, triggers] of Object.entries(THEME_TRIGGERS)) {
    // Count how many trigger words appear
    const matchCount = triggers.filter((t) => textLower.includes(t)).length;

    // Require 2+ triggers for theme to apply (double-signal)
    if (matchCount >= 2) {
      themes.push(theme);
    }
  }

  return themes;
}

/**
 * Stage 4: Quality gate - validate all tags
 */
function applyQualityGate(tags: string[]): string[] {
  return tags.filter((tag) => {
    // Length check: 2-25 chars
    if (tag.length < 2 || tag.length > 25) return false;

    // Must start with letter
    if (!/^[a-z]/i.test(tag)) return false;

    // Only alphanumeric, underscore, hyphen
    if (!/^[a-z][a-z0-9_-]*$/i.test(tag)) return false;

    // Not in blocklist (final check)
    if (KEYWORD_BLOCKLIST.has(tag.toLowerCase())) return false;

    return true;
  });
}

/**
 * Main extraction function - runs full 4-stage pipeline
 */
export function extractTagsV2(text: string, options: TagExtractionOptions = {}): ExtractedTags {
  const { logSubtype, maxKeywords = 4 } = options;

  // Stage 1: Names → @mentions
  const mentions = extractNames(text);

  // Stage 2: Keywords → #keywords
  const keywords = extractKeywords(text, maxKeywords);

  // Stage 3: Themes → #themes (double-signal required)
  const themes = extractThemes(text);

  // Stage 4: Quality gate (applied to keywords, NOT to themes - themes are controlled by THEME_TRIGGERS)
  const filteredKeywords = applyQualityGate(keywords);
  // Themes bypass blocklist since they're already controlled by THEME_TRIGGERS
  const filteredThemes = themes.filter((t) => t.length >= 2 && t.length <= 25);

  return {
    mentions,
    keywords: filteredKeywords,
    themes: filteredThemes,
    subtype: logSubtype,
  };
}

/**
 * Convert ExtractedTags to flat array for storage
 * Format: @mentions first, then #keywords, then #themes, then #subtype
 */
export function tagsToArray(extracted: ExtractedTags): string[] {
  const result: string[] = [];

  // @mentions (prefixed)
  for (const m of extracted.mentions) {
    result.push(`@${m}`);
  }

  // #keywords
  for (const k of extracted.keywords) {
    result.push(k);
  }

  // #themes
  for (const t of extracted.themes) {
    result.push(t);
  }

  // #subtype (for logs)
  if (extracted.subtype) {
    result.push(extracted.subtype);
  }

  // Deduplicate
  return [...new Set(result)];
}

// Export blocklist for testing
export const _testExports = {
  KEYWORD_BLOCKLIST,
  NOT_NAMES,
  THEME_TRIGGERS,
  extractNames,
  extractKeywords,
  extractThemes,
  applyQualityGate,
};
