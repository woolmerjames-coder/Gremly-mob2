// lib/cortex/pipelines/conversation.ts
import { CortexContextBase } from '../lane';
import {
  cortexDecide,
  type DecideInput,
  type CortexContext,
  type CortexResponse,
} from '../cortexDecide';
import { pickSmalltalk, isAcknowledgment } from '../../../app/lib/cortex/smalltalk';
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
} from '../context/memory';

const CATCHALL_COPY_RE = /saving to catch[- ]all/i;

/**
 * Defensive mapper for when worker returns { content: "text", hasChoices: false }
 * Maps to { mode: 'reply', replyText: content, actions: [], suggestions: [] }
 * Phase 10.10 B1: Includes context window + running summary for better continuity
 */
async function tryDirectWorkerCall(
  input: DecideInput,
  ctx: CortexContext,
  contextWindow?: ChatTurn[],
  runningSummary?: string,
): Promise<CortexResponse> {
  try {
    if (!input.text) {
      throw new Error('No text input for direct worker call');
    }

    // B1: Assemble full context: summary + last N turns + current message
    const messages: ChatMessage[] = [];

    // Add running summary as system message if available
    if (runningSummary && runningSummary.trim()) {
      messages.push({
        role: 'system',
        content: `Conversation summary so far:\n${runningSummary}`,
      });
    }

    // Add context window (last N user/assistant turns)
    if (contextWindow && contextWindow.length > 0) {
      for (const turn of contextWindow) {
        messages.push({
          role: turn.role,
          content: turn.text,
        });
      }
    }

    // Add current user message
    messages.push({ role: 'user', content: input.text });

    let response;
    let _lastError;

    // First attempt: Quick response (6s timeout)
    try {
      response = await callChat(messages, {
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 200, // Shorter for quicker response
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

      return {
        actions: [],
        explanation: '', // Keep empty so we don't show legacy text
        replyText: data.content, // Model's text becomes reply
        suggestions: [], // None
        mode: 'reply',
        confidence: 0.8, // Assume good confidence for direct responses
        meta: {
          kind: 'smalltalk', // Mark as reply-type response
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
      mode: 'reply',
      replyText: "I'm here to help. What would you like to talk about?",
      suggestions: [],
      explanation: '', // Empty explanation to avoid catch-all text
      confidence: 0,
      meta: {
        kind: 'smalltalk',
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

  if (ctx.repo && ctx.spaceId) {
    const chatContext = await buildChatContext({
      spaceId: ctx.spaceId,
      repo: ctx.repo,
      maxContext: maxContext,
      runningSummary: ctx.runningSummary || null,
    });

    contextWindow = chatContext.messages;
    runningSummary = chatContext.summary || undefined;
    ctx.runningSummary = runningSummary || null;

    // Logging already done in buildChatContext
  } else {
    // Fallback: Use messages from input if provided (legacy path)
    const allMessages: ChatTurn[] = (input as any).messages || [];
    contextWindow = buildContextWindow(allMessages, maxContext);

    // Initialize or update running summary
    if (!ctx.runningSummary && allMessages.length > 2) {
      ctx.runningSummary = await summarize(allMessages);
    }
    runningSummary = ctx.runningSummary || undefined;

    if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
      console.log('[CORTEX][10.7E] context_built_legacy', {
        windowSize: contextWindow?.length || 0,
        summaryLength: ctx.runningSummary?.length || 0,
      });
    }
  }

  // Phase 10.7C: Check for greeting or smalltalk first
  const userText = input.text?.trim() || '';

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
    raw = await tryDirectWorkerCall(input, ctx, contextWindow, runningSummary);
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

  // Phase 10.7B: Answer-first policy with intent detection
  // Phase 10.7C: Curiosity gating for high-confidence intents
  // Phase 10.7D: Cooldown mechanism with explicit creation bypass
  const intent: DetectedIntent = detectIntent(input.text || '');

  // Always record the locally detected intent in meta for downstream consumers/tests
  normalized.meta = {
    ...normalized.meta,
    detectedIntent: intent,
  };

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

  // Phase 10.7D: Get cooldown settings
  const cooldownTurns = parseInt(process.env.EXPO_PUBLIC_INTENT_COOLDOWN_TURNS || '2', 10);
  let intentCooldown = ctx.intentCooldownTurns || 0;

  // Decrement cooldown each turn
  if (intentCooldown > 0) {
    intentCooldown--;
    if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
      console.log('[CORTEX][10.7D] cooldown_decremented:', intentCooldown);
    }
  }

  // Check for explicit creation intent or affirmation
  const hasExplicitIntent = hasExplicitCreationIntent(userText);
  const isUserAffirming = isAffirmation(userText);
  // Phase 10.10: Also bypass cooldown for explicit command verbs
  const bypassCooldown = hasExplicitIntent || isUserAffirming || intent.isCommand;

  if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
    console.log('[CORTEX][10.7D] intent_check', {
      kind: intent.kind,
      confidence: intent.confidence,
      suppressChips: intent.suppressChips,
      isPlanning: intent.isPlanning,
      isCommand: intent.isCommand,
      cooldown: intentCooldown,
      bypassCooldown,
    });
  }

  const currentTurn = ctx.currentTurn || 0;
  const lastChipTurn = typeof ctx.lastChipTurn === 'number' ? ctx.lastChipTurn : -2; // Default to allow chips
  const recentIntentBuffer = ctx.recentIntentBuffer || [];
  const clarifiedTopics = ctx.clarifiedTopics || new Set<string>();

  // Check if curiosity phase is enabled
  const curiosityEnabled = process.env.EXPO_PUBLIC_CHAT_CURIOSITY_PHASE === 'true';

  // P0 Fix: Raised thresholds to reduce pushy chips
  // Phase 10.10: habit≥0.90, todo≥0.92, note≥0.85, question≥0.70
  const intentThresholds: Record<string, number> = {
    habit: 0.9,
    todo: 0.92,
    note: 0.85,
    question: 0.7,
    reflection: 0.75,
    idea: 0.75,
  };

  // Can show chip if:
  // 1. Meets confidence threshold
  // 2. Not a question
  // 3. Not suppressed (planning mode)
  // 4. Either cooldown is 0 OR user explicitly asked/affirmed
  const threshold = intentThresholds[intent.kind] || 0.8;
  // Cooldown based on turn distance from last shown chip
  const turnsSinceLastChip = lastChipTurn >= 0 ? currentTurn - lastChipTurn : Infinity;
  const cooldownActive = turnsSinceLastChip <= cooldownTurns && !bypassCooldown;
  const shouldShowChip =
    intent.confidence >= threshold &&
    intent.kind !== 'none' &&
    intent.kind !== 'question' &&
    !intent.suppressChips &&
    (!cooldownActive || bypassCooldown);

  // Always record the locally detected intent in meta for downstream consumers/tests
  normalized.meta = {
    ...normalized.meta,
    detectedIntent: intent,
  };

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

  if (intent.confidence >= 0.75 && intent.kind !== 'none') {
    // Phase 10.10: Explicit command handling - immediate action
    // When isCommand=true, bypass all gating and open overlay directly
    if (intent.isCommand && intent.kind !== 'question') {
      // Direct action path - bypass cooldown, reiteration checks, and curiosity
      const suggestionText = `Add as ${intent.kind}`;
      normalized.suggestions = [suggestionText];
      normalized.mode = 'ask';

      // Provide acknowledgment
      normalized.replyText = 'Opening...';

      // Mark for immediate overlay opening
      normalized.meta = {
        ...normalized.meta,
        shouldOpenOverlay: true,
        overlayKind: intent.kind,
      };

      if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
        console.log('[CORTEX][policy] explicit_intent', {
          isCommand: intent.isCommand,
          kind: intent.kind,
          confidence: intent.confidence,
          action: 'open_overlay',
        });
      }

      // Skip the rest of intent handling
      return normalized;
    }

    // Phase 10.7D: Planning mode - provide advice without chips
    if (intent.isPlanning || intent.suppressChips) {
      normalized.replyText =
        normalized.replyText ||
        'I can help you think through that. What aspect would you like to explore?';
      normalized.mode = 'ask';
      normalized.suggestions = [];

      if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
        console.log('[CORTEX][10.7D] planning_mode_advice');
      }

      // Don't update cooldown for planning responses
      // Continue to rest of function
    } else if (intent.kind !== 'question') {
      // Non-question intents follow curiosity/chip logic
      // Phase 10.7C: Curiosity phase - ask before acting
      const topicKey = intent.kind;
      const needsClarification = curiosityEnabled && !clarifiedTopics.has(topicKey);

      if (needsClarification && intent.curiositySuggestion) {
        // First time seeing this intent type - ask clarifying question
        normalized.replyText = intent.curiositySuggestion;
        normalized.suggestions = []; // No chips yet
        normalized.mode = 'ask';
        normalized.meta = {
          ...normalized.meta,
          isAwaitingClarification: true,
          curiosityPrompted: topicKey,
        };

        if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
          console.log('[CORTEX][10.7C] curiosity_prompted:', topicKey);
        }
      } else {
        // Either curiosity disabled, already clarified, or no curiosity suggestion
        // Check if we should show chip
        const intentReiterated =
          recentIntentBuffer.filter((i) => i.kind === intent.kind && currentTurn - i.turn <= 2)
            .length >= 1;

        // Phase 10.7B: Answer-First Policy - chips only for reiterated or explicit intents
        // bypassCooldown = true when user explicitly requests or affirms
        const shouldBypassReiteration = intentReiterated || bypassCooldown;

        if (shouldShowChip && shouldBypassReiteration) {
          // Show chip for reiterated intent or explicit request
          const suggestionText = `Add as ${intent.kind}`;
          normalized.suggestions = [suggestionText]; // Max 1 chip
          normalized.mode = 'ask';

          // Add subtle line to reply
          if (normalized.replyText && normalized.replyText.trim()) {
            normalized.replyText += ' I can save this if you like.';
          } else {
            normalized.replyText = 'I can save this if you like.';
          }

          // Phase 10.7D: Set cooldown markers when chip shown
          ctx.intentCooldownTurns = cooldownTurns;
          ctx.lastChipTurn = currentTurn;

          // Mark that we showed a chip this turn
          normalized.meta = {
            ...normalized.meta,
            showedChip: true,
            cooldownSet: cooldownTurns,
          };

          if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
            console.log('[CORTEX][10.7D] chip_shown_cooldown_set:', cooldownTurns);
          }
        } else {
          // Reply only, no chip
          if (!normalized.replyText || !normalized.replyText.trim()) {
            normalized.replyText =
              intent.kind === 'habit'
                ? 'That sounds like a good habit to build.'
                : intent.kind === 'todo'
                  ? 'Got it, noted.'
                  : intent.kind === 'note'
                    ? "I'll remember that."
                    : intent.kind === 'reflection'
                      ? 'Thanks for sharing that.'
                      : intent.kind === 'idea'
                        ? 'Interesting idea!'
                        : 'Understood.';
          }
          normalized.suggestions = []; // No chips
          normalized.mode = 'ask';

          // Phase 10.7B: Mark that no chip was shown (for test assertions)
          normalized.meta = {
            ...normalized.meta,
            showedChip: false,
          };

          // Phase 10.7D: Update cooldown in context
          ctx.intentCooldownTurns = intentCooldown;
        }
      }
    }

    if (process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
      console.log(`[CORTEX][intent] Detected ${intent.kind} (${intent.confidence.toFixed(2)})`);
      console.log(`[CORTEX][policy] Chip shown: ${!!normalized.meta?.showedChip}`);

      // Phase 10.7C: Log chip suppression reasons
      // Phase 10.7D: Enhanced suppression reasons
      if (intent.confidence >= 0.75 && !normalized.meta?.showedChip) {
        const isAwaitingClarification = normalized.meta?.isAwaitingClarification;
        const hasReplyText = !!normalized.replyText?.trim();
        const hasSuggestions = (normalized.suggestions?.length || 0) > 0;

        let suppressionReason = 'unknown';
        if (intent.isPlanning || intent.suppressChips) {
          suppressionReason = 'planning_mode';
        } else if (isAwaitingClarification) {
          suppressionReason = 'awaiting_clarification';
        } else if (intent.kind === 'question') {
          suppressionReason = 'is_question';
        } else if (intentCooldown > 0 && !bypassCooldown) {
          suppressionReason = `cooldown_active(${intentCooldown})`;
        } else if (!hasReplyText) {
          suppressionReason = 'no_reply_text';
        } else if (!hasSuggestions) {
          suppressionReason = 'not_reiterated';
        }

        console.log('[CORTEX][10.7D] chips_suppressed_reason:', suppressionReason);
      }
    }
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
  const hasNoUsefulContent =
    (!normalized.actions || normalized.actions.length === 0) &&
    (!normalized.suggestions || normalized.suggestions.length === 0) &&
    (!normalized.explanation || !normalized.explanation.trim()) &&
    (!normalized.replyText || !normalized.replyText.trim());

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
      const workerResponse = await tryDirectWorkerCall(input, ctx, contextWindow, runningSummary);
      if (workerResponse.replyText && workerResponse.replyText.trim()) {
        if (__DEV__) {
          console.log('[CORTEX] Using worker response instead of generic response');
        }
        // Preserve meta we have already computed (e.g., detectedIntent)
        return {
          ...workerResponse,
          meta: {
            ...(workerResponse as any)?.meta,
            ...normalized.meta,
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

  if (noExplanation && noSuggestions && noReplyText) {
    // Optional anti-spam: inspect last assistant message from ctx
    const lastWasSmalltalk = ctx?.recentAssistantKind === 'smalltalk';
    const isAck = isAcknowledgment(userText.toLowerCase());

    if (!lastWasSmalltalk && !isAck) {
      return {
        ...normalized,
        mode: 'reply' as const,
        replyText: pickSmalltalk(input?.text),
        actions: [],
        suggestions: [],
        meta: {
          ...normalized?.meta,
          lane: 'space_chat' as const,
          kind: 'smalltalk' as const,
        },
      };
    }
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
