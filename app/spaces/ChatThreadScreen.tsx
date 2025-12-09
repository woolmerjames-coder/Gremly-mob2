/**
 * ChatThreadScreen - Phase 10.5 Space Chats v1
 * Phase 10.7D: Added debounce, spaceId validation, note prefill fixes
 * Phase 11.3: Inline action confirmations instead of overlay toast
 * Phase 11.5: Multi-intent detection and disambiguation
 * Phase 11.6: Entry cards for created/retrieved entries
 * Phase 11.7: Calm Action Bar v1.1 with centered + button
 * Now integrated with message persistence + new UI components
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Image,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { Search as SearchIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { SupabaseSpaceChatRepo } from '../../lib/repo/supabase';
import { MemorySpaceChatRepo } from '../../lib/repo/memory';
import type { SpaceChat } from '../../lib/types';
import { lightTokens } from '../../design/tokens';
import { useAuth } from '../../providers/AuthProvider';
import { useRepo } from '../../providers/RepoProvider';
import { callSpaceChat } from '../../lib/cortex/CortexClient';
import { checkQuickResponse, getQuickResponseText } from '../../lib/chat/quickResponses';
import { perfMonitor } from '../../lib/chat/performanceMonitor';
import { searchIndex } from '../../lib/chat/searchIndex';
import { getEnv } from '../../lib/env';
import { Placeholder } from '../../components/common/Placeholder';
import { useChatMessages } from '../../hooks/useChatMessages';
import { ChatBubble } from '../../components/chat/ChatBubble';
import { ChatComposer } from '../../components/chat/ChatComposer';
import { EntryCard } from '../../components/chat/EntryCard';
import { SavedItemCard } from '../../src/components/chat/SavedItemCard';
import { ChatActionBar } from '../../components/chat/ChatActionBar';
import { MessageSearch } from '../../components/chat/MessageSearch';
// Removed PersistentActionBar to reduce clutter per UX polish
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
import { UnifiedCreateOverlay } from '../../components/overlay/UnifiedCreateOverlay';
import { useActionToast, type ActionToastInput } from '../../src/hooks/useActionToast';

// Space Chat enhanced context imports
import { useSpaceChatEnhanced } from '../../hooks/useSpaceChatEnhanced';
import { type ChatMessageForResolution } from '../../lib/chat/thisResolver';
import MessageWithSave from '../../components/chat/MessageWithSave';
import { eventBus } from '../../lib/events/EventBus';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatThread'>;

export default function ChatThreadScreen({ route }: Props) {
  // Navigation
  const navigation = useNavigation();

  // Scroll ref for auto-scrolling to the latest message
  const scrollViewRef = useRef<import('react-native').ScrollView | null>(null);

  const { spaceId, chatId } = route.params;
  const auth = useAuth();
  const { userId } = auth;
  const repo = useRepo();

  const [chat, setChat] = useState<SpaceChat | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  // Phase 10.7D: Debounce timer ref
  const sendDebounceTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Mascot controller for Phase 10.6
  const mascot = useMascotController();

  // Overlay controller for conversion
  const overlayController = useUnifiedOverlayController();

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

  // Use new chat messages hook
  const {
    messages,
    loading: messagesLoading,
    error: messagesError,
    sendUserMessage,
    appendAssistantMessage,
    appendActionConfirmation,
    appendEntryCard,
    appendSavedItemCard,
    removeMessage,
  } = useChatMessages(chatId, spaceId);

  // Helper function to convert messages for resolution
  const getMessagesForResolution = useCallback((): ChatMessageForResolution[] => {
    return messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
      timestamp: m.created_at ? new Date(m.created_at).getTime() : Date.now(),
    }));
  }, [messages]);

  // Space Chat enhanced context hook
  const spaceChatEnhanced = useSpaceChatEnhanced({
    spaceId,
    chatId,
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
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  // Create SpaceChatRepo instance (unused but kept for potential future use)
  const _spaceChatRepo = React.useMemo(() => {
    const backend = process.env.EXPO_PUBLIC_REPO_BACKEND || 'memory';
    return backend === 'supabase'
      ? new SupabaseSpaceChatRepo(userId || undefined)
      : new MemorySpaceChatRepo(userId || 'anonymous');
  }, [userId]);

  // Load chat
  const loadChat = useCallback(async () => {
    try {
      // For now, we'll show a placeholder
      setChat({
        id: chatId,
        user_id: userId || 'anonymous',
        space_id: spaceId,
        title: 'Chat',
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
  }, [chatId, userId, spaceId]);

  useEffect(() => {
    loadChat();
  }, [loadChat]);

  // Initialize search index
  useEffect(() => {
    searchIndex.initialize();
  }, []);

  // Listen for entity:created events to add SavedItemCard to chat
  useEffect(() => {
    if (!spaceId) return;

    const handleEntityCreated = (payload: {
      entity: any;
      type: string;
      spaceId?: string | null;
    }) => {
      // Only handle events for this space
      if (payload.spaceId !== spaceId) return;

      const entityType = payload.type as 'habit' | 'todo' | 'note' | 'person';
      if (!['habit', 'todo', 'note', 'person'].includes(entityType)) return;

      const entityId = payload.entity?.id;
      if (!entityId) {
        console.warn('[ChatThread] entity:created missing entity id');
        return;
      }

      // CRITICAL: Check if we already have a card for this entity
      // This prevents duplicates when editing existing items
      const existingCard = messages.find(
        (m) =>
          m.role === 'system' &&
          m.metadata_json?.type === 'saved-item' &&
          m.metadata_json?.entityId === entityId,
      );

      if (existingCard) {
        console.log('[ChatThread] Skipping duplicate card for entity:', entityId);
        return;
      }

      if (__DEV__) {
        console.log('[ChatThread] entity:created event received', {
          entityId,
          type: entityType,
          title: payload.entity?.title || payload.entity?.name,
        });
      }

      appendSavedItemCard(payload.entity, entityType).catch((err) => {
        console.error('[ChatThread] Failed to append saved item card:', err);
      });
    };

    const unsub = eventBus.on('entity:created', handleEntityCreated);
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [spaceId, messages, appendSavedItemCard]);

  // Index messages as they're added
  useEffect(() => {
    messages.forEach((msg) => {
      // Only index user and assistant messages (exclude system, action, etc.)
      if (msg.role !== 'user' && msg.role !== 'assistant') return;

      searchIndex.addMessage({
        id: msg.id,
        content: msg.content,
        role: msg.role,
        timestamp: new Date(msg.created_at).getTime(),
        type: msg.metadata_json?.entryType as 'habit' | 'note' | 'task' | 'person' | undefined,
        metadata: msg.metadata_json,
      });
    });
  }, [messages]);

  const handleSend = useCallback(
    async (text: string) => {
      const trimmedText = text.trim();
      if (!trimmedText || !chat) return;

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

        // 1. Send user message via hook
        await sendUserMessage(trimmedText);

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
            await appendAssistantMessage(responseText, {
              isQuickResponse: true,
              confidence: quickResponse.confidence,
            });

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
            const appendedMessage = await appendAssistantMessage(assistantText);

            // Space Chat: Run saveable detection for assistant message
            if (appendedMessage?.id) {
              try {
                console.log('[ChatThread] Running saveable detection', {
                  assistantText: assistantText.slice(0, 50),
                  messageId: appendedMessage.id,
                });

                const detectionResult = await spaceChatEnhanced.runSaveableDetection(
                  assistantText,
                  trimmedText,
                  appendedMessage.id,
                );

                console.log('[ChatThread] Saveable detection result', {
                  result: detectionResult,
                  messageId: appendedMessage.id,
                });
              } catch (err) {
                console.error('[ChatThread] Saveable detection failed:', err);
              }
            }

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

        console.log('[Analytics] space_chat_message_sent', { chatId });
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
      repo,
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

  // Environment gate - wrap entire chat UI
  if (process.env.EXPO_PUBLIC_FEATURE_CHAT !== 'on') {
    return <Placeholder text="Chat temporarily disabled" />;
  }

  if (loading || messagesLoading) {
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
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={[styles.flex, isActionToastVisible && { paddingBottom: actionToastOffset }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          {/* Header - always shown for navigation */}
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <TouchableOpacity
                onPress={handleBackPress}
                style={styles.backButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Go back to Space"
                accessibilityRole="button"
              >
                <Text style={styles.backButtonText}>← Space</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Chat</Text>
              <View style={styles.headerRight}>
                <TouchableOpacity
                  onPress={() => setSearchVisible(true)}
                  style={styles.searchButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityLabel="Search messages"
                  accessibilityRole="button"
                >
                  <SearchIcon size={24} color="#2E5540" />
                </TouchableOpacity>
                {shouldShowMascot() && <Mascot size="md" />}
              </View>
            </View>
          </View>

          {/* Messages ScrollView */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.messages}
            contentContainerStyle={styles.messagesContent}
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.length === 0 ? (
              <View style={styles.placeholder}>
                {/* Centered text */}
                <View style={styles.emptyTextContainer}>
                  <Text style={styles.placeholderTitle}>Start typing what's on your mind.</Text>
                  <Text style={styles.placeholderText}>
                    Gremly can help you sort ideas, set habits, or create next steps
                  </Text>
                </View>
              </View>
            ) : (
              <>
                {messages.map((message) => {
                  // Helper function to get icon for each type
                  const getIconForType = (type: string): string => {
                    switch (type) {
                      case 'habit':
                        return '🔒';
                      case 'todo':
                        return '✓';
                      case 'note':
                        return '📝';
                      case 'person':
                        return '👤';
                      default:
                        return '📌';
                    }
                  };

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
                    const itemType = metadata.itemType;
                    const itemId = getItemId(metadata);
                    const icon = getIconForType(itemType);
                    const title = getLockedTitle(metadata);
                    const subtext = getLockedSubtext(metadata);

                    // Determine which style to use based on itemType
                    const lockedStyle =
                      itemType === 'habit'
                        ? styles.lockedHabit
                        : itemType === 'todo'
                          ? styles.lockedTodo
                          : itemType === 'note'
                            ? styles.lockedNote
                            : itemType === 'person'
                              ? styles.lockedPerson
                              : styles.lockedHabit; // fallback

                    return (
                      <Pressable
                        key={message.id}
                        style={lockedStyle}
                        onPress={() => {
                          if (itemId && itemType) {
                            console.log(`[Locked${itemType}] Tapped, itemId:`, itemId);
                            overlayController.openEdit({
                              record: { id: itemId, type: itemType } as any,
                              spaceId: spaceId ?? undefined,
                            });
                          }
                        }}
                      >
                        <View style={styles.lockedContent}>
                          <Text style={styles.lockIcon}>{icon}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.lockedTitle}>{title}</Text>
                            <Text
                              style={styles.lockedSubtext}
                              numberOfLines={itemType === 'note' ? 1 : undefined}
                            >
                              {subtext}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
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
                          key={message.id}
                          entry={typedEntry}
                          onPress={(entry) => {
                            // Open unified overlay with full entry data
                            overlayController.openEdit({
                              record: entry as any, // Full entry object includes all required fields
                              spaceId: spaceId ?? undefined,
                            });
                          }}
                          testID={`entry-card-${message.id}`}
                        />
                      );
                    }
                  }

                  // Phase 11.8: Render saved-item card for Space Chat save confirmations
                  if (message.role === 'system' && message.metadata_json?.type === 'saved-item') {
                    const metadata = message.metadata_json || {};
                    const savedEntity = metadata.entity || {};
                    const entityType = (metadata.entityType || 'note') as
                      | 'habit'
                      | 'todo'
                      | 'note'
                      | 'person';

                    return (
                      <SavedItemCard
                        key={message.id}
                        itemType={entityType}
                        title={
                          metadata.title || savedEntity.title || savedEntity.name || 'Untitled'
                        }
                        subtitle={metadata.subtitle}
                        onPress={() => {
                          // Open unified overlay with full entity data
                          if (savedEntity.id) {
                            overlayController.openEdit({
                              record: { ...savedEntity, type: entityType } as any,
                              spaceId: spaceId ?? undefined,
                            });
                          }
                        }}
                      />
                    );
                  }

                  // Phase 11.3/11.5: Skip action confirmations - they're rendered outside ScrollView
                  // CRITICAL FIX: Check for system role with type 'action-confirmation' in metadata
                  if (
                    message.role === 'system' &&
                    message.metadata_json?.type === 'action-confirmation'
                  ) {
                    // Don't render inside ScrollView - will be rendered as overlay below
                    return null;
                  }

                  // Space Chat: Get save button state for this message
                  const saveButtonState =
                    message.role === 'assistant'
                      ? spaceChatEnhanced.getButtonStateForMessage(message.id)
                      : null;
                  const showSaveButton = saveButtonState?.isVisible ?? false;
                  const isSaving = saveButtonState?.isSaving ?? false;
                  const saveableResult = saveButtonState?.result ?? null;

                  // Wrap assistant messages with MessageWithSave for save button support
                  const messageBubble = (
                    <View
                      key={message.id}
                      style={[
                        styles.messageContainer,
                        highlightedMessageId === message.id && styles.highlightedMessage,
                      ]}
                    >
                      <ChatBubble message={message} testID={`chat-bubble-${message.id}`} />
                    </View>
                  );

                  // For assistant messages with save button, wrap with MessageWithSave
                  if (message.role === 'assistant' && (showSaveButton || saveableResult)) {
                    return (
                      <MessageWithSave
                        key={message.id}
                        messageId={message.id}
                        saveableResult={saveableResult}
                        showSaveButton={showSaveButton}
                        isSaving={isSaving}
                        onSave={(result) => {
                          spaceChatEnhanced.startSaving();
                          // Open save overlay with prefilled data
                          // AI-generated prefill takes priority, fallback to extracted content
                          const prefill = result.prefill || {};
                          const kind = saveableTypeToOverlayKind(result.suggestedType);
                          // Notes/Logs: full assistant response; Todos/Habits: AI-summarized content
                          const note = kind === 'note' ? message.content : prefill.content || '';
                          openUnifiedFromChat(
                            kind,
                            {
                              // AI title first, fallback to smartTitle extraction
                              title: prefill.title || smartTitle(message.content),
                              // Notes: full response; Todos/Habits: AI summary (or empty)
                              note,
                              // Pass tags from AI, or empty array to avoid stale tags
                              tags: prefill.tags || [],
                              // Habit-specific fields
                              frequency: prefill.frequency ?? undefined,
                              frequencyValue: prefill.frequencyValue,
                              // Todo-specific fields
                              dueDate: prefill.dueDate ?? undefined,
                              // Enable preview mode for logs
                              fromChat: true,
                            },
                            {
                              lane: 'space_chat',
                              spaceId: spaceId || null,
                              messageId: message.id,
                            },
                            overlayController,
                          );
                          // Track save completion
                          spaceChatEnhanced.finishSaving();
                          spaceChatEnhanced.markSaveTapped();
                        }}
                        onDismiss={() => {
                          spaceChatEnhanced.dismissSaveButton();
                          spaceChatEnhanced.markSaveDismissed();
                        }}
                      >
                        {messageBubble}
                      </MessageWithSave>
                    );
                  }

                  return messageBubble;
                })}

                {/* Typing indicator - Phase 10.6 */}
                {mascot.state === 'thinking' && (
                  <View style={styles.typingContainer}>
                    <ChatThinkingIndicator visible variant="both" />
                  </View>
                )}
              </>
            )}
          </ScrollView>

          {/* Persistent Action Bar removed */}

          {/* Chat Composer */}
          <ChatComposer onSend={handleSendDebounced} disabled={sending} testID="chat-composer" />

          {/* Phase 11.7: Calm Action Bar with centered + button */}
          <ChatActionBar
            onAddPress={() => {
              overlayController.openCreate({ spaceId: spaceId ?? undefined });
            }}
            lastCreatedItem={null}
          />

          {ActionToast}
        </KeyboardAvoidingView>

        {/* Unified Create Overlay for Chat Conversions */}
        {overlayController.state.visible &&
          (overlayController.state.mode === 'create' ||
            overlayController.state.mode === 'edit') && (
            <UnifiedCreateOverlay
              visible={overlayController.state.visible}
              mode={overlayController.state.mode}
              initialEntity={overlayController.state.initialEntity}
              initialSpaceId={overlayController.state.initialSpaceId}
              conversionMeta={overlayController.state.conversionMeta}
              onClose={overlayController.close}
              onSaved={async (result) => {
                if (__DEV__) {
                  console.log('[ChatThreadScreen] onSaved called', {
                    resultId: result?.id,
                    resultType: result?.type,
                    resultSpaceId: (result as any)?.space_id,
                    spaceId,
                  });
                }
                // Get the full record for tap-to-edit
                const record = await repo.getById(result.id);

                // NOTE: Toast removed - SavedItemCard is now added via entity:created event listener
                // This provides inline chat feedback instead of floating toast

                // Remove the action confirmation toast after successful creation
                const actionConfirmation = messages.find(
                  (msg) => msg.metadata_json?.type === 'action-confirmation',
                );
                if (actionConfirmation) {
                  console.log(
                    '[Toast] Removing action confirmation after save:',
                    actionConfirmation.id,
                  );
                  removeMessage(actionConfirmation.id);
                }

                // Phase 11.6: Add entry card to chat thread
                try {
                  // Fetch the created record
                  const record = await repo.getById(result.id);

                  if (
                    record &&
                    (result.type === 'note' || result.type === 'todo' || result.type === 'habit')
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
                    if (result.type === 'habit') {
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
                          await appendAssistantMessage(
                            getContinuationMessage('habit', habitRecord.name),
                          );
                          console.log('[Chat] Follow-up message added after habit creation');
                        } catch (err) {
                          console.error('[Chat] Failed to add follow-up message:', err);
                        }
                      }, 1500);
                    } else if (result.type === 'todo') {
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
                    } else if (result.type === 'note') {
                      const noteRecord = record as any;
                      await appendAssistantMessage('', {
                        type: 'note-locked',
                        noteContent: noteRecord.content || noteRecord.title || 'Note',
                        noteId: record.id,
                        locked: true,
                        itemType: 'note',
                      });

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
              }}
            />
          )}

        {/* Message Search Modal */}
        <MessageSearch
          visible={searchVisible}
          onClose={() => setSearchVisible(false)}
          onSelectMessage={(messageId) => {
            // Find message index and scroll to it
            const index = messages.findIndex((m) => m.id === messageId);
            if (index >= 0) {
              // Highlight the message briefly
              setHighlightedMessageId(messageId);
              setTimeout(() => setHighlightedMessageId(null), 2000);

              // Scroll to show the message
              scrollViewRef.current?.scrollTo({
                y: index * 100, // Approximate message height
                animated: true,
              });
            }
          }}
        />
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTokens.spacing[2],
  },
  searchButton: {
    padding: lightTokens.spacing[2],
  },
  headerTitle: {
    fontSize: lightTokens.typography.size.lg,
    fontWeight: '600',
    color: lightTokens.colors.charcoalInk,
  },
  backButton: {
    paddingVertical: lightTokens.spacing[2],
    paddingHorizontal: lightTokens.spacing[2],
    marginRight: lightTokens.spacing[3],
  },
  backButtonText: {
    fontSize: lightTokens.typography.size.md,
    color: lightTokens.colors.mossGreen,
    fontWeight: '500',
  },
  messages: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  messagesContent: {
    padding: lightTokens.spacing[4],
    paddingBottom: lightTokens.spacing[6],
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
  highlightedMessage: {
    backgroundColor: 'rgba(46, 85, 64, 0.1)', // Moss green with transparency
    borderRadius: 8,
    padding: 8,
    marginHorizontal: -8,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: lightTokens.colors.linenCream,
  },
  lockedHabit: {
    backgroundColor: '#E8F5E9', // Light green background
    borderLeftWidth: 4,
    borderLeftColor: '#2E5540', // Moss Green
    padding: 12,
    marginVertical: 8,
    marginHorizontal: 16,
    borderRadius: 8,
  },
  lockedTodo: {
    backgroundColor: '#E3F2FD', // Light blue background
    borderLeftWidth: 4,
    borderLeftColor: '#1976D2', // Blue
    padding: 12,
    marginVertical: 8,
    marginHorizontal: 16,
    borderRadius: 8,
  },
  lockedNote: {
    backgroundColor: '#FFF9E6', // Light yellow background
    borderLeftWidth: 4,
    borderLeftColor: '#F9A825', // Amber
    padding: 12,
    marginVertical: 8,
    marginHorizontal: 16,
    borderRadius: 8,
  },
  lockedPerson: {
    backgroundColor: '#F3E5F5', // Light purple background
    borderLeftWidth: 4,
    borderLeftColor: '#7B1FA2', // Purple
    padding: 12,
    marginVertical: 8,
    marginHorizontal: 16,
    borderRadius: 8,
  },
  lockedContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lockIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  lockedTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2E5540', // Moss Green
  },
  lockedSubtext: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
});
