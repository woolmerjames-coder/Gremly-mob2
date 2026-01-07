/**
 * Meta-Intent Handler Hook for Space Chat
 *
 * Orchestrates handling of explicit user commands like "save this" and
 * "summarize this chat". These meta-intents take priority over regular
 * conversation flow.
 *
 * @example
 * ```tsx
 * function ChatScreen() {
 *   const { detectMetaIntent, handleSaveThis, handleSummary } = useMetaIntentHandler();
 *   const { context } = useChatContext(chatId);
 *
 *   const handleUserMessage = async (userMessage: string) => {
 *     // 1. Check for meta-intents first
 *     const metaIntent = detectMetaIntent(userMessage, messages);
 *
 *     if (metaIntent.type === 'save_this') {
 *       // Handle "save this" command
 *       const result = await handleSaveThis(
 *         metaIntent.intent,
 *         metaIntent.resolution,
 *         generateMessageId()
 *       );
 *
 *       // Add Gremly's response to chat
 *       addMessage({ role: 'assistant', content: result.gremlyResponse });
 *
 *       // Show save button with prefilled data
 *       if (result.shouldShowSave) {
 *         showSaveOverlay(result.saveableResult.prefill);
 *       }
 *       return;
 *     }
 *
 *     if (metaIntent.type === 'summary') {
 *       // Handle "summarize" command
 *       const result = await handleSummary(
 *         context,
 *         messages,
 *         generateMessageId(),
 *         spaceName
 *       );
 *
 *       // Add summary as Gremly's response
 *       addMessage({ role: 'assistant', content: result.gremlyResponse });
 *
 *       // Offer to save the summary
 *       if (result.shouldShowSave) {
 *         showSaveOverlay(result.saveableResult.prefill);
 *       }
 *       return;
 *     }
 *
 *     // 2. No meta-intent, continue with regular conversation
 *     await handleRegularMessage(userMessage);
 *   };
 * }
 * ```
 */

import { useCallback } from 'react';
import {
  detectSaveThisIntent,
  detectSummaryIntent,
  SaveThisIntent,
  explicitTypeToSaveableType,
} from '../lib/chat/metaIntents';
import {
  resolveThisReference,
  ThisResolution,
  ChatMessageForResolution,
} from '../lib/chat/thisResolver';
import { generateChatSummary, SummaryResult } from '../lib/chat/summaryGenerator';
import { detectSaveable } from '../lib/chat/saveableDetector';
import {
  SaveableResult,
  SaveableType,
  EXPLICIT_SAVE_THRESHOLDS,
  createNotSaveableResult,
} from '../lib/chat/saveableTypes';
import { ChatContext } from '../lib/chat/rollingContext';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of detecting a meta-intent in user message.
 */
export type MetaIntentResult =
  | { type: 'none' }
  | { type: 'save_this'; intent: SaveThisIntent; resolution: ThisResolution }
  | { type: 'summary' };

/**
 * Result of handling a "save this" command.
 */
export interface SaveThisHandlerResult {
  /** What Gremly says back to the user */
  gremlyResponse: string;

  /** Saveable detection result for the Save button */
  saveableResult: SaveableResult;

  /** Whether to show the Save button */
  shouldShowSave: boolean;
}

/**
 * Result of handling a "summarize" command.
 */
export interface SummaryHandlerResult {
  /** The summary text Gremly shows */
  gremlyResponse: string;

  /** Saveable result for saving the summary */
  saveableResult: SaveableResult;

  /** Whether to show the Save button */
  shouldShowSave: boolean;
}

/**
 * Return type for the useMetaIntentHandler hook.
 */
export interface UseMetaIntentHandlerReturn {
  /**
   * Detect if user message is a meta-intent (save this, summary).
   */
  detectMetaIntent: (userMessage: string, messages: ChatMessageForResolution[]) => MetaIntentResult;

  /**
   * Handle a "save this" command.
   */
  handleSaveThis: (
    intent: SaveThisIntent,
    resolution: ThisResolution,
    messageId: string,
  ) => Promise<SaveThisHandlerResult>;

  /**
   * Handle a "summarize" command.
   */
  handleSummary: (
    context: ChatContext,
    recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
    messageId: string,
    spaceName?: string,
  ) => Promise<SummaryHandlerResult>;
}

