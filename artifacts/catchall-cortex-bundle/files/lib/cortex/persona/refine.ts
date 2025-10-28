/**
 * Phase 11.7+: Response Refinement
 *
 * Post-processes AI responses to enforce Gremly brand voice:
 * - Remove generic assistant phrases
 * - Limit verbosity (max 2 sentences)
 * - Clean up extra whitespace
 */

/**
 * Generic phrases to remove from AI responses
 * These patterns make Gremly sound like a generic assistant
 */
const GENERIC_PHRASES = [
  /I've made a note( that)?/gi,
  /I'll make a note( that)?/gi,
  /Is there anything else( you'd like)?/gi,
  /How can I assist( you)?( today)?/gi,
  /Let me know if( you need)?/gi,
  /Feel free to/gi,
  /Would you like me to/gi,
  /I can help you( with)?/gi,
  /I'm here to help/gi,
  /Don't hesitate to/gi,
  /If you need anything/gi,
  /I'll be happy to/gi,
  /I'd be happy to/gi,
  /The .+ has been saved/gi,
  /for easy access later/gi,
];

/**
 * Refine an AI response to match Gremly brand voice
 *
 * @param response - Raw AI response text
 * @returns Refined response (shorter, more on-brand)
 *
 * @example
 * refineAIResponse("I've made a note that Casey works at Google. Is there anything else?")
 * // "Casey works at Google."
 *
 * @example
 * refineAIResponse("I'll help you with that! What would you like to do first? Would you like me to create a habit?")
 * // "What would you like to do first?"
 */
export function refineAIResponse(response: string): string {
  if (!response || typeof response !== 'string') {
    return response;
  }

  let refined = response.trim();

  // Step 1: Remove generic phrases
  GENERIC_PHRASES.forEach((phrase) => {
    refined = refined.replace(phrase, '');
  });

  // Step 2: Limit to first 2 sentences (avoid wordiness)
  // Match sentences ending with . ! or ?
  const sentences = refined.match(/[^.!?]+[.!?]+/g) || [];
  if (sentences.length > 2) {
    refined = sentences.slice(0, 2).join(' ');
  }

  // Step 3: Clean up extra whitespace and punctuation
  refined = refined
    .replace(/\s+/g, ' ') // Multiple spaces → single space
    .replace(/\s+([,.!?])/g, '$1') // Space before punctuation
    .replace(/([.!?]){2,}/g, '$1') // Multiple punctuation → single
    .trim();

  // Step 4: If we ended up with nothing, return a fallback
  if (!refined || refined.length < 2) {
    return response; // Return original if refinement failed
  }

  return refined;
}

/**
 * Check if a response should skip refinement
 * Some responses (like structured data, JSON, code) shouldn't be refined
 *
 * @param response - Raw response text
 * @returns true if refinement should be skipped
 */
export function shouldSkipRefinement(response: string): boolean {
  if (!response) return true;

  // Skip if response looks like structured data
  const trimmed = response.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return true; // JSON
  }

  if (trimmed.startsWith('```')) {
    return true; // Code block
  }

  // Skip very short responses (already refined)
  if (trimmed.length < 20) {
    return true;
  }

  return false;
}

/**
 * Smart refinement with automatic skip detection
 *
 * @param response - Raw AI response
 * @returns Refined response or original if skipped
 */
export function smartRefine(response: string): string {
  if (shouldSkipRefinement(response)) {
    return response;
  }
  return refineAIResponse(response);
}
