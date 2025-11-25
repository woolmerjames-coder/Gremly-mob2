/**
 * Get Effective Log Subtype
 *
 * LS2: Pure, deterministic log subtype classification using LS1 classifier.
 * Maps LS1 results to note schema subtypes.
 *
 * Phase 3: Worker produces: 'journal' | 'idea' | 'general'
 * LS1 produces: 'journal' | 'idea' | 'general'
 * Note schema now supports: 'journal' | 'idea' | 'general' | 'catchall' | 'reference'
 *
 * Phase 3 Mapping (worker → schema):
 * - journal → 'journal'
 * - idea → 'idea'
 * - general → 'general' (phase 3: new canonical subtype)
 * - catchall → 'catchall' (legacy only, worker never produces this)
 *
 * @param text - The log body text to classify
 * @returns One of: 'journal' | 'idea' | 'general' | 'catchall' | 'reference' | null
 */

import { classifyLogSubtype } from '../cortex/classifyLogSubtype';

export type NoteSubtype = 'journal' | 'idea' | 'general' | 'catchall' | 'reference' | null;

export function getEffectiveLogSubtype(text: string): NoteSubtype {
  // LS1 pure classifier - synchronous, deterministic
  const signal = classifyLogSubtype(text);

  // Phase 3: Map LS1 subtypes to note schema (preserve 'general')
  switch (signal.subtype) {
    case 'journal':
      return 'journal';
    case 'idea':
      return 'idea';
    case 'general':
      return 'general'; // Phase 3: New canonical subtype (not catchall)
    default:
      // Should never happen with LS1, but safe fallback
      return 'general';
  }
}