// ============================================================================
// Logging
// ============================================================================

const log = (...args: any[]) => {
  if (__DEV__) {
    console.log('[useMetaIntentHandler]', ...args);
  }
};

// ============================================================================
// Response Templates
// ============================================================================

/**
 * Generate Gremly's response for a save action.
 */
function generateSaveResponse(
  type: SaveableType,
  isExplicit: boolean,
  source: ThisResolution['source'],
): string {
  const typeLabel = getTypeLabel(type);

  if (isExplicit) {
    // User explicitly asked for this type
    return `Creating that as a ${typeLabel}. You can edit the details before saving.`;
  }

  // Auto-detected type
  switch (source) {
    case 'inline':
      return `Got it — I'll save that as a ${typeLabel}. You can edit before saving.`;
    case 'assistant_plan':
      return `Saving my suggestion as a ${typeLabel}. Feel free to edit the details!`;
    case 'user_previous':
      return `Saving what you mentioned as a ${typeLabel}. You can tweak it before saving.`;
    case 'conversation_segment':
      return `I'll save that as a ${typeLabel}. Let me know if you want to change anything.`;
    default:
      return `Got it — I'll save that as a ${typeLabel}.`;
  }
}

/**
 * Get human-readable label for a saveable type.
 */
function getTypeLabel(type: SaveableType): string {
  switch (type) {
    case 'todo':
      return 'task';
    case 'habit':
      return 'habit';
    case 'log-general':
      return 'note';
    case 'log-idea':
      return 'idea';
    case 'log-journal':
      return 'journal';
    default:
      return 'note';
  }
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for handling meta-intents like "save this" and "summarize".
 *
 * Meta-intents are explicit user commands that should be handled before
 * regular conversation flow. This hook provides detection and handling
 * for these special commands.
 *
 * @returns Object with detectMetaIntent, handleSaveThis, handleSummary
 */
export function useMetaIntentHandler(): UseMetaIntentHandlerReturn {
  /**
   * Detect if user message is a meta-intent.
   */
  const detectMetaIntent = useCallback(
    (userMessage: string, messages: ChatMessageForResolution[]): MetaIntentResult => {
      log('DETECT', userMessage.slice(0, 50));

      // Priority 1: Check for save intent
      const saveIntent = detectSaveThisIntent(userMessage);
      if (saveIntent) {
        log('SAVE_INTENT_DETECTED', saveIntent);

        // Resolve what "this" refers to
        const resolution = resolveThisReference(messages, userMessage);
        log('THIS_RESOLVED', {
          source: resolution.source,
          confidence: resolution.confidence,
          contentLength: resolution.content.length,
        });

        return {
          type: 'save_this',
          intent: saveIntent,
          resolution,
        };
      }

      // Priority 2: Check for summary intent
      if (detectSummaryIntent(userMessage)) {
        log('SUMMARY_INTENT_DETECTED');
        return { type: 'summary' };
      }

      // No meta-intent
      return { type: 'none' };
    },
    [],
  );

  /**
   * Handle a "save this" command.
   */
  const handleSaveThis = useCallback(
    async (
      intent: SaveThisIntent,
      resolution: ThisResolution,
      messageId: string,
    ): Promise<SaveThisHandlerResult> => {
      log('HANDLE_SAVE_THIS', {
        explicitType: intent.explicitType,
        source: resolution.source,
      });

      // If resolution has no content, return error response
      if (!resolution.content || resolution.content.trim().length === 0) {
        return {
          gremlyResponse:
            "I'm not sure what you want to save. Could you tell me more specifically?",
          saveableResult: createNotSaveableResult(messageId),
          shouldShowSave: false,
        };
      }

      let saveableResult: SaveableResult;
      let suggestedType: SaveableType;

      // If user explicitly requested a type, use it
      if (intent.explicitType !== 'auto') {
        const explicitSaveableType = explicitTypeToSaveableType(intent.explicitType);
        suggestedType = explicitSaveableType || 'log-general';

        // Create result directly without AI detection (user specified type)
        saveableResult = {
          isSaveable: true,
          confidence: 0.9, // High confidence since user specified
          suggestedType,
          prefill: {
            title: extractTitle(resolution.content),
            content: resolution.content,
            tags: [],
          },
          detectedAt: new Date().toISOString(),
          messageId,
        };
      } else {
        // Run AI detection with relaxed thresholds
        try {
          saveableResult = await detectSaveable({
            assistantMessage: resolution.content,
            userMessage: intent.rawMatch,
          });

          // Apply explicit save thresholds (more relaxed)
          if (saveableResult.confidence >= EXPLICIT_SAVE_THRESHOLDS.FLOOR) {
            saveableResult = {
              ...saveableResult,
              isSaveable: true,
            };

            // Apply type-specific thresholds
            if (
              saveableResult.suggestedType === 'todo' &&
              saveableResult.confidence < EXPLICIT_SAVE_THRESHOLDS.TODO
            ) {
              saveableResult = {
                ...saveableResult,
                suggestedType: 'log-general',
              };
            }
            if (
              saveableResult.suggestedType === 'habit' &&
              saveableResult.confidence < EXPLICIT_SAVE_THRESHOLDS.HABIT
            ) {
              saveableResult = {
                ...saveableResult,
                suggestedType: 'log-general',
              };
            }
          }
        } catch (error) {
          log('DETECTION_ERROR', error);
          // Fallback: create basic result
          saveableResult = {
            isSaveable: true,
            confidence: 0.6,
            suggestedType: 'log-general',
            prefill: {
              title: extractTitle(resolution.content),
              content: resolution.content,
              tags: [],
            },
            detectedAt: new Date().toISOString(),
            messageId,
          };
        }

        suggestedType = saveableResult.suggestedType;
      }

      // Ensure prefill content is populated
      if (!saveableResult.prefill.content) {
        saveableResult = {
          ...saveableResult,
          prefill: {
            ...saveableResult.prefill,
            content: resolution.content,
          },
        };
      }

      // Generate Gremly's response
      const gremlyResponse = generateSaveResponse(
        suggestedType,
        intent.explicitType !== 'auto',
        resolution.source,
      );

      return {
        gremlyResponse,
        saveableResult: {
          ...saveableResult,
          isSaveable: true, // Always saveable for explicit save requests
        },
        shouldShowSave: true,
      };
    },
    [],
  );

  /**
   * Handle a "summarize" command.
   */
  const handleSummary = useCallback(
    async (
      context: ChatContext,
      recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
      messageId: string,
      spaceName?: string,
    ): Promise<SummaryHandlerResult> => {
      log('HANDLE_SUMMARY', {
        messageCount: recentMessages.length,
        hasContext: !!context.runningSummary,
      });

      // Generate the summary
      const summaryResult = await generateChatSummary(context, recentMessages, spaceName);

      // Build Gremly's response
      let gremlyResponse: string;
      if (summaryResult.success && summaryResult.summary) {
        gremlyResponse = `Here's a summary of our conversation:\n\n${summaryResult.summary}`;
      } else {
        gremlyResponse =
          "I tried to summarize our chat, but there wasn't much to work with yet. Let's keep talking!";
        return {
          gremlyResponse,
          saveableResult: createNotSaveableResult(messageId),
          shouldShowSave: false,
        };
      }

      // Build saveable result for the summary
      const saveableResult: SaveableResult = {
        isSaveable: true,
        confidence: 0.9,
        suggestedType: 'log-general',
        prefill: {
          title: summaryResult.title || 'Chat Summary',
          content: summaryResult.summary,
          tags: summaryResult.tags,
        },
        reasoning: 'User requested conversation summary',
        detectedAt: new Date().toISOString(),
        messageId,
      };

      return {
        gremlyResponse,
        saveableResult,
        shouldShowSave: true,
      };
    },
    [],
  );

  return {
    detectMetaIntent,
    handleSaveThis,
    handleSummary,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract a short title from content.
 *
 * @param content - Content to extract title from
 * @returns Short title (max 50 chars)
 */
function extractTitle(content: string): string {
  if (!content) return 'Saved from chat';

  // Get first line or sentence
  const firstLine = content.split('\n')[0];
  const firstSentence = firstLine.match(/^[^.!?]+[.!?]?/)?.[0] || firstLine;

  // Clean and truncate
  let title = firstSentence.trim();
  if (title.length > 50) {
    title = title.slice(0, 47) + '...';
  }

  return title || 'Saved from chat';
}

export default useMetaIntentHandler;
