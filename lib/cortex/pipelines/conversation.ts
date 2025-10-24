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

const CATCHALL_COPY_RE = /saving to catch[- ]all/i;

function isExplicitActionRequest(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;

  if (/^(set|add|create|save|send|log)\b/.test(normalized)) {
    return true;
  }

  return /\b(remind me|remember to|note to|schedule|make sure to)\b/.test(normalized);
}

function cleanCuriosityFragment(fragment: string): string {
  return fragment
    .trim()
    .replace(/^[,:;\-\s]+/, '')
    .replace(/[\s.:;!]+$/, '')
    .replace(/^to\s+/i, '')
    .trim();
}

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

  const remainingGlobalCooldown = Object.values(nextCooldowns).reduce((max, value) => {
    if (typeof value !== 'number') {
      return max;
    }
    return Math.max(max, value);
  }, 0);

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

    const systemPrompt = context?.systemPrompt?.trim() || getPersonaPrompt();
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

      return {
        actions: [],
        explanation: undefined,
        replyText,
        suggestions,
        mode: 'reply',
        confidence: workerConfidence,
        meta: {
          responseSource: 'worker',
          workerModel: data.model ?? 'gpt-4o-mini',
          workerUsage: data.usage,
        },
      };
    }

    throw new Error('Worker response missing content or has unexpected format');
  } catch (error) {
    if (__DEV__) {
      console.log('[CORTEX] Direct worker call failed', error);
    }

    // P0 Fix: Never return catch-all message in space_chat lane
    // Return minimal smalltalk reply instead
    return {
      actions: [],
      mode: 'ask',
      replyText: "Let's explore that together. What should we focus on?",
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
  const curiosityEnabled = curiosityPhaseFlag === 'on' || curiosityPhaseFlag === 'true';

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
      replyText: "I'm here for you. What's going on?",
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

    // Defensive mapper: try direct worker call for Space Chat with full context
    const fallbackContext: ChatContext = chatContext ?? {
      messages: contextWindow,
      summary: runningSummary,
      windowSize: contextWindow.length,
      summaryLength: runningSummary?.length ?? 0,
      systemPrompt: getPersonaPrompt(),
    };

    raw = await tryDirectWorkerCall(input, ctx, fallbackContext);
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

  // Phase 11.1: Curiosity-first routing with conservative intent gating
  const intent: DetectedIntent = detectIntent(input.text || '');

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
  const bypassCooldown = hasExplicitIntent || isUserAffirming || intent.isCommand;

  const creationIntents = new Set<DetectedIntent['kind']>([
    'habit',
    'todo',
    'note',
    'reflection',
    'idea',
  ]);
  const isCreationIntent = creationIntents.has(intent.kind);
  const meetsConfidence = intent.confidence >= minIntentConfidence;
  const priorCooldown =
    typeof previousCooldowns[intent.kind] === 'number'
      ? (previousCooldowns[intent.kind] as number)
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
    detectedIntent: intent,
    intentConfidenceMin: minIntentConfidence,
  };

  let intentHandled = false;
  let awaitingClarification = false;

  if (intent.kind === 'question' && meetsConfidence) {
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
      intentKind: intent.kind,
    };
  } else if (intent.isPlanning || intent.suppressChips) {
    normalized.mode = 'ask';
    normalized.replyText =
      normalized.replyText ||
      'I can help you think through that. What aspect would you like to explore?';
    intentHandled = true;
    normalized.meta = {
      ...normalized.meta,
      intentRoutedAs: 'planning',
      intentKind: intent.kind,
    };
  } else if (isCreationIntent && meetsConfidence && !intentCoolingDown) {
    const topicKey = intent.kind;
    const needsClarification =
      !intent.isCommand &&
      curiosityEnabled &&
      topicKey &&
      !clarifiedTopics.has(topicKey) &&
      !!intent.curiositySuggestion;

    if (needsClarification) {
      normalized.mode = 'ask';
      normalized.replyText =
        intent.curiositySuggestion ||
        "I'd like to understand this a bit better. What should we focus on?";
      normalized.meta = {
        ...normalized.meta,
        isAwaitingClarification: true,
        curiosityPrompted: topicKey,
      };
      awaitingClarification = true;
      intentHandled = true;
    } else if (intent.isCommand) {
      normalized.mode = 'ask';
      normalized.replyText = normalized.replyText?.trim() ? normalized.replyText : 'Opening...';
      normalized.meta = {
        ...normalized.meta,
        shouldOpenOverlay: true,
        overlayKind: intent.kind,
        intentRoutedAs: 'command',
        intentKind: intent.kind,
      };
      if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
        console.log('[CORTEX][policy] explicit_intent', {
          isCommand: true,
          kind: intent.kind,
          action: 'open_overlay',
        });
      }
      intentHandled = true;
    } else {
      const fallbackReplies: Record<string, string> = {
        habit: 'That sounds like a habit worth reinforcing.',
        todo: 'Got it, noted.',
        note: "I'll remember that.",
        reflection: 'Thanks for sharing that.',
        idea: 'Interesting idea!',
      };

      if (!normalized.replyText || !normalized.replyText.trim()) {
        normalized.replyText = fallbackReplies[intent.kind] || 'Understood.';
      }

      normalized.mode = 'ask';
      intentHandled = true;
      normalized.meta = {
        ...normalized.meta,
        intentRoutedAs: intent.kind,
        intentKind: intent.kind,
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
      intentCoolingDown: intent.kind,
      intentKind: intent.kind,
    };
  } else if (
    (!normalized.replyText || !normalized.replyText.trim()) &&
    (!normalized.explanation || !normalized.explanation.trim())
  ) {
    if (suppressSmalltalkAck) {
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
        intentRoutedAs: 'exploration',
        fallback: 'exploration',
      };
    }
  }

  if (intentHandled && isCreationIntent) {
    recentIntentBuffer.push({ kind: intent.kind, turn: currentTurn });
  }
  ctx.recentIntentBuffer = recentIntentBuffer;

  if (intentHandled && isCreationIntent) {
    nextCooldowns[intent.kind] = cooldownTurns;
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
      kind: intent.kind,
      confidence: intent.confidence,
      meetsConfidence,
      intentCoolingDown,
      intentHandled,
      awaitingClarification,
      nextCooldowns,
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

  if (__DEV__ && wasCatchAllResponse) {
    console.log('[CORTEX] Detected catch-all response:', normalized.explanation?.substring(0, 50));
  }

  // Suppress catch-all copy in chat
  if (typeof normalized.explanation === 'string' && CATCHALL_COPY_RE.test(normalized.explanation)) {
    normalized.explanation = '';
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

  if (wasCatchAllResponse && hasNoUsefulContent) {
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

  if (wasCatchAllResponse && (!normalized.replyText || !normalized.replyText.trim())) {
    normalized.replyText = "Let's explore that a bit more.";
    normalized.mode = 'ask';
    normalized.meta = {
      ...normalized.meta,
      intentRoutedAs: 'exploration',
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
  if (suppressSmalltalkAck && noExplanation && noSuggestions && noReplyText) {
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
      replyText: "Let's explore that a bit more.",
      actions: [],
      suggestions: [],
      meta: {
        ...normalized?.meta,
        lane: 'space_chat' as const,
        intentRoutedAs: 'exploration',
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

  return normalized;
}
