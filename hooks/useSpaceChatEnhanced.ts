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
import { useGremlyStore } from '../lib/store/useGremlyStore';

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
    /** Optional save_suggestion from Cortex - takes precedence over heuristic */
    saveSuggestion?: any | null,
  ) => SaveableResult | null;

  // Save button state
  /** Currently active save button (the most recently activated) */
  activeButton: SaveButtonState | null;
  /** All message save states (for persisting across scrolls) */
  messageSaveStates: Record<string, SaveButtonState>;
  /** Show save button for a message */
  showSaveButton: (messageId: string, result: SaveableResult) => void;
  /** Dismiss the current save button */
  dismissSaveButton: () => void;
  /** Set status to 'saving' for current active message */
  setSaving: () => void;
  /** Set status to 'saving' for a specific message */
  setMessageSaving: (messageId: string) => void;
  /** Set status to 'saved' with item details (shows confirmation state) */
  setSaved: (savedItemId: string, savedItemType: 'habit' | 'todo' | 'log') => void;
  /** Set status to 'saved' for a specific message */
  setMessageSaved: (
    messageId: string,
    savedItemType: 'habit' | 'todo' | 'log',
    savedItemId: string,
  ) => void;
  /** @deprecated Use setSaving() instead */
  startSaving: () => void;
  /** @deprecated Use setSaved() or dismissSaveButton() instead */
  finishSaving: () => void;
  /** Get button state for a specific message (checks both active and persisted states) */
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
  console.log('[shouldShowSaveButtonHeuristic] Checking:', {
    messageLength: assistantMessage?.length,
    conversationMode,
    threshold: 120,
  });

  // Don't show for emotional support / venting responses
  if (conversationMode === 'reflective') {
    console.log('[shouldShowSaveButtonHeuristic] SKIP: reflective mode');
    return false;
  }

  // Don't show for very short responses (acknowledgments, follow-up questions)
  if (assistantMessage.length < 120) {
    console.log('[shouldShowSaveButtonHeuristic] SKIP: message too short', assistantMessage.length);
    return false;
  }

  console.log('[shouldShowSaveButtonHeuristic] SHOW: passed all checks');
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
  const accountCreatedAt = useGremlyStore((state) => state.accountCreatedAt);

  // Build system prompt from context (includes space context if provided)
  const systemPrompt = useMemo(
    () => buildSpaceChatSystemPrompt(context, spaceName, spaceContext, accountCreatedAt),
    [context, spaceName, spaceContext, accountCreatedAt],
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
   * Uses save_suggestion from Cortex when available, otherwise falls back to client-side heuristic.
   */
  const runSaveableDetection = useCallback(
    (
      assistantMessage: string,
      userMessage: string,
      messageId: string,
      saveSuggestion?: any | null,
    ): SaveableResult | null => {
      console.log('[useSpaceChatEnhanced] runSaveableDetection called', {
        messageId,
        assistantLength: assistantMessage?.length,
        userMessage: userMessage?.slice(0, 50),
        hasSaveSuggestion: saveSuggestion != null,
      });

      // If Cortex returned a save_suggestion, use it directly
      if (saveSuggestion != null) {
        console.log('[useSpaceChatEnhanced] Using Cortex save_suggestion:', saveSuggestion);

        // Map Cortex save_suggestion to SaveableResult
        // Behavior rules:
        // 1) Default to NOTE unless explicitly todo/habit or clearly single todo/habit
        // 2) Multiple todos = NOTE (user can convert later)
        // 3) Only ONE item per save suggestion
        let suggestedType: SaveableResult['suggestedType'] = 'log-general';

        const ssType = saveSuggestion.type?.toLowerCase();
        const ssSubtype = saveSuggestion.subtype?.toLowerCase();

        // Only use todo if it's clearly a SINGLE actionable task
        if (ssType === 'todo' && !saveSuggestion.hasList && !saveSuggestion.has_list) {
          suggestedType = 'todo';
        }
        // Only use habit if it's clearly a repeating behavior
        else if (ssType === 'habit') {
          suggestedType = 'habit';
        }
        // For logs, map subtype
        else if (ssType === 'log' || ssType === 'note') {
          if (ssSubtype === 'idea') {
            suggestedType = 'log-idea';
          } else if (ssSubtype === 'journal') {
            suggestedType = 'log-journal';
          } else {
            suggestedType = 'log-general';
          }
        }

        const result: SaveableResult = {
          isSaveable: true,
          confidence: saveSuggestion.confidence ?? 0.9,
          suggestedType,
          prefill: {
            title: saveSuggestion.title || '',
            content: saveSuggestion.content || assistantMessage,
            tags: saveSuggestion.tags || [],
            frequency: saveSuggestion.frequency || null,
            dueDate: saveSuggestion.dueDate || saveSuggestion.due_date || null,
          },
          detectedAt: new Date().toISOString(),
          messageId,
        };

        console.log('[useSpaceChatEnhanced] Mapped save_suggestion to SaveableResult:', {
          suggestedType: result.suggestedType,
          hasTitle: !!result.prefill.title,
        });

        buttonState.showSaveButton(messageId, result);
        cooldown.markSaveShown();

        return result;
      }

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
    messageSaveStates: buttonState.messageSaveStates,
    showSaveButton: buttonState.showSaveButton,
    dismissSaveButton: buttonState.dismissSaveButton,
    setSaving: buttonState.setSaving,
    setMessageSaving: buttonState.setMessageSaving,
    setSaved: buttonState.setSaved,
    setMessageSaved: buttonState.setMessageSaved,
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
