/**
 * Phase 2 Enrichment Validation
 *
 * Validates and corrects AI enrichment results to prevent hallucinations
 * and ensure data quality.
 */

import type { MindDropBucket } from './types';

// Import Phase2Result type (we define it here to avoid circular deps)
export interface Phase2Result {
  smartTitle: string;
  tags: string[];
  timeEstimateMinutes: number | null;
  extractedDate: string | null;
  extractedFrequency: string | null;
  people: string[];
}

export interface EnrichmentValidation {
  isValid: boolean;
  issues: string[];
  correctedResult?: Partial<Phase2Result>;
}

// --- Helpers ---

/**
 * Generate a fallback title from text.
 * Takes first 60 chars, breaks at word boundary if possible, adds '...' if truncated.
 */
export function generateFallbackTitle(text: string): string {
  const cleaned = text.trim().replace(/\s+/g, ' ');

  if (cleaned.length <= 60) {
    return cleaned;
  }

  // Find a word boundary within first 60 chars
  const truncated = cleaned.substring(0, 60);
  const lastSpace = truncated.lastIndexOf(' ');

  // If there's a space and it's not too early, break there
  if (lastSpace > 40) {
    return truncated.substring(0, lastSpace) + '...';
  }

  // Otherwise just truncate at 57 chars + '...'
  return truncated.substring(0, 57) + '...';
}

/**
 * Extract significant words (>3 chars) from text, lowercase
 */
function extractWords(text: string, maxWords?: number): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3);

  const limited = maxWords ? words.slice(0, maxWords) : words;
  return new Set(limited);
}

/**
 * Check if a string appears in text (case-insensitive)
 */
function appearsInText(needle: string, haystack: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Parse a date string and check if it's valid
 */
function parseDate(dateStr: string): Date | null {
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

// --- Main Validation Function ---

const GENERIC_TITLES = new Set([
  'untitled',
  'note',
  'task',
  'item',
  'entry',
  'thought',
  'todo',
  'idea',
  'reminder',
  'memo',
]);

/**
 * Validate and correct AI enrichment results.
 *
 * @param result - The Phase2Result from the API
 * @param originalText - The original text that was enriched
 * @param bucket - The classified bucket type
 * @returns EnrichmentValidation with issues and corrected values
 */
export function validateEnrichmentResult(
  result: Phase2Result,
  originalText: string,
  bucket: MindDropBucket,
): EnrichmentValidation {
  const issues: string[] = [];
  const corrections: Partial<Phase2Result> = {};
  let needsCorrection = false;

  const fallbackTitle = generateFallbackTitle(originalText);

  // --- 1. Title Length Validation ---
  if (result.smartTitle.length < 3) {
    issues.push('title_too_short');
    corrections.smartTitle = fallbackTitle;
    needsCorrection = true;
  } else if (result.smartTitle.length > 80) {
    issues.push('title_too_long');
    corrections.smartTitle = result.smartTitle.substring(0, 77) + '...';
    needsCorrection = true;
  }

  // --- 2. Title Relevance Validation ---
  if (!corrections.smartTitle) {
    const titleWords = extractWords(result.smartTitle);
    const textWords = extractWords(originalText, 20);

    // Check if any title word (>3 chars) appears in first 20 words of text
    let hasOverlap = false;
    for (const word of titleWords) {
      if (textWords.has(word)) {
        hasOverlap = true;
        break;
      }
    }

    if (!hasOverlap && titleWords.size > 0) {
      issues.push('title_no_overlap');
      corrections.smartTitle = fallbackTitle;
      needsCorrection = true;
    }
  }

  // --- 3. Generic Title Check ---
  if (!corrections.smartTitle) {
    const normalizedTitle = result.smartTitle.trim().toLowerCase();
    if (GENERIC_TITLES.has(normalizedTitle)) {
      issues.push('title_generic');
      corrections.smartTitle = fallbackTitle;
      needsCorrection = true;
    }
  }

  // --- 4. People Validation (hallucination check) ---
  if (result.people.length > 0) {
    const validPeople = result.people.filter((person) => appearsInText(person, originalText));

    if (validPeople.length < result.people.length) {
      issues.push('hallucinated_people');
      corrections.people = validPeople;
      needsCorrection = true;
    }
  }

  // --- 5. Date Validation ---
  if (result.extractedDate) {
    const parsed = parseDate(result.extractedDate);

    if (parsed) {
      const now = new Date();
      const oneYearAgo = new Date(now);
      oneYearAgo.setFullYear(now.getFullYear() - 1);

      const twoYearsFromNow = new Date(now);
      twoYearsFromNow.setFullYear(now.getFullYear() + 2);

      if (parsed < oneYearAgo || parsed > twoYearsFromNow) {
        issues.push('date_implausible');
        corrections.extractedDate = null;
        needsCorrection = true;
      }
    } else {
      // Invalid date format
      issues.push('date_invalid_format');
      corrections.extractedDate = null;
      needsCorrection = true;
    }
  }

  // --- 6. Time Estimate Validation ---
  if (result.timeEstimateMinutes !== null && bucket !== 'todo') {
    issues.push('time_estimate_wrong_bucket');
    corrections.timeEstimateMinutes = null;
    needsCorrection = true;
  }

  return {
    isValid: issues.length === 0,
    issues,
    ...(needsCorrection ? { correctedResult: corrections } : {}),
  };
}
