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
 * NOTE: This prompt is now DEPRECATED and no longer used by the Cloudflare Worker.
 * The worker uses its own master classifier spec with bucket/type/subtype.
 * This is kept for backward compatibility with old OpenAI fallback path only.
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
    // The Cloudflare worker applies its own master classifier prompt
    const result = await callClassify({
      text, // Pass full text - worker will apply master classifier spec
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

    // Parse AI response using new unified classifier response
    const classification = result.classification;

    if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
      console.log('[classifyIntentWithAI] AI response:', {
        bucket: classification.bucket,
        type: classification.type,
        subtype: classification.subtype,
        confidence: classification.confidence,
        title: classification.title,
        tags: classification.tags,
      });
    }

    // Extract bucket/type/subtype from unified response (confidence is 0-100)
    // Backward compatibility: if bucket/type/subtype are missing, derive from category
    let bucket = classification.bucket;
    let type = classification.type;
    let subtype = classification.subtype;
    const classifierTitle = classification.title;
    const classifierTags = classification.tags;

    // BACKWARD COMPATIBILITY: Handle old test mocks that only have 'category'
    if (!bucket && classification.category) {
      // Try to parse category as JSON (old OpenAI format)
      let parsed: any = classification;
      if (typeof classification.category === 'string') {
        try {
          const maybeJson = JSON.parse(classification.category);
          if (typeof maybeJson === 'object' && maybeJson !== null) {
            parsed = maybeJson;
          }
        } catch {
          // Not JSON, treat category as simple string
        }
      }

      // Extract type from parsed JSON or use category directly
      const rawType = parsed.type ?? parsed.category ?? classification.category;
      const category = String(rawType).toLowerCase();

      if (category === 'todo') {
        bucket = 'todo';
        type = 'todo';
        subtype = null;
      } else if (category === 'habit') {
        bucket = 'habit';
        type = 'habit';
        subtype = null;
      } else if (category === 'log' || category === 'note') {
        bucket = 'log-general';
        type = 'log';
        subtype = 'general';
      } else if (category === 'ignore') {
        bucket = 'unsorted';
        type = 'ignore';
        subtype = null;
      } else {
        bucket = 'log-general';
        type = 'log';
        subtype = 'general';
      }
    }

    const aiConfidence = parseConfidence(classification.confidence);

    // Use canonical intent resolver with new unified classifier response
    const canonical = resolveCanonicalIntent({
      ruleKind: fallback.kind,
      ruleConfidence: fallback.confidence,
      aiBucket: bucket,
      aiType: type,
      aiSubtype: subtype,
      aiConfidence: (aiConfidence ?? 0) / 100, // Normalize to 0-1 scale for canonical resolver
      text,
    });

    // Map canonical type back to IntentKind
    const finalKind = CANONICAL_TO_INTENT_KIND[canonical.type];

    // Build result with canonical classification
    const detectedIntent: DetectedIntent = {
      ...fallback,
      kind: finalKind,
      confidence: canonical.confidence,
      aiConfidence, // Keep raw 0-100 score
      suppressChips: canonical.suppressChips,
      title: text,
      // Phase 4: Pass through unified classifier fields
      classifierBucket: bucket,
      classifierType: type,
      classifierSubtype: subtype,
      classifierTitle,
      classifierTags,
      // Phase 3.2: Store canonical result to avoid recomputing in cortexDecide
      canonicalType: canonical.type,
      canonicalAllowAutoCreate: canonical.allowAutoCreate,
      canonicalSuppressChips: canonical.suppressChips,
      canonicalConfidence: canonical.confidence,
      canonicalReasoning: canonical.reasoning,
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
