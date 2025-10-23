/**
 * Phase 10.7B: Context Assembly
 * Assembles conversation context from running summary + recent turns + pinned facts
 */

import { getPersonaPrompt } from '../persona/prompt';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AssembleContextInput {
  threadId: string;
  lastTurns: Array<{ role: 'user' | 'assistant'; text: string }>;
  runningSummary?: string | null;
  pinnedFacts?: {
    spaceName?: string | null;
    spaceGoals?: string | null;
    userTone?: 'calm' | 'warm' | 'direct' | null;
  } | null;
}

export interface AssembledContext {
  system: string;
  messages: ChatMessage[];
}

/**
 * Assemble conversation context for Cortex
 * Includes: persona prompt + pinned facts + running summary + last 10 turns
 * Note: Keep at 10 turns to satisfy current context window policy and tests
 */
export function assembleContext(input: AssembleContextInput): AssembledContext {
  const { lastTurns, runningSummary, pinnedFacts } = input;

  // Build system prompt
  const systemParts: string[] = [];

  // 1. Personality/persona
  systemParts.push(getPersonaPrompt(pinnedFacts?.userTone));

  // 2. Pinned facts
  if (pinnedFacts?.spaceName) {
    systemParts.push(`Current space: ${pinnedFacts.spaceName}.`);
  }
  if (pinnedFacts?.spaceGoals) {
    systemParts.push(`Space goals: ${pinnedFacts.spaceGoals}.`);
  }
  if (pinnedFacts?.userTone) {
    systemParts.push(`User prefers ${pinnedFacts.userTone} tone.`);
  }

  // 3. Running summary (if exists, limit to ~350 tokens)
  if (runningSummary && runningSummary.trim()) {
    const trimmedSummary = runningSummary.trim().substring(0, 1400); // ~350 tokens
    systemParts.push(`\nConversation summary: ${trimmedSummary}`);
  }

  const systemPrompt = systemParts.join(' ');

  // 4. Recent turns (last 10)
  const recentTurns = lastTurns.slice(-10);
  const messages: ChatMessage[] = recentTurns.map((turn) => ({
    role: turn.role,
    content: turn.text,
  }));

  return {
    system: systemPrompt,
    messages,
  };
}
