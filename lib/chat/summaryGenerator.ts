/**
 * Chat Summary Generator for Space Chat
 *
 * Generates conversation summaries when user asks for a recap.
 * Uses AI to create concise, actionable summaries with titles and tags
 * for easy saving.
 *
 * @example
 * ```ts
 * const result = await generateChatSummary(
 *   context,
 *   recentMessages,
 *   'Fitness'
 * );
 *
 * if (result.success) {
 *   console.log(result.summary);
 *   // "Here's what we covered:
 *   //  • Discussed starting a morning workout routine
 *   //  • Suggested Pomodoro technique for focus
 *   //  ...
 *   //  Next steps: Try 15-minute morning stretches for a week."
 * }
 * ```
 */

import { callChat } from '../cortex/CortexClient';
import { ChatContext } from './rollingContext';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of generating a chat summary.
 */
export interface SummaryResult {
  /**
   * The formatted summary text.
   * Includes overview, key points, and action items.
   */
  summary: string;

  /**
   * Short title for the summary (3-6 words).
   * Used for prefilling save overlay.
   */
  title: string;

  /**
   * Tags extracted from conversation topics.
   * 1-3 relevant tags for categorization.
   */
  tags: string[];

  /**
   * Whether summary generation succeeded.
   */
  success: boolean;

  /**
   * Error message if generation failed.
   */
  error?: string;
}

// ============================================================================
// Prompts
// ============================================================================

/**
 * System prompt for generating chat summaries.
 */
export const SUMMARY_GENERATION_PROMPT = `Generate a concise summary of this conversation for the user to save.

FORMAT:
- Start with a one-sentence overview
- List 3-5 key points or takeaways as bullet points
- End with any action items or next steps discussed
- Keep it under 150 words total
- Use natural language, be warm but concise

RESPONSE FORMAT (JSON):
{
  "summary": "the formatted summary text",
  "title": "3-6 word title for this summary",
  "tags": ["tag1", "tag2", "tag3"]
}`;

// ============================================================================
// Logging
// ============================================================================

const log = (...args: any[]) => {
  if (__DEV__) {
    console.log('[SUMMARY]', ...args);
  }
};

const logError = (...args: any[]) => {
  console.error('[SUMMARY]', ...args);
};

// ============================================================================
// Main Summary Generation
// ============================================================================

/**
 * Generate a summary of the chat conversation.
 *
 * Uses AI to create a concise, structured summary with:
 * - One-sentence overview
 * - 3-5 key points as bullet points
 * - Action items or next steps
 * - Title and tags for saving
 *
 * @param context - The chat context with running summary
 * @param recentMessages - Recent conversation messages
 * @param spaceName - Optional space name for context
 * @returns SummaryResult with summary, title, tags, and success status
 *
 * @example
 * ```ts
 * const result = await generateChatSummary(
 *   context,
 *   [
 *     { role: 'user', content: 'How can I focus better?' },
 *     { role: 'assistant', content: "I'd suggest the Pomodoro technique..." },
 *   ],
 *   'Productivity'
 * );
 *
 * if (result.success) {
 *   // Use result.summary, result.title, result.tags
 * }
 * ```
 */
