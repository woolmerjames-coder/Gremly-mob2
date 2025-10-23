/**
 * Phase 10.8: Space Insight Summaries
 *
 * Rolling conversation summaries for Spaces:
 * - Auto-refresh based on thresholds (turns + time)
 * - Extractive + structured output (summary text + bullets + next_steps)
 * - Append-only history in space_summaries table
 * - Convenience projection on spaces table for instant render
 */

import { CortexClient, type ChatMessage } from './CortexClient';
import type { ChatTurn } from './context/memory';
import { getEnv } from '../env';
import { supabase } from '../supabase/client';

// Environment configuration
const getConfig = () => ({
  maxContext: parseInt(getEnv('EXPO_PUBLIC_SPACE_SUMMARY_MAX_CONTEXT') || '12', 10),
  maxChars: parseInt(getEnv('EXPO_PUBLIC_SPACE_SUMMARY_MAX_CHARS') || '900', 10),
  minTurns: parseInt(getEnv('EXPO_PUBLIC_SPACE_SUMMARY_MIN_TURNS') || '6', 10),
  minMs: parseInt(getEnv('EXPO_PUBLIC_SPACE_SUMMARY_MIN_MS') || '180000', 10), // 3 minutes
  model: getEnv('EXPO_PUBLIC_SPACE_SUMMARY_MODEL') || 'gpt-4o-mini',
  tokens: parseInt(getEnv('EXPO_PUBLIC_SPACE_SUMMARY_TOKENS') || '400', 10),
  background: getEnv('EXPO_PUBLIC_SPACE_SUMMARY_BG') === 'on',
});

export interface SpaceSummaryData {
  summary: string;
  extracted_bullets: string[];
  next_steps?: string[];
  source_window: number;
  token_usage?: number;
}

export interface SummaryThresholds {
  turnCount: number;
  lastSummaryAt?: Date;
  lastMessageId?: string;
}

/**
 * Check if summary refresh is needed based on thresholds
 * Requires BOTH conditions:
 * - At least N turns since last summary (default: 6)
 * - At least T milliseconds since last summary (default: 3min)
 */
export function shouldRefreshSummary(thresholds: SummaryThresholds): boolean {
  const config = getConfig();

  // Not enough turns yet
  if (thresholds.turnCount < config.minTurns) {
    return false;
  }

  // No previous summary → yes, create first one
  if (!thresholds.lastSummaryAt) {
    return true;
  }

  // Check time threshold
  const elapsedMs = Date.now() - thresholds.lastSummaryAt.getTime();
  return elapsedMs >= config.minMs;
}

/**
 * Build summary prompt from message history
 * Caps context to maxContext turns and maxChars per message
 */
export function buildSummaryPrompt(messages: ChatTurn[]): ChatMessage[] {
  const config = getConfig();

  // Take last N turns
  const window = messages.slice(-config.maxContext);

  // Build conversation text with character limits
  const lines: string[] = [];
  for (const turn of window) {
    const text =
      turn.text.length > config.maxChars
        ? turn.text.substring(0, config.maxChars) + '…'
        : turn.text;

    lines.push(`${turn.role === 'user' ? 'User' : 'Assistant'}: ${text}`);
  }

  const conversationText = lines.join('\n\n');

  return [
    {
      role: 'system',
      content: `You are a helpful assistant that summarizes conversations concisely. 
Extract key topics, decisions, and action items. Keep summaries under 150 words.

Format your response as JSON:
{
  "summary": "Brief narrative summary of the conversation",
  "bullets": ["Key point 1", "Key point 2", ...],
  "next_steps": ["Action 1", "Action 2", ...] // optional
}`,
    },
    {
      role: 'user',
      content: `Summarize this conversation:\n\n${conversationText}`,
    },
  ];
}

/**
 * Generate a rolling summary for a Space
 * Returns structured data ready for DB storage
 */
