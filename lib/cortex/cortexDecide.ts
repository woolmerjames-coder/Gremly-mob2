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
import { analyzeListShape } from './policy/listHeuristics';
import { analyzeIdeaShape } from './policy/ideaHeuristics';
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
import { buildHabitFields, buildTodoFields } from './textNormalization';
import type { CanonicalType, LogSubtype, NoteSubtype } from '../types';
import { canonicalToPersisted } from '../canonical';

// Re-export lane types for convenience
export type { Lane, CortexContextBase } from './lane';

/**
 * Mind Drop Decision - Unified decision structure for all Mind Drop flows
 *
 * Replaces old mode: 'ask' | 'auto' | 'keep' with a clearer structure:
 * - probableKind: What type of entity this likely is
 * - confidence: How confident we are (0-1)
 * - needsClarification: Whether to show chips/ask UI before converting
 *
 * Usage:
 * - If probableKind === 'none': Leave as unsorted
 * - If needsClarification === false && high confidence: Auto-convert immediately
 * - If needsClarification === true: Show chips, convert on user selection
 */
export type MindDropDecision = {
  /** What type of entity this probably is */
  probableKind: 'todo' | 'habit' | 'log' | 'none';
  /** Confidence score 0-1 */
  confidence: number;
  /** Whether user needs to confirm via chips before conversion */
  needsClarification: boolean;
  /** Optional: Specific subtype for logs (idea, journal, list, etc.) */
  logSubtype?: LogSubtype | null;
  /** Raw tags from AI classification */
  tags?: string[];
};

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
      payload: { text: string; subtype?: NoteSubtype | 'note' | null; spaceId?: string | null };
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
  /** Mind Drop decision (new unified structure) - preferred over mode for Mind Drop flows */
  mindDropDecision?: MindDropDecision;
  /** Additional metadata for telemetry and tracking */
  meta?: {
    lane?: Lane;
    kind?: 'smalltalk' | 'decision' | 'classification';
    detectedIntent?: any; // Phase 10.7: Intent detection from conversation pipeline
    showedChip?: boolean; // UI tracking
    empathy_triggered?: boolean; // Empathy mode flag
    [key: string]: any;
  };
  /** Raw tags from engine classification (if provided) */
  engineTags?: string[];
  /** Phase 2A: Original user input text for background prefill */
  rawSentence?: string;
}

/**
 * Input for cortexDecide - either free text or structured data
 */
export type DecideInput =
  | { text: string; structured?: undefined }
  | { text?: undefined; structured: Record<string, any> };

/**
 * Build MindDropDecision from cortexDecide analysis
 *
 * Maps old mode/probable logic to new unified structure.
 * - probableKind: Normalized classification (todo, habit, log, none)
 * - confidence: Numeric confidence score [0-1]
 * - needsClarification: true if mode was 'ask', false if 'auto'
 * - logSubtype: Extracted from canonicalSubtype if probableKind is 'log'
 * - tags: AI-derived tags for the entry
 *
 * @param probable - Classification from engine ('todo' | 'habit' | 'log' | 'unknown')
 * @param confidence - Confidence score [0-1]
 * @param mode - Decision mode ('auto' | 'ask' | 'keep' | 'reply')
 * @param canonicalSubtype - Log subtype if kind is 'log'
 * @param tags - AI-derived tags
 * @returns MindDropDecision object for unified pipeline
 */