export async function generateChatSummary(
  context: ChatContext,
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
  spaceName?: string,
): Promise<SummaryResult> {
  log('START', {
    hasContext: !!context.runningSummary,
    messageCount: recentMessages.length,
    spaceName,
  });

  try {
    // Build conversation context for the AI
    const conversationContext = buildConversationContext(context, recentMessages, spaceName);

    if (!conversationContext.trim()) {
      log('EMPTY_CONTEXT', 'No conversation to summarize');
      return createFallbackSummary(recentMessages, spaceName);
    }

    // Call AI for summary
    const response = await callChat(
      [
        { role: 'system', content: SUMMARY_GENERATION_PROMPT },
        { role: 'user', content: conversationContext },
      ],
      {
        model: 'gpt-4o-mini',
        temperature: 0.3,
        maxTokens: 400,
        lane: 'summary_generation',
      },
    );

    if (!response.ok) {
      logError('AI_CALL_FAILED', response.error);
      return createFallbackSummary(recentMessages, spaceName);
    }

    // Extract response content
    const data = response.data as any;
    const responseText =
      typeof data === 'string' ? data : (data?.choices?.[0]?.message?.content ?? '');

    if (!responseText) {
      log('EMPTY_RESPONSE', 'AI returned empty response');
      return createFallbackSummary(recentMessages, spaceName);
    }

    log('AI_RESPONSE', responseText.slice(0, 200));

    // Parse the JSON response
    const parsed = parseAISummaryResponse(responseText, spaceName);
    if (parsed) {
      log('SUCCESS', { title: parsed.title, tagCount: parsed.tags.length });
      return parsed;
    }

    // If parsing failed, use fallback
    log('PARSE_FAILED', 'Could not parse AI response');
    return createFallbackSummary(recentMessages, spaceName);
  } catch (error) {
    logError('ERROR', error);
    return createFallbackSummary(recentMessages, spaceName);
  }
}

// ============================================================================
// Context Building
// ============================================================================

/**
 * Build conversation context string for the AI.
 *
 * @param context - Chat context with running summary
 * @param recentMessages - Recent messages
 * @param spaceName - Optional space name
 * @returns Formatted context string
 */
function buildConversationContext(
  context: ChatContext,
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
  spaceName?: string,
): string {
  const parts: string[] = [];

  // Add space context if available
  if (spaceName) {
    parts.push(`Space: ${spaceName}`);
  }

  // Add running summary if available
  if (context.runningSummary && context.runningSummary.trim()) {
    parts.push(`Previous context:\n${context.runningSummary.trim()}`);
  }

  // Add recent messages (last 5)
  const lastMessages = recentMessages.slice(-5);
  if (lastMessages.length > 0) {
    parts.push('Recent conversation:');
    for (const msg of lastMessages) {
      const role = msg.role === 'user' ? 'User' : 'Gremly';
      parts.push(`${role}: ${msg.content}`);
    }
  }

  return parts.join('\n\n');
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Parse the AI's JSON response into a SummaryResult.
 *
 * @param responseText - Raw response from AI
 * @param spaceName - Optional space name for title enhancement
 * @returns Parsed SummaryResult or null if parsing failed
 */
function parseAISummaryResponse(responseText: string, spaceName?: string): SummaryResult | null {
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
    if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) {
      return null;
    }

    // Build title, potentially incorporating space name
    let title = typeof parsed.title === 'string' ? parsed.title : 'Chat Summary';
    if (spaceName && !title.toLowerCase().includes(spaceName.toLowerCase())) {
      title = `${spaceName}: ${title}`;
    }

    // Validate and clean tags
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags
          .filter((t: unknown) => typeof t === 'string')
          .map((t: string) => t.toLowerCase().trim())
          .filter((t: string) => t.length > 0)
          .slice(0, 5)
      : [];

    return {
      summary: parsed.summary.trim(),
      title: title.slice(0, 100), // Limit title length
      tags,
      success: true,
    };
  } catch (error) {
    log('PARSE_ERROR', error);
    return null;
  }
}

// ============================================================================
// Fallback Summary
// ============================================================================

/**
 * Create a fallback summary when AI generation fails.
 *
 * This creates a basic summary from recent messages without AI assistance.
 * Used as a graceful degradation when the AI call fails.
 *
 * @param recentMessages - Recent conversation messages
 * @param spaceName - Optional space name
 * @returns SummaryResult with basic summary
 *
 * @example
 * ```ts
 * const fallback = createFallbackSummary(messages, 'Fitness');
 * // Creates a simple summary from message content
 * ```
 */
