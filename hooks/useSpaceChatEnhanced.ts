/**
 * useSpaceChatEnhanced - Orchestration hook for Space Chat enhancements
 *
 * Combines context management, saveable detection, cooldown tracking,
 * meta-intent handling, and save button state into one unified interface.
 *
 * @example
 * ```tsx
 * function ChatThreadScreen({ chatId, spaceId, spaceName }) {
 *   const {
 *     systemPrompt,
 *     checkForMetaIntent,
 *     handleSaveThisCommand,
 *     runSaveableDetection,
 *     activeButton,
 *     dismissSaveButton,
 *     onTurnComplete,
 *   } = useSpaceChatEnhanced({ chatId, spaceId, spaceName });
 *
 *   const handleSend = async (userMessage) => {
 *     // 1. Check for meta-intents first
 *     const metaIntent = checkForMetaIntent(userMessage, messages);
 *     if (metaIntent.type === 'save_this') {
 *       const result = await handleSaveThisCommand(metaIntent.intent, metaIntent.resolution);
 *       addMessage({ role: 'assistant', content: result.gremlyResponse });
 *       return;
 *     }
 *
 *     // 2. Normal flow - send to AI
 *     const response = await sendToAI(userMessage, { systemPrompt });
 *     addMessage({ role: 'assistant', content: response });
 *
 *     // 3. Run saveable detection
 *     runSaveableDetection(response, userMessage, messageId);
 *
 *     // 4. Update context
 *     await onTurnComplete(userMessage, response);
 *   };
 * }
 * ```
 */

import { useCallback, useMemo } from 'react';
import { useChatContext } from './useChatContext';
import { useSaveableCooldown } from './useSaveableCooldown';
import { useSaveButtonState, SaveButtonState } from './useSaveButtonState';
import {
  useMetaIntentHandler,
  MetaIntentResult,
  SaveThisHandlerResult,
  SummaryHandlerResult,
} from './useMetaIntentHandler';
import { detectConversationMode, ConversationMode } from '../lib/chat/conversationMode';
import { buildSpaceChatSystemPrompt } from '../lib/chat/gremlyPersona';
import { SpaceContext } from '../lib/chat/buildSpaceContext';
import { incrementTurnCount, addKeyTopic, ChatContext } from '../lib/chat/rollingContext';
import { SaveableResult } from '../lib/chat/saveableTypes';
import { ChatMessageForResolution, ThisResolution } from '../lib/chat/thisResolver';
import { SaveThisIntent } from '../lib/chat/metaIntents';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface UseSpaceChatEnhancedProps {
  /** ID of the chat (optional for new chats) */
  chatId?: string;
  /** ID of the space */
  spaceId: string;
  /** Optional name of the space for context */
  spaceName?: string;
  /** Optional rich space context (milestone, meta, summary) */
  spaceContext?: SpaceContext | null;
}

export interface UseSpaceChatEnhancedReturn {
  // Context
  /** Current chat context (running summary + structured data) */
  context: ChatContext;
  /** System prompt built from context + Gremly persona */
  systemPrompt: string;

  // Meta-intent handling
  /** Check if user message is a meta-intent (save this, summary) */
  checkForMetaIntent: (
    userMessage: string,
    messages: ChatMessageForResolution[],
  ) => MetaIntentResult;
  /** Handle "save this" command */
  handleSaveThisCommand: (
    intent: SaveThisIntent,
    resolution: ThisResolution,
  ) => Promise<SaveThisHandlerResult>;
  /** Handle "summary" command */
  handleSummaryCommand: (
    recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
  ) => Promise<SummaryHandlerResult>;

  // Saveable detection (call after assistant responds)
  /** Run saveable detection for an assistant message (sync - uses client-side heuristic) */
  runSaveableDetection: (
    assistantMessage: string,
    userMessage: string,
    messageId: string,
  ) => SaveableResult | null;

