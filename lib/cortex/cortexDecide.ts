/**
 * Cortex Decision SDK - Single Entrypoint
 *
 * This is the main interface for all UI surfaces to interact with Cortex.
 * It selects the appropriate engine, normalizes outputs into canonical actions,
 * applies confidence thresholds, and generates explanations.
 *
 * Pure decision layer - no side effects, no DB writes.
 */

import { createCortexEngine } from '../../cortex/createEngine';
import type { CortexInput } from '../../cortex/ICortexEngine';
import { decideMode, type DecisionMode } from './thresholds';
import {
  explainFiledToSpace,
  explainAddedToList,
  explainCreated,
  explainAmbiguous,
  type Tone,
} from './explain';
import { env } from '../env';

/**
 * Context provided by UI layers when calling Cortex
 */
export interface CortexContext {
  /** Current authenticated user ID */
  userId: string;
  /** Active space ID (if any) */
  activeSpaceId?: string | null;
  /** UI surface making the request */
  uiSurface: 'chat' | 'overlay' | 'spaces' | 'today' | 'hub';
}

/**
 * Canonical actions that the app can execute
 * These are normalized from engine outputs and can be dispatched to the repo layer
 */
export type CortexAction =
  | {
      type: 'create.todo';
      payload: { title: string; due?: string; spaceId?: string | null };
    }
  | {
      type: 'create.habit';
      payload: { name: string; freq?: 'daily' | 'weekly' | 'custom'; spaceId?: string | null };
    }
  | {
      type: 'create.note';
      payload: { text: string; subtype?: 'journal' | 'catchall' | 'note'; spaceId?: string | null };
    }
  | {
      type: 'add.to.list';
      payload: {
        listKey: 'shopping' | 'reading' | 'packing' | 'custom';
        item: string;
        spaceId?: string | null;
      };
    }
  | {
      type: 'file.to.space';
      payload: { itemId: string; spaceId: string };
    }
  | {
      type: 'attach.reminder';
      payload: { itemId: string; when: string; rule?: string };
    };

/**
 * Response from cortexDecide containing normalized actions and metadata
 */
export interface CortexResponse {
  /** Normalized actions to execute */
  actions: CortexAction[];
  /** Friendly explanation for the user */
  explanation?: string;
  /** Alternative suggestions (for ASK/KEEP modes) */
  suggestions?: string[];
  /** Confidence score from engine (0-1) */
  confidence?: number;
  /** Decision mode based on confidence threshold */
  mode: 'auto' | 'ask' | 'keep';
}

/**
 * Input for cortexDecide - either free text or structured data
 */
export type DecideInput =
  | { text: string; structured?: undefined }
  | { text?: undefined; structured: Record<string, any> };

/**
 * Main Cortex decision function
 *
 * Accepts user input (text or structured), applies AI classification,
 * normalizes to canonical actions, and returns with confidence/explanation.
 *
 * Never throws - returns safe fallback on errors.
 *
 * @param input - User input (text or structured data)
 * @param ctx - Context from UI layer (userId, activeSpaceId, uiSurface)
 * @returns Promise resolving to CortexResponse with actions and metadata
 *
 * @example
 * const result = await cortexDecide(
 *   { text: "buy milk" },
 *   { userId: "user-1", activeSpaceId: null, uiSurface: "overlay" }
 * );
 *
 * if (result.mode === 'auto') {
 *   // Execute actions immediately
 *   for (const action of result.actions) {
 *     await executeAction(action);
 *   }
 * } else if (result.mode === 'ask') {
 *   // Show suggestions to user
 *   showSuggestions(result.suggestions);
 * }
 */
export async function cortexDecide(
  input: DecideInput,
  ctx: CortexContext,
): Promise<CortexResponse> {
  try {
    // Read configuration from env
    const timeoutMs = env.cortex.timeoutMs || 2500;
    const classifyCatchAll = env.cortex.classifyCatchAll;
    const optimistic = env.cortex.optimistic;

    // If classification is disabled, return keep mode immediately
    if (!classifyCatchAll) {
      return {
        actions: [],
        mode: 'keep',
        explanation: 'Saving to Catch-All for now.',
        confidence: 0,
      };
    }

    // Create engine instance
    const engine = createCortexEngine();

    // Prepare engine input
    const engineInput: CortexInput = {
      text: input.text || JSON.stringify(input.structured || {}),
      spaceId: ctx.activeSpaceId,
    };

    // Call engine with timeout protection
    const engineOutput = await Promise.race([
      engine.classify(engineInput),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Engine timeout')), timeoutMs)),
    ]);

    // Normalize engine output to canonical actions
    const normalized = normalizeEngineOutput(engineOutput as any, ctx, engineInput.text);

    // Determine mode based on confidence
    const confidence = normalized.confidence;
    const mode = decideMode(confidence);

    // Generate explanation based on mode and actions
    const tone: Tone = optimistic ? 'warm' : 'calm';
    const explanation = generateExplanation(normalized.actions, mode, tone, ctx);

    // Generate suggestions for ASK/KEEP modes
    const suggestions = mode !== 'auto' ? generateSuggestions(normalized.actions, ctx) : undefined;

    return {
      actions: normalized.actions,
      explanation,
      suggestions,
      confidence,
      mode,
    };
  } catch (error) {
    // Never throw - return safe fallback
    if (__DEV__) {
      console.error('[cortexDecide] Error:', error);
    }

    return {
      actions: [],
      mode: 'keep',
      explanation: 'Saving to Catch-All for now.',
      confidence: 0,
    };
  }
}

