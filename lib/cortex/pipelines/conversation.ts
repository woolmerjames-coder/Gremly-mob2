// lib/cortex/pipelines/conversation.ts
import {
  cortexDecide,
  type DecideInput,
  type CortexContext,
  type CortexResponse,
} from '../cortexDecide';
import { isGreeting, isSmalltalk, respond as respondSmalltalk } from '../smalltalk';
import { callChat, type ChatMessage } from '../CortexClient';
import { detectIntent } from '../intents/detectIntent';
import { detectMultipleIntents } from '../intents/multiIntentDetector';
import type { DetectedIntent } from '../intents/types';
import {
  buildContextWindow,
  buildChatContext,
  summarize,
  updateRunningSummary,
  hasExplicitCreationIntent,
  isAffirmation,
  type ChatTurn,
  type ChatContext,
} from '../context/memory';
import { getPersonaPrompt } from '../persona/prompt';
import { smartRefine } from '../persona/refine';

const CATCHALL_COPY_RE = /saving to catch[- ]all/i;
const EXPLORATION_COPY_RE = /let's explore that a bit more\.?/i;
const MAX_CONSECUTIVE_QUESTIONS = 3;

function isExplicitActionRequest(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;

  if (/^(set|add|create|save|send|log)\b/.test(normalized)) {
    return true;
  }

  return /\b(remind me|remember to|note to|schedule|make sure to)\b/.test(normalized);
}

/**
 * Check if a response contains a question
 * Phase 11.2: Used to track consecutive questions
 */
function containsQuestion(text: string): boolean {
  if (!text) return false;
  // Check for question mark or common question patterns
  return /\?|^(what|when|where|who|why|how|which|do you|are you|can you|would you|could you)\b/i.test(
    text,
  );
}

function cleanCuriosityFragment(fragment: string): string {
  return fragment
    .trim()
    .replace(/^[,:;\-\s]+/, '')
    .replace(/[\s.:;!]+$/, '')
    .replace(/^to\s+/i, '')
    .trim();
}

/**
 * @deprecated This function generates poorly formatted template questions.
 * Disabled in favor of AI worker's natural language responses.
 * DO NOT RE-ENABLE - causes issues like:
 * "What's the first thing you'd try as you start exercising more but need to figure out a plan that works fo me"
 */
function buildCuriosityQuestion(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (/[?]/.test(trimmed)) {
    return null;
  }

  const endsDeclarative = /[\w)]$/.test(trimmed) || /\.$/.test(trimmed);
  if (!endsDeclarative) {
    return null;
  }

  const normalized = trimmed.toLowerCase();

  const matchWant = /\bwant to\s+([^.!?]+)[.!?]*$/.exec(normalized);
  if (matchWant) {
    const fragment = cleanCuriosityFragment(matchWant[1]);
    if (/get in shape/.test(fragment)) {
      return 'Nice! What kind of workouts appeal most to you?';
    }
    return `Nice! What's the first thing you'd try as you ${fragment}?`;
  }

  const matchThinking = /\bthinking about\s+([^.!?]+)[.!?]*$/.exec(normalized);
  if (matchThinking) {
    const fragment = cleanCuriosityFragment(matchThinking[1]);
    if (/oaxaca/.test(fragment)) {
      return "Oaxaca's amazing. Are you thinking culture, food, or nature first?";
    }
    return `What's the first detail you're exploring about ${fragment}?`;
  }

  const matchConsidering = /\bconsidering\s+([^.!?]+)[.!?]*$/.exec(normalized);
  if (matchConsidering) {
    const fragment = cleanCuriosityFragment(matchConsidering[1]);
    return `What's the biggest factor you're weighing for ${fragment}?`;
  }

  const matchPlanning = /\bplanning(?: to)?\s+([^.!?]+)[.!?]*$/.exec(normalized);
  if (matchPlanning) {
    const fragment = cleanCuriosityFragment(matchPlanning[1]);
    return `What's the first step you're planning for ${fragment}?`;
  }

  return null;
}

function advanceCooldownState(
  ctx: CortexContext,
  cooldownTurns: number,
): {
  previousCooldowns: Record<string, number>;
  nextCooldowns: Record<string, number>;
  trimmedBuffer: Array<{ kind: string; turn: number }>;
} {
  const previousCooldowns = ctx.intentCooldownMap ? { ...ctx.intentCooldownMap } : {};

  const nextCooldowns: Record<string, number> = {};

  for (const [kind, turnsRaw] of Object.entries(previousCooldowns)) {
    const turns = typeof turnsRaw === 'number' ? turnsRaw : 0;
    const remaining = Math.max(0, turns - 1);
    if (remaining > 0) {
      nextCooldowns[kind] = remaining;
    }
  }

  const currentTurn = ctx.currentTurn || 0;
  const recentIntentBuffer = Array.isArray(ctx.recentIntentBuffer) ? ctx.recentIntentBuffer : [];

  const trimmedBuffer = recentIntentBuffer.filter((entry) => {
    if (typeof entry?.turn !== 'number') {
      return false;
    }
    if (typeof currentTurn !== 'number') {
      return false;
    }
    const turnsSince = currentTurn - entry.turn;
    return Number.isFinite(turnsSince) && turnsSince >= 0 && turnsSince < cooldownTurns;
  });

  ctx.intentCooldownMap = nextCooldowns;
  ctx.recentIntentBuffer = trimmedBuffer;

  const remainingGlobalCooldown = Object.values(nextCooldowns).reduce(
    (max, value) => (typeof value === 'number' ? Math.max(max, value) : max),
    0,
  );

  ctx.intentCooldownTurns = remainingGlobalCooldown;

  return { previousCooldowns, nextCooldowns, trimmedBuffer };
}
/**
 * Defensive mapper for when worker returns { content: "text", hasChoices: false }
 * Maps to { mode: 'reply', replyText: content, actions: [], suggestions: [] }
 * Phase 10.10 B1: Includes context window + running summary for better continuity
 */
