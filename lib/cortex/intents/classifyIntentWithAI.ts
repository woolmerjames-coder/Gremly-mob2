/**
 * Phase 11.8: AI-Powered Intent Classification with Confidence Scoring
 *
 * Extends the existing rule-based classifyIntent with AI-powered classification
 * that includes confidence scoring (0-100).
 *
 * Option B Implementation:
 * - Does NOT replace existing classification
 * - Adds AI as an enhancement with confidence score
 * - Falls back to rule-based classification on error/timeout
 * - Plumbs aiConfidence through DetectedIntent for future use
 */

import { callClassify } from '../CortexClient';
import { classifyIntent } from './intentRules';
import type { DetectedIntent, IntentKind } from './types';

/**
 * AI Classification Prompt
 *
 * Instructs the AI to classify user input and return a confidence score
 * based on explicit scoring rules.
 */
const AI_CLASSIFICATION_PROMPT = `You are an intent classifier for a productivity app. Analyze user input and determine:
1. The intent type (todo, habit, log, or ignore)
2. A confidence score (0-100) based on explicit rules

**Scoring Rules:**
• 90-100%: Contains explicit keywords like "todo:", "habit:", "remind me to", "I need to", "I have to", "please remember to"
• 75-89%: Clear intent with action verbs or patterns, e.g. "call dentist", "email Sarah", "meditate daily", "go running three times a week"
• 50-74%: Ambiguous, could be multiple types, e.g. "talked to Sarah about project", "thinking about starting a side hustle"
• < 50%: Unclear intent, meta-comment, or very vague, e.g. "hmm", "interesting", "idk", "just thinking"

**Consider:**
• Strong action verbs → higher To-Do confidence
• Recurring language ("daily", "every", "each morning", "every week") → higher Habit confidence
• Past tense narratives → higher Log confidence

**Output Format:**
Return ONLY a JSON object with this exact structure:
{
  "type": "todo" | "habit" | "log" | "ignore",
  "confidence": number
}

Do not include any other fields or commentary.`;

/**
 * Mapping from AI types to IntentKind
 */
const AI_TYPE_TO_INTENT_KIND: Record<string, IntentKind> = {
  todo: 'todo',
  habit: 'habit',
  log: 'note', // AI "log" maps to "note" intent kind
  ignore: 'none',
};

/**
 * Parse and validate AI confidence score
 *
 * @param raw - Raw confidence value from AI
 * @returns Validated integer 0-100, or undefined if invalid
 */
function parseConfidence(raw: unknown): number | undefined {
  if (typeof raw !== 'number') {
    return undefined;
  }

  const rounded = Math.round(raw);
  if (rounded < 0 || rounded > 100) {
    return undefined;
  }

  return rounded;
}

/**
 * Normalize AI type to IntentKind
 *
 * @param raw - Raw type string from AI
 * @returns Normalized IntentKind or undefined if invalid
 */
function normalizeAIType(raw: unknown): IntentKind | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }

  const normalized = raw.toLowerCase().trim();
  return AI_TYPE_TO_INTENT_KIND[normalized];
}

/**
 * Classify user intent with AI-powered confidence scoring
 *
 * This function extends the existing rule-based classification with AI:
 * 1. Calls AI classifier to get type + confidence
 * 2. Falls back to rule-based classification on error/timeout
 * 3. Returns DetectedIntent with optional aiConfidence field
 *
 * **Behavior:**
 * - On success: Returns AI classification with aiConfidence (0-100)
 * - On error/timeout: Returns rule-based classification without aiConfidence
 * - Invalid confidence: Sets aiConfidence to undefined but keeps AI type
 *
 * **Performance:**
 * - Timeout: 2500ms (configurable)
 * - Single-flight dedupe via CortexClient
 * - Non-blocking: always returns a result
 *
 * @param text - User input text to classify
 * @param timeoutMs - Optional timeout in milliseconds (default: 2500)
 * @returns DetectedIntent with optional aiConfidence field
 */
export async function classifyIntentWithAI(
  text: string,
  timeoutMs = 2500,
): Promise<DetectedIntent> {
  // Get rule-based classification as fallback
  const fallback = classifyIntent(text);

  // Early return for empty input
  if (!text || text.trim().length === 0) {
    return fallback;
  }

  try {
    // Call AI classifier
    const result = await callClassify({
      messages: [
        { role: 'system', content: AI_CLASSIFICATION_PROMPT },
        { role: 'user', content: text.slice(0, 500) }, // Limit to 500 chars
      ],
      timeoutMs,
    });

    // Handle AI errors/timeouts
    if (!result.ok) {
      if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
        console.log(
          '[classifyIntentWithAI] AI classification failed, using fallback:',
          result.error,
        );
      }
      return fallback;
    }

    // Parse AI response
    const raw = result.classification;
    if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
      console.log('[classifyIntentWithAI] AI raw response:', {
        category: raw.category,
        confidence: raw.confidence,
      });
    }

    // Try to parse as JSON if category is a JSON string
    let parsed: any = raw;
    if (typeof raw.category === 'string') {
      try {
        const maybeJson = JSON.parse(raw.category);
        if (typeof maybeJson === 'object' && maybeJson !== null) {
          parsed = maybeJson;
        }
      } catch {
        // Not JSON, treat raw.category as type string
        parsed = { type: raw.category, confidence: raw.confidence };
      }
    }

    // Normalize type
    const aiType = normalizeAIType(parsed.type);
    if (!aiType) {
      if (__DEV__) {
        console.warn('[classifyIntentWithAI] Invalid AI type, using fallback:', parsed.type);
      }
      return fallback;
    }

    // Parse and validate confidence
    const aiConfidence = parseConfidence(parsed.confidence);

    // Build result with AI classification
    return {
      ...fallback,
      kind: aiType,
      confidence: aiConfidence ? aiConfidence / 100 : fallback.confidence, // Normalize to 0-1
      aiConfidence, // Keep raw 0-100 score
      title: text,
    };
  } catch (error) {
    // Catch-all error handler
    if (__DEV__) {
      console.error('[classifyIntentWithAI] Unexpected error, using fallback:', error);
    }
    return fallback;
  }
}

/**
 * Check if AI classification is available
 *
 * @returns true if AI is enabled and available
 */
export function isAIClassificationAvailable(): boolean {
  // Check if AI is disabled via env var
  const disabled =
    process.env.EXPO_PUBLIC_DISABLE_AI === 'true' || process.env.EXPO_PUBLIC_DISABLE_AI === '1';
  const cortexUrl = process.env.EXPO_PUBLIC_CORTEX_URL;

  return !disabled && !!cortexUrl;
}