/**
 * Normalize engine output to canonical CortexAction[]
 * @internal
 */
function normalizeEngineOutput(
  engineOutput: any,
  ctx: CortexContext,
  originalText?: string,
): { actions: CortexAction[]; confidence: number } {
  const actions: CortexAction[] = [];

  // Extract confidence if available, default to high confidence (0.85) if engine made a classification
  const confidence = typeof engineOutput.confidence === 'number' ? engineOutput.confidence : 0.85;

  // Use original text as fallback for title/name/text
  const fallbackText = originalText || 'Untitled';

  // Map engine output type to canonical action
  if (engineOutput.type === 'todo') {
    actions.push({
      type: 'create.todo',
      payload: {
        title: engineOutput.title || fallbackText,
        due: engineOutput.due,
        spaceId: ctx.activeSpaceId,
      },
    });
  } else if (engineOutput.type === 'habit') {
    actions.push({
      type: 'create.habit',
      payload: {
        name: engineOutput.name || fallbackText,
        freq: engineOutput.frequency || 'daily',
        spaceId: ctx.activeSpaceId,
      },
    });
  } else if (engineOutput.type === 'note') {
    // Check if it's a list-type note
    const subtype = engineOutput.subtype || 'catchall';

    if (subtype === 'list') {
      // Detect list type from content
      const listKey = detectListType(fallbackText);
      actions.push({
        type: 'add.to.list',
        payload: {
          listKey,
          item: fallbackText,
          spaceId: ctx.activeSpaceId,
        },
      });
    } else {
      actions.push({
        type: 'create.note',
        payload: {
          text: fallbackText,
          subtype: subtype as any,
          spaceId: ctx.activeSpaceId,
        },
      });
    }
  }

  return { actions, confidence };
}

/**
 * Detect list type from text content
 * @internal
 */
function detectListType(text: string): 'shopping' | 'reading' | 'packing' | 'custom' {
  const lower = text.toLowerCase();

  if (lower.includes('buy') || lower.includes('shop') || lower.includes('store')) {
    return 'shopping';
  }
  if (lower.includes('read') || lower.includes('book')) {
    return 'reading';
  }
  if (lower.includes('pack') || lower.includes('travel')) {
    return 'packing';
  }

  return 'custom';
}

/**
 * Generate friendly explanation for the decision
 * @internal
 */
function generateExplanation(
  actions: CortexAction[],
  mode: DecisionMode,
  tone: Tone,
  ctx: CortexContext,
): string {
  if (actions.length === 0) {
    return mode === 'keep' ? explainAmbiguous(tone) : 'No actions determined.';
  }

  const action = actions[0]; // Use first action for explanation

  switch (action.type) {
    case 'create.todo':
      return explainCreated('todo', tone);

    case 'create.habit':
      return explainCreated('habit', tone);

    case 'create.note':
      return explainCreated('note', tone);

    case 'add.to.list':
      return explainAddedToList(
        action.payload.listKey.charAt(0).toUpperCase() + action.payload.listKey.slice(1),
        tone,
      );

    case 'file.to.space':
      return explainFiledToSpace('Unknown Space', tone);

    default:
      return mode === 'auto' ? 'Done ✓' : 'Action prepared';
  }
}

/**
 * Generate alternative suggestions for ASK/KEEP modes
 * @internal
 */
function generateSuggestions(actions: CortexAction[], ctx: CortexContext): string[] {
  const suggestions: string[] = [];

  if (actions.length === 0) {
    suggestions.push('Save as note?');
    suggestions.push('Add to a list?');
    return suggestions;
  }

  const action = actions[0];

  if (action.type === 'add.to.list') {
    const alternatives = ['shopping', 'reading', 'packing', 'custom'].filter(
      (k) => k !== action.payload.listKey,
    );
    suggestions.push(`Add to ${alternatives[0]} list instead?`);
    suggestions.push('Create as todo instead?');
  } else if (action.type === 'create.todo') {
    suggestions.push('Create as note instead?');
    suggestions.push('Add to shopping list?');
  } else if (action.type === 'create.habit') {
    suggestions.push('Create as todo instead?');
  }

  return suggestions.slice(0, 3); // Limit to 3 suggestions
}
