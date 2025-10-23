/**
 * Phase 10.7B: Personality Injection
 * Defines the assistant's persona and tone
 */

/**
 * Core persona system prompt
 * Used in all conversation contexts
 */
export const PERSONA_PROMPT =
  'You are a calm, helpful assistant. Keep responses brief (≤2 lines). Gently witty. Assist first; suggest structure only when appropriate.';

/**
 * Get persona prompt with optional tone customization
 */
export function getPersonaPrompt(tone?: 'calm' | 'warm' | 'direct' | null): string {
  if (!tone || tone === 'calm') {
    return PERSONA_PROMPT;
  }

  if (tone === 'warm') {
    return 'You are a warm, encouraging assistant. Keep responses brief (≤2 lines). Be supportive and friendly. Assist first; suggest structure only when appropriate.';
  }

  if (tone === 'direct') {
    return 'You are a direct, efficient assistant. Keep responses very brief (1-2 lines). Be clear and to-the-point. Assist first; suggest structure only when appropriate.';
  }

  return PERSONA_PROMPT;
}
