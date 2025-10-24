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
import { type CortexContextBase, type Lane } from './lane';

// Re-export lane types for convenience
export type { Lane, CortexContextBase } from './lane';

/**
 * Context provided by UI layers when calling Cortex
 * Phase 10.4: Extended with space defaults and user tone preferences
 * Phase 10.6B: Extended with lane for routing context
 * Phase 10.7E: Extended with chatId and repo for context building
 */
export interface CortexContext extends CortexContextBase {
  /** Current authenticated user ID */
  userId: string;
  /** Active space ID (if any) */
  activeSpaceId?: string | null;
  /** UI surface making the request */
  uiSurface: 'chat' | 'overlay' | 'spaces' | 'today' | 'hub' | 'catchall';
  /** Chat ID for context building (Phase 10.7E) */
  chatId?: string | null;
  /** Repository instance for fetching messages (Phase 10.7E) */
  repo?: any; // IRepo type
  /** Per-space defaults for biasing (Phase 10.4) */
  spaceDefaults?: {
    tone?: 'calm' | 'warm' | 'direct';
    allowedTypes?: Array<'todo' | 'habit' | 'journal' | 'note'>;
    preferredListKeys?: string[];
    reminderWindows?: Record<string, any>;
  } | null;
  /** User-level tone preference from cortex_preferences (Phase 10.4) */
  userPrefsTone?: 'calm' | 'warm' | 'direct';
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
  /** Small-talk reply text (for chat surfaces when no actions/explanations) */
  replyText?: string;
  /** Alternative suggestions (for ASK/KEEP modes) */
  suggestions?: string[];
  /** Confidence score from engine (0-1) */
  confidence?: number;
  /** Decision mode based on confidence threshold */
  mode: 'auto' | 'ask' | 'keep' | 'reply';
  /** Additional metadata for telemetry and tracking */
  meta?: {
    lane?: Lane;
    kind?: 'smalltalk' | 'decision' | 'classification';
    detectedIntent?: any; // Phase 10.7: Intent detection from conversation pipeline
    showedChip?: boolean; // UI tracking
    empathy_triggered?: boolean; // Empathy mode flag
    [key: string]: any;
  };
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
 * **Performance Budget:**
 * - Enforces timeout from `env.cortex.timeoutMs` (default: 2500ms)
 * - Returns safe fallback { mode:'keep', actions:[] } on timeout or error
 * - Never throws - fail-safe design ensures UX degradation, not crashes
 *
 * **Failure Modes:**
 * - Engine timeout → keep mode with "Let's explore that a bit more."
 * - Engine error → keep mode with safe explanation
 * - Malformed output → keep mode with empty actions
 *
 * @param input - User input (text or structured data)
 * @param ctx - Context from UI layer (userId, activeSpaceId, uiSurface, spaceDefaults, userPrefsTone)
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
    // Apply default lane if not specified (backward compatibility)
    const normalizedCtx = {
      ...ctx,
      lane: ctx.lane ?? 'system',
    };

    // Read configuration from env
    const timeoutMs = env.cortex.timeoutMs || 2500;
    const classifyCatchAll = env.cortex.classifyCatchAll;
    const optimistic = env.cortex.optimistic;

    // If classification is disabled, return keep mode immediately
    if (!classifyCatchAll) {
      return {
        actions: [],
        mode: 'ask',
        explanation: "Let's explore that a bit more.",
        confidence: 0,
      };
    }

    // Create engine instance
    const engine = createCortexEngine();

    // Prepare engine input
    const engineInput: CortexInput = {
      text: input.text || JSON.stringify(input.structured || {}),
      spaceId: normalizedCtx.activeSpaceId,
    };

    // Call engine with timeout protection
    const engineOutput = await Promise.race([
      engine.classify(engineInput),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Engine timeout')), timeoutMs)),
    ]);

    // Normalize engine output to canonical actions
    const normalized = normalizeEngineOutput(engineOutput as any, normalizedCtx, engineInput.text);

    // Determine mode based on confidence
    const confidence = normalized.confidence;
    const mode = decideMode(confidence);

    // Phase 10.4: Choose tone based on priority: userPrefsTone > spaceDefaults.tone > env.optimistic > 'calm'
    const tone: Tone =
      normalizedCtx.userPrefsTone ??
      normalizedCtx.spaceDefaults?.tone ??
      (optimistic ? 'warm' : 'calm');

    // Generate explanation based on mode and actions
    const explanation = generateExplanation(normalized.actions, mode, tone, normalizedCtx);

    // Generate suggestions for ASK/KEEP modes
    const suggestions =
      mode !== 'auto' ? generateSuggestions(normalized.actions, normalizedCtx) : undefined;

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
      mode: 'ask',
      explanation: "Let's explore that a bit more.",
      confidence: 0,
    };
  }
}

/**
 * Normalize engine output to canonical CortexAction[]
 * Phase 10.4: Apply space-level biasing for ambiguous intents
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

  // Phase 10.4: Apply type biasing based on spaceDefaults.allowedTypes
  let engineType = engineOutput.type;
  if (ctx.spaceDefaults?.allowedTypes && ctx.spaceDefaults.allowedTypes.length > 0) {
    // If engine type is ambiguous (note/catchall) and space has preferred types, bias toward first preferred type
    if ((engineType === 'note' || !engineType) && confidence < 0.7) {
      const preferredType = ctx.spaceDefaults.allowedTypes[0];
      if (preferredType === 'todo') {
        engineType = 'todo';
      } else if (preferredType === 'habit') {
        engineType = 'habit';
      }
    }
  }

  // Map engine output type to canonical action
  if (engineType === 'todo') {
    actions.push({
      type: 'create.todo',
      payload: {
        title: engineOutput.title || fallbackText,
        due: engineOutput.due,
        spaceId: ctx.activeSpaceId,
      },
    });
  } else if (engineType === 'habit') {
    actions.push({
      type: 'create.habit',
      payload: {
        name: engineOutput.name || fallbackText,
        freq: engineOutput.frequency || 'daily',
        spaceId: ctx.activeSpaceId,
      },
    });
  } else if (engineType === 'note') {
    // Check if it's a list-type note
    const subtype = engineOutput.subtype || 'catchall';

    if (subtype === 'list') {
      // Phase 10.4: Detect list type with space biasing
      const listKey = detectListType(fallbackText, ctx);
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
 * Phase 10.4: Bias toward preferredListKeys when available
 * @internal
 */
function detectListType(
  text: string,
  ctx?: CortexContext,
): 'shopping' | 'reading' | 'packing' | 'custom' {
  const lower = text.toLowerCase();

  // Phase 10.4: Check if text mentions any preferred list keys by name
  if (ctx?.spaceDefaults?.preferredListKeys && ctx.spaceDefaults.preferredListKeys.length > 0) {
    for (const key of ctx.spaceDefaults.preferredListKeys) {
      if (lower.includes(key.toLowerCase())) {
        return key as any;
      }
    }

    // If user said "add" or "list" but no specific list keyword, use first preferred key
    if (lower.includes('add') || lower.includes('list')) {
      const firstKey = ctx.spaceDefaults.preferredListKeys[0];
      if (['shopping', 'reading', 'packing'].includes(firstKey)) {
        return firstKey as any;
      }
    }
  }

  // Fall back to default heuristics
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
