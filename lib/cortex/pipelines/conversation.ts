// lib/cortex/pipelines/conversation.ts
import { CortexContextBase } from '../lane';
import {
  cortexDecide,
  type DecideInput,
  type CortexContext,
  type CortexResponse,
} from '../cortexDecide';
import { pickSmalltalk, isAcknowledgment } from '../../../app/lib/cortex/smalltalk';
import { callChat, type ChatMessage } from '../CortexClient';
import { detectIntent } from '../intents/detectIntent';
import type { DetectedIntent } from '../intents/types';

const CATCHALL_COPY_RE = /saving to catch[- ]all/i;

/**
 * Defensive mapper for when worker returns { content: "text", hasChoices: false }
 * Maps to { mode: 'reply', replyText: content, actions: [], suggestions: [] }
 */
async function tryDirectWorkerCall(
  input: DecideInput,
  ctx: CortexContext,
): Promise<CortexResponse> {
  try {
    if (!input.text) {
      throw new Error('No text input for direct worker call');
    }

    // Make direct chat call to worker with retry strategy
    const messages: ChatMessage[] = [{ role: 'user', content: input.text }];

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

    // Return safe fallback
    return {
      actions: [],
      mode: 'keep',
      explanation: 'Saving to Catch-All for now.',
      confidence: 0,
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
 */
export async function runConversationPipeline(input: DecideInput, ctx: CortexContext) {
  if (__DEV__) {
    console.log('[CORTEX] Space Chat pipeline started', {
      inputText: input.text?.substring(0, 50) + (input.text && input.text.length > 50 ? '...' : ''),
      userId: ctx.userId,
      spaceId: ctx.spaceId,
      recentAssistantKind: ctx.recentAssistantKind,
    });
  }

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

    // Defensive mapper: try direct worker call for Space Chat
    raw = await tryDirectWorkerCall(input, ctx);
  }

  // Normalize for Space Chat UX
  const normalized = { ...raw };

  // Never auto-sort in chat
  if (normalized.mode === 'auto') {
    normalized.mode = 'ask';
  }
  // No auto actions in chat
  if (Array.isArray(normalized.actions) && normalized.actions.length > 0) {
    normalized.actions = [];
  }

  // Phase 10.7B: Answer-first policy with intent detection
  const intent: DetectedIntent = detectIntent(input.text || '');
  const currentTurn = ctx.currentTurn || 0;
  const lastChipTurn = ctx.lastChipTurn || -2; // Default to allow chips
  const recentIntentBuffer = ctx.recentIntentBuffer || [];

  // Priority: question > reflection > note > todo > habit > idea
  const shouldShowChip =
    intent.confidence >= 0.8 &&
    intent.kind !== 'none' &&
    intent.kind !== 'question' && // Questions never get chips
    currentTurn - lastChipTurn >= 2; // Cooldown: 2 turns between chips

  if (intent.confidence >= 0.75 && intent.kind !== 'none') {
    normalized.meta = {
      ...normalized.meta,
      detectedIntent: intent,
    };

    // Questions: reply only, no chips
    if (intent.kind === 'question') {
      if (!normalized.replyText || !normalized.replyText.trim()) {
        normalized.replyText = 'Let me think about that...';
      }
      normalized.mode = 'ask';
      normalized.suggestions = []; // Clear any suggestions
    } else {
      // Non-questions: check if we should show chip
      const intentReiterated =
        recentIntentBuffer.filter((i) => i.kind === intent.kind && currentTurn - i.turn <= 2)
          .length >= 1;

      if (shouldShowChip && intentReiterated) {
        // Show chip for reiterated intent
        const suggestionText = `Add as ${intent.kind}`;
        normalized.suggestions = [suggestionText]; // Max 1 chip
        normalized.mode = 'ask';

        // Add subtle line to reply
        if (normalized.replyText && normalized.replyText.trim()) {
          normalized.replyText += ' I can save this if you like.';
        } else {
          normalized.replyText = 'I can save this if you like.';
        }

        // Mark that we showed a chip this turn
        normalized.meta = {
          ...normalized.meta,
          showedChip: true,
        };
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
      }
    }

    if (process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
      console.log(`[CORTEX][intent] Detected ${intent.kind} (${intent.confidence.toFixed(2)})`);
      console.log(`[CORTEX][policy] Chip shown: ${!!normalized.meta?.showedChip}`);
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
      const workerResponse = await tryDirectWorkerCall(input, ctx);
      if (workerResponse.replyText && workerResponse.replyText.trim()) {
        if (__DEV__) {
          console.log('[CORTEX] Using worker response instead of generic response');
        }
        return workerResponse;
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

  // Step 5.1b: Small-talk fallback - only when no actionable content
  const noSuggestions = !normalized?.suggestions || normalized.suggestions.length === 0;
  const noExplanation = !normalized?.explanation || !normalized.explanation.trim();
  const noReplyText = !normalized?.replyText || !normalized.replyText.trim();

  if (noExplanation && noSuggestions && noReplyText) {
    // Optional anti-spam: inspect last assistant message from ctx
    const lastWasSmalltalk = ctx?.recentAssistantKind === 'smalltalk';
    const userText = (input?.text ?? '').trim().toLowerCase();
    const isAck = isAcknowledgment(userText);

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

  // Lightweight telemetry (optional)
  if ((normalized as any).debug && typeof (normalized as any).debug === 'object') {
    (normalized as any).debug.lane = 'space_chat';
  }

  return normalized;
}
