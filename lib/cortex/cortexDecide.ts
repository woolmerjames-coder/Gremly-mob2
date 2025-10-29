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
import { type DecisionMode } from './thresholds';
import { buildMindDropAskChips, type ChipSuggestion } from '../cortex/policy/chips';
import {
  explainFiledToSpace,
  explainAddedToList,
  explainCreated,
  explainAmbiguous,
  type Tone,
} from './explain';
import { env } from '../env';
import { detectIntent } from './intents/detectIntent';
import { getPersonaPrompt } from './persona/prompt';
import { callChat, type ChatMessage } from './CortexClient';
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

export type CortexSuggestion = string | ChipSuggestion;

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
  suggestions?: CortexSuggestion[];
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
  // Ensure safe defaults - never return undefined fields
  const safeResult: CortexResponse = {
    actions: [],
    explanation: '',
    confidence: 0,
    mode: 'ask',
    meta: {},
  };

  const midLower = 0.55; // offer chips for mid confidence

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

    // Detect intent up-front for fast-path routing when highly confident
    const userText = input.text || (input.structured ? JSON.stringify(input.structured) : '');
    const detected = detectIntent(userText);

    console.log('[DEBUG][cortexDecide] Intent detected:', {
      text: userText.substring(0, 50),
      kind: detected.kind,
      confidence: detected.confidence,
      suppressChips: detected.suppressChips,
      isMetaComment: (detected as any).isMetaComment,
    });

    // Create engine instance
    const engine = createCortexEngine();

    // Prepare engine input
    const engineInput: CortexInput = {
      text: input.text || JSON.stringify(input.structured || {}),
      spaceId: normalizedCtx.activeSpaceId,
    };

    // Check for meta-comments FIRST - these should NEVER create actions
    if (detected.suppressChips || (detected.kind === 'question' && detected.confidence >= 0.9)) {
      console.log('[DEBUG][cortexDecide] Meta-comment/question detected - returning reply mode');
      // This is a question or meta-comment, not an action request
      const isMetaComment = detected.suppressChips;
      const replyText = isMetaComment
        ? "I see you're asking for clarification. What would you like help with?"
        : 'Let me help you with that question.';

      // For questions/meta-comments, try to generate contextual reply
      try {
        const messages: ChatMessage[] = [
          { role: 'system', content: getPersonaPrompt() },
          { role: 'user', content: userText },
        ];
        const response = await callChat(messages, {
          model: 'gpt-4o-mini',
          temperature: 0.7,
          maxTokens: 200,
          spaceId: (ctx as any).spaceId ?? ctx.activeSpaceId ?? null,
          chatId: ctx.chatId ?? null,
          lane: ctx.lane ?? 'system',
        });

        if (response.ok && (response.data as any)?.content) {
          const content = String((response.data as any).content).trim();
          if (content) {
            const replyResult: CortexResponse = {
              ...safeResult,
              actions: [],
              mode: 'reply',
              replyText: content,
              explanation: '',
              suggestions: [],
              confidence: detected.confidence,
              meta: {
                intent: { kind: detected.kind, confidence: detected.confidence },
                isMetaComment,
              },
            };
            console.log('[cortexDecide][final]', {
              mode: replyResult.mode,
              confidence: replyResult.confidence,
              actions: replyResult.actions.map((a) => a.type),
              explanationLen: (replyResult.explanation || '').length,
            });
            return replyResult;
          }
        }
      } catch (e) {
        // Fall back to default reply text
      }

      // Fallback: return default clarification response
      const fallbackReply: CortexResponse = {
        ...safeResult,
        actions: [],
        mode: 'reply',
        replyText,
        explanation: '',
        suggestions: [],
        confidence: detected.confidence,
        meta: {
          intent: { kind: detected.kind, confidence: detected.confidence },
          isMetaComment,
        },
      };
      console.log('[cortexDecide][final]', {
        mode: fallbackReply.mode,
        confidence: fallbackReply.confidence,
        actions: fallbackReply.actions.map((a) => a.type),
        explanationLen: (fallbackReply.explanation || '').length,
      });
      return fallbackReply;
    }

    // If classification is disabled, skip engine and map from high-confidence intent
    let engineOutput: any;
    let engineFailed = false;
    if (!classifyCatchAll) {
      engineOutput = null;
    } else {
      // Call engine with timeout protection
      try {
        engineOutput = await Promise.race([
          engine.classify(engineInput),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Engine timeout')), timeoutMs),
          ),
        ]);
      } catch (_err) {
        // Treat engine failure like disabled classification and attempt intent mapping fallback
        engineOutput = null;
        engineFailed = true;
      }
    }

    // Normalize engine output to canonical actions
    let normalized = { actions: [] as CortexAction[], confidence: 0 } as {
      actions: CortexAction[];
      confidence: number;
    };

    if (engineOutput) {
      normalized = normalizeEngineOutput(engineOutput as any, normalizedCtx, engineInput.text);
    } else if (detected.confidence >= 0.9 && !detected.suppressChips) {
      // Map high-confidence intents to actions when engine is disabled/unavailable
      // NEVER create actions when suppressChips is true (meta-comments/questions)
      const title = (detected as any).title || engineInput.text;
      if (detected.kind === 'note') {
        normalized = {
          actions: [
            {
              type: 'create.note',
              payload: { text: title, subtype: 'note', spaceId: normalizedCtx.activeSpaceId },
            },
          ],
          confidence: detected.confidence,
        };
      } else if (detected.kind === 'todo') {
        normalized = {
          actions: [
            {
              type: 'create.todo',
              payload: { title, spaceId: normalizedCtx.activeSpaceId },
            },
          ],
          confidence: detected.confidence,
        };
      } else if (detected.kind === 'habit') {
        normalized = {
          actions: [
            {
              type: 'create.habit',
              payload: { name: title, freq: 'daily', spaceId: normalizedCtx.activeSpaceId },
            },
          ],
          confidence: detected.confidence,
        };
      } else {
        normalized = { actions: [], confidence: 0 };
      }
    }

    const candidateActions = normalized.actions;

    const probable: 'todo' | 'habit' | 'note' | 'unknown' = (() => {
      const firstAction = candidateActions[0];
      if (firstAction) {
        if (firstAction.type === 'create.todo') return 'todo';
        if (firstAction.type === 'create.habit') return 'habit';
        if (firstAction.type === 'create.note') return 'note';
        if (firstAction.type === 'add.to.list') return 'note';
      }

      const engineType =
        typeof (engineOutput as any)?.type === 'string' ? (engineOutput as any).type : null;
      if (engineType === 'todo' || engineType === 'habit' || engineType === 'note') {
        return engineType;
      }
      if (detected.kind === 'habit') return 'habit';
      if (detected.kind === 'todo') return 'todo';
      if (detected.kind === 'note') return 'note';
      return 'unknown';
    })();

    const engineConfidence =
      typeof normalized.confidence === 'number' && !Number.isNaN(normalized.confidence)
        ? normalized.confidence
        : 0;
    const detectorConfidence =
      typeof detected?.confidence === 'number' && !Number.isNaN(detected.confidence)
        ? detected.confidence
        : 0;
    const combinedConfidenceRaw =
      candidateActions.length > 0 && Number.isFinite(engineConfidence)
        ? engineConfidence
        : Math.max(engineConfidence, detectorConfidence);
    const confidence = Number.isFinite(combinedConfidenceRaw)
      ? Math.max(0, Math.min(1, combinedConfidenceRaw))
      : 0;
    const hasConfidence = typeof confidence === 'number' && !Number.isNaN(confidence);

    const autoThresholdEnv = parseFloat(String(process.env.INTENT_MIN_CONFIDENCE ?? '0.85'));
    const autoThreshold = Number.isFinite(autoThresholdEnv) ? autoThresholdEnv : 0.85;

    const habitAutoFloorEnv = parseFloat(String(process.env.INTENT_HABIT_AUTO_FLOOR ?? '0.90'));
    const habitAutoFloor = Number.isFinite(habitAutoFloorEnv) ? habitAutoFloorEnv : 0.9;

    const hasDate = hasExplicitDateOrTime(userText);
    const habitByText = looksHabitText(userText);
    const preferHabitAuto =
      (probable === 'habit' || habitByText) && !hasDate && confidence >= habitAutoFloor;

    const shouldAuto =
      candidateActions.length > 0 && (confidence > autoThreshold || preferHabitAuto);

    let mode: DecisionMode = 'keep';

    if (!hasConfidence || confidence < 0) {
      mode = 'keep';
    } else if (shouldAuto) {
      mode = 'auto';
    } else if (confidence >= midLower) {
      mode = 'ask';
    }

    const listActionLowRisk =
      normalizedCtx.uiSurface === 'overlay' &&
      hasConfidence &&
      confidence <= autoThreshold &&
      candidateActions.some((action) => action.type === 'add.to.list');

    if (mode === 'auto' && listActionLowRisk) {
      mode = 'ask';
    }

    if (candidateActions.length === 0) {
      mode = 'ask';
    }

    if (mode === 'auto' || mode === 'ask') {
      console.log('[cortexDecide][confidence]', {
        detectorConfidence,
        engineConfidence,
        combinedConfidence: confidence,
        probable,
        preferHabitAuto,
        mode,
      });
    }

    // Phase 10.4: Choose tone based on priority: userPrefsTone > spaceDefaults.tone > env.optimistic > 'calm'
    const tone: Tone =
      normalizedCtx.userPrefsTone ??
      normalizedCtx.spaceDefaults?.tone ??
      (optimistic ? 'warm' : 'calm');

    // Generate explanation based on mode and actions
    // Favor canonical exploration copy when engine failed/timed-out and no actions were produced
    const inMidConfidenceBand =
      hasConfidence && confidence >= midLower && confidence < autoThreshold;

    const chipSuggestions =
      mode === 'ask'
        ? buildMindDropAskChips({
            text: userText,
            probable,
            confidence: hasConfidence ? confidence : 0,
          }).map((c) => ({ ...c }))
        : [];

    let suggestions: CortexSuggestion[] = [];
    if (mode === 'ask') {
      suggestions =
        chipSuggestions.length > 0
          ? chipSuggestions
          : generateSuggestions(candidateActions, normalizedCtx);
    }

    const suggestionLabels =
      mode === 'ask'
        ? chipSuggestions.length > 0
          ? chipSuggestions.map((chip) => chip.label)
          : suggestions.filter((suggestion): suggestion is string => typeof suggestion === 'string')
        : undefined;

    const shouldUseExploreFallback =
      (engineFailed || !engineOutput) && candidateActions.length === 0;

    const explanation = shouldUseExploreFallback
      ? "Let's explore that a bit more."
      : mode === 'ask'
        ? explainAmbiguous(tone, suggestionLabels)
        : generateExplanation(candidateActions, mode, tone, normalizedCtx);

    const result: CortexResponse = {
      ...safeResult,
      actions: mode === 'auto' ? candidateActions : [],
      explanation,
      suggestions,
      confidence,
      mode,
      meta: {
        intent: { kind: detected.kind, confidence: detected.confidence },
        showedChip:
          (chipSuggestions.length > 0 || inMidConfidenceBand) &&
          suggestions.some((suggestion) => typeof suggestion !== 'string'),
        candidateActions,
      },
    };

    console.log('[cortexDecide][final]', {
      mode: result.mode,
      confidence: result.confidence,
      actions: result.actions.map((a) => a.type),
      explanationLen: (result.explanation || '').length,
    });
    return result;
  } catch (error) {
    // Never throw - return safe fallback
    if (__DEV__) {
      console.error('[cortexDecide] Error:', error);
    }

    const fallback: CortexResponse = {
      ...safeResult,
      actions: [],
      mode: 'ask',
      explanation: "Let's explore that a bit more.",
      confidence: 0,
    };
    console.log('[cortexDecide][final]', {
      mode: fallback.mode,
      confidence: fallback.confidence,
      actions: fallback.actions.map((a) => a.type),
      explanationLen: (fallback.explanation || '').length,
    });
    return fallback;
  }
}