export function createFallbackSummary(
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
  spaceName?: string,
): SummaryResult {
  log('FALLBACK', 'Creating basic summary');

  // Build basic summary from messages
  const summaryParts: string[] = ["Here's what we discussed:"];
  const userTopics: string[] = [];

  // Extract key points from messages
  const lastMessages = recentMessages.slice(-5);
  for (const msg of lastMessages) {
    if (msg.role === 'user' && msg.content.trim().length > 10) {
      // Extract first sentence or chunk as a topic
      const topic = extractFirstSentence(msg.content);
      if (topic && !isMetaIntent(topic)) {
        userTopics.push(`• ${topic}`);
      }
    }
  }

  // Add user topics (limit to 3)
  const limitedTopics = userTopics.slice(-3);
  if (limitedTopics.length > 0) {
    summaryParts.push(...limitedTopics);
  } else {
    summaryParts.push('• General conversation');
  }

  // Build title
  const title = spaceName ? `${spaceName} Chat Summary` : 'Chat Summary';

  // Extract basic tags from content
  const tags = extractBasicTags(recentMessages, spaceName);

  return {
    summary: summaryParts.join('\n'),
    title,
    tags,
    success: true, // Fallback is still a valid result
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract the first sentence from text.
 *
 * @param text - Text to extract from
 * @returns First sentence (max 100 chars) or null
 */
function extractFirstSentence(text: string): string | null {
  if (!text) return null;

  const trimmed = text.trim();

  // Find first sentence ending
  const match = trimmed.match(/^[^.!?]+[.!?]?/);
  if (match) {
    let sentence = match[0].trim();
    // Truncate if too long
    if (sentence.length > 100) {
      sentence = sentence.slice(0, 97) + '...';
    }
    return sentence;
  }

  // If no sentence end, take first 100 chars
  if (trimmed.length > 100) {
    return trimmed.slice(0, 97) + '...';
  }

  return trimmed;
}

/**
 * Check if text is a meta-intent (save this, summarize, etc.)
 *
 * @param text - Text to check
 * @returns True if text is a meta-intent
 */
function isMetaIntent(text: string): boolean {
  const metaPatterns = [/^save\s+(this|that)/i, /^summar/i, /^recap/i, /^tl;?dr/i];
  return metaPatterns.some((p) => p.test(text.trim()));
}

/**
 * Extract basic tags from conversation content.
 *
 * @param messages - Messages to extract from
 * @param spaceName - Optional space name to include as tag
 * @returns Array of 1-3 tags
 */
function extractBasicTags(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  spaceName?: string,
): string[] {
  const tags: string[] = [];

  // Add space name as tag if available
  if (spaceName) {
    tags.push(spaceName.toLowerCase());
  }

  // Common topic words to look for
  const topicPatterns: Array<{ pattern: RegExp; tag: string }> = [
    { pattern: /\b(exercise|workout|fitness|gym|running)\b/i, tag: 'fitness' },
    { pattern: /\b(focus|productivity|work|task)\b/i, tag: 'productivity' },
    { pattern: /\b(habit|routine|daily|schedule)\b/i, tag: 'habits' },
    { pattern: /\b(health|wellness|sleep|diet)\b/i, tag: 'health' },
    { pattern: /\b(goal|plan|project)\b/i, tag: 'planning' },
    { pattern: /\b(stress|anxiety|overwhelm|mental)\b/i, tag: 'wellbeing' },
  ];

  // Check messages for topic patterns
  const allContent = messages.map((m) => m.content).join(' ');
  for (const { pattern, tag } of topicPatterns) {
    if (pattern.test(allContent) && !tags.includes(tag)) {
      tags.push(tag);
      if (tags.length >= 3) break;
    }
  }

  // If no tags found, add a generic one
  if (tags.length === 0) {
    tags.push('chat');
  }

  return tags.slice(0, 3);
}

/**
 * Quick check if a summary is substantial enough.
 *
 * @param summary - Summary text to check
 * @returns True if summary has enough content
 */
export function isSummarySubstantial(summary: string): boolean {
  if (!summary) return false;

  // At least 50 characters and 2 lines
  const lines = summary.split('\n').filter((l) => l.trim().length > 0);
  return summary.length >= 50 && lines.length >= 2;
}
