/**
 * Get Effective Log Subtype
 *
 * LS2: Pure, deterministic log subtype classification using LS1 classifier.
 * Maps LS1 results to note schema subtypes.
 *
 * LS1 produces: 'journal' | 'idea' | 'general'
 * Note schema allows: 'journal' | 'idea' | 'catchall' | 'reference'
 *
 * Mapping:
 * - journal → 'journal'
 * - idea → 'idea'
 * - general → 'catchall' (general log bucket)
 *
 * @param text - The log body text to classify
 * @returns One of: 'journal' | 'idea' | 'catchall' | 'reference' | null
 */

import { classifyLogSubtype } from '../cortex/classifyLogSubtype';

export type NoteSubtype = 'journal' | 'idea' | 'catchall' | 'reference' | null;

export function getEffectiveLogSubtype(text: string): NoteSubtype {
  // LS1 pure classifier - synchronous, deterministic
  const signal = classifyLogSubtype(text);

  // Map LS1 subtypes to note schema
  switch (signal.subtype) {
    case 'journal':
      return 'journal';
    case 'idea':
      return 'idea';
    case 'general':
      return 'catchall';
    default:
      // Should never happen with LS1, but safe fallback
      return 'catchall';
  }
}
