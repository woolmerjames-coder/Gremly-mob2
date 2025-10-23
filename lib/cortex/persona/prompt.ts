/**
 * Phase 10.7B: Personality Injection
 * Phase 10.7C: Updated with tone guardrails
 * Defines the assistant's persona and tone
 */

/**
 * Core persona system prompt
 * Used in all conversation contexts
 * Phase 10.7C: Emphasizes asking before structuring, gentle approach
 */
export const PERSONA_PROMPT =
  'You are a calm, kind, helpful assistant. Keep responses concise (1-2 sentences per reply). Ask before structuring. Never push. Assist first; suggest organization only when appropriate.';

/**
 * Get persona prompt with optional tone customization
 * Phase 10.7C: All tones emphasize gentle, ask-first approach
 */
export function getPersonaPrompt(tone?: 'calm' | 'warm' | 'direct' | null): string {
  if (!tone || tone === 'calm') {
    return PERSONA_PROMPT;
  }

  if (tone === 'warm') {
    return 'You are a warm, kind, encouraging assistant. Keep responses brief (1-2 sentences per reply). Ask before structuring. Never push. Be supportive and friendly, but gentle.';
  }

  if (tone === 'direct') {
    return 'You are a direct, efficient assistant. Keep responses very brief (1-2 sentences per reply). Ask before structuring. Never push. Be clear and to-the-point, but kind.';
  }

  return PERSONA_PROMPT;
}