function buildMindDropDecision(
  probable: 'todo' | 'habit' | 'log' | 'unknown',
  confidence: number,
  mode: 'auto' | 'ask' | 'keep' | 'reply',
  canonicalSubtype?: LogSubtype | null,
  tags?: string[],
): MindDropDecision {
  // Map 'unknown' to 'none' for probableKind
  const probableKind: MindDropDecision['probableKind'] = probable === 'unknown' ? 'none' : probable;

  // needsClarification = true when mode is 'ask'
  // This replaces the mode: 'ask' branching logic
  const needsClarification = mode === 'ask';

  // Extract logSubtype only if probableKind is 'log'
  const logSubtype = probableKind === 'log' ? canonicalSubtype : undefined;

  return {
    probableKind,
    confidence,
    needsClarification,
    logSubtype,
    tags: tags || [],
  };
}

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
    engineTags: [],
    rawSentence: '', // Phase 2A: Will be populated with user input
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
    const listAnalysis = analyzeListShape(userText);
    const ideaAnalysis = analyzeIdeaShape(userText);
    const listHeuristicTriggered = listAnalysis.score >= 0.6;
    const ideaHeuristicTriggered = ideaAnalysis.score >= 0.5;

    console.log('[DEBUG][cortexDecide] Intent detected:', {
      text: userText.substring(0, 50),
      kind: detected.kind,
      confidence: detected.confidence,
      suppressChips: detected.suppressChips,
      isMetaComment: (detected as any).isMetaComment,
      listHeuristic: {
        score: Number(listAnalysis.score.toFixed(2)),
        matches: listAnalysis.matches,
        triggered: listHeuristicTriggered,
      },
      ideaHeuristic: {
        score: Number(ideaAnalysis.score.toFixed(2)),
        matches: ideaAnalysis.matches.length,
        triggered: ideaHeuristicTriggered,
      },
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
              rawSentence: userText, // Phase 2A
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
        rawSentence: userText, // Phase 2A
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
    let normalized: NormalizedEngineResult = { actions: [], confidence: 0 };

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
          canonicalType: 'log',
          canonicalSubtype: 'everything_else',
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
          canonicalType: 'todo',
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
          canonicalType: 'habit',
        };
      } else {
        normalized = { actions: [], confidence: 0 };
      }
    }

    const candidateActions = normalized.actions;
    const engineTags = Array.isArray(normalized.tags)
      ? normalized.tags
      : coerceEngineTags(engineOutput?.tags);

    const probable: 'todo' | 'habit' | 'log' | 'unknown' = (() => {
      const canonical = normalized.canonicalType;
      if (canonical === 'todo') return 'todo';
      if (canonical === 'habit') return 'habit';
      if (canonical === 'log' || canonical === 'unsorted') return 'log';

      const firstAction = candidateActions[0];
      if (firstAction) {
        if (firstAction.type === 'create.todo') return 'todo';
        if (firstAction.type === 'create.habit') return 'habit';
        if (firstAction.type === 'create.note' || firstAction.type === 'add.to.list') return 'log';
      }

      const engineTypeRaw =
        typeof normalized.engineType === 'string'
          ? normalized.engineType
          : typeof (engineOutput as any)?.type === 'string'
            ? (engineOutput as any).type
            : null;
      if (engineTypeRaw === 'todo' || engineTypeRaw === 'habit') {
        return engineTypeRaw;
      }
      if (engineTypeRaw === 'note') {
        return 'log';
      }
      if (detected.kind === 'habit') return 'habit';
      if (detected.kind === 'todo') return 'todo';
      if (detected.kind === 'note') return 'log';
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

    const listHeuristicApplied = listHeuristicTriggered;
    const ideaHeuristicApplied =
      ideaHeuristicTriggered &&
      !((probable === 'todo' || probable === 'habit') && confidence >= 0.9);

    // Strong list patterns (score >= 0.7) should auto-create as logs without chips
    // Weak list patterns (0.5-0.7) should show chips for confirmation
    const listStrong = listAnalysis.looksLikeList && listAnalysis.score >= 0.7;
    const forceListAsk = listHeuristicApplied && !listStrong; // Only ask for weak lists
    const forceIdeaAsk = ideaHeuristicApplied;

    // For strong lists, override candidate actions to create.note with list subtype
    let effectiveCandidateActions = candidateActions;
    if (listStrong) {
      effectiveCandidateActions = [
        {
          type: 'create.note' as const,
          payload: {
            text: userText,
            subtype: 'list' as const,
            spaceId: null,
          },
        },
      ];
    }

    const shouldAuto =
      !forceListAsk &&
      !forceIdeaAsk &&
      effectiveCandidateActions.length > 0 &&
      (confidence > autoThreshold || preferHabitAuto || listStrong); // Auto for strong lists

    let mode: DecisionMode = 'keep';

    if (!hasConfidence || confidence < 0) {
      mode = 'keep';
    } else if (shouldAuto) {
      mode = 'auto';
    } else if (confidence >= midLower) {
      mode = 'ask';
    }

    if (forceListAsk || forceIdeaAsk) {
      mode = 'ask';
    }

    const listActionLowRisk =
      normalizedCtx.uiSurface === 'overlay' &&
      hasConfidence &&
      confidence <= autoThreshold &&
      effectiveCandidateActions.some((action) => action.type === 'add.to.list');

    const autoTodoWithStrongList =
      mode === 'auto' &&
      listStrong &&
      effectiveCandidateActions.some((action) => action.type === 'create.todo');

    if (mode === 'auto' && (listActionLowRisk || autoTodoWithStrongList)) {
      mode = 'ask';
    }

    if (effectiveCandidateActions.length === 0) {
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

    let chipSuggestions: ChipSuggestion[] = [];
    if (mode === 'ask') {
      const baseChips = buildMindDropAskChips({
        text: userText,
        probable,
        confidence: hasConfidence ? confidence : 0,
      }).map((c) => ({ ...c }));
      const heuristicChips: ChipSuggestion[] = [];
      if (listHeuristicApplied) {
        heuristicChips.push(...buildListHeuristicChips(userText));
      }
      if (ideaHeuristicApplied) {
        heuristicChips.push(...buildIdeaHeuristicChips(userText));
      }

      chipSuggestions = dedupeChipSuggestions([...baseChips, ...heuristicChips]);
    }

    let suggestions: CortexSuggestion[] = [];
    if (mode === 'ask') {
      suggestions =
        chipSuggestions.length > 0
          ? chipSuggestions
          : generateSuggestions(effectiveCandidateActions, normalizedCtx);
    }

    const suggestionLabels =
      mode === 'ask'
        ? chipSuggestions.length > 0
          ? chipSuggestions.map((chip) => chip.label)
          : suggestions.filter((suggestion): suggestion is string => typeof suggestion === 'string')
        : undefined;

    const shouldUseExploreFallback =
      (engineFailed || !engineOutput) && effectiveCandidateActions.length === 0;

    const explanation = shouldUseExploreFallback
      ? "Let's explore that a bit more."
      : mode === 'ask'
        ? explainAmbiguous(tone, suggestionLabels)
        : generateExplanation(effectiveCandidateActions, mode, tone, normalizedCtx);

    const candidateCanonical = canonicalFromAction(effectiveCandidateActions[0]);
    const canonicalHint = listHeuristicApplied
      ? {
          canonicalType: 'log' as CanonicalType,
          canonicalSubtype: 'list' as LogSubtype,
          score: listAnalysis.score,
          reasons: [...listAnalysis.reasons],
          source: 'list-heuristic' as const,
        }
      : ideaHeuristicApplied
        ? {
            canonicalType: 'log' as CanonicalType,
            canonicalSubtype: 'idea' as LogSubtype,
            score: ideaAnalysis.score,
            reasons: [...ideaAnalysis.reasons],
            source: 'idea-heuristic' as const,
          }
        : null;

    const effectiveCanonicalType =
      canonicalHint?.canonicalType ?? normalized.canonicalType ?? candidateCanonical.canonicalType;

    const effectiveCanonicalSubtype =
      canonicalHint?.canonicalSubtype ??
      normalized.canonicalSubtype ??
      candidateCanonical.canonicalSubtype ??
      null;

    const heuristicsMeta = {
      list: {
        ...listAnalysis,
        triggered: listHeuristicTriggered,
        applied: listHeuristicApplied,
      },
      idea: {
        ...ideaAnalysis,
        triggered: ideaHeuristicTriggered,
        applied: ideaHeuristicApplied,
      },
    };

    // Extract classification tags from engineOutput if available
    const classificationTags = engineOutput?.classification?.tags
      ? coerceEngineTags(engineOutput.classification.tags)
      : undefined;

    // Build unified Mind Drop decision for new pipeline
    const mindDropDecision = buildMindDropDecision(
      probable,
      confidence,
      mode,
      effectiveCanonicalSubtype,
      engineTags,
    );

    const result: CortexResponse = {
      ...safeResult,
      actions: mode === 'auto' ? effectiveCandidateActions : [],
      explanation,
      suggestions,
      confidence,
      mode,
      mindDropDecision, // New unified decision structure
      rawSentence: userText, // Phase 2A: Original user input for background prefill
      meta: {
        intent: { kind: detected.kind, confidence: detected.confidence },
        showedChip:
          (chipSuggestions.length > 0 || inMidConfidenceBand) &&
          suggestions.some((suggestion) => typeof suggestion !== 'string'),
        candidateActions: effectiveCandidateActions,
        canonicalType: effectiveCanonicalType,
        canonicalSubtype: effectiveCanonicalSubtype,
        listHeuristicTriggered: listHeuristicApplied,
        ideaHeuristicTriggered: ideaHeuristicApplied,
        heuristics: heuristicsMeta,
        canonicalHint: canonicalHint ?? undefined,
        engineOutputTags: engineTags,
        ...(classificationTags && {
          classification: {
            tags: classificationTags,
          },
        }),
      },
      engineTags,
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
      rawSentence: input.text || '', // Phase 2A
      mindDropDecision: {
        probableKind: 'none',
        confidence: 0,
        needsClarification: true,
        tags: [],
      },
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
  const hasGenericFrequency =
    /\bevery\b|\beach\b|\bdaily\b|\bevery day\b|\bweekly\b|\bmonthly\b/.test(t);
  const hasTimesPerPeriod = /\b\d+\s+times?\s+(a|per)\s+(day|week|month)\b/.test(t);
  const hasDurationPerDay =
    /\b\d+\s+(minutes?|minute|hours?|hour)\b.*\b((per|each|every)\s*day|a\s+day|in\s+(a\s+)?day)\b/.test(
      t,
    );

  return hasGenericFrequency || hasTimesPerPeriod || hasDurationPerDay;
}

/**
 * Extract item text from shopping list or similar add-to-list commands
 * @internal
 */
function buildListHeuristicChips(text: string): ChipSuggestion[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const canonicalTypesOn = env.feature.canonicalTypes;
  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const heading = lines[0] ?? trimmed;

  const todoFields = buildTodoFields(trimmed, undefined, { inferDueFromText: true });
  const due = todoFields.due ?? null;
  const listNoteLabel = canonicalTypesOn ? 'Save as list' : 'Save as note (list)';

  return [
    {
      type: 'create.note',
      label: listNoteLabel,
      payload: {
        title: heading,
        body: trimmed,
        subtype: 'list',
      },
      reason: 'list-heuristic',
    },
    {
      type: 'create.todo',
      label: 'Create To-do checklist',
      payload: {
        name: todoFields.title || heading,
        undefined_due: !due,
        due,
        due_date: due,
      },
      reason: 'list-heuristic',
    },
  ];
}

function buildIdeaHeuristicChips(text: string): ChipSuggestion[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const canonicalTypesOn = env.feature.canonicalTypes;
  const ideaNoteLabel = canonicalTypesOn ? 'Save as idea' : 'Save as note (idea)';
  const todoFields = buildTodoFields(trimmed, undefined, { inferDueFromText: true });
  const due = todoFields.due ?? null;

  return [
    {
      type: 'create.note',
      label: ideaNoteLabel,
      payload: {
        title: trimmed,
        body: trimmed,
        subtype: 'idea',
      },
      reason: 'idea-heuristic',
    },
    {
      type: 'create.todo',
      label: 'Create To-do',
      payload: {
        name: todoFields.title,
        undefined_due: !due,
        due,
        due_date: due,
      },
      reason: 'idea-heuristic',
    },
  ];
}

function dedupeChipSuggestions(chips: ChipSuggestion[]): ChipSuggestion[] {
  const seen = new Set<string>();
  const result: ChipSuggestion[] = [];
  for (const chip of chips) {
    const key = `${chip.type}:${chip.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(chip);
  }
  return result;
}

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
 * Interpret commands like "Make work todo list today" as todo creation instead of list capture.
 * Guards against "Add eggs to my todo list" by requiring build verbs and skipping list verbs.
 */
function convertTodoListCommandToTodo(text: string): { title: string; due?: string } | null {
  const lower = text.toLowerCase();

  if (!/\bto-?do list\b/.test(lower)) {
    return null;
  }

  // Skip when user is clearly adding items to an existing todo list.
  if (/(?:^|\s)(add|put|include|insert|append|throw|toss|drop)\b/.test(lower)) {
    return null;
  }

  const buildVerbMatches =
    /\b(make|create|start|begin|finish|complete|organize|plan|prep|prepare|build|draft|write|do|work on)\b/;
  if (!buildVerbMatches.test(lower)) {
    return null;
  }

  const todoFields = buildTodoFields(text, undefined, { inferDueFromText: true });

  if (!todoFields.title) {
    return null;
  }

  return { title: todoFields.title, due: todoFields.due };
}

function canonicalFromAction(action: CortexAction | undefined): {
  canonicalType?: CanonicalType;
  canonicalSubtype?: LogSubtype | null;
} {
  if (!action) {
    return { canonicalType: undefined, canonicalSubtype: null };
  }

  switch (action.type) {
    case 'create.todo':
      return { canonicalType: 'todo', canonicalSubtype: null };
    case 'create.habit':
      return { canonicalType: 'habit', canonicalSubtype: null };
    case 'create.note': {
      const subtype = action.payload.subtype ?? null;
      if (!subtype) {
        return { canonicalType: 'unsorted', canonicalSubtype: null };
      }

      switch (subtype) {
        case 'journal':
        case 'idea':
        case 'list':
          return { canonicalType: 'log', canonicalSubtype: subtype };
        case 'reference':
          return { canonicalType: 'log', canonicalSubtype: 'everything_else' };
        case 'catchall':
        default:
          return { canonicalType: 'unsorted', canonicalSubtype: null };
      }
    }
    case 'add.to.list':
      return { canonicalType: 'log', canonicalSubtype: 'list' };
    default:
      return { canonicalType: undefined, canonicalSubtype: null };
  }
}

/**
 * Normalize engine output to canonical CortexAction[]
 * Phase 10.4: Apply space-level biasing for ambiguous intents
 * @internal
 */
type NormalizedEngineResult = {
  actions: CortexAction[];
  confidence: number;
  canonicalType?: CanonicalType;
  canonicalSubtype?: LogSubtype | null;
  engineType?: string | null;
  tags?: string[];
};

function normalizeEngineOutput(
  engineOutput: any,
  ctx: CortexContext,
  originalText?: string,
): NormalizedEngineResult {
  const actions: CortexAction[] = [];

  // Extract confidence if available, default to high confidence (0.85) if engine made a classification
  const confidence = typeof engineOutput.confidence === 'number' ? engineOutput.confidence : 0.85;

  // Use original text as fallback for title/name/text
  const fallbackText = originalText || 'Untitled';

  const tags = coerceEngineTags(engineOutput?.tags);

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

  let canonicalType: CanonicalType | undefined;
  let canonicalSubtype: LogSubtype | null | undefined = null;

  if (engineType === 'todo') {
    canonicalType = 'todo';
  } else if (engineType === 'habit') {
    canonicalType = 'habit';
  } else if (engineType === 'note') {
    const rawSubtype =
      typeof engineOutput.subtype === 'string' ? engineOutput.subtype.toLowerCase() : '';
    switch (rawSubtype) {
      case 'journal':
        canonicalType = 'log';
        canonicalSubtype = 'journal';
        break;
      case 'idea':
        canonicalType = 'log';
        canonicalSubtype = 'idea';
        break;
      case 'person':
        canonicalType = 'log';
        canonicalSubtype = 'person';
        break;
      case 'list':
        canonicalType = 'log';
        canonicalSubtype = 'list';
        break;
      case 'catchall':
      case '':
        canonicalType = 'unsorted';
        canonicalSubtype = null;
        break;
      default:
        canonicalType = 'log';
        canonicalSubtype = 'everything_else';
        break;
    }
  }

  if (canonicalType === 'todo') {
    const { title, due } = buildTodoFields(engineOutput.title || fallbackText, engineOutput.due);
    actions.push({
      type: 'create.todo',
      payload: {
        title,
        due,
        spaceId: ctx.activeSpaceId,
      },
    });
  } else if (canonicalType === 'habit') {
    const { name, freq } = buildHabitFields(
      engineOutput.name || fallbackText,
      engineOutput.frequency,
    );
    actions.push({
      type: 'create.habit',
      payload: {
        name,
        freq,
        spaceId: ctx.activeSpaceId,
      },
    });
  } else if (canonicalType === 'log' && canonicalSubtype === 'list') {
    const todoOverride = convertTodoListCommandToTodo(fallbackText);
    if (todoOverride) {
      actions.push({
        type: 'create.todo',
        payload: {
          title: todoOverride.title,
          due: todoOverride.due,
          spaceId: ctx.activeSpaceId,
        },
      });
    } else {
      const whyString = engineOutput.whyString || '';
      const isShoppingIntent =
        /shopping|grocery|groceries/i.test(fallbackText) ||
        /shopping|grocery|groceries/i.test(whyString);

      const item = extractItemFromText(fallbackText);
      const listKey = isShoppingIntent ? 'shopping' : detectListType(fallbackText, ctx);

      actions.push({
        type: 'add.to.list',
        payload: {
          listKey,
          item,
          spaceId: ctx.activeSpaceId,
        },
      });
    }
  } else if (canonicalType === 'log' || canonicalType === 'unsorted') {
    const mapping = canonicalToPersisted(canonicalType, canonicalSubtype ?? null);
    actions.push({
      type: 'create.note',
      payload: {
        text: fallbackText,
        subtype: (mapping.noteSubtype ?? 'catchall') as any,
        spaceId: ctx.activeSpaceId,
      },
    });
  }

  return {
    actions,
    confidence,
    canonicalType,
    canonicalSubtype: canonicalSubtype ?? null,
    engineType,
    tags,
  };
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

function coerceEngineTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const normalized = raw
    .map((tag) => (typeof tag === 'string' ? tag.trim() : null))
    .filter((tag): tag is string => Boolean(tag));

  if (normalized.length === 0) {
    return [];
  }

  return Array.from(new Set(normalized));
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
    suggestions.push('Save as log?');
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
