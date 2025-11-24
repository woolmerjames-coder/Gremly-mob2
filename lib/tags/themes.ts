/**
 * Theme Tag Enrichment - Phase 4B + LS2
 *
 * Adds canonical theme tags (e.g., #exercise, #work, #health, #money, #journal, #idea, #catchall) to entities
 * based on pattern matching in the entity's text content AND existing specific tags.
 *
 * Key principles:
 * - Theme tags are ADDITIVE, not replacements
 * - Specific tags (#running, #yoga, #bills) are always preserved
 * - Theme tags provide broader categorization (#exercise, #money)
 * - For logs: subtype-driven tags (#journal, #idea, #catchall) are added automatically (LS2)
 *
 * Examples:
 * - "Start running every morning" → #running (specific) + #exercise (theme)
 * - "Yoga before bed" → #yoga (specific) + #exercise (theme)
 * - "Pay rent and utilities" → #rent, #utilities (specific) + #money (theme)
 * - "I'm feeling overwhelmed" + subtype='journal' → #journal (theme)
 * - "Idea: new meeting format" + subtype='idea' → #idea (theme)
 *
 * This is applied as a post-processing step in BackgroundPrefill after
 * AI tag merging and quality filtering.
 */

import type { NoteSubtype } from '../logs/getEffectiveLogSubtype';

type ThemeName =
  | 'exercise'
  | 'work'
  | 'health'
  | 'money'
  | 'relationships'
  | 'sleep'
  | 'journal'
  | 'idea'
  | 'reference';

type ThemeRule = {
  theme: string; // e.g. "#exercise"
  keywords: string[]; // keywords to match in text OR existing tags
};

/**
 * Canonical theme tags with their detection keywords.
 * Keywords are matched against both:
 * 1. The entity's text content (title/body)
 * 2. Normalized existing tag tokens
 *
 * Keep this opinionated - only add themes that provide clear value.
 */
const THEME_RULES: ThemeRule[] = [
  {
    theme: '#exercise',
    keywords: [
      'run',
      'running',
      'jog',
      'jogging',
      'gym',
      'workout',
      'lifting',
      'weights',
      'cardio',
      'yoga',
      'pilates',
      'swim',
      'swimming',
      'cycle',
      'cycling',
      'bike',
      'biking',
      'walk',
      'walking',
      'hike',
      'hiking',
      'sport',
      'sports',
      'fitness',
      'training',
      'strength',
    ],
  },
  {
    theme: '#work',
    keywords: [
      'work',
      'job',
      'office',
      'boss',
      'manager',
      'meeting',
      'deadline',
      'project',
      'client',
      'presentation',
      'report',
      'conference',
      'colleague',
      'career',
    ],
  },
  {
    theme: '#health',
    keywords: [
      'health',
      'diet',
      'doctor',
      'therapy',
      'therapist',
      'meds',
      'medication',
      'dentist',
      'sick',
      'medical',
      'checkup',
      'hospital',
      'clinic',
      'appointment',
      'nutrition',
    ],
  },
  {
    theme: '#money',
    keywords: [
      'money',
      'debt',
      'bills',
      'rent',
      'salary',
      'income',
      'budget',
      'tax',
      'taxes',
      'bank',
      'payment',
      'invoice',
      'accountant',
      'finance',
      'financial',
      'savings',
      'investment',
      'mortgage',
      'utilities',
    ],
  },
  {
    theme: '#relationships',
    keywords: [
      'relationship',
      'partner',
      'friend',
      'friends',
      'family',
      'dating',
      'girlfriend',
      'boyfriend',
      'spouse',
      'marriage',
      'parents',
      'children',
      'kids',
    ],
  },
  {
    theme: '#sleep',
    keywords: ['sleep', 'insomnia', 'tired', 'bedtime', 'nap', 'rest', 'fatigue'],
  },
  // Note: #journal, #idea, #reference are added via subtype parameter, not keyword matching
];

/**
 * Normalize a tag token for comparison
 * Strips #, *, @ prefixes and lowercases
 */
function normalizeTagToken(tag: string): string {
  return tag
    .replace(/^[#*@]/, '')
    .toLowerCase()
    .trim();
}

/**
 * Enriches a tag list with canonical theme tags based on text content, existing tags, AND log subtype.
 *
 * Phase 4B: This is ADDITIVE - theme tags are added alongside specific tags, never replacing them.
 *
 * @param text - The source text to analyze (title, body, or rawSentence)
 * @param tags - Current tags (after quality filtering)
 * @param logSubtype - Optional log subtype for subtype-driven theme tags (journal/idea/reference)
 * @returns Enriched tag list with theme tags added (if applicable)
 *
 * Detection logic:
 * 1. If logSubtype is provided (journal/idea/reference), adds corresponding theme tag
 * 2. Checks if any keyword matches in the text (case-insensitive substring match)
 * 3. Checks if any keyword matches in existing tag tokens
 * 4. If either matches, adds the theme tag (if not already present)
 *
 * Examples:
 * - applyThemeTags("Start running every morning", ["#running"])
 *   => ["#running", "#exercise"]
 * - applyThemeTags("I'm feeling overwhelmed", [], 'journal')
 *   => ["#journal"]
 * - applyThemeTags("Idea: new meeting format", [], 'idea')
 *   => ["#idea"]
 * - applyThemeTags("General note about something", [], 'catchall')
 *   => ["#catchall"]
 */
export function applyThemeTags(text: string, tags: string[], logSubtype?: NoteSubtype): string[] {
  if (!text && (!tags || tags.length === 0) && !logSubtype) {
    return tags || [];
  }

  const lowerText = (text || '').toLowerCase();
  const normalizedExisting = new Set(tags.map((tag) => normalizeTagToken(tag)));
  const result = [...tags]; // Start with all existing tags

  // LS2: Add subtype-driven theme tags for logs (journal/idea/catchall/reference)
  // Note: All NoteSubtype values get a corresponding tag
  if (logSubtype) {
    const subtypeTheme = `#${logSubtype}`; // e.g. #journal, #idea, #catchall, #reference
    const themeToken = normalizeTagToken(subtypeTheme);

    if (!normalizedExisting.has(themeToken)) {
      result.push(subtypeTheme);
      normalizedExisting.add(themeToken); // Track to avoid duplicates
    }
  }

  // Add keyword-based theme tags
  for (const rule of THEME_RULES) {
    // Check if theme already present (case-insensitive)
    const themeToken = normalizeTagToken(rule.theme);
    if (normalizedExisting.has(themeToken)) {
      continue; // Theme already present, skip
    }

    // Check if any keyword matches in text OR in existing tags
    const hitInText = rule.keywords.some((kw) => lowerText.includes(kw.toLowerCase()));
    const hitInTags = rule.keywords.some((kw) =>
      Array.from(normalizedExisting).some((tok) => tok.includes(kw.toLowerCase())),
    );

    if (hitInText || hitInTags) {
      result.push(rule.theme);
      normalizedExisting.add(themeToken); // Track to avoid duplicates
    }
  }

  return result;
}

/**
 * Export THEME_RULES for testing purposes
 */
export { THEME_RULES };
