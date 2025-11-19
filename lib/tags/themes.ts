/**
 * Theme Tag Enrichment
 *
 * Adds canonical theme tags (e.g., #exercise, #work, #health) to entities
 * based on pattern matching in the entity's text content.
 *
 * This is applied as a post-processing step in BackgroundPrefill after
 * AI tag merging and quality filtering.
 */

type ThemeRule = {
  theme: string; // e.g. "#exercise"
  patterns: RegExp[]; // any of these matching suggests this theme
};

/**
 * Canonical theme tags with their detection patterns.
 * Keep this small and opinionated - only add themes that provide
 * clear value across many use cases.
 */
const THEME_RULES: ThemeRule[] = [
  {
    theme: '#exercise',
    patterns: [
      /\brun\b/i,
      /\brunning\b/i,
      /\bjog\b/i,
      /\bjogging\b/i,
      /\bworkout\b/i,
      /\bgym\b/i,
      /\bcardio\b/i,
      /\byoga\b/i,
      /\bswim\b/i,
      /\bswimming\b/i,
      /\bfitness\b/i,
      /\btraining\b/i,
      /\bhiking\b/i,
      /\bcycling\b/i,
      /\bbiking\b/i,
    ],
  },
  {
    theme: '#work',
    patterns: [
      /\bwork\b/i,
      /\bmeeting\b/i,
      /\bdeadline\b/i,
      /\bpresentation\b/i,
      /\bclient\b/i,
      /\bboss\b/i,
      /\bproject\b/i,
      /\boffice\b/i,
      /\breport\b/i,
      /\bconference\b/i,
    ],
  },
  {
    theme: '#health',
    patterns: [
      /\bdoctor\b/i,
      /\bdentist\b/i,
      /\btherapy\b/i,
      /\btherapist\b/i,
      /\bmeds?\b/i,
      /\bhealth\b/i,
      /\bsick\b/i,
      /\bappointment\b/i,
      /\bmedical\b/i,
      /\bcheckup\b/i,
      /\bhospital\b/i,
      /\bclinic\b/i,
    ],
  },
  {
    theme: '#finance',
    patterns: [
      /\btax\b/i,
      /\btaxes\b/i,
      /\bbudget\b/i,
      /\bmoney\b/i,
      /\bbank\b/i,
      /\bpay\b/i,
      /\bpaying\b/i,
      /\bbill\b/i,
      /\bbills\b/i,
      /\binvoice\b/i,
      /\baccountant\b/i,
      /\bfinance\b/i,
      /\bfinancial\b/i,
    ],
  },
  {
    theme: '#home',
    patterns: [
      /\bclean\b/i,
      /\bcleaning\b/i,
      /\blaundry\b/i,
      /\bgrocery\b/i,
      /\bgroceries\b/i,
      /\brepair\b/i,
      /\bmaintenance\b/i,
      /\bplumber\b/i,
      /\belectrician\b/i,
      /\bhousehold\b/i,
    ],
  },
];

/**
 * Enriches a tag list with canonical theme tags based on text content.
 *
 * @param text - The source text to analyze (title, body, or textPreview)
 * @param tags - Current tags (after quality filtering)
 * @returns Enriched tag list with theme tags added (if applicable)
 *
 * Rules:
 * - Only adds a theme tag if it's not already present (case-insensitive)
 * - Only adds if at least one pattern matches the text
 * - Preserves all existing tags
 * - Returns deduplicated list
 *
 * Example:
 * applyThemeTags("Start running every morning", ["#running", "#morning"])
 * => ["#running", "#morning", "#exercise"]
 */
export function applyThemeTags(text: string, tags: string[]): string[] {
  if (!text || !text.trim()) {
    return tags;
  }

  const lowerText = text.toLowerCase();
  const present = new Set(tags);

  for (const rule of THEME_RULES) {
    // Check if theme already present (case-insensitive)
    const alreadyPresent = Array.from(present).some(
      (tag) => tag.replace(/^#/, '').toLowerCase() === rule.theme.replace(/^#/, '').toLowerCase(),
    );
    if (alreadyPresent) {
      continue;
    }

    // Check if any pattern matches
    const matches = rule.patterns.some((re) => re.test(lowerText));
    if (matches) {
      present.add(rule.theme);
    }
  }

  return Array.from(present);
}

/**
 * Export THEME_RULES for testing purposes
 */
export { THEME_RULES };
