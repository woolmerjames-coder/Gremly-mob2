/**
 * AI-powered list item enrichment for Make Actionable feature.
 *
 * Converts verbose list items into concise, actionable todo titles
 * using the same Cortex API pattern as saveable detection.
 */

import { callChat } from '../cortex/CortexClient';

// ============================================================================
// Types
// ============================================================================

export interface EnrichedItem {
  title: string;
  notes?: string;
}

// ============================================================================
// Prompt
// ============================================================================

const ENRICH_LIST_ITEM_PROMPT = `You are a todo title generator. Convert verbose list items into concise, actionable todo titles.

RULES:
- Title: Maximum 6 words, action-focused, starts with a verb
- Notes: Optional context that provides useful detail (omit if title captures everything)
- Be specific but brief

EXAMPLES:
Input: "Pick 1 go-to replacement drink you actually enjoy"
Output: {"title": "Choose replacement drink", "notes": "Pick something you actually enjoy"}

Input: "Decide one default evening activity (your "instead of drinking")"  
Output: {"title": "Pick evening wind-down activity", "notes": "Alternative to drinking"}

Input: "Move/remove alcohol you don't want around"
Output: {"title": "Remove accessible alcohol"}

Input: "Stock alternatives: drinks + snacks you like"
Output: {"title": "Stock alternative drinks/snacks"}

RESPOND IN JSON ONLY:
{"title": "concise action (max 6 words)", "notes": "optional context or null"}`;

// ============================================================================
// Logging
// ============================================================================

const log = (...args: any[]) => {
  if (__DEV__) {
    console.log('[ENRICH_ITEM]', ...args);
  }
};

// ============================================================================
// Main Function
// ============================================================================

/**
 * Enrich a single list item using AI to generate a concise title.
 *
 * @param verboseText - The full text of the list item
 * @returns Enriched item with concise title and optional notes
 */
export async function enrichListItem(verboseText: string): Promise<EnrichedItem> {
  log('START', verboseText.slice(0, 50));

  try {
    const response = await callChat(
      [
        { role: 'system', content: ENRICH_LIST_ITEM_PROMPT },
        { role: 'user', content: verboseText },
      ],
      {
        model: 'gpt-4o-mini',
        temperature: 0,
        maxTokens: 150,
        lane: 'enrich_list_item',
      },
    );

    if (!response.ok) {
      log('AI_CALL_FAILED', response.error);
      return createFallback(verboseText);
    }

    // Extract content from response
    const data = response.data as any;
    const responseText =
      typeof data === 'string'
        ? data
        : (data?.content ?? data?.choices?.[0]?.message?.content ?? '');

    if (!responseText) {
      log('EMPTY_RESPONSE');
      return createFallback(verboseText);
    }

    log('AI_RESPONSE', responseText);

    // Parse JSON response
    const parsed = parseResponse(responseText);
    if (!parsed) {
      log('PARSE_FAILED');
      return createFallback(verboseText);
    }

    log('SUCCESS', parsed.title);
    return parsed;
  } catch (error) {
    log('ERROR', error);
    return createFallback(verboseText);
  }
}

/**
 * Enrich multiple list items in parallel.
 *
 * @param items - Array of verbose list item texts
 * @returns Array of enriched items (same order as input)
 */
export async function enrichListItems(items: string[]): Promise<EnrichedItem[]> {
  log('BATCH_START', items.length);

  const results = await Promise.all(
    items.map(async (item) => {
      try {
        return await enrichListItem(item);
      } catch {
        return createFallback(item);
      }
    }),
  );

  log('BATCH_COMPLETE', results.length);
  return results;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Create a fallback result using simple truncation.
 */
function createFallback(text: string): EnrichedItem {
  const cleaned = text.trim();
  const title = cleaned.length > 50 ? cleaned.slice(0, 47) + '...' : cleaned;
  return {
    title,
    notes: cleaned.length > 50 ? cleaned : undefined,
  };
}

/**
 * Parse the AI response JSON.
 */
function parseResponse(responseText: string): EnrichedItem | null {
  try {
    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = responseText.trim();

    // Remove markdown code block if present
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(jsonStr);

    if (!parsed.title || typeof parsed.title !== 'string') {
      return null;
    }

    return {
      title: parsed.title.trim(),
      notes: parsed.notes && typeof parsed.notes === 'string' ? parsed.notes.trim() : undefined,
    };
  } catch {
    return null;
  }
}