  // Save button state
  /** Currently active save button (only one at a time) */
  activeButton: SaveButtonState | null;
  /** Show save button for a message */
  showSaveButton: (messageId: string, result: SaveableResult) => void;
  /** Dismiss the current save button */
  dismissSaveButton: () => void;
  /** Set status to 'saving' (shows loading state) */
  setSaving: () => void;
  /** Set status to 'saved' with item details (shows confirmation state) */
  setSaved: (savedItemId: string, savedItemType: 'habit' | 'todo' | 'log') => void;
  /** @deprecated Use setSaving() instead */
  startSaving: () => void;
  /** @deprecated Use setSaved() or dismissSaveButton() instead */
  finishSaving: () => void;
  /** Get button state for a specific message */
  getButtonStateForMessage: (messageId: string) => SaveButtonState | null;

  // Cooldown
  /** Record that save button was shown */
  markSaveShown: () => void;
  /** Record that user dismissed save button */
  markSaveDismissed: () => void;
  /** Record that user tapped save */
  markSaveTapped: () => void;

  // Context updates (call after each turn)
  /** Update context after conversation turn completes */
  onTurnComplete: (userMessage: string, assistantMessage: string) => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Client-side heuristic to determine if we should show the save button.
 * Replaces the API-based saveable detection with a simple check.
 */
function shouldShowSaveButtonHeuristic(
  assistantMessage: string,
  conversationMode: ConversationMode,
): boolean {
  // Don't show for emotional support / venting responses
  if (conversationMode === 'reflective') return false;

  // Don't show for very short responses (acknowledgments, follow-up questions)
  if (assistantMessage.length < 120) return false;

  // Show for everything else
  return true;
}

/**
 * Extract key topics from conversation messages.
 * Uses simple keyword matching for common topics.
 */
function extractTopicsFromMessages(userMessage: string, assistantMessage: string): string[] {
  const topics: string[] = [];
  const combined = `${userMessage} ${assistantMessage}`.toLowerCase();

  // Simple keyword patterns for common topics
  const topicPatterns: Array<{ pattern: RegExp; topic: string }> = [
    { pattern: /\b(exercise|workout|fitness|gym|running|run)\b/, topic: 'fitness' },
    { pattern: /\b(habit|routine|daily|schedule)\b/, topic: 'habits' },
    { pattern: /\b(focus|productivity|work|task)\b/, topic: 'productivity' },
    { pattern: /\b(sleep|rest|tired|energy)\b/, topic: 'sleep' },
    { pattern: /\b(stress|anxiety|overwhelm|mental)\b/, topic: 'wellbeing' },
    { pattern: /\b(goal|plan|project)\b/, topic: 'planning' },
    { pattern: /\b(meditat|mindful|breathing)\b/, topic: 'mindfulness' },
    { pattern: /\b(read|book|learn)\b/, topic: 'learning' },
    { pattern: /\b(eat|diet|food|meal)\b/, topic: 'nutrition' },
    { pattern: /\b(money|budget|finance|save)\b/, topic: 'finances' },
  ];

  for (const { pattern, topic } of topicPatterns) {
    if (pattern.test(combined) && !topics.includes(topic)) {
      topics.push(topic);
      if (topics.length >= 2) break; // Max 2 topics per turn
    }
  }

  return topics;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook Implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Orchestration hook for Space Chat enhancements.
 *
 * Combines context management, saveable detection, cooldown tracking,
 * meta-intent handling, and save button state into one unified interface.
 */
export function useSpaceChatEnhanced({
  chatId,
  spaceId: _spaceId,
  spaceName,
  spaceContext,
}: UseSpaceChatEnhancedProps): UseSpaceChatEnhancedReturn {
  // Initialize all sub-hooks
  // Pass empty string to useChatContext when chatId is undefined (new chat)
  const { context, updateContext } = useChatContext(chatId ?? '');
  const cooldown = useSaveableCooldown();
  const buttonState = useSaveButtonState();
  const metaIntent = useMetaIntentHandler();

  // Build system prompt from context (includes space context if provided)
  const systemPrompt = useMemo(
    () => buildSpaceChatSystemPrompt(context, spaceName, spaceContext),
    [context, spaceName, spaceContext],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Meta-Intent Handling
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Check if user message is a meta-intent (save this, summary).
   * Call this BEFORE sending to AI.
   */
  const checkForMetaIntent = useCallback(
    (userMessage: string, messages: ChatMessageForResolution[]): MetaIntentResult => {
      return metaIntent.detectMetaIntent(userMessage, messages);
    },
    [metaIntent],
  );

  /**
   * Handle a "save this" command.
   * Returns Gremly's response and shows save button if appropriate.
   */
  const handleSaveThisCommand = useCallback(
    async (intent: SaveThisIntent, resolution: ThisResolution): Promise<SaveThisHandlerResult> => {
      const messageId = `save_${Date.now()}`;
      const result = await metaIntent.handleSaveThis(intent, resolution, messageId);

      if (result.shouldShowSave) {
        buttonState.showSaveButton(messageId, result.saveableResult);
      }

      return result;
    },
    [metaIntent, buttonState],
  );

  /**
   * Handle a "summarize" command.
   * Returns summary text and optionally shows save button.
   */
  const handleSummaryCommand = useCallback(
    async (
      recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
    ): Promise<SummaryHandlerResult> => {
      const messageId = `summary_${Date.now()}`;
      const result = await metaIntent.handleSummary(context, recentMessages, messageId, spaceName);

      if (result.shouldShowSave) {
        buttonState.showSaveButton(messageId, result.saveableResult);
      }

      return result;
    },
    [metaIntent, context, spaceName, buttonState],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Saveable Detection
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Run saveable detection after assistant responds.
   * Uses a simple client-side heuristic instead of an API call.
   */
  const runSaveableDetection = useCallback(
    (assistantMessage: string, userMessage: string, messageId: string): SaveableResult | null => {
      console.log('[useSpaceChatEnhanced] runSaveableDetection called', {
        messageId,
        assistantLength: assistantMessage?.length,
        userMessage: userMessage?.slice(0, 50),
      });

      // Detect conversation mode from user message
      const mode = detectConversationMode(userMessage);
      console.log('[useSpaceChatEnhanced] Conversation mode:', mode);

      // Use simple heuristic to decide if we should show save button
      const shouldShow = shouldShowSaveButtonHeuristic(assistantMessage, mode);

      if (!shouldShow) {
        console.log('[useSpaceChatEnhanced] Heuristic says no save button', {
          messageId,
          mode,
          messageLength: assistantMessage.length,
        });
        return null;
      }

      // Create a minimal SaveableResult for the button
      const result: SaveableResult = {
        isSaveable: true,
        confidence: 1.0,
        suggestedType: 'log-general',
        prefill: {
          title: '',
          content: assistantMessage,
          tags: [],
        },
        detectedAt: new Date().toISOString(),
        messageId,
      };

      console.log('[useSpaceChatEnhanced] Showing save button for', messageId);
      buttonState.showSaveButton(messageId, result);
      cooldown.markSaveShown();

      return result;
    },
    [buttonState, cooldown],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Context Updates
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Update context after each conversation turn completes.
   * Increments turn count and extracts key topics.
   */
  const onTurnComplete = useCallback(
    async (userMessage: string, assistantMessage: string): Promise<void> => {
      // Increment turn count for cooldown tracking
      cooldown.incrementTurn();

      // Update rolling context
      await updateContext((prev) => {
        let next = incrementTurnCount(prev);

        // Extract key topics from the conversation
        const topics = extractTopicsFromMessages(userMessage, assistantMessage);
        for (const topic of topics) {
          next = addKeyTopic(next, topic);
        }

        return next;
      });
    },
    [cooldown, updateContext],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Return
  // ─────────────────────────────────────────────────────────────────────────

  return {
    // Context
    context,
    systemPrompt,

    // Meta-intent handling
    checkForMetaIntent,
    handleSaveThisCommand,
    handleSummaryCommand,

    // Saveable detection
    runSaveableDetection,

    // Save button state
    activeButton: buttonState.activeButton,
    showSaveButton: buttonState.showSaveButton,
    dismissSaveButton: buttonState.dismissSaveButton,
    setSaving: buttonState.setSaving,
    setSaved: buttonState.setSaved,
    startSaving: buttonState.startSaving,
    finishSaving: buttonState.finishSaving,
    getButtonStateForMessage: buttonState.getButtonStateForMessage,

    // Cooldown
    markSaveShown: cooldown.markSaveShown,
    markSaveDismissed: cooldown.markSaveDismissed,
    markSaveTapped: cooldown.markSaveTapped,

    // Context updates
    onTurnComplete,
  };
}

export default useSpaceChatEnhanced;
