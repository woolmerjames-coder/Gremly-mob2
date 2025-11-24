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
import { resolveCanonicalIntent, type CanonicalType } from './canonicalIntent';

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
• < 50%: Unclear intent, meta-comment, or very vague, e.g. "hmm", "interesting", "idk"

**Consider:**
• Strong action verbs → higher To-Do confidence
• Recurring language ("daily", "every", "each morning", "every week") → higher Habit confidence
• Past tense narratives → higher Log confidence

**CRITICAL DISTINCTION - 'log' vs 'ignore':**

'log' should be used for:
  - Reflective thoughts: "just thinking about", "wondering if", "maybe I should"
  - Vague plans: "someday I want to", "might do this later", "considering"
  - Internal monologue: "thinking about messaging Alex", "could start a side hustle"
  - Past tense reflections: "talked to Sarah about project"
  - ANY thought or idea the user might want to remember later

'ignore' should ONLY be used for:
  - Meta-comments about the app: "this app is confusing", "how does this work?"
  - Explicit opt-outs: "don't save this", "never mind", "forget it", "stop"
  - Feedback about the app: "you made a mistake", "that doesn't make sense"
  - Questions about the app's behavior: "why did you do that?"

When in doubt between 'log' and 'ignore', choose 'log' with low confidence (< 50).

**CRITICAL - Output Format:**
You MUST return a JSON object with this EXACT structure.
The top-level key MUST be "type" (not "category" or anything else).

{
  "type": "todo" | "habit" | "log" | "ignore",
  "confidence": number
}

Example valid outputs:
{"type": "todo", "confidence": 95}
{"type": "habit", "confidence": 88}
{"type": "log", "confidence": 62}
{"type": "log", "confidence": 40}  ← Use this for vague reflective thoughts
{"type": "ignore", "confidence": 30}  ← Only for meta-comments/feedback

Do not include any other fields or commentary. Use "type" as the key.`;

/**
 * Mapping from AI type strings to IntentKind
 */
const AI_TYPE_TO_INTENT_KIND: Record<string, IntentKind> = {
  todo: 'todo',
  habit: 'habit',
  log: 'note',
  note: 'note',
  ignore: 'none',
  none: 'none',
  question: 'question',
};

/**
 * Mapping from canonical types to IntentKind
 */
const CANONICAL_TO_INTENT_KIND: Record<CanonicalType, IntentKind> = {
  todo: 'todo',
  habit: 'habit',
  log: 'note',
  meta: 'question',
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
    // Call AI classifier with full text (no truncation for better accuracy)
    const result = await callClassify({
      messages: [
        { role: 'system', content: AI_CLASSIFICATION_PROMPT },
        { role: 'user', content: text }, // Pass full text, not truncated
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

    // Extract type from AI response - prefer 'type' field, fall back to 'category' for backward compat
    const rawType = parsed.type ?? parsed.category;

    // Parse and validate confidence
    const aiConfidence = parseConfidence(parsed.confidence);

    // Use canonical intent resolver for unified decision logic
    const canonical = resolveCanonicalIntent({
      ruleKind: fallback.kind,
      ruleConfidence: fallback.confidence,
      aiCategory: rawType,
      aiConfidence: (aiConfidence ?? 0) / 100, // Normalize to 0-1 scale
      text,
    }); // Map canonical type back to IntentKind
    const finalKind = CANONICAL_TO_INTENT_KIND[canonical.type];

    // Build result with canonical classification
    const detectedIntent: DetectedIntent = {
      ...fallback,
      kind: finalKind,
      confidence: canonical.confidence,
      aiConfidence, // Keep raw 0-100 score
      suppressChips: canonical.suppressChips,
      title: text,
    };

    // Development-only logging for Mind Drop AI classification
    if (__DEV__) {
      const trimmedText = text.length > 120 ? text.slice(0, 120) + '…' : text;
      console.log(
        `[MindDrop AI] type=${canonical.type} ai_confidence=${aiConfidence ?? 'null'} text="${trimmedText}"`,
      );
      console.log(`[CanonicalIntent] ${canonical.reasoning}`);
    }

    return detectedIntent;
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
