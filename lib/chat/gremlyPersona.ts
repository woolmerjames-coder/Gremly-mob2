/**
 * Gremly Persona for Space Chat
 *
 * Defines the Gremly AI assistant persona specifically for Spaces Chat conversations.
 * Includes the core persona prompt and utilities for building context-aware system prompts.
 */

import { ChatContext } from './rollingContext';

// ============================================================================
// CORE PERSONA
// ============================================================================

/**
 * The core Gremly persona for Space Chat conversations.
 * Warm, thoughtful, ADHD-friendly companion that listens first and supports.
 */
export const GREMLY_SPACE_CHAT_PERSONA = `You are Gremly, a warm and thoughtful companion for people with ADHD.

Your personality:
- Encouraging but not cheesy—you celebrate wins without being over-the-top
- Curious—you ask follow-up questions because you genuinely want to help
- Structured when helpful, conversational when not
- You remember what the user told you and reference it naturally
- You never lecture or give unsolicited productivity advice
- You never push the user to create tasks, habits, or notes
- You meet people where they are—if they're venting, you listen first
- You're concise. No walls of text. No corporate speak. No bullet-point dumps.
- You have a gentle sense of humor when appropriate

When the user is exploring or thinking aloud, stay in conversation mode.
When the user shifts to planning or action, you can offer structure.
The user leads; you support.

When relevant, naturally reference what the user recently shared—don't summarize, just show you remember.
Example: "Since you mentioned wanting to run more this month, we could start by..."

Keep responses under 3 sentences unless the user asks for more detail.`;

// ============================================================================
// SYSTEM PROMPT BUILDERS
// ============================================================================

/**
 * Builds the full system prompt for Space Chat by combining the Gremly persona
 * with conversation context and optional space name.
 *
 * @param context - The chat context containing running summary and structured data
 * @param spaceName - Optional name of the space this chat belongs to
 * @returns Complete system prompt string for the AI
 *
 * @example
 * ```ts
 * const systemPrompt = buildSpaceChatSystemPrompt(context, 'Fitness');
 * // Use with OpenAI: { role: 'system', content: systemPrompt }
 * ```
 */
export function buildSpaceChatSystemPrompt(context: ChatContext, spaceName?: string): string {
  let prompt = GREMLY_SPACE_CHAT_PERSONA;

  // Add running summary if available
  if (context.runningSummary && context.runningSummary.trim()) {
    prompt += `\n\nCONVERSATION CONTEXT:\n${context.runningSummary.trim()}`;
  }

  // Add space context if provided
  if (spaceName && spaceName.trim()) {
    prompt += `\n\nThis conversation is in the user's '${spaceName.trim()}' space.`;
  }

  return prompt;
}

// ============================================================================
// CONTEXT INJECTION UTILITIES
// ============================================================================

/**
 * Builds a brief context reminder to inject into the conversation.
 * Returns null if there's no useful context to inject.
 *
 * Useful for injecting a quick reminder of recent topics/goals without
 * repeating the full running summary.
 *
 * @param context - The chat context
 * @returns Brief context string (under 50 words) or null
 *
 * @example
 * ```ts
 * const injection = buildContextInjection(context);
 * if (injection) {
 *   // Add as a system message or prepend to assistant context
 * }
 * ```
 */
export function buildContextInjection(context: ChatContext): string | null {
  const parts: string[] = [];

  // Add key topics if present
  const topics = context.structured.keyTopics;
  if (topics && topics.length > 0) {
    // Take up to 5 most recent topics
    const recentTopics = topics.slice(-5);
    parts.push(`Recent topics: ${recentTopics.join(', ')}`);
  }

  // Add goals if present
  const goals = context.structured.userMentioned?.goals;
  if (goals && goals.length > 0) {
    // Take up to 3 most recent goals
    const recentGoals = goals.slice(-3);
    parts.push(`User goals: ${recentGoals.join(', ')}`);
  }

  // Add people if mentioned
  const people = context.structured.userMentioned?.people;
  if (people && people.length > 0) {
    // Take up to 3 most recent people
    const recentPeople = people.slice(-3);
    parts.push(`People mentioned: ${recentPeople.join(', ')}`);
  }

  // Return null if nothing useful
  if (parts.length === 0) {
    return null;
  }

  // Combine parts, keeping under ~50 words
  const result = parts.join('. ') + '.';

  // Safety check: if somehow too long, truncate
  const words = result.split(/\s+/);
  if (words.length > 50) {
    return words.slice(0, 50).join(' ') + '...';
  }

  return result;
}

/**
 * Checks if context has enough substance to be worth injecting.
 *
 * @param context - The chat context
 * @returns True if context has meaningful content
 */
export function hasSubstantiveContext(context: ChatContext): boolean {
  // Check running summary
  if (context.runningSummary && context.runningSummary.trim().length > 20) {
    return true;
  }

  // Check key topics
  if (context.structured.keyTopics.length > 0) {
    return true;
  }

  // Check user mentioned facts
  const um = context.structured.userMentioned;
  if (um) {
    if (um.goals && um.goals.length > 0) return true;
    if (um.people && um.people.length > 0) return true;
    if (um.preferences && Object.keys(um.preferences).length > 0) return true;
    if (um.dates && Object.keys(um.dates).length > 0) return true;
  }

  return false;
}
