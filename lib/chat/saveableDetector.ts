/**
 * Core saveable detection logic.
 *
 * This module analyzes assistant messages to determine if they contain
 * content worth saving (logs, todos, habits) and provides prefilled
 * data for the save overlay.
 *
 * @example
 * ```ts
 * const result = await detectSaveable({
 *   assistantMessage: "I'd suggest trying the Pomodoro technique - 25 min work, 5 min break.",
 *   userMessage: "How can I focus better?",
 * });
 *
 * if (shouldShowSaveButton(result, 'operational', false)) {
 *   // Show save button with result.prefill
 * }
 * ```
 */

import { callChat } from '../cortex/CortexClient';
import {
  SaveableResult,
  SaveableDetectionInput,
  SaveableType,
  SAVEABLE_THRESHOLDS,
  createNotSaveableResult,
  isSaveableType,
} from './saveableTypes';
import { detectFrequency } from './frequencyDetector';
import { ConversationMode } from './conversationMode';

// Re-export for convenience
export { createNotSaveableResult as createEmptySaveableResult };

// ============================================================================
// Logging
// ============================================================================

const log = (...args: any[]) => {
  if (__DEV__) {
    console.log('[SAVEABLE]', ...args);
  }
};

const logError = (...args: any[]) => {
  console.error('[SAVEABLE]', ...args);
};

// ============================================================================
// Detection Prompt
// ============================================================================

/**
 * System prompt for saveable content detection.
 *
 * Instructs the AI to analyze assistant responses and determine
 * if they contain content worth saving.
 */
export const SAVEABLE_DETECTION_PROMPT = `You are analyzing a conversation to determine if the assistant's response contains content worth saving.

Context: This is a productivity app for people with ADHD. Users can save: logs (notes/info), todos (tasks), habits (recurring behaviors).

ANALYZE THE ASSISTANT'S RESPONSE FOR SAVEABLE CONTENT:

SAVEABLE (show Save button):
- Recommendations or suggestions: "I'd suggest trying the Pomodoro technique"
- Plans or schedules: "Here's a workout split for the week..."
- Useful information: "The best time to visit is spring"
- User commitments: "Got it, you'll call the dentist tomorrow at 3pm"
- Recurring intentions: "Starting daily meditation at 7am"
- Lists or steps: "Here are 5 ways to improve focus..."

NOT SAVEABLE (no Save button):
- Greetings: "Hi! How can I help?"
- Questions: "What time works best for you?"
- Empathy without content: "That sounds frustrating"
- Meta-comments: "I understand" 
- Incomplete thoughts awaiting response
- Casual back-and-forth

TITLE RULES:
- Titles must be COMPLETE phrases, never cut off mid-sentence
- 3-7 words maximum
- Action-focused: Start with verb or noun describing the task/content
- Never end with 'and', 'for', 'to', 'the', or other connectors
- Match the content type: todos = action phrase, habits = behavior phrase, logs = topic phrase

CONTENT RULES:
- For todos/habits: Extract the SPECIFIC action or behavior, not the full paragraph
- Title and content should describe the SAME thing
- If multiple items mentioned, focus on the PRIMARY one

DETERMINE TYPE:
- "log-general": DEFAULT. Information, recommendations, notes. Use when unsure.
- "log-idea": Creative ideas, brainstorms, inspirations
- "log-journal": Time-anchored reflections, daily entries
- "todo": ONLY if there's a clear, specific, one-time action. Very high confidence required.
- "habit": ONLY if there's recurring behavior AND explicit frequency. Very high confidence required.

RESPOND IN JSON:
{
  "isSaveable": boolean,
  "confidence": number (0-1),
  "suggestedType": "log-general" | "log-idea" | "log-journal" | "todo" | "habit",
  "prefill": {
    "title": "SHORT action-focused title (3-7 words max). Must be a COMPLETE phrase, never truncated. Examples: 'Weekly alcohol check-in', 'January fitness plan', 'Call dentist tomorrow'. Do NOT include connecting words at the end like 'and', 'for', 'to'.",
    "content": "the relevant content to save",
    "tags": ["tag1", "tag2"],
    "dueDate": "For todos only. Use relative terms for simple cases: 'tomorrow', 'next_week', 'monday', '+3d'. For SPECIFIC month references like 'last week of January', 'end of February', 'mid-March', return the actual YYYY-MM-DD date (e.g., '2025-01-27' for last week of January). Return null if no date mentioned."
  },
  "reasoning": "brief explanation"
}`;

// ============================================================================
// Date Resolution
// ============================================================================

/**
 * Resolve relative date indicators to YYYY-MM-DD format.
 *
 * Handles: "tomorrow", "today", "+Nd" (e.g. "+3d"), "next_week",
 * weekday names (monday, tuesday, etc.)
 *
 * @returns YYYY-MM-DD string or undefined if not resolvable
 */
