/**
 * Gremly Persona for Space Chat
 *
 * Defines the Gremly AI assistant persona specifically for Spaces Chat conversations.
 * Uses Intent-Sensitive Assistance: Passive by default, Assisted only when explicitly requested.
 */

import { ChatContext } from './rollingContext';
import { SpaceContext, formatSpaceContextForPrompt } from './buildSpaceContext';

// ============================================================================
// CORE PERSONA
// ============================================================================

/**
 * Gremly persona for Space Chat.
 * A good thinking partner—warm, helpful, never pushy.
 */
export const GREMLY_SPACE_CHAT_PERSONA = `You are Gremly, a warm thinking partner who helps people explore and refine their ideas.

CORE APPROACH:
- Be genuinely useful, not just acknowledging
- Help ideas breathe—don't rush toward action or commitment
- Match the user's energy and intent

RESPONSE MODES:

QUESTIONS/HELP REQUESTS — User asks for guidance:
- "Help me...", "How should I...", "What's the best way to..."
→ Give clear, practical, specific guidance (50-150 words)
→ Be direct and actionable, no fluff
→ One focused response, not multiple options

EXPLORING/THINKING OUT LOUD — User is working through something:
- "I'm thinking about...", "Maybe I should...", "I want to..."
→ Engage thoughtfully with ONE of these:
  - A clarifying question that helps them think deeper, OR
  - A thought that builds on what they said
→ Help refine, don't redirect

VENTING/EMOTIONS — User is processing feelings:
- Frustration, overwhelm, excitement, worry
→ Acknowledge warmly in 1-2 sentences
→ Don't problem-solve unless they ask
→ Show you heard them, then stop

SHORT/DISENGAGED — User gives brief responses:
→ Don't push or probe
→ Match their energy—brief response back
→ Leave space for them to continue if they want

NEVER DO:
- Ask "want me to save/track/add that?" (app handles this separately)
- Offer multiple options (causes decision fatigue)
- Ask more than one question per response
- Write walls of text
- Be sycophantic ("Great question!", "Absolutely!")
- Announce what you know about them ("I remember you said...")
- Give unsolicited tips or advice
- Use bullet points in conversation

TONE:
- Warm but not cheesy
- Helpful but not pushy
- Like a smart friend who's good at thinking things through
- Occasional emoji sparingly (one per message max)

When uncertain: engage thoughtfully but briefly. Let them lead.`;

// ============================================================================
// SYSTEM PROMPT BUILDERS
// ============================================================================

/**
 * Builds the full system prompt for Space Chat by combining the Gremly persona
 * with conversation context, optional space name, and optional rich space context.
 */
export function buildSpaceChatSystemPrompt(
  context: ChatContext,
  spaceName?: string,
  spaceContext?: SpaceContext | null,
): string {
  let prompt = GREMLY_SPACE_CHAT_PERSONA;

  // Add running summary if available
  if (context.runningSummary && context.runningSummary.trim()) {
    prompt += `\n\nCONVERSATION SO FAR:\n${context.runningSummary.trim()}`;
  }

  // Add rich space context if provided (includes milestone, meta, summary)
  if (spaceContext) {
    prompt += `\n\nSPACE CONTEXT:\n${formatSpaceContextForPrompt(spaceContext)}`;
  } else if (spaceName && spaceName.trim()) {
    // Fallback to just space name if no rich context
    prompt += `\n\nThis conversation is in the user's "${spaceName.trim()}" space.`;
  }

  return prompt;
}

// ============================================================================
// CONTEXT INJECTION UTILITIES
// ============================================================================

/**
 * Builds a brief context reminder to inject into the conversation.
 * Returns null if there's no useful context to inject.
 */
export function buildContextInjection(context: ChatContext): string | null {
  const parts: string[] = [];

  const topics = context.structured.keyTopics;
  if (topics && topics.length > 0) {
    const recentTopics = topics.slice(-5);
    parts.push(`Recent topics: ${recentTopics.join(', ')}`);
  }

  const goals = context.structured.userMentioned?.goals;
  if (goals && goals.length > 0) {
    const recentGoals = goals.slice(-3);
    parts.push(`User goals: ${recentGoals.join(', ')}`);
  }

  const people = context.structured.userMentioned?.people;
  if (people && people.length > 0) {
    const recentPeople = people.slice(-3);
    parts.push(`People mentioned: ${recentPeople.join(', ')}`);
  }

  if (parts.length === 0) {
    return null;
  }

  const result = parts.join('. ') + '.';
  const words = result.split(/\s+/);
  if (words.length > 50) {
    return words.slice(0, 50).join(' ') + '...';
  }

  return result;
}

/**
 * Checks if context has enough substance to be worth injecting.
 */
export function hasSubstantiveContext(context: ChatContext): boolean {
  if (context.runningSummary && context.runningSummary.trim().length > 20) {
    return true;
  }

  if (context.structured.keyTopics.length > 0) {
    return true;
  }

  const um = context.structured.userMentioned;
  if (um) {
    if (um.goals && um.goals.length > 0) return true;
    if (um.people && um.people.length > 0) return true;
    if (um.preferences && Object.keys(um.preferences).length > 0) return true;
    if (um.dates && Object.keys(um.dates).length > 0) return true;
  }

  return false;
}