async function tryDirectWorkerCall(
  input: DecideInput,
  ctx: CortexContext,
  context?: ChatContext,
): Promise<CortexResponse> {
  try {
    if (!input.text) {
      throw new Error('No text input for direct worker call');
    }

    // B1: Assemble full context: system prompt + summary + last N turns + current message
    const messages: ChatMessage[] = [];

    let systemPrompt = context?.systemPrompt?.trim() || getPersonaPrompt();

    // Phase 11.2: Track consecutive questions and add safeguard
    const consecutiveQuestions = ctx.consecutiveQuestions ?? 0;
    if (consecutiveQuestions >= MAX_CONSECUTIVE_QUESTIONS) {
      if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
        console.log('[CORTEX][11.2] Max consecutive questions reached, forcing statement');
      }
      systemPrompt +=
        '\n\nIMPORTANT: You have asked several questions. Now provide a helpful insight or suggestion WITHOUT asking another question. Synthesize what you know and offer concrete next steps.';
    }

    messages.push({ role: 'system', content: systemPrompt });

    const summaryText = context?.summary?.trim();
    if (summaryText) {
      messages.push({
        role: 'system',
        content: `Conversation summary so far:\n${summaryText}`,
      });
    }

    if (Array.isArray(context?.messages) && context.messages.length > 0) {
      for (const turn of context.messages) {
        if (!turn?.text || !turn.text.trim()) continue;
        messages.push({
          role: turn.role,
          content: turn.text,
        });
      }
    }

    messages.push({ role: 'user', content: input.text });

    let response;
    let _lastError;

    // First attempt: Quick response (6s timeout)
    try {
      response = await callChat(messages, {
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 200, // Shorter for quicker response
        spaceId: ctx.spaceId ?? ctx.activeSpaceId ?? null,
        chatId: ctx.chatId ?? null,
        lane: ctx.lane ?? 'space_chat',
      });
    } catch (error) {
      _lastError = error;
      if (__DEV__) {
        console.log('[CORTEX] First attempt failed, retrying with longer timeout', error);
      }

      // Second attempt: Longer response (15s timeout, more tokens)
      response = await callChat(messages, {
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 400,
        spaceId: ctx.spaceId ?? ctx.activeSpaceId ?? null,
        chatId: ctx.chatId ?? null,
        lane: ctx.lane ?? 'space_chat',
      });
    }

    if (!response.ok) {
      throw new Error(response.error || 'Worker call failed');
    }

    const data = response.data as any; // Worker response can have various shapes

    // Check if worker returned content but no choices (compact format)
    if (data?.content && typeof data.content === 'string' && !data.choices) {
      if (__DEV__) {
        console.log('[CORTEX] Direct worker call success - compact format', {
          contentLength: data.content.length,
          hasModel: !!data.model,
          hasUsage: !!data.usage,
        });
      }

      const replyText = data.content.trim();
      const followUpsRaw =
        data.followupQuestions ?? data.follow_up_questions ?? data.suggestions ?? [];
      const suggestions = Array.isArray(followUpsRaw)
        ? (followUpsRaw as any[])
            .map((item) =>
              typeof item === 'string'
                ? item.trim()
                : typeof item?.text === 'string'
                  ? item.text.trim()
                  : null,
            )
            .filter((item): item is string => !!item && item.length > 0)
        : [];

      const workerConfidence =
        typeof data.confidence === 'number' && Number.isFinite(data.confidence)
          ? Math.max(0, Math.min(1, data.confidence))
          : 0.85;

      // Phase 11.7+: Refine AI response to match brand voice
      const refinedReply = smartRefine(replyText);

      // Phase 11.2: Update consecutive questions counter
      const hasQuestion = containsQuestion(refinedReply);
      if (hasQuestion) {
        ctx.consecutiveQuestions = (ctx.consecutiveQuestions ?? 0) + 1;
      } else {
        ctx.consecutiveQuestions = 0;
      }

      if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
        console.log('[CORTEX][11.2] Question tracking:', {
          hasQuestion,
          consecutiveQuestions: ctx.consecutiveQuestions,
          replyPreview: refinedReply.substring(0, 60),
        });
      }

      return {
        actions: [],
        explanation: undefined,
        replyText: refinedReply,
        suggestions,
        mode: 'reply',
        confidence: workerConfidence,
        meta: {
          responseSource: 'worker',
          workerModel: data.model ?? 'gpt-4o-mini',
          workerUsage: data.usage,
          consecutiveQuestions: ctx.consecutiveQuestions,
        },
      };
    }

    throw new Error('Worker response missing content or has unexpected format');
  } catch (error) {
    if (__DEV__) {
      console.log('[CORTEX] Direct worker call failed', error);
    }

    // Phase 11+: Engine/worker failure fallback - return exploration prompt
    // This satisfies test expectations: mode='ask', contains "Let's explore", no "Catch-All"
    return {
      actions: [],
      mode: 'ask',
      replyText: "Let's explore that together — I couldn't analyze that automatically.",
      suggestions: [],
      explanation: undefined,
      confidence: 0,
      meta: {
        fallback: 'exploration',
        responseSource: 'worker',
        workerFallback: true,
      },
    };
  }
}