export function resolveRelativeDate(indicator: string | undefined): string | undefined {
  if (!indicator) return undefined;

  const normalized = indicator.toLowerCase().trim();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Helper to format date as YYYY-MM-DD
  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper to add days
  const addDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  // "today"
  if (normalized === 'today') {
    return formatDate(today);
  }

  // "tomorrow"
  if (normalized === 'tomorrow') {
    return formatDate(addDays(today, 1));
  }

  // "+Nd" format (e.g., "+3d", "+7d")
  const plusDaysMatch = normalized.match(/^\+(\d+)d$/);
  if (plusDaysMatch) {
    const days = parseInt(plusDaysMatch[1], 10);
    return formatDate(addDays(today, days));
  }

  // "next_week" or "next week"
  if (normalized === 'next_week' || normalized === 'next week') {
    return formatDate(addDays(today, 7));
  }

  // Weekday names - find next occurrence
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const weekdayIndex = weekdays.indexOf(normalized);
  if (weekdayIndex !== -1) {
    const currentDay = today.getDay();
    let daysUntil = weekdayIndex - currentDay;
    if (daysUntil <= 0) {
      daysUntil += 7; // Next week if today or past
    }
    return formatDate(addDays(today, daysUntil));
  }

  // Month-based references: "end of january", "late january", "last week of january", etc.
  const monthNames = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];

  for (let i = 0; i < monthNames.length; i++) {
    const month = monthNames[i];
    if (normalized.includes(month)) {
      // Determine year - if month is before current month, assume next year
      const currentMonth = today.getMonth();
      let targetYear = today.getFullYear();
      if (i < currentMonth) {
        targetYear += 1;
      }

      // Determine day within month based on qualifier
      let targetDay: number;
      if (
        normalized.includes('last week') ||
        normalized.includes('end of') ||
        normalized.includes('late')
      ) {
        // Last week of month = around 25th-28th
        targetDay = 27;
      } else if (normalized.includes('mid') || normalized.includes('middle')) {
        targetDay = 15;
      } else if (
        normalized.includes('early') ||
        normalized.includes('beginning') ||
        normalized.includes('first week')
      ) {
        targetDay = 7;
      } else {
        // Default to middle of month
        targetDay = 15;
      }

      // Clamp day to valid range for the month
      const lastDayOfMonth = new Date(targetYear, i + 1, 0).getDate();
      targetDay = Math.min(targetDay, lastDayOfMonth);

      const targetDate = new Date(targetYear, i, targetDay);
      return formatDate(targetDate);
    }
  }

  // Check if it's already a valid YYYY-MM-DD date (pass through)
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  // Not a recognized format
  log('DATE_RESOLVE', `Unrecognized date indicator: ${indicator}`);
  return undefined;
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Parse the AI response into a structured result.
 * Exported for testing.
 */
export function parseDetectionResponse(
  responseText: string,
  messageId: string,
): SaveableResult | null {
  try {
    // Try to extract JSON from the response
    let jsonStr = responseText.trim();

    // Handle markdown code blocks
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);

    // Validate required fields
    if (typeof parsed.isSaveable !== 'boolean') {
      log('PARSE_ERROR', 'Missing isSaveable field');
      return null;
    }

    if (typeof parsed.confidence !== 'number') {
      log('PARSE_ERROR', 'Missing confidence field');
      return null;
    }

    // Validate and normalize suggestedType
    let suggestedType: SaveableType = SAVEABLE_THRESHOLDS.DEFAULT_TYPE;
    if (parsed.suggestedType && isSaveableType(parsed.suggestedType)) {
      suggestedType = parsed.suggestedType;
    }

    // Validate prefill
    const rawDueDate =
      typeof parsed.prefill?.dueDate === 'string' ? parsed.prefill.dueDate : undefined;
    const prefill = {
      title: typeof parsed.prefill?.title === 'string' ? parsed.prefill.title : '',
      content: typeof parsed.prefill?.content === 'string' ? parsed.prefill.content : '',
      tags: Array.isArray(parsed.prefill?.tags)
        ? parsed.prefill.tags.filter((t: unknown) => typeof t === 'string')
        : [],
      // Resolve relative date indicator to YYYY-MM-DD (e.g., "tomorrow" → "2025-12-09")
      dueDate: resolveRelativeDate(rawDueDate),
    };

    return {
      isSaveable: parsed.isSaveable,
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      suggestedType,
      prefill,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : undefined,
      detectedAt: new Date().toISOString(),
      messageId,
    };
  } catch (error) {
    log('PARSE_ERROR', 'Failed to parse response:', error);
    return null;
  }
}

