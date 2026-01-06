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
import { AppFlatList } from '../../components/common/AppFlatList';
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
import {
  callSpaceChat,
  callSpaceChatStreaming,
  callSpaceChatSave,
} from '../../lib/cortex/CortexClient';
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
  selectCompletionsInRolling7Days,
} from '../../lib/store/selectors';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatThread'>;

// Pure helper functions moved outside component - no need to recreate on every render
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

const getLockedSubtext = (metadata: any): string => {
  const itemType = metadata.itemType;
  if (itemType === 'note' && metadata.noteContent) {
    return metadata.noteContent.substring(0, 50);
  }
  return 'Click this entry or find it in the Space to edit';
};

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

export default function ChatThreadScreen({ route }: Props) {
  // Navigation
  const navigation = useNavigation();

  // Safe area insets for bottom padding
  const insets = useSafeAreaInsets();

  // Scroll ref for auto-scrolling to the latest message
  const flatListRef = useRef<any>(null);

  const { spaceId, chatId } = route.params;
  const auth = useAuth();
  const { userId } = auth;
  const getItemById = useCallback(
    (id: string) => selectItemById(useGremlyStore.getState(), id),
    [],
  );

  // Store functions for instant save
  const createTodo = useGremlyStore((s) => s.createTodo);
  const createHabit = useGremlyStore((s) => s.createHabit);
  const createNote = useGremlyStore((s) => s.createNote);

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
  const rolling7Completions = useGremlyStore(selectCompletionsInRolling7Days);

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

    // Map todos with richer data for AI context
    const todosData = todos.map((t) => ({
      name: t.name || t.title,
      title: t.name || t.title,
      completed_at: t.completed_at ?? null,
      due_date: t.due_date || null,
    }));

    // Map habits with richer data for AI context
    const habitsData = habits.map((h) => ({
      name: h.name,
      frequency: h.frequency,
      completionSummary: `${rolling7Completions.get(h.id) ?? 0}/${h.target_per_period ?? 1} past 7d`,
    }));

    // Map notes/guides with title
    const notesData = notes.map((n) => ({
      name: n.title || '',
      title: n.title || '',
    }));

    return (
      buildSpaceContext({
        space,
        milestone: milestoneData,
        meta: metaData,
        countdown: countdownData,
        todos: todosData,
        habits: habitsData,
        notes: notesData,
      }) ?? undefined
    );
  }, [space, todos, habits, notes, milestone, countdown, rolling7Completions]);

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

  // Streaming support refs
  const streamingControllerRef = useRef<{ close: () => void } | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const wordBufferRef = useRef<string[]>([]);
  const wordFlushIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
    createStreamingMessage,
    updateStreamingContent,
    finalizeStreamingMessage,
    cancelStreaming,
  } = useChatMessages(chatId, spaceId);

  // Helper function to convert messages for resolution
  const getMessagesForResolution = useCallback((): ChatMessageForResolution[] => {
    return messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
      timestamp: m.created_at ? new Date(m.created_at).getTime() : Date.now(),
    }));
  }, [messages]);

  // Streaming word buffer flush helpers
  const flushWordBuffer = useCallback(() => {
    const messageId = streamingMessageIdRef.current;
    if (!messageId || wordBufferRef.current.length === 0) return;
    const wordsToFlush = wordBufferRef.current.splice(0, 3);
    updateStreamingContent(messageId, wordsToFlush.join(''), 'append');
  }, [updateStreamingContent]);

  const startWordFlushInterval = useCallback(() => {
    if (wordFlushIntervalRef.current) return;
    wordFlushIntervalRef.current = setInterval(flushWordBuffer, 50);
  }, [flushWordBuffer]);

  const stopWordFlushInterval = useCallback(() => {
    if (wordFlushIntervalRef.current) {
      clearInterval(wordFlushIntervalRef.current);
      wordFlushIntervalRef.current = null;
    }
    if (streamingMessageIdRef.current && wordBufferRef.current.length > 0) {
      updateStreamingContent(
        streamingMessageIdRef.current,
        wordBufferRef.current.join(''),
        'append',
      );
      wordBufferRef.current = [];
    }
  }, [updateStreamingContent]);

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

        // 2. Process with Cortex streaming (Phase 12)
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

          // Build conversation history for context
          const conversationHistory = messages.slice(-8).map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }));

          // Add current user message
          conversationHistory.push({ role: 'user' as const, content: trimmedText });

          // Create streaming message placeholder
          const streamingResult = await createStreamingMessage();
          if (!streamingResult) {
            await appendAssistantMessage('Sorry, something went wrong.');
            setSending(false);
            return;
          }

          const { messageId } = streamingResult;
          streamingMessageIdRef.current = messageId;
          startWordFlushInterval();

          // Call GPT via streaming Space Chat pipeline
          streamingControllerRef.current = callSpaceChatStreaming(
            conversationHistory,
            {
              spaceId: chat.space_id || spaceId,
              chatId: activeChatId || chat.id,
              systemPrompt: spaceChatEnhanced.systemPrompt,
            },
            {
              onChunk: (delta) => {
                // Split on whitespace boundaries to buffer words
                wordBufferRef.current.push(...delta.split(/(?<=\s)/));
              },
              onComplete: async (finalText) => {
                stopWordFlushInterval();
                const finalizedMessage = await finalizeStreamingMessage(messageId, finalText);
                streamingMessageIdRef.current = null;
                streamingControllerRef.current = null;
                mascot.replying();

                // Run saveable detection on completed message
                if (finalizedMessage?.id) {
                  try {
                    console.log(
                      '[ChatThread] Running saveable detection for:',
                      finalizedMessage.id,
                    );
                    const result = spaceChatEnhanced.runSaveableDetection(
                      finalText,
                      trimmedText,
                      finalizedMessage.id,
                    );
                    console.log('[ChatThread] Saveable detection result:', {
                      messageId: finalizedMessage.id,
                      isSaveable: result?.isSaveable,
                      suggestedType: result?.suggestedType,
                    });
                    if (result?.isSaveable && result.suggestedType) {
                      const typeMap: Record<string, 'todo' | 'habit' | 'note'> = {
                        todo: 'todo',
                        habit: 'habit',
                        'log-general': 'note',
                        'log-idea': 'note',
                        'log-journal': 'note',
                      };
                      console.log('[ChatThread] Updating message with saveable:', {
                        messageId: finalizedMessage.id,
                        type: typeMap[result.suggestedType] || 'note',
                      });
                      updateMessage(finalizedMessage.id, {
                        saveable: {
                          type: typeMap[result.suggestedType] || 'note',
                          title: result.prefill?.title || '',
                        },
                        saveableDismissed: false,
                      });
                    }
                  } catch (err) {
                    console.error('[ChatThread] Saveable detection failed:', err);
                  }
                }

                // Space Chat: Update rolling context after turn completes
                spaceChatEnhanced.onTurnComplete(trimmedText, finalText).catch((err) => {
                  if (__DEV__) {
                    console.error('[ChatThread] Context update failed:', err);
                  }
                });

                setTimeout(() => mascot.idle(), 800);
                setSending(false);
              },
              onError: async (error, partialText) => {
                console.error(
                  '[ChatThread] Streaming error:',
                  error,
                  'partial:',
                  partialText?.length,
                );
                stopWordFlushInterval();
                cancelStreaming(messageId);
                streamingMessageIdRef.current = null;
                streamingControllerRef.current = null;
                mascot.idle();
                setSending(false);
              },
            },
          );
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
      createStreamingMessage,
      updateStreamingContent,
      finalizeStreamingMessage,
      cancelStreaming,
      startWordFlushInterval,
      stopWordFlushInterval,
      updateMessage,
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

  // Handle retry for failed streaming messages
  const handleRetryStream = useCallback(
    (messageId: string) => {
      const messageIndex = messages.findIndex((m) => m.id === messageId);
      const precedingUserMessage = messages
        .slice(0, messageIndex)
        .reverse()
        .find((m) => m.role === 'user');
      if (!precedingUserMessage) return;

      removeMessage(messageId);
      // Re-trigger send with the original user message
      handleSendDebounced(precedingUserMessage.content);
    },
    [messages, removeMessage, handleSendDebounced],
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

  // Handle edit from ChatBubble's embedded edit button (opens overlay)
  // If the item is already saved, open the overlay in edit mode with the existing item
  // Otherwise, open create mode with prefill data
  const handleBubbleEdit = useCallback(
    (message: SpaceChatMessage) => {
      const saveable = message.saveable;
      if (!saveable) return;

      if (__DEV__) {
        console.log('[Chat] Edit pressed for saveable:', { messageId: message.id, saveable });
      }

      // Check if item is already saved - if so, open in edit mode
      const savedItemId = saveable.savedItemId;
      const savedItemType = saveable.savedItemType;

      if (savedItemId && savedItemType) {
        // Item already exists - fetch from store and open in edit mode
        const existingItem = getItemById(savedItemId);

        if (existingItem) {
          if (__DEV__) {
            console.log('[Chat] Opening edit overlay for existing item:', {
              itemId: savedItemId,
              itemType: savedItemType,
              item: existingItem,
            });
          }

          overlayController.openEdit({
            record: existingItem,
            spaceId: spaceId || undefined,
          });
          return;
        } else {
          // Item not found in store (rare edge case - deleted externally?)
          console.warn('[Chat] Saved item not found in store:', savedItemId);
        }
      }

      // Item not saved yet - open create overlay with prefill
      // Track which message is being saved - set BOTH state and ref
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
    [spaceChatEnhanced, spaceId, overlayController, getItemById],
  );

  // Handle instant save from ChatBubble's embedded save button (new on-tap flow)
  const handleBubbleSave = useCallback(
    async (message: SpaceChatMessage) => {
      if (__DEV__) {
        console.log('[Chat] Save this pressed:', {
          messageId: message.id,
          contentLength: message.content?.length,
        });
      }

      // 1. Set button state to 'saving' - update both hook state and message saveable
      spaceChatEnhanced.setSaving();

      // Update message saveable to show loading state in UI
      const currentSaveable = message.saveable || { type: 'note' as const, title: '' };
      updateMessage(message.id, {
        saveable: {
          ...currentSaveable,
          isSaving: true,
        },
      });

      // 2. Find the preceding user message that triggered this assistant response
      const messageIndex = messages.findIndex((m) => m.id === message.id);
      const precedingUserMessage = messages
        .slice(0, messageIndex)
        .reverse()
        .find((m) => m.role === 'user');

      const userMessageContent = precedingUserMessage?.content || '';
      const assistantMessage = message.content || '';

      try {
        // 3. Call spaceChatSave to classify and get metadata
        const classification = await callSpaceChatSave({
          userMessage: userMessageContent,
          assistantMessage,
          spaceName: spaceName || 'Space',
        });

        console.log('[Chat] spaceChatSave raw result:', JSON.stringify(classification, null, 2));
        console.log(
          '[Chat] classification.title =',
          classification.title,
          'type:',
          typeof classification.title,
        );

        // 4. Create the item based on classification type
        let result: { id: string } | null = null;
        const basePayload = {
          space_id: spaceId || null,
          origin: 'space_chat' as const,
          tags: classification.tags || [],
        };

        if (classification.type === 'habit') {
          const habitPayload = {
            ...basePayload,
            name: classification.title,
            title: classification.title, // Some schemas expect both
            notes: assistantMessage,
            frequency: classification.frequency || 'daily',
            subtype: classification.subtype === 'break_habit' ? 'break_habit' : 'start_habit',
            time_estimate_minutes: classification.timeEstimateMinutes || undefined,
          };
          console.log('[Chat] Creating habit with:', {
            title: classification.title,
            name: classification.title,
            frequency: classification.frequency,
            subtype: classification.subtype,
            fullPayload: habitPayload,
          });
          result = await createHabit(habitPayload);
        } else if (classification.type === 'todo') {
          result = await createTodo({
            ...basePayload,
            name: classification.title,
            body: assistantMessage,
            time_estimate_minutes: classification.timeEstimateMinutes || undefined,
          });
        } else {
          // log type - save as note
          result = await createNote({
            ...basePayload,
            title: classification.title,
            body: assistantMessage,
          });
        }

        if (result?.id) {
          console.log('[Chat] Save successful:', result.id, classification.type);

          // 5. Update button state to 'saved'
          spaceChatEnhanced.setSaved(result.id, classification.type);

          // 6. Update the message's saveable metadata for the saved card display
          updateMessage(message.id, {
            saveable: {
              type:
                classification.type === 'todo'
                  ? 'todo'
                  : classification.type === 'habit'
                    ? 'habit'
                    : 'note',
              title: classification.title,
              isSaving: false,
              savedItemId: result.id,
              savedItemType: classification.type,
            },
          });
        } else {
          throw new Error('No result ID returned from create action');
        }
      } catch (error) {
        console.error('[Chat] Save failed:', error);

        // Reset saveable to ready state (remove isSaving)
        updateMessage(message.id, {
          saveable: {
            ...currentSaveable,
            isSaving: false,
          },
        });

        // Reset button state back to 'ready' on error
        // We need to re-show the button for retry
        spaceChatEnhanced.showSaveButton(message.id, {
          isSaveable: true,
          confidence: 1.0,
          suggestedType: 'log-general',
          prefill: { title: '', content: assistantMessage, tags: [] },
          detectedAt: new Date().toISOString(),
          messageId: message.id,
        });

        // Optionally show error toast
        if (__DEV__) {
          console.error('[Chat] Save error details:', error);
        }
      }
    },
    [
      messages,
      spaceId,
      spaceName,
      spaceChatEnhanced,
      createTodo,
      createHabit,
      createNote,
      updateMessage,
    ],
  );

  // Memoized keyExtractor for FlatList performance
  const keyExtractor = useCallback(
    (item: SpaceChatMessage, index: number) => item.id || `msg-${index}`,
    [],
  );

  // Memoized renderItem callback for FlatList performance
  const renderMessage = useCallback(
    ({ item: message }: { item: SpaceChatMessage }) => {
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

      // Phase 11.3/11.5: Skip action confirmations - they're rendered outside FlatList
      // CRITICAL FIX: Check for system role with type 'action-confirmation' in metadata
      if (message.role === 'system' && message.metadata_json?.type === 'action-confirmation') {
        // Don't render inside FlatList - will be rendered as overlay below
        return null;
      }

      // Render message bubble with inline saveable card support
      return (
        <View style={styles.messageContainer}>
          <ChatBubble
            message={message}
            testID={`chat-bubble-${message.id}`}
            onSavePress={() => handleBubbleSave(message)}
            onEditPress={() => handleBubbleEdit(message)}
            onDismissSaveable={handleDismissSaveable}
            onRetryStream={handleRetryStream}
          />
        </View>
      );
    },
    [
      spaceId,
      overlayController,
      handleBubbleSave,
      handleBubbleEdit,
      handleDismissSaveable,
      handleRetryStream,
    ],
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
          <AppFlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={keyExtractor}
            renderItem={renderMessage}
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
            ListFooterComponent={null}
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
    paddingBottom: 140, // Account for input field + SaveButton + safe area
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
