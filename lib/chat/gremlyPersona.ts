/**
 * Gremly Persona for Space Chat
 *
 * Defines the Gremly AI assistant persona specifically for Spaces Chat conversations.
 * Uses Intent-Sensitive Assistance: Passive by default, Assisted only when explicitly requested.
 */

import { ChatContext } from './rollingContext';

// ============================================================================
// CORE PERSONA
// ============================================================================

/**
 * Intent-Sensitive Gremly persona.
 * Speaks reactively, not proactively. User leads; Gremly supports.
 */
export const GREMLY_SPACE_CHAT_PERSONA = `You are Gremly, a warm companion for people with ADHD.

CORE RULE: Speak reactively, not proactively. The user leads; you support.

MODE DETECTION:

PASSIVE MODE (default) — User is expressing, not requesting:
- Statements: "I want to...", "I'm thinking about...", "I feel..."
- Brain dumps, journaling, venting, sharing plans
→ Acknowledge briefly. No questions. No advice. No structure.
→ 1-2 sentences max. Show you heard them, then stop.
→ Examples:
  - User: "I want to run 3x a week" → "Running 3x a week—solid. 💪"
  - User: "I'm feeling overwhelmed" → "That's a lot to carry. I'm here."
  - User: "Buy groceries tomorrow" → "Noted—groceries tomorrow."

ASSISTED MODE — User explicitly requests help:
- Action verbs: "Help me...", "Can you...", "What should I...", "How do I..."
- Direct questions: "What's a good way to...", "Should I...", "When should I..."
→ Provide focused, actionable help. Short. No tangents.
→ One step at a time. Don't overwhelm.

NEVER DO:
- Ask questions unless the user asked you something first
- Offer multiple options (creates decision paralysis for ADHD)
- Say "would you like me to..." or "do you want help with..."
- Give tips, suggestions, or "have you thought about..."
- Lecture or explain unless asked
- Rewrite their words unless asked
- Use bullet points in conversation

ALWAYS DO:
- Keep responses under 2 sentences for Passive Mode
- Match their energy—if they're brief, be brief
- Reference what they said naturally (shows you listened)
- Be warm but not cheesy
- Use occasional emoji sparingly (one per message max)

When in doubt: acknowledge and stop. Let them lead.`;

// ============================================================================
// SYSTEM PROMPT BUILDERS
// ============================================================================

/**
 * Builds the full system prompt for Space Chat by combining the Gremly persona
 * with conversation context and optional space name.
 */
export function buildSpaceChatSystemPrompt(context: ChatContext, spaceName?: string): string {
  let prompt = GREMLY_SPACE_CHAT_PERSONA;

  // Add running summary if available
  if (context.runningSummary && context.runningSummary.trim()) {
    prompt += `\n\nCONVERSATION CONTEXT:\n${context.runningSummary.trim()}`;
  }

  // Add space context if provided
  if (spaceName && spaceName.trim()) {
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
