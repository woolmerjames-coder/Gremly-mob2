/**
 * ChatThreadScreen - Phase 10.5 Space Chats v1
 * Phase 10.7D: Added debounce, spaceId validation, note prefill fixes
 * Phase 11.3: Inline action confirmations instead of overlay toast
 * Phase 11.5: Multi-intent detection and disambiguation
 * Phase 11.6: Entry cards for created/retrieved entries
 * Phase 11.7: Calm Action Bar v1.1 with centered + button
 * Now integrated with message persistence + new UI components
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
  TouchableOpacity,
  Pressable,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ChevronLeft } from 'lucide-react-native';
import { BRAND } from '../../design/brand';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { SupabaseSpaceChatRepo } from '../../lib/repo/supabase';
import { MemorySpaceChatRepo } from '../../lib/repo/memory';
import type { SpaceChat, SpaceChatMessage } from '../../lib/types';
import { lightTokens } from '../../design/tokens';
import { useAuth } from '../../providers/AuthProvider';
import { callSpaceChat } from '../../lib/cortex/CortexClient';
import { checkQuickResponse, getQuickResponseText } from '../../lib/chat/quickResponses';
import { perfMonitor } from '../../lib/chat/performanceMonitor';
import { getEnv } from '../../lib/env';
import { Placeholder } from '../../components/common/Placeholder';
import { useChatMessages } from '../../hooks/useChatMessages';
import { ChatBubble } from '../../components/chat/ChatBubble';
import { ChatComposer } from '../../components/chat/ChatComposer';
import { EntryCard } from '../../components/chat/EntryCard';
import { SavedItemCard } from '../../src/components/chat/SavedItemCard';
// Removed PersistentActionBar and ChatActionBar to reduce clutter per UX polish
import { ChatThinkingIndicator } from '../../src/components/ChatThinkingIndicator';

// Phase 10.6: New mascot system
import { MascotProvider } from '../features/mascot/useMascot';
import { Mascot } from '../features/mascot/Mascot';
import { emitChatEvent } from '../lib/chat/events';

// Legacy mascot imports (to be removed)
import { useMascotController } from '../../hooks/useMascotController';
import { shouldShowMascot, shouldUseHaptics } from '../../config/featureFlags';
import { openUnifiedFromChat, saveableTypeToOverlayKind } from './chat/openUnifiedFromChat';
import type { OverlayKind } from './chat/openUnifiedFromChat';
import { smartTitle } from './chat/prefillUtils';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import { useActionToast, type ActionToastInput } from '../../src/hooks/useActionToast';

// Space Chat enhanced context imports
import { useSpaceChatEnhanced } from '../../hooks/useSpaceChatEnhanced';
import { type ChatMessageForResolution } from '../../lib/chat/thisResolver';
// MessageWithSave import removed - saveable card now rendered inline in ChatBubble
import { eventBus } from '../../lib/events/EventBus';
import { addOverlaySavedListener, type OverlaySavedPayload } from '../../lib/events/overlaySaved';
import { buildSpaceContext, type SpaceContext } from '../../lib/chat/buildSpaceContext';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import {
  useSpaceTodosFromStore,
  useSpaceHabitsFromStore,
  useSpaceNotesFromStore,
  useSpaceMilestoneFromStore,
  useMilestoneCountdown,
  useSpaceById,
  selectItemById,
} from '../../lib/store/selectors';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatThread'>;

export default function ChatThreadScreen({ route }: Props) {
  // Navigation
  const navigation = useNavigation();

  // Safe area insets for bottom padding
  const insets = useSafeAreaInsets();

  // Scroll ref for auto-scrolling to the latest message
  const flatListRef = useRef<FlatList>(null);

  const { spaceId, chatId } = route.params;
  const auth = useAuth();
  const { userId } = auth;
  const getItemById = useCallback(
    (id: string) => selectItemById(useGremlyStore.getState(), id),
    [],
  );

  const [chat, setChat] = useState<SpaceChat | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [spaceName, setSpaceName] = useState<string | null>(null);

  // Enable LayoutAnimation on Android
  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  // Fetch space data from Zustand store
  const space = useSpaceById(spaceId);
  const todos = useSpaceTodosFromStore(spaceId);
  const habits = useSpaceHabitsFromStore(spaceId);
  const notes = useSpaceNotesFromStore(spaceId);
  const milestone = useSpaceMilestoneFromStore(spaceId);
  const countdown = useMilestoneCountdown(spaceId);

  // Build space context for AI
  const spaceContext = useMemo(() => {
    if (!space) return undefined;

    // Map milestone to expected format (name falls back to title for legacy)
    const milestoneName = milestone?.name || milestone?.title;
    const milestoneData =
      milestoneName && milestone?.date
        ? {
            name: milestoneName,
            target_date: milestone.date,
            status: 'active',
          }
        : null;

    // Map meta fields from milestone (success_criteria -> why, other_context -> notes)
    const metaData = milestone
      ? {
          why: (milestone as any).success_criteria || undefined,
          notes: (milestone as any).other_context || undefined,
        }
      : null;

    // Map countdown (handle null days)
    const countdownData =
      countdown && countdown.days !== null
        ? {
            days: countdown.days,
            isPast: countdown.isPast,
          }
        : null;

    return (
      buildSpaceContext({
        space,
        milestone: milestoneData,
        meta: metaData,
        countdown: countdownData,
        todos: todos.map((t) => ({ completed_at: t.completed_at ?? null })),
        habits,
        notes,
      }) ?? undefined
    );
  }, [space, todos, habits, notes, milestone, countdown]);

  // Debug: Log space context for AI
  useEffect(() => {
    if (__DEV__ && spaceContext) {
      console.log('[ChatThread] Space context for AI:', {
        spaceName: spaceContext.spaceName,
        hasMilestone: !!spaceContext.milestone,
        milestoneName: spaceContext.milestone?.name,
        daysRemaining: spaceContext.milestone?.daysRemaining,
        hasWhy: !!spaceContext.meta?.why,
        summary: spaceContext.summary,
      });
    }
  }, [spaceContext]);

  // Phase 10.7D: Debounce timer ref
  const sendDebounceTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Mascot controller for Phase 10.6
  const mascot = useMascotController();

  // Overlay controller for conversion
  const overlayController = useUnifiedOverlayController();

  // Track which message has the active saveable being saved
  // Use BOTH state and ref - ref survives closure staleness, state triggers re-renders
  const [activeMessageWithSaveable, setActiveMessageWithSaveable] = useState<string | null>(null);
  const activeMessageWithSaveableRef = useRef<string | null>(null);

  const actionToastOffset = React.useMemo(
    () => Platform.select({ ios: 128, android: 112, default: 112 }) ?? 112,
    [],
  );
  const {
    showToast: showActionToast,
    hideToast: hideActionToast,
    isVisible: isActionToastVisible,
    Toast: ActionToast,
  } = useActionToast({ bottomOffset: actionToastOffset });

  // Use new chat messages hook - chatId may be undefined for new chats
  const {
    messages,
    loading: messagesLoading,
    error: messagesError,
    currentChatId,
    sendUserMessage,
    appendAssistantMessage,
    appendActionConfirmation,
    appendEntryCard,
    removeMessage,
    updateMessage,
  } = useChatMessages(chatId, spaceId);

  // Helper function to convert messages for resolution
  const getMessagesForResolution = useCallback((): ChatMessageForResolution[] => {
    return messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
      timestamp: m.created_at ? new Date(m.created_at).getTime() : Date.now(),
    }));
  }, [messages]);

  // Space Chat enhanced context hook - use currentChatId (may be null for new chats)
  const spaceChatEnhanced = useSpaceChatEnhanced({
    spaceId,
    chatId: currentChatId ?? undefined,
    spaceContext,
  });

  // Back button handler
  const handleBackPress = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      // Fallback: navigate to the space home if can't go back
      (navigation as any).navigate('SpaceHome', { spaceId });
    }
  }, [navigation, spaceId]);

  // Auto-scroll when messages change (e.g., new assistant/user messages)
  useEffect(() => {
    // Small delay to let layout settle before scrolling
    const timer = setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 150);
    return () => clearTimeout(timer);
  }, [messages]);

  // Phase 12: Global overlay saved event listener
  // This fires when OverlayHost saves (the real overlay) and includes sourceMessageId
  useEffect(() => {
    const handleOverlaySaved = async (payload: OverlaySavedPayload) => {
      if (__DEV__) {
        console.log('[ChatThreadScreen] Global overlay saved event received', {
          payloadId: payload.id,
          payloadType: payload.type,
          sourceMessageId: payload.sourceMessageId,
        });
      }

      // Only process if this save came from our chat (has sourceMessageId matching a message)
      if (!payload.sourceMessageId) {
        if (__DEV__) {
          console.log('[ChatThreadScreen] No sourceMessageId, ignoring overlay saved event');
        }
        return;
      }

      // Check if the sourceMessageId matches one of our messages
      const matchingMessage = messages.find((m) => m.id === payload.sourceMessageId);
      if (!matchingMessage) {
        if (__DEV__) {
          console.log(
            '[ChatThreadScreen] sourceMessageId does not match any of our messages, ignoring',
          );
        }
        return;
      }

      if (__DEV__) {
        console.log(
          '🔥🔥🔥 [ChatThreadScreen] GLOBAL OVERLAY SAVED - processing for message:',
          payload.sourceMessageId,
        );
      }

      // Get the full record for tap-to-edit from Zustand store
      const record = getItemById(payload.id);

      // Remove the action confirmation toast after successful creation
      const actionConfirmation = messages.find(
        (msg) => msg.metadata_json?.type === 'action-confirmation',
      );
      if (actionConfirmation) {
        console.log('[Toast] Removing action confirmation after save:', actionConfirmation.id);
        removeMessage(actionConfirmation.id);
      }

      // Phase 11.6: Add entry card to chat thread
      try {
        if (
          record &&
          (payload.type === 'note' || payload.type === 'todo' || payload.type === 'habit')
        ) {
          // Helper function to get continuation message based on type
          const getContinuationMessage = (
            type: 'habit' | 'todo' | 'note',
            itemName?: string,
          ): string => {
            switch (type) {
              case 'habit':
                return `Great! Your ${itemName || 'habit'} is set. What else would you like to work on?`;
              case 'todo':
                return 'Task added to your list. Anything else you need to get done?';
              case 'note':
                return "Got it! Note saved. What's next?";
              default:
                return 'Done! What would you like to do next?';
            }
          };

          // Add locked confirmation message for all types
          console.log('🔥🔥🔥 LOCKED CARD - About to add for type:', payload.type);
          if (payload.type === 'habit') {
            const habitRecord = record as any;
            await appendAssistantMessage('', {
              type: 'habit-locked',
              habitName: habitRecord.name || 'Habit',
              frequency: habitRecord.frequency || 'regularly',
              habitId: record.id,
              locked: true,
              itemType: 'habit',
            });

            // Add follow-up message after short delay
            setTimeout(async () => {
              try {
                await appendAssistantMessage(getContinuationMessage('habit', habitRecord.name));
                console.log('[Chat] Follow-up message added after habit creation');
              } catch (err) {
                console.error('[Chat] Failed to add follow-up message:', err);
              }
            }, 1500);
          } else if (payload.type === 'todo') {
            const todoRecord = record as any;
            await appendAssistantMessage('', {
              type: 'todo-locked',
              todoTitle: todoRecord.title || 'Task',
              dueDate: todoRecord.due_date || null,
              todoId: record.id,
              locked: true,
              itemType: 'todo',
            });

            // Add follow-up message after short delay
            setTimeout(async () => {
              try {
                await appendAssistantMessage(getContinuationMessage('todo'));
                console.log('[Chat] Follow-up message added after todo creation');
              } catch (err) {
                console.error('[Chat] Failed to add follow-up message:', err);
              }
            }, 1500);
          } else if (payload.type === 'note') {
            const noteRecord = record as any;
            console.log('🔥🔥🔥 NOTE-LOCKED - Creating card for:', noteRecord?.title);
            await appendAssistantMessage('', {
              type: 'note-locked',
              noteContent: noteRecord.content || noteRecord.title || 'Note',
              noteId: record.id,
              locked: true,
              itemType: 'note',
            });
            console.log('[ChatThread] note-locked card should be added now');

            // Add follow-up message after short delay
            setTimeout(async () => {
              try {
                await appendAssistantMessage(getContinuationMessage('note'));
                console.log('[Chat] Follow-up message added after note creation');
              } catch (err) {
                console.error('[Chat] Failed to add follow-up message:', err);
              }
            }, 1500);
          }
        }
      } catch (err) {
        console.error('[EntryCard] Failed to add entry card to chat:', err);
      }

      // Dismiss the saveable card on the source message
      if (__DEV__) {
        console.log('[Chat] Dismissing saveable after save for message:', payload.sourceMessageId);
      }
      updateMessage(payload.sourceMessageId, { saveableDismissed: true });
      activeMessageWithSaveableRef.current = null;
      setActiveMessageWithSaveable(null);
    };

    const unsubscribe = addOverlaySavedListener(handleOverlaySaved);
    return () => unsubscribe();
  }, [messages, getItemById, appendAssistantMessage, removeMessage, updateMessage]);

  // Create SpaceChatRepo instance (unused but kept for potential future use)
  const _spaceChatRepo = React.useMemo(() => {
    const backend = process.env.EXPO_PUBLIC_REPO_BACKEND || 'memory';
    return backend === 'supabase'
      ? new SupabaseSpaceChatRepo(userId || undefined)
      : new MemorySpaceChatRepo(userId || 'anonymous');
  }, [userId]);

  // Load chat - only if we have a chatId
  const loadChat = useCallback(async () => {
    try {
      // For new chats (no chatId), create a placeholder
      const effectiveChatId = currentChatId || chatId;
      setChat({
        id: effectiveChatId || 'pending',
        user_id: userId || 'anonymous',
        space_id: spaceId,
        title: effectiveChatId ? 'Chat' : 'New Chat',
        pinned: false,
        archived_at: null,
        last_message_snippet: null,
        updated_at: new Date().toISOString(),
        metadata_json: null,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to load chat:', error);
      Alert.alert('Error', 'Failed to load chat');
    } finally {
      setLoading(false);
    }
  }, [currentChatId, chatId, userId, spaceId]);

  useEffect(() => {
    loadChat();
  }, [loadChat]);

  // Fetch space name from Zustand store
  useEffect(() => {
    if (space?.name) {
      setSpaceName(space.name);
    }
  }, [space]);

  // NOTE: entity:created event listener removed - SavedItemCard is now rendered
  // inline within ChatBubble via message.saveable property

  const handleSend = useCallback(
    async (text: string) => {
      const trimmedText = text.trim();
      if (!trimmedText || !chat) return;

      // Guard against rapid double-taps while sending
      if (sending) {
        console.log('[Chat] Ignoring send - already sending');
        return;
      }

      hideActionToast();

      // P0 Fix: Strict spaceId validation with dev error
      if (!spaceId) {
        console.error('[ChatThread][10.10] Missing spaceId - this should never happen');
        if (__DEV__) {
          throw new Error('[P0] spaceId is required for space_chat lane but was undefined/null');
        }
        Alert.alert('Error', 'Invalid space context');
        return;
      }

      // Log spaceId once for debugging
      if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
        console.log('[Chat] spaceId=', spaceId);
      }

      const currentUserId = userId || 'anonymous';

      try {
        setSending(true);

        // Phase 10.6: Trigger haptic feedback for send action
        if (shouldUseHaptics()) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }

        // 1. Send user message via hook - capture the chat ID (important for new chats)
        const activeChatId = await sendUserMessage(trimmedText);

        // Phase 10.6: Emit user message sent event
        emitChatEvent({
          type: 'user_message_sent',
          payload: { text: trimmedText, spaceId: chat.space_id || undefined },
        });

        // Check for quick response (instant reply without API call)
        const quickResponse = checkQuickResponse(trimmedText, messages.length);

        if (quickResponse && quickResponse.confidence > 0.7) {
          // Use quick response - no API call needed
          if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
            console.log('[Chat] Using quick response', {
              confidence: quickResponse.confidence,
              pattern: trimmedText.substring(0, 30),
            });
          }

          // Phase 10.6: Start thinking animation briefly
          mascot.thinking();

          // Add slight delay so response feels natural (not instantaneous)
          setTimeout(async () => {
            const responseText = getQuickResponseText(quickResponse);

            // Append assistant message with quick response metadata
            // Pass activeChatId to avoid race condition with state update
            await appendAssistantMessage(
              responseText,
              {
                isQuickResponse: true,
                confidence: quickResponse.confidence,
              },
              activeChatId,
            );

            // Phase 10.6: Transition to replying state
            mascot.replying();

            // Record performance metric
            await perfMonitor.recordQuickResponse();

            // Brief replying state, then back to idle
            setTimeout(() => {
              mascot.idle();
            }, 800);

            setSending(false);
          }, 300); // 300ms delay feels natural

          return; // Skip Cortex API call
        }

        // Space Chat: Meta-intent handling (before regular Cortex call)
        // Handles "save this", "what did we talk about", etc.
        const metaResult = spaceChatEnhanced.checkForMetaIntent(
          trimmedText,
          getMessagesForResolution(),
        );
        if (metaResult.type === 'save_this') {
          mascot.thinking();
          const saveResult = await spaceChatEnhanced.handleSaveThisCommand(
            metaResult.intent,
            metaResult.resolution,
          );
          await appendAssistantMessage(saveResult.gremlyResponse);
          mascot.idle();
          setSending(false);
          return;
        } else if (metaResult.type === 'summary') {
          mascot.thinking();
          // Filter to only user/assistant messages for summary
          const recentMessages = getMessagesForResolution()
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
          const summaryResult = await spaceChatEnhanced.handleSummaryCommand(recentMessages);
          await appendAssistantMessage(summaryResult.gremlyResponse);
          mascot.idle();
          setSending(false);
          return;
        }

        // Phase 10.6: Start thinking animation for API call
        mascot.thinking();

        // 2. Process with Cortex in parallel (Phase 10.3)
        try {
          // Ensure we have a valid session before making cortex calls
          const validSession = await auth.waitForSession(3000);
          if (!validSession && auth.user) {
            console.warn('[ChatThread] Session timeout, cortex call skipped');
            await appendAssistantMessage(
              'I had trouble processing your message. Please try again.',
            );
            return;
          }

          // Phase 10.6: Emit request started event
          emitChatEvent({
            type: 'request_started',
            payload: { requestId: Date.now().toString(), lane: 'space_chat' },
          });

          const cortexStartTime = Date.now();

          // Build conversation history for context
          const conversationHistory = messages.slice(-8).map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }));

          // Add current user message
          conversationHistory.push({ role: 'user' as const, content: trimmedText });

          // Call GPT via Space Chat pipeline
          const spaceChatResult = await callSpaceChat(conversationHistory, {
            spaceId: chat.space_id || spaceId,
            chatId: chat.id,
            systemPrompt: spaceChatEnhanced.systemPrompt,
          });

          const cortexDuration = Date.now() - cortexStartTime;

          // Record API call performance
          await perfMonitor.recordApiCall(cortexDuration);

          if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
            console.log('[Chat] Space Chat API call completed', {
              duration: `${cortexDuration}ms`,
              ok: spaceChatResult.ok,
            });
          }

          // Handle error
          if (!spaceChatResult.ok) {
            console.error('[ChatThread] Space Chat failed:', spaceChatResult.error);
            throw new Error(spaceChatResult.error || 'Space Chat request failed');
          }

          // Map response to expected format
          const chatData = spaceChatResult.data as { content?: string } | undefined;
          const response = {
            explanation: chatData?.content || '',
            replyText: chatData?.content || '',
            actions: [] as any[],
            suggestions: [] as any[],
            mode: 'keep' as const,
            confidence: 1,
            meta: {} as Record<string, any>,
          };

          // REMOVED: Automatic action creation without user confirmation (lines 800-883)
          // Phase 10.6: Determine mascot state based on cortex response
          let shouldTriggerPlayful = false;

          // Normalize actions array for type safety
          const actions = Array.isArray(response.actions) ? response.actions : [];

          // Check if this is chit-chat/conversational content
          if (response.mode === 'keep' && actions.length === 0) {
            // Simple heuristic for chit-chat detection
            const chitChatPatterns =
              /\b(hello|hi|hey|thanks|thank you|how are you|what's up|good morning|good afternoon|good evening)\b/i;
            if (chitChatPatterns.test(trimmedText.toLowerCase())) {
              shouldTriggerPlayful = true;
            }
          }

          // Add AI response message for all cortex responses (explanation or replyText)
          const assistantText = response.explanation?.trim() || response.replyText?.trim() || '';

          if (assistantText) {
            // Run saveable detection BEFORE adding message (single state update)
            let saveableData: {
              type: 'todo' | 'habit' | 'note';
              title: string;
              content?: string;
              prefillData?: any;
            } | null = null;

            let detectionResult: any = null;

            try {
              console.log('[ChatThread] Running saveable detection BEFORE append', {
                assistantText: assistantText.slice(0, 50),
              });

              // Run detection without messageId (we don't have it yet)
              detectionResult = await spaceChatEnhanced.runSaveableDetection(
                assistantText,
                trimmedText,
                'pending', // Temporary ID, will be updated
              );

              // Log detection result
              if (__DEV__) {
                console.log('[Chat] Saveable detection result:', {
                  detected: detectionResult?.isSaveable ?? false,
                  type: detectionResult?.suggestedType,
                  title: detectionResult?.prefill?.title,
                });
              }

              if (detectionResult?.isSaveable && detectionResult.suggestedType) {
                // Map SaveableType to simpler type for message storage
                const typeMap: Record<string, 'todo' | 'habit' | 'note'> = {
                  todo: 'todo',
                  habit: 'habit',
                  'log-general': 'note',
                  'log-list': 'note',
                  'log-idea': 'note',
                };
                saveableData = {
                  type: typeMap[detectionResult.suggestedType] || 'note',
                  title: detectionResult.prefill?.title || '',
                  content: detectionResult.prefill?.content,
                  prefillData: detectionResult.prefill,
                };
              }
            } catch (err) {
              console.error('[ChatThread] Saveable detection failed:', err);
            }

            // Add message with saveable data attached (single state update)
            const appendedMessage = await appendAssistantMessage(
              assistantText,
              undefined,
              undefined,
              saveableData,
            );

            // Log AI message addition
            if (__DEV__) {
              console.log('[Chat] Adding AI message with saveable:', {
                messageId: appendedMessage?.id,
                hasSaveable: !!saveableData,
                saveableType: saveableData?.type,
              });
            }

            // NOTE: showSaveButton call removed - saveable data is now embedded
            // in the message itself via message.saveable property

            // Phase 10.8: Maybe refresh Space Insight summary (background, fire-and-forget)
            if (getEnv('EXPO_PUBLIC_SPACE_SUMMARY_BG') === 'on' && spaceId) {
              // Convert messages to ChatTurn format
              const historyTurns = messages.map((m) => ({
                role: m.role as 'user' | 'assistant',
                text: m.content,
              }));

              const hasLatestUser = historyTurns.some(
                (turn) => turn.role === 'user' && turn.text === trimmedText,
              );

              if (!hasLatestUser) {
                historyTurns.push({ role: 'user', text: trimmedText });
              }

              historyTurns.push({ role: 'assistant', text: assistantText });

              const turns = historyTurns;

              const lastMsgId = appendedMessage?.id || messages[messages.length - 1]?.id;

              // Context update handled by useSpaceChatEnhanced
              if (__DEV__) {
                console.log('[ChatThread] Turn complete, context managed by enhanced hook');
              }
            }

            // Phase 10.6: Emit response final event
            emitChatEvent({
              type: 'response_final',
              payload: {
                requestId: Date.now().toString(),
                assistantKind: response.meta.kind,
                hasActions: response.actions && response.actions.length > 0,
                hasSuggestions: response.suggestions && response.suggestions.length > 0,
              },
            });

            // Phase 10.6: Trigger appropriate mascot state after assistant message
            if (shouldTriggerPlayful) {
              mascot.playful();
            } else {
              mascot.replying();
            }

            // Space Chat: Update rolling context after turn completes
            spaceChatEnhanced.onTurnComplete(trimmedText, assistantText).catch((err) => {
              if (__DEV__) {
                console.error('[ChatThread] Context update failed:', err);
              }
            });
          } else {
            // EMPTY RESPONSE HANDLING: API returned no content
            // This can happen when the model spends reasoning tokens but produces nothing
            console.warn('[ChatThread] API returned empty content', {
              responseKeys: Object.keys(response),
              explanation: response.explanation,
              replyText: response.replyText,
            });

            // Show a friendly fallback message instead of leaving the chat frozen
            const fallbackContent =
              'Hmm, I lost my train of thought there. Could you say that again?';

            await appendAssistantMessage(fallbackContent, {
              wasEmptyResponse: true,
            });

            // Trigger a gentle mascot state
            mascot.replying();

            // Skip saveable detection for fallback messages (nothing to save)
          }
        } catch (cortexError: any) {
          // Enhanced cortex error handling with detailed logging
          console.error('[ChatThread] Cortex decision failed:', {
            error: cortexError,
            userId: currentUserId,
            spaceId: chat.space_id,
            text: trimmedText.substring(0, 100) + (trimmedText.length > 100 ? '...' : ''),
          });

          // Phase 10.6: Emit error event
          emitChatEvent({
            type: 'error',
            payload: {
              error: cortexError,
              context: 'cortex_request',
            },
          });

          // Check for specific error types and provide appropriate responses
          let errorResponse =
            "I apologize, but I'm having trouble processing your message right now.";

          if (cortexError?.message?.includes('timeout') || cortexError?.name === 'AbortError') {
            errorResponse = 'The response is taking longer than expected. Your message was saved.';
          } else if (
            cortexError?.message?.includes('network') ||
            cortexError?.message?.includes('fetch')
          ) {
            errorResponse = "I'm having network connectivity issues. Your message was saved.";
          } else if (
            cortexError?.message?.includes('auth') ||
            cortexError?.message?.includes('unauthorized')
          ) {
            errorResponse = 'There was an authentication issue. Please try refreshing the app.';
          }

          // Still add an assistant message to acknowledge the user's input
          try {
            await appendAssistantMessage(errorResponse);
            // Phase 10.6: Even on error, show replying state briefly
            mascot.replying();
          } catch (appendError) {
            console.error('[ChatThread] Failed to append error message:', appendError);
            // Phase 10.6: Return to idle on complete failure
            mascot.idle();
          }
        }

        console.log('[Analytics] space_chat_message_sent', { chatId: currentChatId || chatId });
      } catch (error) {
        console.error('Failed to send message:', error);
        Alert.alert('Error', 'Failed to send message');
      } finally {
        setSending(false);
      }
    },
    [
      chat,
      chatId,
      currentChatId,
      userId,
      sendUserMessage,
      appendAssistantMessage,
      messages,
      mascot,
      hideActionToast,
      spaceChatEnhanced,
      spaceId,
    ],
  );

  const handlePersistentActionPress = useCallback(() => {
    if (shouldUseHaptics()) {
      Haptics.selectionAsync();
    }
    overlayController.openCreate({ spaceId: spaceId ?? null });
  }, [overlayController, spaceId]);

  // Phase 10.7D: Debounced send wrapper (200ms)
  const handleSendDebounced = useCallback(
    (text: string) => {
      // Clear any existing debounce timer
      if (sendDebounceTimerRef.current) {
        clearTimeout(sendDebounceTimerRef.current);
      }

      // Set new debounce timer
      sendDebounceTimerRef.current = setTimeout(() => {
        handleSend(text);
      }, 200);
    },
    [handleSend],
  );

  // Handle dismiss saveable card from ChatBubble
  const handleDismissSaveable = useCallback(
    (messageId: string) => {
      if (__DEV__) {
        console.log('[Chat] Dismissing saveable for message:', messageId);
      }
      spaceChatEnhanced.dismissSaveButton();
      spaceChatEnhanced.markSaveDismissed();
      // Update message to mark saveable as dismissed
      updateMessage(messageId, { saveableDismissed: true });
    },
    [spaceChatEnhanced, updateMessage],
  );

  // Handle save from ChatBubble's embedded save button
  // Moved outside renderItem to prevent re-creation on each render
  const handleBubbleSave = useCallback(
    (message: SpaceChatMessage) => {
      const saveable = message.saveable;
      if (!saveable) return;

      if (__DEV__) {
        console.log('[Chat] Save pressed for saveable:', { messageId: message.id, saveable });
      }
      // Track which message is being saved - set BOTH state and ref
      // Ref survives closure staleness in onSaved callback
      setActiveMessageWithSaveable(message.id);
      activeMessageWithSaveableRef.current = message.id;
      spaceChatEnhanced.startSaving();
      // Map saveable type to overlay kind
      const kind = saveable.type === 'todo' ? 'todo' : saveable.type === 'habit' ? 'habit' : 'note';
      const prefill = saveable.prefillData || {};
      // Notes/Logs: full assistant response; Todos/Habits: AI-summarized content
      const note = kind === 'note' ? message.content : prefill.content || '';
      openUnifiedFromChat(
        kind,
        {
          title: saveable.title || smartTitle(message.content),
          note,
          tags: prefill.tags || [],
          frequency: prefill.frequency ?? undefined,
          frequencyValue: prefill.frequencyValue,
          dueDate: prefill.dueDate ?? undefined,
          fromChat: true,
        },
        {
          lane: 'space_chat',
          spaceId: spaceId || null,
          messageId: message.id,
        },
        overlayController,
      );
      spaceChatEnhanced.finishSaving();
      spaceChatEnhanced.markSaveTapped();
    },
    [spaceChatEnhanced, spaceId, overlayController],
  );

  // Environment gate - wrap entire chat UI
  if (process.env.EXPO_PUBLIC_FEATURE_CHAT !== 'on') {
    return <Placeholder text="Chat temporarily disabled" />;
  }

  // Don't show loading screen if we're actively sending - prevents flash on new chat creation
  if ((loading || messagesLoading) && !sending) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={lightTokens.colors.primary} />
      </View>
    );
  }

  if (!chat) {
    return <Placeholder text="Chat not found" />;
  }

  if (messagesError) {
    return <Placeholder text={`Error: ${messagesError}`} />;
  }

  return (
    <MascotProvider lane="space_chat">
      <SafeAreaView
        style={[styles.container, { paddingBottom: 0 }]}
        edges={['top', 'left', 'right']}
      >
        <KeyboardAvoidingView
          style={[styles.flex, isActionToastVisible && { paddingBottom: actionToastOffset }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          {/* Header - always shown for navigation */}
          <View style={styles.header}>
            <View style={styles.headerContent}>
              {/* Back button - chevron only */}
              <TouchableOpacity
                onPress={handleBackPress}
                style={styles.backButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Go back to Space"
                accessibilityRole="button"
              >
                <ChevronLeft size={28} color={BRAND.colors.charcoalInk} strokeWidth={2} />
              </TouchableOpacity>

              {/* Centered title with golden underline */}
              <View style={styles.headerTitleContainer}>
                <Text style={styles.headerTitle}>{spaceName || 'Chat'}</Text>
                <View style={styles.headerUnderline} />
              </View>

              {/* Right spacer for centering (or mascot if enabled) */}
              <View style={styles.headerRight}>{shouldShowMascot() && <Mascot size="md" />}</View>
            </View>
          </View>

          {/* Messages FlatList */}
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item, index) => item.id || `msg-${index}`}
            style={styles.messages}
            contentContainerStyle={[
              styles.messagesContent,
              messages.length === 0 && styles.emptyListContent,
            ]}
            // Performance optimizations to reduce re-render flash
            removeClippedSubviews={false}
            maxToRenderPerBatch={10}
            windowSize={10}
            initialNumToRender={15}
            onContentSizeChange={() => {
              // Small delay prevents flash during rapid updates
              setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
              }, 100);
            }}
            ListEmptyComponent={
              <View style={styles.placeholder}>
                {/* Mascot */}
                <Image
                  source={require('../../assets/mascot/spaceschatchair.png')}
                  style={styles.emptyMascot}
                  resizeMode="contain"
                />

                {/* Centered text with Space context */}
                <View style={styles.emptyTextContainer}>
                  <Text style={styles.placeholderTitle}>Start typing what's on your mind.</Text>
                  <Text style={styles.placeholderText}>
                    {milestone?.name
                      ? `Gremly can help you plan for ${milestone.name} — sort ideas, set habits, or create next steps.`
                      : `Gremly can help you with ${spaceName || 'this space'} — sort ideas, set habits, or create next steps.`}
                  </Text>
                </View>
              </View>
            }
            ListFooterComponent={
              mascot.state === 'thinking' ? (
                <View style={styles.typingContainer}>
                  <ChatThinkingIndicator visible variant="both" />
                </View>
              ) : null
            }
            renderItem={({ item: message }) => {
              // Helper function to get title for each locked type
              const getLockedTitle = (metadata: any): string => {
                const itemType = metadata.itemType;
                switch (itemType) {
                  case 'habit':
                    return `Habit locked in for ${metadata.frequency}`;
                  case 'todo':
                    return `Task added${metadata.dueDate ? ` for ${metadata.dueDate}` : ''}`;
                  case 'note':
                    return 'Note captured';
                  case 'person':
                    return `${metadata.personName} added to connections`;
                  default:
                    return 'Item created';
                }
              };

              // Helper function to get subtext for each locked type
              const getLockedSubtext = (metadata: any): string => {
                const itemType = metadata.itemType;
                if (itemType === 'note' && metadata.noteContent) {
                  return metadata.noteContent.substring(0, 50);
                }
                return 'Click this entry or find it in the Space to edit';
              };

              // Helper function to get item ID based on type
              const getItemId = (metadata: any): string | undefined => {
                const itemType = metadata.itemType;
                switch (itemType) {
                  case 'habit':
                    return metadata.habitId;
                  case 'todo':
                    return metadata.todoId;
                  case 'note':
                    return metadata.noteId;
                  case 'person':
                    return metadata.personId;
                  default:
                    return undefined;
                }
              };

              // Unified renderer for all locked confirmation types
              if (
                message.role === 'assistant' &&
                (message.metadata_json as any)?.type?.includes('-locked')
              ) {
                const metadata = message.metadata_json || {};
                const rawItemType = metadata.itemType as 'habit' | 'todo' | 'note' | 'person';
                // Filter to supported types for SavedItemCard
                const itemType: 'habit' | 'todo' | 'note' =
                  rawItemType === 'person' ? 'note' : rawItemType || 'note';
                const itemId = getItemId(metadata);
                const title = getLockedTitle(metadata);
                const subtext = getLockedSubtext(metadata);

                return (
                  <SavedItemCard
                    itemType={itemType}
                    title={title}
                    subtitle={subtext}
                    onPress={() => {
                      if (itemId && itemType) {
                        console.log(`[Locked${itemType}] Tapped, itemId:`, itemId);
                        // Notes open in view mode, todos/habits open in edit mode
                        if (itemType === 'note') {
                          overlayController.openView({
                            record: { id: itemId, type: itemType } as any,
                            spaceId: spaceId ?? undefined,
                          });
                        } else {
                          // todo or habit
                          overlayController.openEdit({
                            record: { id: itemId, type: itemType } as any,
                            spaceId: spaceId ?? undefined,
                          });
                        }
                      }
                    }}
                  />
                );
              }

              // Phase 11.6: Render entry card
              // Check for system role with type 'entry-card' in metadata
              if (message.role === 'system' && message.metadata_json?.type === 'entry-card') {
                const metadata = message.metadata_json || {};
                const entry = metadata.entry;
                const entryType = metadata.entryType;

                if (entry && entryType) {
                  // Add type property to entry object
                  const typedEntry = { ...entry, type: entryType };

                  return (
                    <EntryCard
                      entry={typedEntry}
                      onPress={(entry) => {
                        // Notes open in view mode, todos/habits open in edit mode
                        if (entryType === 'note' || entryType === 'log') {
                          overlayController.openView({
                            record: entry as any,
                            spaceId: spaceId ?? undefined,
                          });
                        } else {
                          // todo or habit
                          overlayController.openEdit({
                            record: entry as any,
                            spaceId: spaceId ?? undefined,
                          });
                        }
                      }}
                      testID={`entry-card-${message.id}`}
                    />
                  );
                }
              }

              // NOTE: SavedItemCard rendering removed - now rendered inline in ChatBubble
              // via message.saveable property

              // Phase 11.3/11.5: Skip action confirmations - they're rendered outside FlatList
              // CRITICAL FIX: Check for system role with type 'action-confirmation' in metadata
              if (
                message.role === 'system' &&
                message.metadata_json?.type === 'action-confirmation'
              ) {
                // Don't render inside FlatList - will be rendered as overlay below
                return null;
              }

              // NOTE: buttonState variables removed - saveable card now uses message.saveable
              // NOTE: handleBubbleSave moved to useCallback above renderItem to prevent re-creation

              // Render message bubble with inline saveable card support
              const messageBubble = (
                <View style={styles.messageContainer}>
                  <ChatBubble
                    message={message}
                    testID={`chat-bubble-${message.id}`}
                    onSavePress={() => handleBubbleSave(message)}
                    onDismissSaveable={handleDismissSaveable}
                  />
                </View>
              );

              // NOTE: MessageWithSave wrapper removed - saveable card is now rendered
              // inline within ChatBubble via message.saveable property

              return messageBubble;
            }}
          />

          {/* Persistent Action Bar removed */}

          {/* Chat Composer */}
          <View style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
            <ChatComposer onSend={handleSendDebounced} disabled={sending} testID="chat-composer" />
          </View>

          {ActionToast}
        </KeyboardAvoidingView>

        {/* Phase 12: UnifiedCreateOverlay removed - global OverlayHost handles saves,
            and ChatThreadScreen listens to overlay saved events via addOverlaySavedListener */}
      </SafeAreaView>
    </MascotProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#D4E4D4', // Sage green background for seamless empty state
  },
  flex: {
    flex: 1,
  },
  // Atmosphere overlay for depth
  atmosphereOverlay: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
    opacity: 0.02,
  },
  header: {
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
    paddingHorizontal: lightTokens.spacing[4],
    paddingVertical: lightTokens.spacing[3],
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleContainer: {
    alignItems: 'center',
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#222222',
  },
  headerUnderline: {
    width: 40,
    height: 3,
    backgroundColor: '#E0C47A', // goldenPear
    borderRadius: 2,
    marginTop: 4,
  },
  headerRight: {
    width: 44, // Match back button width for centering
    alignItems: 'flex-end',
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messages: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  messagesContent: {
    padding: lightTokens.spacing[4],
    paddingBottom: lightTokens.spacing[6],
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  typingContainer: {
    alignSelf: 'flex-start',
    marginTop: lightTokens.spacing[2],
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100, // Account for input field
    paddingHorizontal: 32,
  },
  emptyMascot: {
    width: 140,
    height: 140,
    marginBottom: 24,
  },
  emptyTextContainer: {
    alignItems: 'center',
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2E5540', // Moss Green
    marginBottom: 12,
    lineHeight: 24,
    textAlign: 'center',
  },
  placeholderText: {
    fontSize: 15,
    color: '#4A5F4A', // Darker green for better contrast on sage background
    lineHeight: 21,
    textAlign: 'center',
  },
  messageContainer: {
    marginBottom: lightTokens.spacing[3],
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: lightTokens.colors.linenCream,
  },
});
