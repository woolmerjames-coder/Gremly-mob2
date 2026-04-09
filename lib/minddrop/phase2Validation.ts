/**
 * Phase 2 Enrichment Validation
 *
 * Validates and corrects AI enrichment results to prevent hallucinations
 * and ensure data quality.
 */

import type { MindDropBucket } from './types';
import { getDateService } from '../date/DateService';

// Import Phase2Result type (we define it here to avoid circular deps)
export interface Phase2Result {
  smartTitle: string;
  tags: string[];
  timeEstimateMinutes: number | null;
  extractedDate: string | null;
  extractedStartDate: string | null;
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

  // --- 2. Generic Title Check ---
  if (!corrections.smartTitle) {
    const normalizedTitle = result.smartTitle.trim().toLowerCase();
    if (GENERIC_TITLES.has(normalizedTitle)) {
      issues.push('title_generic');
      corrections.smartTitle = fallbackTitle;
      needsCorrection = true;
    }
  }

  // --- 3. People Validation (hallucination check) ---
  if (result.people.length > 0) {
    const validPeople = result.people.filter((person) => appearsInText(person, originalText));

    if (validPeople.length < result.people.length) {
      issues.push('hallucinated_people');
      corrections.people = validPeople;
      needsCorrection = true;
    }
  }

  // --- 4. Date Validation (using DateService) ---
  if (result.extractedDate) {
    const dateService = getDateService();
    const validatedDate = dateService.parseAIDate(result.extractedDate);

    if (validatedDate === null) {
      // parseAIDate returns null for invalid format OR implausible range
      issues.push('date_invalid_or_implausible');
      corrections.extractedDate = null;
      needsCorrection = true;
    } else if (validatedDate !== result.extractedDate) {
      // Date was normalized (e.g., had time component stripped)
      corrections.extractedDate = validatedDate;
      needsCorrection = true;
    }
  }

  // --- 4b. Start Date Validation for Habits ---
  if (result.extractedStartDate) {
    const dateService = getDateService();
    const validatedStartDate = dateService.parseAIDate(result.extractedStartDate);

    if (validatedStartDate === null) {
      issues.push('start_date_invalid_or_implausible');
      corrections.extractedStartDate = null;
      needsCorrection = true;
    } else if (validatedStartDate !== result.extractedStartDate) {
      corrections.extractedStartDate = validatedStartDate;
      needsCorrection = true;
    }
  }

  // --- 5. Time Estimate Validation ---
  if (result.timeEstimateMinutes !== null && bucket !== 'todo' && bucket !== 'habit') {
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

// --- Date Verification ---

/**
 * Independently verify a date returned by the Phase 2 LLM using chrono-node
 * via DateService.parseNaturalDate().
 */
export function verifyAIDate(
  originalText: string,
  aiDate: string,
  currentDate: string,
): {
  resolvedDate: string;
  confidence: 'verified' | 'llm_only' | 'chrono_override';
} {
  const chronoResult = getDateService().parseNaturalDate(originalText);

  if (!chronoResult) {
    return { resolvedDate: aiDate, confidence: 'llm_only' };
  }

  if (chronoResult.date === aiDate) {
    return { resolvedDate: aiDate, confidence: 'verified' };
  }

  console.warn('[verifyAIDate] chrono disagrees with AI date', {
    originalText,
    aiDate,
    chronoDate: chronoResult.date,
    currentDate,
  });
  return { resolvedDate: chronoResult.date, confidence: 'chrono_override' };
}