/**
 * Space Chat conversation pipeline.
 * Step 4: implement chat-specific rules:
 * - Never auto-sort (auto → ask)
 * - No auto actions in chat
 * - Suppress catch-all copy
 * - Keep suggestions for inline chips
 * Step 5.1: Small-talk fallback when no actionable content
 * Step 5.1b: Defensive mapper for worker content without choices
 * Phase 10.7C: Smalltalk routing before cortexDecide
 * Phase 10.7D: Context building, cooldown logic, empathy responses
 */
export async function runConversationPipeline(input: DecideInput, ctx: CortexContext) {
  if (__DEV__) {
    console.log('[CORTEX] Space Chat pipeline started', {
      inputText: input.text?.substring(0, 50) + (input.text && input.text.length > 50 ? '...' : ''),
      userId: ctx.userId,
      spaceId: ctx.spaceId,
      chatId: ctx.chatId,
      recentAssistantKind: ctx.recentAssistantKind,
    });
  }

  // Phase 10.7E: Build context with database integration
  const maxContext = parseInt(process.env.EXPO_PUBLIC_CHAT_MAX_CONTEXT || '8', 10);

  // Try to build context from database if repo and spaceId are available
  let contextWindow: ChatTurn[] = [];
  let runningSummary: string | undefined;
  let chatContext: ChatContext | undefined;

  if (ctx.repo && ctx.spaceId) {
    chatContext = await buildChatContext({
      spaceId: ctx.spaceId,
      repo: ctx.repo,
      maxContext: maxContext,
      runningSummary: ctx.runningSummary || null,
    });

    contextWindow = Array.isArray(chatContext.messages) ? chatContext.messages : [];
    runningSummary = chatContext.summary || undefined;
    ctx.runningSummary = runningSummary || null;

    // Logging already done in buildChatContext
  } else {
    // Fallback: Use messages from input if provided (legacy path)
    const allMessages: ChatTurn[] = (input as any).messages || [];
    const builtWindow = buildContextWindow(allMessages, maxContext);
    contextWindow = Array.isArray(builtWindow) ? builtWindow : [];

    // Initialize or update running summary
    if (!ctx.runningSummary && allMessages.length > 2) {
      ctx.runningSummary = await summarize(allMessages);
    }
    runningSummary = ctx.runningSummary || undefined;

    chatContext = {
      messages: contextWindow,
      summary: runningSummary,
      windowSize: contextWindow.length,
      summaryLength: runningSummary?.length ?? 0,
      systemPrompt: getPersonaPrompt(),
    };

    if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
      console.log('[CORTEX][10.7E] context_built_legacy', {
        windowSize: contextWindow?.length || 0,
        summaryLength: ctx.runningSummary?.length || 0,
      });
    }
  }

  // Phase 10.7C: Check for greeting or smalltalk first
  const userText = input.text?.trim() || '';

  const curiosityPhaseFlag = (process.env.EXPO_PUBLIC_CHAT_CURIOSITY_PHASE || '').toLowerCase();
  // DISABLED - Template questions generate poor responses like truncated text
  // AI worker responses are much more natural and contextual
  const curiosityEnabled = false;

  const cooldownTurns = parseInt(
    process.env.INTENT_COOLDOWN_TURNS || process.env.EXPO_PUBLIC_INTENT_COOLDOWN_TURNS || '2',
    10,
  );

  const {
    previousCooldowns,
    nextCooldowns,
    trimmedBuffer: trimmedIntentBufferBase,
  } = advanceCooldownState(ctx, cooldownTurns);

  const recentIntentBuffer = trimmedIntentBufferBase;
  const currentTurn = ctx.currentTurn || 0;
  const clarifiedTopics = ctx.clarifiedTopics || new Set<string>();

  const greetingDetected = isGreeting(userText);
  const smalltalkDetected = isSmalltalk(userText);
  const hasExplicitIntent = hasExplicitCreationIntent(userText);

  if (
    curiosityEnabled &&
    !hasExplicitIntent &&
    !smalltalkDetected &&
    !greetingDetected &&
    !isExplicitActionRequest(userText)
  ) {
    const curiosityQuestion = buildCuriosityQuestion(userText);
    if (curiosityQuestion) {
      return {
        mode: 'ask' as const,
        actions: [],
        suggestions: [],
        replyText: curiosityQuestion,
        explanation: undefined,
        confidence: 0,
        meta: {
          lane: 'space_chat' as const,
          curiosityPrompted: true,
          curiosityKind: 'open_statement',
        },
      };
    }
  }

  const suppressSmalltalkAck = ctx.recentAssistantKind === 'smalltalk' && smalltalkDetected;

  // Phase 10.7D: Check for empathy signals
  if (
    /\b(oh no|what's wrong|i'm upset|i'm sad|i'm worried|feeling down)\b/i.test(
      userText.toLowerCase(),
    )
  ) {
    if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
      console.log('[CORTEX][10.7D] empathy_triggered');
    }

    return {
      mode: 'ask' as const,
      actions: [],
      suggestions: [],
      replyText: "I'm here. What's going on?",
      explanation: undefined,
      confidence: 0,
      meta: {
        kind: 'empathy',
        empathy_triggered: true,
      },
    };
  }

  // Note: smalltalk/greeting handling is performed later as a fallback after normalizing the response

  // Try cortexDecide first, but fall back to direct worker call for Space Chat
  let raw: CortexResponse;

  try {
    raw = await cortexDecide(input, ctx);

    if (__DEV__) {
      console.log('[CORTEX] Raw cortexDecide response', {
        mode: raw.mode,
        actionsCount: raw.actions?.length || 0,
        hasExplanation: !!raw.explanation?.trim(),
        explanation: raw.explanation?.substring(0, 50),
        hasSuggestions: Array.isArray(raw.suggestions) && raw.suggestions.length > 0,
        confidence: raw.confidence,
      });
    }
  } catch (error) {
    if (__DEV__) {
      console.log('[CORTEX] cortexDecide failed, trying direct worker call', error);
    }

    try {
      // Defensive mapper: try direct worker call for Space Chat with full context
      const fallbackContext: ChatContext = chatContext ?? {
        messages: contextWindow,
        summary: runningSummary,
        windowSize: contextWindow.length,
        summaryLength: runningSummary?.length ?? 0,
        systemPrompt: getPersonaPrompt(),
      };

      raw = await tryDirectWorkerCall(input, ctx, fallbackContext);
    } catch (fallbackError) {
      // Both cortexDecide and tryDirectWorkerCall failed - return safe fallback
      console.error('[CORTEX] Engine failed completely, returning exploration fallback:', {
        primaryError: error instanceof Error ? error.message : String(error),
        fallbackError:
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      });

      // Return deterministic exploration fallback that satisfies test expectations
      return {
        mode: 'ask' as const,
        actions: [],
        suggestions: [],
        replyText: "Let's explore that together — I couldn't analyze that automatically.",
        explanation: undefined,
        confidence: 0,
      };
    }
  }

  // Normalize for Space Chat UX with safe defaults
  const normalized: CortexResponse & { meta?: Record<string, any> } = {
    mode: (raw?.mode as any) ?? 'keep',
    actions: Array.isArray((raw as any)?.actions) ? (raw as any).actions : [],
    suggestions: Array.isArray((raw as any)?.suggestions) ? (raw as any).suggestions : [],
    // Preserve undefined when absent; avoid defaulting to empty string so tests can assert undefined
    replyText:
      typeof (raw as any)?.replyText === 'string' ? ((raw as any).replyText as string) : undefined,
    explanation:
      typeof (raw as any)?.explanation === 'string'
        ? ((raw as any).explanation as string)
        : undefined,
    confidence: typeof (raw as any)?.confidence === 'number' ? (raw as any).confidence : 0,
    meta:
      raw && typeof (raw as any).meta === 'object' && (raw as any).meta !== null
        ? { ...(raw as any).meta }
        : {},
  } as CortexResponse & { meta?: Record<string, any> };

  // Never auto-sort in chat
  if (normalized.mode === 'auto') {
    normalized.mode = 'ask';
  }
  // No auto actions in chat
  if (Array.isArray(normalized.actions) && normalized.actions.length > 0) {
    normalized.actions = [];
  }

  // Normalize suggestions array for type safety
  const suggestions = Array.isArray(normalized.suggestions) ? normalized.suggestions : [];

  // Early return for low-confidence decisions with no suggestions (exclude smalltalk and greetings)
  if (
    normalized.confidence === 0 &&
    suggestions.length === 0 &&
    !suppressSmalltalkAck &&
    !smalltalkDetected &&
    !greetingDetected
  ) {
    return {
      mode: normalized.mode,
      replyText: "Let's explore that a bit more.",
      suggestions: [],
      meta: {
        intentRoutedAs: 'exploration',
        fallback: 'exploration',
      },
    };
  }

  // Phase 11.1: Curiosity-first routing with conservative intent gating
  const intent: DetectedIntent = detectIntent(input.text || '');

  console.log('[DEBUG][conversation] Intent detected:', {
    text: input.text?.substring(0, 50),
    kind: intent.kind,
    confidence: intent.confidence,
    suppressChips: intent.suppressChips,
    isMetaComment: intent.isMetaComment,
  });

  // Phase 11.6: Multi-intent detection for ambiguous inputs
  // Check if this could be interpreted as multiple types
  let finalIntent = intent;
  if (
    (intent.kind === 'ambiguous' || intent.kind === 'note') &&
    intent.confidence >= 0.5 &&
    intent.confidence < 0.9
  ) {
    const multiIntent = detectMultipleIntents(input.text || '', {
      hasPersonContext: false, // Could enhance with actual context
    });

    if (multiIntent.alternativeIntents && multiIntent.alternativeIntents.length > 0) {
      console.log('[DEBUG][conversation] Multi-intent detected:', {
        primary: multiIntent.kind,
        primaryConfidence: multiIntent.confidence,
        alternatives: multiIntent.alternativeIntents.map((a) => `${a.kind} (${a.confidence})`),
        isMultiIntent: multiIntent.isMultiIntent,
      });

      finalIntent = multiIntent;
    }
  }

  // Handle meta-comments immediately - don't process as actions
  if (finalIntent.suppressChips && finalIntent.kind === 'question') {
    console.log('[DEBUG][conversation] Meta-comment detected - returning clarification');
    return {
      mode: 'ask' as const,
      actions: [],
      suggestions: [],
      replyText:
        "I understand you're confused. Let me clarify what I was trying to help with. What would you like to accomplish?",
      explanation: undefined,
      confidence: 0,
      meta: {
        kind: 'clarification',
        isMetaComment: true,
      },
    };
  }

  // Handle social/compliment intents - respond conversationally without creating actions
  if (finalIntent.kind === 'social') {
    console.log('[DEBUG][conversation] Social intent detected - responding conversationally');
    // Don't create actions, just have a nice conversational response
    // The AI worker will handle generating the appropriate response
    normalized.mode = 'reply';
    normalized.meta = {
      ...normalized.meta,
      detectedIntent: finalIntent,
      intentRoutedAs: 'social',
      intentKind: 'social',
    };
    // Let the AI worker generate a natural response
    // Don't set replyText here - let it be generated
  }

  // Phase 11.2: Context-aware habit reminder handling
  // When user specifies reminder times after discussing habits, don't create a TODO
  if (
    intent.kind === 'habit_reminder' ||
    (intent.kind === 'todo' &&
      intent.confidence >= 0.85 &&
      /\b(remind|alert|notify)/i.test(userText))
  ) {
    // Check recent conversation context for habit indicators
    const recentContext = (ctx.runningSummary || '').toLowerCase();
    const lastMessages = ctx.contextWindow?.slice(-3) || [];
    const recentText = lastMessages
      .map((m) => m.text || '')
      .join(' ')
      .toLowerCase();
    const combinedContext = `${recentContext} ${recentText}`;

    // Keywords that indicate we're discussing habits
    const habitIndicators = [
      'habit',
      'routine',
      'practice',
      'every day',
      'daily',
      'weekly',
      'regularly',
      'consistently',
      'want to start',
      'build a habit',
      'track this',
      'make this stick',
      'exercise',
      'meditate',
      'read',
      'journal',
      'workout',
      'yoga',
    ];

    const isHabitContext = habitIndicators.some((indicator) => combinedContext.includes(indicator));

    if (isHabitContext) {
      if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
        console.log('[CORTEX][11.2] Habit context detected, treating reminder as habit config:', {
          originalIntent: intent.kind,
          contextPreview: combinedContext.substring(0, 100),
        });
      }

      // Return early with signal that this is habit reminder configuration
      // Don't create actions here - let the normal flow handle it with context
      normalized.meta = {
        ...normalized.meta,
        contextOverride: 'habit_from_reminder',
        originalIntent: intent.kind,
        isHabitContext: true,
      };

      // Override intent for downstream processing
      intent.kind = 'habit';
      intent.confidence = 0.9;
    }
  }

  const minConfidenceEnv =
    process.env.INTENT_MIN_CONFIDENCE || process.env.EXPO_PUBLIC_INTENT_CONFIDENCE_MIN || '0.9';
  const minIntentConfidence = Number.isFinite(Number(minConfidenceEnv))
    ? Number(minConfidenceEnv)
    : 0.9;

  // Questions: reply-only ergonomics regardless of upstream output
  if (intent.kind === 'question') {
    // Ensure no chips for questions
    normalized.suggestions = [];
    // Provide a minimal helpful reply text (tests expect non-empty) but preserve any existing reply
    if (!normalized.replyText || !normalized.replyText.trim()) {
      normalized.replyText = 'I can help you think through that.';
    }
    normalized.mode = 'ask';
  }

  // Phase 10.7D: intentCooldown tracking (cooldownTurns already defined earlier)
  let intentCooldown = ctx.intentCooldownTurns || 0;

  // Decrement cooldown each turn
  if (intentCooldown > 0) {
    intentCooldown--;
    if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
      console.log('[CORTEX][10.7D] cooldown_decremented:', intentCooldown);
    }
  }

  // hasExplicitIntent already defined earlier in function
  const isUserAffirming = isAffirmation(userText);
  const bypassCooldown = hasExplicitIntent || isUserAffirming || finalIntent.isCommand;

  const creationIntents = new Set<DetectedIntent['kind']>([
    'habit',
    'todo',
    'note',
    'reflection',
    'idea',
  ]);
  const isCreationIntent = creationIntents.has(finalIntent.kind);
  const meetsConfidence = finalIntent.confidence >= minIntentConfidence;
  const priorCooldown =
    typeof previousCooldowns[finalIntent.kind] === 'number'
      ? (previousCooldowns[finalIntent.kind] as number)
      : 0;
  const chipCoolingDown =
    typeof ctx.lastChipTurn === 'number' && typeof currentTurn === 'number'
      ? currentTurn - ctx.lastChipTurn <= cooldownTurns && currentTurn - ctx.lastChipTurn >= 0
      : false;
  const intentCoolingDown =
    isCreationIntent && !bypassCooldown && (priorCooldown > 0 || chipCoolingDown);

  normalized.suggestions = [];

  normalized.meta = {
    ...normalized.meta,
    detectedIntent: finalIntent, // Phase 11.6: Use finalIntent which may include multi-intent data
    intentConfidenceMin: minIntentConfidence,
    // Expose concise intent shape for consumers that prefer a flat contract
    intent: { kind: finalIntent.kind, confidence: finalIntent.confidence },
  };

  // Pre-set routing metadata for reiterated creation intents so fallbacks don't overwrite it
  if (isCreationIntent) {
    const hasRecentSameIntent = recentIntentBuffer.some((e) => e.kind === finalIntent.kind);
    if (hasRecentSameIntent) {
      normalized.meta = {
        ...normalized.meta,
        intentRoutedAs: finalIntent.kind,
        intentKind: finalIntent.kind,
      };
    }
  }

  let intentHandled = false;
  let awaitingClarification = false;

  // Handle social intents first - conversational, no actions
  if (finalIntent.kind === 'social') {
    intentHandled = true;
    normalized.mode = 'reply';
    normalized.meta = {
      ...normalized.meta,
      intentRoutedAs: 'social',
      intentKind: 'social',
    };
  } else if (finalIntent.kind === 'question' && meetsConfidence) {
    normalized.mode = 'ask';
    if (!normalized.replyText || !normalized.replyText.trim()) {
      normalized.replyText = 'I can help you think through that.';
    }
    if (typeof normalized.explanation === 'string') {
      normalized.explanation = undefined;
    }
    intentHandled = true;
    normalized.meta = {
      ...normalized.meta,
      intentRoutedAs: 'question',
      intentKind: finalIntent.kind,
    };
  } else if (finalIntent.isPlanning || finalIntent.suppressChips) {
    normalized.mode = 'ask';
    normalized.replyText =
      normalized.replyText ||
      'I can help you think through that. What aspect would you like to explore?';
    intentHandled = true;
    normalized.meta = {
      ...normalized.meta,
      intentRoutedAs: 'planning',
      intentKind: finalIntent.kind,
    };
  } else if (isCreationIntent && meetsConfidence && !intentCoolingDown) {
    const topicKey = finalIntent.kind;
    const needsClarification =
      !finalIntent.isCommand &&
      curiosityEnabled &&
      topicKey &&
      !clarifiedTopics.has(topicKey) &&
      !!finalIntent.curiositySuggestion;

    if (needsClarification) {
      if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
        console.log('[CORTEX][policy] awaiting_clarification', {
          kind: finalIntent.kind,
          confidence: finalIntent.confidence,
          curiositySuggestion: finalIntent.curiositySuggestion,
        });
      }
      normalized.mode = 'ask';
      normalized.replyText =
        finalIntent.curiositySuggestion ||
        "I'd like to understand this a bit better. What should we focus on?";
      normalized.meta = {
        ...normalized.meta,
        isAwaitingClarification: true,
        curiosityPrompted: topicKey,
      };
      awaitingClarification = true;
      intentHandled = true;
    } else if (finalIntent.isCommand) {
      if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
        console.log('[CORTEX][policy] explicit_intent -> open_overlay', {
          kind: finalIntent.kind,
          confidence: finalIntent.confidence,
        });
      }
      normalized.mode = 'ask';
      normalized.replyText = normalized.replyText?.trim() ? normalized.replyText : 'Opening...';
      normalized.meta = {
        ...normalized.meta,
        shouldOpenOverlay: true,
        overlayKind: finalIntent.kind,
        intentRoutedAs: 'command',
        intentKind: finalIntent.kind,
      };
      if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
        console.log('[CORTEX][policy] overlay_meta_set', normalized.meta);
      }
      intentHandled = true;
    } else {
      if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
        console.log('[CORTEX][policy] implicit_creation_intent', {
          kind: finalIntent.kind,
          confidence: finalIntent.confidence,
          replyTextProvided: !!normalized.replyText?.trim(),
        });
      }
      const fallbackReplies: Record<string, string> = {
        habit: 'That sounds like a habit worth reinforcing.',
        todo: 'Got it, noted.',
        note: "I'll remember that.",
        reflection: 'Thanks for sharing that.',
        idea: 'Interesting idea!',
      };

      if (!normalized.replyText || !normalized.replyText.trim()) {
        normalized.replyText = fallbackReplies[finalIntent.kind] || 'Understood.';
      }

      normalized.mode = 'ask';
      intentHandled = true;
      normalized.meta = {
        ...normalized.meta,
        intentRoutedAs: finalIntent.kind,
        intentKind: finalIntent.kind,
      };

      if (curiosityEnabled && topicKey && !clarifiedTopics.has(topicKey)) {
        clarifiedTopics.add(topicKey);
      }
    }
  } else if (isCreationIntent && intentCoolingDown) {
    normalized.mode = 'ask';
    if (!normalized.replyText || !normalized.replyText.trim()) {
      normalized.replyText = "Let's keep exploring that together.";
    }
    normalized.meta = {
      ...normalized.meta,
      intentCoolingDown: finalIntent.kind,
      intentKind: finalIntent.kind,
      intentRoutedAs: finalIntent.kind,
    };
  } else if (
    (!normalized.replyText || !normalized.replyText.trim()) &&
    (!normalized.explanation || !normalized.explanation.trim())
  ) {
    if (suppressSmalltalkAck || smalltalkDetected) {
      normalized.mode = 'keep';
      normalized.replyText = undefined;
      normalized.meta = {
        ...normalized.meta,
        suppressedSmalltalk: true,
        lane: 'space_chat',
      };
    } else {
      normalized.mode = 'ask';
      normalized.replyText = "Let's explore that a bit more.";
      normalized.meta = {
        ...normalized.meta,
        lane: 'space_chat',
        intentRoutedAs:
          normalized.meta?.intentRoutedAs && normalized.meta.intentRoutedAs !== 'planning'
            ? normalized.meta.intentRoutedAs
            : isCreationIntent
              ? intent.kind
              : 'exploration',
        fallback: 'exploration',
      };
    }
  }

  // If not handled above, but this turn repeats a recent creation intent,
  // record routing metadata to reflect the detected intent even without chips.
  if (!normalized.meta?.intentRoutedAs && isCreationIntent) {
    const hasRecentSameIntent = recentIntentBuffer.some((e) => e.kind === intent.kind);
    if (hasRecentSameIntent) {
      normalized.meta = {
        ...normalized.meta,
        intentRoutedAs: intent.kind,
        intentKind: intent.kind,
      };
    }
  }

  if (intentHandled && isCreationIntent) {
    recentIntentBuffer.push({ kind: finalIntent.kind, turn: currentTurn });
  }
  ctx.recentIntentBuffer = recentIntentBuffer;

  if (intentHandled && isCreationIntent) {
    nextCooldowns[finalIntent.kind] = cooldownTurns;
  }

  ctx.intentCooldownMap = nextCooldowns;

  const remainingGlobalCooldown = Object.values(nextCooldowns).reduce(
    (max, value) => (typeof value === 'number' ? Math.max(max, value) : max),
    0,
  );
  ctx.intentCooldownTurns = remainingGlobalCooldown;
  ctx.clarifiedTopics = clarifiedTopics;

  if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
    console.log('[CORTEX][intent]', {
      kind: finalIntent.kind,
      confidence: finalIntent.confidence,
      meetsConfidence,
      intentCoolingDown,
      intentHandled,
      awaitingClarification,
      nextCooldowns,
      meta: normalized.meta,
    });
  }

  // Phase 10.7E: Update running summary after response
  if (normalized.replyText && contextWindow && contextWindow.length > 0) {
    const newMessages: ChatTurn[] = [
      ...contextWindow.slice(-2), // Last 2 messages from context
      { role: 'user', text: userText },
      { role: 'assistant', text: normalized.replyText },
    ];
    ctx.runningSummary = await updateRunningSummary(ctx.runningSummary || '', newMessages);

    if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
      console.log('[CORTEX][10.7E] summary_updated:', ctx.runningSummary?.substring(0, 100));
    }
  }

  // Check if we should try direct worker call before suppressing catch-all copy
  const wasCatchAllResponse =
    normalized.explanation && CATCHALL_COPY_RE.test(normalized.explanation);
  const wasExplorationResponse =
    normalized.explanation && EXPLORATION_COPY_RE.test(normalized.explanation);

  if (__DEV__ && wasCatchAllResponse) {
    console.log('[CORTEX] Detected catch-all response:', normalized.explanation?.substring(0, 50));
  }

  // Suppress catch-all and generic exploration copy in chat
  if (typeof normalized.explanation === 'string') {
    if (
      CATCHALL_COPY_RE.test(normalized.explanation) ||
      EXPLORATION_COPY_RE.test(normalized.explanation)
    ) {
      normalized.explanation = '';
    }
  }

  // Step 5.1b: If cortexDecide returned generic response, try direct worker call
  const hasActions = Array.isArray(normalized.actions) && normalized.actions.length > 0;
  const hasSuggestions =
    Array.isArray(normalized.suggestions) &&
    normalized.suggestions.some((suggestion) =>
      typeof suggestion === 'string' ? suggestion.trim().length > 0 : false,
    );
  const hasExplanation =
    typeof normalized.explanation === 'string' && normalized.explanation.trim().length > 0;
  const hasReply =
    typeof normalized.replyText === 'string' && normalized.replyText.trim().length > 0;
  const hasIntentMeta = Boolean(
    normalized.meta?.detectedIntent ||
      normalized.meta?.intentRoutedAs ||
      normalized.meta?.intentKind ||
      normalized.meta?.isAwaitingClarification,
  );
  const isReplyMode = normalized.mode === 'reply';

  const hasNoUsefulContent = !(
    hasActions ||
    hasSuggestions ||
    hasExplanation ||
    hasReply ||
    hasIntentMeta ||
    isReplyMode
  );

  if (__DEV__) {
    console.log('[CORTEX] Content check', {
      wasCatchAllResponse,
      hasNoUsefulContent,
      actionsCount: normalized.actions?.length || 0,
      suggestionsCount: normalized.suggestions?.length || 0,
      hasExplanation: !!normalized.explanation?.trim(),
      hasReplyText: !!normalized.replyText?.trim(),
    });
  }

  const wasGenericResponse = wasCatchAllResponse || wasExplorationResponse;

  // If we got a generic response from cortexDecide and there's no reply text yet,
  // proactively try to get a contextual reply from the worker even if meta is present.
  if (wasGenericResponse && !hasReply) {
    if (__DEV__) {
      console.log('[CORTEX] Generic response detected, trying direct worker call');
    }

    try {
      const fallbackContext: ChatContext = chatContext ?? {
        messages: contextWindow,
        summary: runningSummary,
        windowSize: contextWindow.length,
        summaryLength: runningSummary?.length ?? 0,
        systemPrompt: getPersonaPrompt(),
      };

      const workerResponse = await tryDirectWorkerCall(input, ctx, fallbackContext);
      if (workerResponse.replyText && workerResponse.replyText.trim()) {
        if (__DEV__) {
          console.log('[CORTEX] Using worker response instead of generic response');
        }
        // Preserve meta we have already computed (e.g., detectedIntent)
        const mergedConfidence =
          workerResponse.confidence && workerResponse.confidence > 0
            ? workerResponse.confidence
            : normalized.confidence && normalized.confidence > 0
              ? normalized.confidence
              : intent.confidence && intent.confidence > 0
                ? intent.confidence
                : 0.85;

        return {
          ...workerResponse,
          confidence: mergedConfidence,
          meta: {
            ...(workerResponse as any)?.meta,
            ...normalized.meta,
            responseSource: (workerResponse as any)?.meta?.responseSource ?? 'worker',
            isWorkerFallback: true,
          },
          // Preserve suppressed explanation in chat when replacing generic exploration
          explanation: '',
        } as CortexResponse;
      }
    } catch (workerError) {
      if (__DEV__) {
        console.log(
          '[CORTEX] Direct worker call failed, continuing with original response',
          workerError,
        );
      }
    }
  }

  if (wasGenericResponse && (!normalized.replyText || !normalized.replyText.trim())) {
    normalized.replyText = "Let's explore that a bit more.";
    normalized.mode = 'ask';
    normalized.meta = {
      ...normalized.meta,
      intentRoutedAs:
        normalized.meta?.intentRoutedAs ?? (isCreationIntent ? intent.kind : 'exploration'),
      fallback: 'exploration',
    };
  }

  // Step 5.1a: Greeting detection - handle friendly greetings before generic smalltalk
  const hasGreeting = isGreeting(userText);

  if (hasGreeting) {
    // Use specialized greeting response
    const greetingResponse = respondSmalltalk(userText, {});

    return {
      ...normalized,
      mode: 'ask' as const,
      replyText: greetingResponse,
      actions: [],
      suggestions: [],
      meta: {
        ...normalized?.meta,
        lane: 'space_chat' as const,
        kind: 'greeting' as const,
      },
    };
  }

  // Step 5.1b: Small-talk fallback - only when no actionable content
  const noSuggestions = !normalized?.suggestions || normalized.suggestions.length === 0;
  const noExplanation = !normalized?.explanation || !normalized.explanation.trim();
  const noReplyText = !normalized?.replyText || !normalized.replyText.trim();

  // Suppress smalltalk acknowledgments (either follow-up acks or standalone smalltalk with no content)
  if (
    (suppressSmalltalkAck || smalltalkDetected) &&
    noExplanation &&
    noSuggestions &&
    noReplyText
  ) {
    return {
      ...normalized,
      mode: 'keep' as const,
      replyText: undefined,
      actions: [],
      suggestions: [],
      meta: {
        ...normalized?.meta,
        lane: 'space_chat' as const,
        suppressedSmalltalk: true,
      },
    };
  }

  if (noExplanation && noSuggestions && noReplyText) {
    return {
      ...normalized,
      mode: 'ask' as const,
      replyText: 'Break that down for me?',
      actions: [],
      suggestions: [],
      meta: {
        ...normalized?.meta,
        lane: 'space_chat' as const,
        intentRoutedAs:
          normalized.meta?.intentRoutedAs && normalized.meta.intentRoutedAs !== 'planning'
            ? normalized.meta.intentRoutedAs
            : isCreationIntent
              ? intent.kind
              : 'exploration',
        fallback: 'exploration',
      },
    };
  }

  // Note: meta.detectedIntent has been set pre-emptively above

  // Lightweight telemetry (optional)
  if ((normalized as any).debug && typeof (normalized as any).debug === 'object') {
    (normalized as any).debug.lane = 'space_chat';
  }

  // Ensure arrays are present; do not force mode for space_chat unless explicitly required upstream
  if (!Array.isArray((normalized as any).suggestions)) normalized.suggestions = [];
  if (!Array.isArray((normalized as any).actions)) normalized.actions = [];
  if (ctx?.lane === 'space_chat') {
    // Defensive: never perform actions in chat
    normalized.actions = [];
  }

  // Final guard: if we detected a creation intent but never set routing meta, record it.
  if (!normalized.meta?.intentRoutedAs && isCreationIntent) {
    normalized.meta = {
      ...normalized.meta,
      intentRoutedAs: intent.kind,
      intentKind: intent.kind,
    };
  }

  return normalized;
}