/**
 * Apply threshold logic to adjust detection results.
 *
 * - If confidence < FLOOR, mark as not saveable
 * - If todo but confidence < TODO threshold, downgrade to log-general
 * - If habit but no frequency or confidence < HABIT threshold, downgrade to log-general
 */
function applyThresholds(result: SaveableResult, combinedText: string): SaveableResult {
  const { isSaveable, confidence } = result;
  let { suggestedType } = result;

  // Check floor threshold
  if (confidence < SAVEABLE_THRESHOLDS.FLOOR) {
    log('THRESHOLD', `Confidence ${confidence} below floor ${SAVEABLE_THRESHOLDS.FLOOR}`);
    return {
      ...result,
      isSaveable: false,
    };
  }

  // Check todo threshold
  if (suggestedType === 'todo' && confidence < SAVEABLE_THRESHOLDS.TODO) {
    log(
      'THRESHOLD',
      `Todo confidence ${confidence} below threshold ${SAVEABLE_THRESHOLDS.TODO}, downgrading to log-general`,
    );
    suggestedType = 'log-general';
  }

  // Check habit threshold and frequency requirement
  if (suggestedType === 'habit') {
    const frequencyResult = detectFrequency(combinedText);

    // Trust high-confidence AI detection even without frequency match
    if (!frequencyResult && confidence < 0.85) {
      log('THRESHOLD', 'No frequency detected for habit, downgrading to log-general');
      suggestedType = 'log-general';
    } else if (confidence < SAVEABLE_THRESHOLDS.HABIT) {
      log(
        'THRESHOLD',
        `Habit confidence ${confidence} below threshold ${SAVEABLE_THRESHOLDS.HABIT}, downgrading to log-general`,
      );
      suggestedType = 'log-general';
    } else if (frequencyResult) {
      // Valid habit with frequency - add frequency to prefill
      log(
        'THRESHOLD',
        `Habit detected with frequency: ${frequencyResult.frequency}, count: ${frequencyResult.details?.count ?? 1}`,
      );
      return {
        ...result,
        suggestedType,
        prefill: {
          ...result.prefill,
          frequency: frequencyResult.frequency,
          frequencyValue: frequencyResult.details?.count ?? 1,
        },
      };
    }
    // else: high confidence habit without frequency - continue without frequency prefill
  }

  return {
    ...result,
    isSaveable,
    suggestedType,
  };
}

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * Detect saveable content in an assistant message.
 *
 * Analyzes the assistant's response using AI to determine if it contains
 * content worth saving, and if so, what type and how to prefill the save overlay.
 *
 * @param input - The detection input with assistant message, user message, and context
 * @returns SaveableResult with detection results
 *
 * @example
 * ```ts
 * const result = await detectSaveable({
 *   assistantMessage: "I'd suggest trying the Pomodoro technique.",
 *   userMessage: "How can I focus better?",
 * });
 *
 * if (result.isSaveable) {
 *   console.log('Saveable:', result.suggestedType, result.prefill.title);
 * }
 * ```
 */