function hasExplicitDateOrTime(text: string): boolean {
  const t = (text || '').toLowerCase();
  return (
    /\btoday\b|\btomorrow\b|\btonight\b/.test(t) ||
    /\bnext\s+(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(
      t,
    ) ||
    /\b(on\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+\d{1,2}\b/.test(t) ||
    /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/.test(t) ||
    /\b(at\s*)?\d{1,2}(:\d{2})?\s*(am|pm)\b/.test(t)
  );
}

function looksHabitText(text: string): boolean {
  const t = (text || '').toLowerCase();
  return (
    /\bevery\b|\beach\b|\bdaily\b|\bevery day\b|\bweekly\b|\bmonthly\b/.test(t) ||
    /\b\d+\s+times?\s+(a|per)\s+(day|week|month)\b/.test(t)
  );
}

/**
 * Extract item text from shopping list or similar add-to-list commands
 * @internal
 */
function extractItemFromText(text: string): string {
  // Matches: "add oats to my shopping list", "put milk in shopping list", "add 'peanut butter' to groceries"
  const regexes = [
    /(?:add|put)\s+(?:an?\s+)?(.+?)\s+(?:to|into|in)\s+(?:my\s+)?(?:shopping|grocery|groceries|list)/i,
    /(?:add|put)\s+(?:an?\s+)?(.+?)$/i, // fallback: "add oats"
  ];

  for (const r of regexes) {
    const m = text.match(r);
    if (m && m[1]) {
      return m[1].trim();
    }
  }

  return text.trim(); // ultimate fallback
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
      // Detect if this is a shopping/list intent by checking text and engine whyString
      const whyString = engineOutput.whyString || '';
      const isShoppingIntent =
        /shopping|grocery|groceries/i.test(fallbackText) ||
        /shopping|grocery|groceries/i.test(whyString);

      // Extract the actual item (not the full command)
      const item = extractItemFromText(fallbackText);

      // Phase 10.4: Detect list type with space biasing
      const listKey = isShoppingIntent ? 'shopping' : detectListType(fallbackText, ctx);

      actions.push({
        type: 'add.to.list',
        payload: {
          listKey,
          item,
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

    case 'add.to.list': {
      // Include list name in explanation for clarity
      const listName =
        action.payload.listKey.charAt(0).toUpperCase() + action.payload.listKey.slice(1);
      const item = action.payload.item || 'item';

      // For tests and clarity, include both list name and action
      if (tone === 'warm' || tone === 'direct') {
        return explainAddedToList(listName, tone);
      }

      // calm tone: be explicit for test expectations
      return `${listName}: add ${item} to your ${action.payload.listKey} list.`;
    }

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
function generateSuggestions(actions: CortexAction[], ctx: CortexContext): CortexSuggestion[] {
  const suggestions: CortexSuggestion[] = [];

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