export async function generateSpaceSummary(
  messages: ChatTurn[],
  lastMessageId?: string,
): Promise<SpaceSummaryData | null> {
  const config = getConfig();

  if (messages.length < config.minTurns) {
    if (__DEV__) {
      console.log('[SUMMARIZE] Insufficient messages', {
        count: messages.length,
        min: config.minTurns,
      });
    }
    return null;
  }

  try {
    const prompt = buildSummaryPrompt(messages);

    const result = await CortexClient.callChat(prompt, {
      model: config.model,
      maxTokens: config.tokens,
      temperature: 0.3, // Lower temperature for consistent summaries
    });

    if (!result.ok) {
      if (__DEV__) {
        console.error('[SUMMARIZE] LLM call failed', result.error);
      }
      return null;
    }

    // Cast and validate response data
    const data = result.data as { content?: string; usage?: { total_tokens?: number } };

    if (!data.content) {
      if (__DEV__) {
        console.error('[SUMMARIZE] No content in response');
      }
      return null;
    }

    // Parse structured response
    const content = data.content.trim();
    let parsed: any;

    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch =
        content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : content;
      parsed = JSON.parse(jsonText);
    } catch {
      // Fallback: treat entire content as summary
      parsed = { summary: content, bullets: [] };
    }

    return {
      summary: parsed.summary || '',
      extracted_bullets: Array.isArray(parsed.bullets) ? parsed.bullets : [],
      next_steps: Array.isArray(parsed.next_steps) ? parsed.next_steps : undefined,
      source_window: config.maxContext,
      token_usage: data.usage?.total_tokens,
    };
  } catch (error) {
    if (__DEV__) {
      console.error('[SUMMARIZE] Generation failed', error);
    }
    return null;
  }
}

/**
 * Maybe refresh the Space summary based on thresholds
 * This is the main entry point called from conversation pipeline
 */
export async function maybeRefreshSummary(
  spaceId: string,
  messages: ChatTurn[],
  lastMessageId?: string,
): Promise<boolean> {
  try {
    // Fetch current summary state
    const { data: space, error } = await supabase
      .from('spaces')
      .select('last_summary_at')
      .eq('id', spaceId)
      .single();

    if (error) {
      if (__DEV__) {
        console.error('[SUMMARIZE] Failed to fetch space', error);
      }
      return false;
    }

    // Check thresholds
    const thresholds: SummaryThresholds = {
      turnCount: messages.length,
      lastSummaryAt: space?.last_summary_at ? new Date(space.last_summary_at) : undefined,
    };

    if (!shouldRefreshSummary(thresholds)) {
      if (__DEV__ && getEnv('EXPO_PUBLIC_DEBUG_CORTEX') === 'on') {
        console.log('[SUMMARIZE] Thresholds not met', {
          turns: thresholds.turnCount,
          elapsed: thresholds.lastSummaryAt
            ? Date.now() - thresholds.lastSummaryAt.getTime()
            : 'never',
        });
      }
      return false;
    }

    // Generate new summary
    const summaryData = await generateSpaceSummary(messages, lastMessageId);

    if (!summaryData) {
      return false;
    }

    // Store in space_summaries (append-only history)
    const { error: insertError } = await supabase.from('space_summaries').insert({
      space_id: spaceId,
      summary: summaryData.summary,
      extracted_bullets: summaryData.extracted_bullets,
      last_message_id: lastMessageId,
      source_window: summaryData.source_window,
      model: getConfig().model,
      token_usage: summaryData.token_usage,
    });

    if (insertError) {
      if (__DEV__) {
        console.error('[SUMMARIZE] Failed to insert summary', insertError);
      }
      return false;
    }

    // Update convenience projection on spaces table
    const { error: updateError } = await supabase
      .from('spaces')
      .update({
        last_summary: summaryData.summary,
        last_summary_at: new Date().toISOString(),
        last_summary_tokens: summaryData.token_usage,
      })
      .eq('id', spaceId);

    if (updateError) {
      if (__DEV__) {
        console.error('[SUMMARIZE] Failed to update space projection', updateError);
      }
      return false;
    }

    if (__DEV__ || getEnv('EXPO_PUBLIC_DEBUG_CORTEX') === 'on') {
      console.log('[SUMMARIZE] ✅ Summary refreshed', {
        spaceId,
        chars: summaryData.summary.length,
        bullets: summaryData.extracted_bullets.length,
        tokens: summaryData.token_usage,
      });
    }

    return true;
  } catch (error) {
    if (__DEV__) {
      console.error('[SUMMARIZE] Refresh failed', error);
    }
    return false;
  }
}