export async function detectSaveable(input: SaveableDetectionInput): Promise<SaveableResult> {
  const { assistantMessage, userMessage, conversationContext, recentMessages } = input;

  // Generate a message ID if not tracking externally
  const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  log('DETECT_START', {
    assistantLength: assistantMessage.length,
    userLength: userMessage.length,
    hasContext: !!conversationContext,
    recentCount: recentMessages?.length ?? 0,
  });

  try {
    // Build the user message for the detection AI
    let detectionUserMessage = `USER MESSAGE:\n${userMessage}\n\nASSISTANT RESPONSE:\n${assistantMessage}`;

    if (conversationContext) {
      detectionUserMessage = `CONVERSATION CONTEXT:\n${conversationContext}\n\n${detectionUserMessage}`;
    }

    if (recentMessages && recentMessages.length > 0) {
      const recentText = recentMessages
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n');
      detectionUserMessage = `RECENT MESSAGES:\n${recentText}\n\n${detectionUserMessage}`;
    }

    // Call the AI for detection
    const response = await callChat(
      [
        { role: 'system', content: SAVEABLE_DETECTION_PROMPT },
        { role: 'user', content: detectionUserMessage },
      ],
      {
        model: 'gpt-4o-mini',
        temperature: 0,
        maxTokens: 500,
        lane: 'saveable_detection',
      },
    );

    if (!response.ok) {
      logError('AI_CALL_FAILED', response.error);
      return createNotSaveableResult(messageId);
    }

    // Extract content from response
    const data = response.data as any;
    const responseText =
      typeof data === 'string'
        ? data
        : (data?.content ?? data?.choices?.[0]?.message?.content ?? '');

    if (!responseText) {
      log('EMPTY_RESPONSE', 'AI returned empty response');
      return createNotSaveableResult(messageId);
    }

    log('AI_RESPONSE', responseText.slice(0, 200));

    // Parse the response
    const parsed = parseDetectionResponse(responseText, messageId);
    if (!parsed) {
      log('PARSE_FAILED', 'Could not parse AI response');
      return createNotSaveableResult(messageId);
    }

    // Apply threshold logic
    const combinedText = `${userMessage}\n${assistantMessage}`;
    const result = applyThresholds(parsed, combinedText);

    log('DETECT_RESULT', {
      isSaveable: result.isSaveable,
      confidence: result.confidence,
      type: result.suggestedType,
      reasoning: result.reasoning?.slice(0, 50),
    });

    return result;
  } catch (error) {
    logError('DETECT_ERROR', error);
    return createNotSaveableResult(messageId);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determine if the Save button should be shown based on detection result,
 * conversation mode, and cooldown state.
 *
 * @param result - The saveable detection result
 * @param mode - The current conversation mode (reflective vs operational)
 * @param inCooldown - Whether the Save button is currently in cooldown
 * @returns True if the Save button should be shown
 *
 * @example
 * ```ts
 * const result = await detectSaveable(input);
 * const mode = detectConversationMode(userMessage);
 * const inCooldown = isInCooldown(cooldownState, currentTurn);
 *
 * if (shouldShowSaveButton(result, mode, inCooldown)) {
 *   // Render Save button
 * }
 * ```
 */
export function shouldShowSaveButton(
  result: SaveableResult,
  mode: ConversationMode,
  inCooldown: boolean,
): boolean {
  // Don't show in reflective mode (user is venting/processing)
  if (mode === 'reflective') {
    log('HIDE_SAVE', 'Reflective mode - user is venting');
    return false;
  }

  // Don't show during cooldown
  if (inCooldown) {
    log('HIDE_SAVE', 'In cooldown period');
    return false;
  }

  // Don't show if not saveable
  if (!result.isSaveable) {
    log('HIDE_SAVE', 'Content not saveable');
    return false;
  }

  return true;
}

/**
 * Quick check if an assistant message is likely saveable.
 *
 * Use this for early filtering before running full AI detection.
 * Returns true if the message has characteristics of saveable content.
 *
 * @param assistantMessage - The assistant's message to check
 * @returns True if message might be saveable
 */
export function mightBeSaveable(assistantMessage: string): boolean {
  if (!assistantMessage || assistantMessage.length < 20) {
    return false;
  }

  // Check for saveable indicators FIRST - expanded list
  // This ensures messages like "Got it: call the dentist tomorrow" are detected
  // even though "Got it" alone would match a non-saveable pattern
  const saveableIndicators = [
    // Suggestions and recommendations
    /\b(?:suggest|recommend|try|consider)\b/i,
    // List structure
    /\b(?:here(?:'s| is| are)|step \d|first|second|third)\b/i,
    /\d+\.\s+\w/, // Numbered list
    /[-•]\s+\w/, // Bullet list
    // Schedule/habit words
    /\b(?:schedule|plan|routine|habit)\b/i,
    // Time references (todos/habits)
    /\b(?:today|tomorrow|tonight)\b/i,
    /\b(?:next week|next month|this week)\b/i,
    /\b(?:every day|daily|weekly|monthly)\b/i,
    // Weekday names
    /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    // Action verbs commonly in tasks
    /\b(?:call|buy|get|pick up|drop off|send|email|text|book|reserve)\b/i,
    /\b(?:remind|remember|don't forget|make sure)\b/i,
    /\b(?:need to|have to|should|must|gonna|going to)\b/i,
    // Confirmation of task/commitment
    /\b(?:added|noted|on (?:the|your) list|got it.*(?:call|buy|do|schedule|remind))\b/i,
  ];

  // If ANY saveable indicator matches, return true immediately
  for (const pattern of saveableIndicators) {
    if (pattern.test(assistantMessage)) {
      return true;
    }
  }

  // Check for non-saveable indicators (questions, greetings)
  // Only reject if NO saveable indicators were found above
  const nonSaveableIndicators = [
    /^(?:hi|hello|hey)[!,.\s]*$/i, // Pure greeting (nothing else)
    /^[^.!]*\?$/, // Single sentence ending with question
    /^(?:how|what|when|where|why|would you like)\b/i, // Question starters
  ];

  // If it looks like a pure question or greeting (and no saveable indicators), reject
  for (const pattern of nonSaveableIndicators) {
    if (pattern.test(assistantMessage.trim())) {
      return false;
    }
  }

  // Default to true for longer messages (let AI decide)
  return assistantMessage.length > 30;
}
