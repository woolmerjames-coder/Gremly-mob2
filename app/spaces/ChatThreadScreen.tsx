/**
 * ChatThreadScreen - Phase 10.5 Space Chats v1
 * Phase 10.7D: Added debounce, spaceId validation, note prefill fixes
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
  ToastAndroid,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { SupabaseSpaceChatRepo } from '../../lib/repo/supabase';
import { MemorySpaceChatRepo } from '../../lib/repo/memory';
import type { SpaceChat } from '../../lib/types';
import { lightTokens } from '../../design/tokens';
import { useAuth } from '../../providers/AuthProvider';
import { useRepo } from '../../providers/RepoProvider';
import { cortexRoute } from '../../lib/cortex/router';
import type { CortexContext, CortexAction } from '../../lib/cortex/cortexDecide';
import type { DetectedIntent } from '../../lib/cortex/intents/types';
import { explainAddedToList, explainCreated, explainFiledToSpace } from '../../lib/cortex/explain';
import { getEnv } from '../../lib/env';
import { ConfirmationPill } from '../../components/common/ConfirmationPill';
import { Placeholder } from '../../components/common/Placeholder';
import { useChatMessages } from '../../hooks/useChatMessages';
import { ChatBubble } from '../../components/chat/ChatBubble';
import { ChatComposer } from '../../components/chat/ChatComposer';
import { MiniActionBar } from '../../components/chat/MiniActionBar';

// Phase 10.6: New mascot system
import { MascotProvider } from '../features/mascot/useMascot';
import { Mascot } from '../features/mascot/Mascot';
import { emitChatEvent } from '../lib/chat/events';

// Legacy mascot imports (to be removed)
import { useMascotController } from '../../hooks/useMascotController';
import { shouldShowMascot, shouldUseHaptics } from '../../config/featureFlags';
import { openUnifiedFromChat } from './chat/openUnifiedFromChat';
import type { OverlayKind } from './chat/openUnifiedFromChat';
import { Chip } from '../../ui/Chip';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import { UnifiedCreateOverlay } from '../../components/overlay/UnifiedCreateOverlay';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatThread'>;

// Phase 10.7B: Type guards for safe meta access
function metaHasDetectedIntent(meta: any): meta is { detectedIntent: unknown } {
  return !!meta && typeof meta === 'object' && 'detectedIntent' in meta;
}

function metaKindAsAssistantKind(kind: any): 'classification' | 'smalltalk' | 'decision' | null {
  if (kind === 'classification' || kind === 'smalltalk' || kind === 'decision') return kind;
  return null;
}

export default function ChatThreadScreen({ route }: Props) {
  const { spaceId, chatId } = route.params;
  const auth = useAuth();
  const { userId } = auth;
  const repo = useRepo();

  const [chat, setChat] = useState<SpaceChat | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [confirmations, setConfirmations] = useState<{ messageId: string; texts: string[] }[]>([]);
  const [activeSuggestions, setActiveSuggestions] = useState<string[]>([]);
  const [detectedIntent, setDetectedIntent] = useState<DetectedIntent | null>(null);
  const [lastUserMessage, setLastUserMessage] = useState<string>('');

  // Auto-fade suggestions after 3 seconds
  const suggestionFadeTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Phase 10.7D: Debounce timer ref
  const sendDebounceTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Track last assistant response for conversion metadata and anti-spam logic
  const lastAssistantResponseRef = React.useRef<{
    explanation?: string | null;
    replyText?: string | null;
    kind?: 'smalltalk' | 'decision' | 'classification' | null;
  }>({});

  // Mascot controller for Phase 10.6
  const mascot = useMascotController();

  // Overlay controller for conversion
  const overlayController = useUnifiedOverlayController();

  // Use new chat messages hook
  const {
    messages,
    loading: messagesLoading,
    error: messagesError,
    sendUserMessage,
    appendAssistantMessage,
  } = useChatMessages(chatId);

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

  // Cleanup suggestion fade timer on unmount
  useEffect(() => {
    return () => {
      if (suggestionFadeTimerRef.current) {
        clearTimeout(suggestionFadeTimerRef.current);
      }
    };
  }, []);

  // Debug: Log when activeSuggestions changes
  useEffect(() => {
    if (activeSuggestions.length > 0) {
      console.log('[Chips] activeSuggestions updated:', activeSuggestions);
      console.log('[Chips] detectedIntent:', detectedIntent);
    } else {
      console.log('[Chips] activeSuggestions cleared');
    }
  }, [activeSuggestions, detectedIntent]);

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim() || !chat) return;

      // Phase 10.7D: Validate spaceId
      if (!spaceId) {
        console.error('[ChatThread][10.7D] Missing spaceId');
        Alert.alert('Error', 'Invalid space context');
        return;
      }

      const currentUserId = userId || 'anonymous';

      try {
        setSending(true);

        // Clear active suggestions when user sends a new message
        setActiveSuggestions([]);
        setDetectedIntent(null);
        setLastUserMessage(text);

        // Clear any existing fade timer
        if (suggestionFadeTimerRef.current) {
          clearTimeout(suggestionFadeTimerRef.current);
          suggestionFadeTimerRef.current = null;
        }

        // Phase 10.6: Trigger haptic feedback for send action
        if (shouldUseHaptics()) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }

        // 1. Send user message via hook
        await sendUserMessage(text);

        // Phase 10.6: Emit user message sent event
        emitChatEvent({
          type: 'user_message_sent',
          payload: { text, spaceId: chat.space_id || undefined },
        });

        // Phase 10.6: Start thinking animation
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

          const ctx: CortexContext = {
            lane: 'space_chat',
            userId: currentUserId,
            activeSpaceId: chat.space_id || null,
            uiSurface: 'chat',
            spaceId: chat.space_id || null,
            recentAssistantKind: lastAssistantResponseRef.current?.kind ?? null,
          };

          // Dev-only lane logging
          if (process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
            console.log(
              '[CORTEX] lane=%s space=%s msg=%s',
              ctx.lane,
              ctx.spaceId ?? '-',
              ctx.messageId ?? '-',
            );
          }

          // Phase 10.6: Emit request started event
          emitChatEvent({
            type: 'request_started',
            payload: { requestId: Date.now().toString(), lane: 'space_chat' },
          });

          // Log spaceId before cortex call
          console.log('[Chat] spaceId:', ctx.spaceId);

          const response = await cortexRoute({ text }, ctx);

          // Log event (non-blocking)
          repo
            .writeEvent(
              'cortex_decision',
              {
                source: 'chat',
                text,
                actions: response.actions,
                confidence: response.confidence,
                mode: response.mode,
                spaceId: chat.space_id,
              },
              { userId: currentUserId },
            )
            .catch((err) => console.error('[ChatThread] Failed to log event:', err));

          if (response.mode === 'auto' && response.actions.length > 0) {
            // Execute actions in parallel
            const confirmationTexts: string[] = [];

            await Promise.all(
              response.actions.map(async (action: CortexAction) => {
                try {
                  if (action.type === 'add.to.list') {
                    const list = await repo.getOrCreateList(action.payload.listKey, {
                      userId: currentUserId,
                      spaceId: chat.space_id || null,
                    });
                    await repo.addListItem(list.id, action.payload.item);
                    confirmationTexts.push(explainAddedToList(list.name, 'warm'));
                  } else if (action.type === 'create.todo') {
                    await repo.create({
                      type: 'todo',
                      name: action.payload.title,
                      title: action.payload.title,
                      due_date: action.payload.due ?? null,
                      undefined_due: !action.payload.due,
                      space_id: chat.space_id || null,
                      ai_placed: true,
                      why_string: response.explanation,
                      origin: 'catchall',
                    });
                    confirmationTexts.push(explainCreated('todo', 'warm'));
                  } else if (action.type === 'create.habit') {
                    await repo.create({
                      type: 'habit',
                      name: action.payload.name,
                      frequency:
                        (action.payload.freq === 'custom' ? 'daily' : action.payload.freq) ||
                        'daily',
                      subtype: 'start_habit',
                      space_id: chat.space_id || null,
                      ai_placed: true,
                      why_string: response.explanation,
                      origin: 'catchall',
                    });
                    confirmationTexts.push(explainCreated('habit', 'warm'));
                  } else if (action.type === 'create.note') {
                    await repo.create({
                      type: 'note',
                      title: action.payload.text || text,
                      body: action.payload.text,
                      subtype:
                        (action.payload.subtype as
                          | 'journal'
                          | 'list'
                          | 'catchall'
                          | 'idea'
                          | 'reference') || 'catchall',
                      space_id: chat.space_id || null,
                      ai_placed: true,
                      why_string: response.explanation,
                      origin: 'catchall',
                    });
                    confirmationTexts.push(explainCreated('note', 'warm'));
                  } else if (action.type === 'file.to.space' && action.payload.spaceId) {
                    const spaces = await repo.listSpaces();
                    const space = spaces.find((s) => s.id === action.payload.spaceId);
                    if (space) {
                      confirmationTexts.push(explainFiledToSpace(space.name, 'warm'));
                    }
                  }
                } catch (err) {
                  console.error('[ChatThread] Failed to execute action:', action, err);
                }
              }),
            );

            // Show confirmations for the latest message
            if (confirmationTexts.length > 0 && messages.length > 0) {
              const latestMessage = messages[messages.length - 1];
              setConfirmations((prev) => [
                ...prev.filter((c) => c.messageId !== latestMessage.id),
                { messageId: latestMessage.id, texts: confirmationTexts },
              ]);

              // Phase 10.6: Celebration state when actions are successfully executed
              mascot.celebrate();
            }
          }

          // Phase 10.6: Determine mascot state based on cortex response
          let shouldTriggerPlayful = false;

          // Check if this is chit-chat/conversational content
          if (response.mode === 'keep' && response.actions.length === 0) {
            // Simple heuristic for chit-chat detection
            const chitChatPatterns =
              /\b(hello|hi|hey|thanks|thank you|how are you|what's up|good morning|good afternoon|good evening)\b/i;
            if (chitChatPatterns.test(text.toLowerCase())) {
              shouldTriggerPlayful = true;
            }
          }

          // Add AI response message for all cortex responses (explanation or replyText)
          const assistantText = response.explanation?.trim() || response.replyText?.trim();
          if (assistantText) {
            // Phase 10.7: Handle intent-based suggestions
            if (
              response.mode === 'ask' &&
              response.suggestions &&
              response.suggestions.length > 0
            ) {
              setActiveSuggestions(response.suggestions);

              // Store detected intent from meta if available
              if (
                response.meta &&
                'detectedIntent' in response.meta &&
                response.meta.detectedIntent
              ) {
                setDetectedIntent(response.meta.detectedIntent as DetectedIntent);
                const detectedIntentObj = response.meta.detectedIntent as DetectedIntent;
                console.log(
                  '[Chips] render for messageId=',
                  messages[messages.length - 1]?.id || 'unknown',
                  'kind=',
                  detectedIntentObj.kind,
                  'confidence=',
                  detectedIntentObj.confidence.toFixed(2),
                );
              }

              // Phase 10.7B: Auto-fade suggestions after 6 seconds
              if (suggestionFadeTimerRef.current) {
                clearTimeout(suggestionFadeTimerRef.current);
              }
              suggestionFadeTimerRef.current = setTimeout(() => {
                console.log('[Chips] auto-fade triggered');
                setActiveSuggestions([]);
                setDetectedIntent(null);
              }, 6000);
            } else {
              setActiveSuggestions([]);
              setDetectedIntent(null);
            }

            await appendAssistantMessage(assistantText);

            // Phase 10.8: Maybe refresh Space Insight summary (background, fire-and-forget)
            if (getEnv('EXPO_PUBLIC_SPACE_SUMMARY_BG') === 'on' && spaceId) {
              import('../../lib/cortex/summarize')
                .then(({ maybeRefreshSummary }) => {
                  // Convert messages to ChatTurn format
                  const turns = messages.map((m) => ({
                    role: m.role as 'user' | 'assistant',
                    text: m.content,
                  }));

                  // Get the last message ID (the assistant message we just sent)
                  const lastMsg = messages[messages.length - 1];

                  maybeRefreshSummary(spaceId, turns, lastMsg?.id).catch((err) => {
                    if (__DEV__) {
                      console.error('[ChatThread][10.8] Summary refresh failed:', err);
                    }
                  });
                })
                .catch((err) => {
                  if (__DEV__) {
                    console.error('[ChatThread][10.8] Failed to load summarize module:', err);
                  }
                });
            }

            // Phase 10.6: Emit response final event with intent detection flag
            const hasIntent =
              response.meta &&
              'detectedIntent' in response.meta &&
              response.meta.detectedIntent &&
              (response.meta.detectedIntent as DetectedIntent).kind !== 'none' &&
              (response.meta.detectedIntent as DetectedIntent).confidence >= 0.75;

            emitChatEvent({
              type: 'response_final',
              payload: {
                requestId: Date.now().toString(),
                assistantKind: response.meta?.kind,
                hasActions: response.actions && response.actions.length > 0,
                hasSuggestions: response.suggestions && response.suggestions.length > 0,
                intentDetected: hasIntent,
              },
            });

            // Track assistant response for conversion metadata and anti-spam logic
            lastAssistantResponseRef.current = {
              explanation: response.explanation,
              replyText: response.replyText,
              kind:
                (response.meta?.kind as
                  | 'smalltalk'
                  | 'decision'
                  | 'classification'
                  | null
                  | undefined) ?? null,
            };

            // Phase 10.6: Trigger appropriate mascot state after assistant message
            if (shouldTriggerPlayful) {
              mascot.playful();
            } else {
              mascot.replying();
            }
          }
        } catch (cortexError: any) {
          // Enhanced cortex error handling with detailed logging
          console.error('[ChatThread] Cortex decision failed:', {
            error: cortexError,
            userId: currentUserId,
            spaceId: chat.space_id,
            text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
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
    [chat, chatId, repo, userId, sendUserMessage, appendAssistantMessage, messages, mascot],
  );

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

  // Convert from chip handler
  const convertFromChip = useCallback(
    (kind: OverlayKind) => {
      // Phase 10.7: Use detected intent title if available, otherwise use last user message
      const titleFromIntent = detectedIntent?.title;
      const titleFromMessage = messages.find((m, index) => {
        // Find the last user message
        return (
          (m.role === 'user' && index === messages.length - 1) ||
          (index < messages.length - 1 && messages[index + 1]?.role === 'assistant')
        );
      })?.content;

      const lastUser = messages.find((m, index) => {
        // Find the last user message
        return (
          (m.role === 'user' && index === messages.length - 1) ||
          (index < messages.length - 1 && messages[index + 1]?.role === 'assistant')
        );
      });

      if (!lastUser) return;

      const lastUserText = lastUser.content || '';

      // Phase 10.7D: For notes, put text in body, not title
      const initial =
        kind === 'note'
          ? {
              title: '',
              note: lastUserText.trim(),
            }
          : { title: (titleFromIntent || lastUserText).trim() };

      const whyFromIntent = detectedIntent?.why;

      if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
        console.log('[ChatThread][10.7D] Opening overlay:', {
          kind,
          hasTitle: !!(initial as any).title,
          hasBody: !!(initial as any).note,
          prefill: initial,
        });
      }

      openUnifiedFromChat(
        kind,
        initial,
        {
          lane: 'space_chat',
          spaceId: spaceId ?? null,
          messageId: lastUser.id ?? null,
          whyString: whyFromIntent || (lastAssistantResponseRef.current?.explanation ?? null),
        },
        overlayController,
      );
    },
    [messages, spaceId, overlayController, detectedIntent],
  );

  // Map suggestion text to overlay kind
  const getSuggestionKind = useCallback((suggestion: string): OverlayKind | null => {
    const lower = suggestion.toLowerCase();
    if (lower.includes('todo') || lower.includes('task') || lower.includes('do')) return 'todo';
    if (lower.includes('note') || lower.includes('remember') || lower.includes('write'))
      return 'note';
    if (lower.includes('habit') || lower.includes('routine') || lower.includes('daily'))
      return 'habit';
    if (lower.includes('reflect') || lower.includes('think') || lower.includes('journal'))
      return 'reflection';

    // Default fallback for generic suggestions
    return 'todo';
  }, []);

  const handleSuggestionPress = useCallback(
    (suggestion: string) => {
      // Phase 10.7: Use detected intent if available, otherwise parse suggestion text
      let kind: OverlayKind | null = null;

      if (detectedIntent && detectedIntent.kind !== 'none' && detectedIntent.kind !== 'question') {
        // Use intent kind directly
        kind = detectedIntent.kind as OverlayKind;
      } else {
        // Fall back to parsing suggestion text
        kind = getSuggestionKind(suggestion);
      }

      if (kind) {
        convertFromChip(kind);
        // Clear suggestions after conversion
        setActiveSuggestions([]);
        setDetectedIntent(null);
        if (suggestionFadeTimerRef.current) {
          clearTimeout(suggestionFadeTimerRef.current);
          suggestionFadeTimerRef.current = null;
        }
      }
    },
    [detectedIntent, getSuggestionKind, convertFromChip],
  );

  const handleMiniAction = useCallback(
    (action: string) => {
      // Map mini action icons to overlay kinds
      const actionMap: Record<string, OverlayKind> = {
        brain: 'reflection',
        check: 'todo',
        file: 'note',
        flame: 'habit',
        pen: 'note', // alternate mapping for pen
      };

      const kind = actionMap[action];
      if (kind) {
        convertFromChip(kind);
      } else {
        console.log('[ChatThread] Unknown mini action:', action);
      }
    },
    [convertFromChip],
  );

  // Helper to show success toast cross-platform with chat-specific messaging
  const showChatConversionToast = useCallback((message: string) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    } else {
      // TODO: Implement custom toast with Golden Pear color (#E0C47A)
      Alert.alert('✅ Success', message);
    }
  }, []);

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
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          {/* Header with Mascot - Phase 10.6 */}
          {shouldShowMascot() && (
            <View style={styles.header}>
              <View style={styles.headerContent}>
                <Text style={styles.headerTitle}>Chat with Gremly</Text>
                <Mascot size="md" />
              </View>
            </View>
          )}

          {/* Messages ScrollView */}
          <ScrollView style={styles.messages} contentContainerStyle={styles.messagesContent}>
            {messages.length === 0 ? (
              <View style={styles.placeholder}>
                <Text style={styles.placeholderIcon}>💬</Text>
                <Text style={styles.placeholderTitle}>Start a conversation</Text>
                <Text style={styles.placeholderText}>
                  This is a chat thread with Gremly. Type a message below to get started.
                </Text>
              </View>
            ) : (
              <>
                {messages.map((message) => {
                  const messageConfirmations = confirmations.find(
                    (c) => c.messageId === message.id,
                  );
                  return (
                    <View key={message.id} style={styles.messageContainer}>
                      <ChatBubble message={message} testID={`chat-bubble-${message.id}`} />
                      {messageConfirmations && messageConfirmations.texts.length > 0 && (
                        <View style={styles.confirmationsContainer}>
                          {messageConfirmations.texts.map((confirmation, idx) => (
                            <ConfirmationPill
                              key={idx}
                              text={confirmation}
                              testID={`chat-confirmation-${message.id}-${idx}`}
                            />
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}

                {/* Suggestion chips for ask mode responses */}
                {/* Phase 10.7B: Max 1 chip */}
                {activeSuggestions.length > 0 && (
                  <View style={styles.suggestionsContainer}>
                    <Text style={styles.suggestionsLabel}>You could also:</Text>
                    <View style={styles.suggestionChips}>
                      {activeSuggestions.slice(0, 1).map((suggestion, index) => {
                        console.log('[Chips] Rendering chip:', suggestion, 'index:', index);
                        return (
                          <Chip
                            key={index}
                            label={suggestion}
                            onPress={() => handleSuggestionPress(suggestion)}
                            testID={`suggestion-chip-${index}`}
                          />
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Typing indicator - Phase 10.6 */}
                {mascot.state === 'thinking' && (
                  <View style={styles.typingContainer}>
                    {/* TODO: Add TypingDots when ready */}
                  </View>
                )}
              </>
            )}
          </ScrollView>

          {/* Chat Composer */}
          <ChatComposer onSend={handleSendDebounced} disabled={sending} testID="chat-composer" />

          {/* Mini Action Bar */}
          <MiniActionBar
            onBrainPress={() => handleMiniAction('brain')}
            onCheckPress={() => handleMiniAction('check')}
            onFilePress={() => handleMiniAction('file')}
            onFlamePress={() => handleMiniAction('flame')}
            onPenPress={() => handleMiniAction('pen')}
            testID="mini-action-bar"
          />
        </KeyboardAvoidingView>

        {/* Unified Create Overlay for Chat Conversions */}
        <UnifiedCreateOverlay
          visible={overlayController.state.visible}
          mode={overlayController.state.mode}
          initialEntity={overlayController.state.initialEntity}
          initialSpaceId={overlayController.state.initialSpaceId}
          conversionMeta={overlayController.state.conversionMeta}
          onClose={overlayController.close}
          onSaved={(result) => {
            // Success toast with chat-specific messaging
            const itemType =
              result.type === 'note'
                ? 'Note'
                : result.type === 'todo'
                  ? 'To-Do'
                  : result.type === 'habit'
                    ? 'Habit'
                    : 'Item';
            showChatConversionToast(`${itemType} created from chat ✨`);
          }}
        />
      </SafeAreaView>
    </MascotProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightTokens.colors.bg,
  },
  flex: {
    flex: 1,
  },
  header: {
    backgroundColor: lightTokens.colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: lightTokens.colors.border,
    paddingHorizontal: lightTokens.spacing[4],
    paddingVertical: lightTokens.spacing[3],
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: lightTokens.typography.size.lg,
    fontWeight: '600',
    color: lightTokens.colors.text,
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    padding: lightTokens.spacing[4],
  },
  typingContainer: {
    alignSelf: 'flex-start',
    marginTop: lightTokens.spacing[2],
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: lightTokens.spacing[7],
  },
  placeholderIcon: {
    fontSize: 48,
    marginBottom: lightTokens.spacing[3],
  },
  placeholderTitle: {
    fontSize: lightTokens.typography.size.xl,
    fontWeight: '600',
    color: lightTokens.colors.text,
    marginBottom: lightTokens.spacing[2],
  },
  placeholderText: {
    fontSize: lightTokens.typography.size.md,
    color: lightTokens.colors.subtle,
    textAlign: 'center',
    maxWidth: 300,
  },
  messageContainer: {
    marginBottom: lightTokens.spacing[3],
  },
  confirmationsContainer: {
    marginTop: lightTokens.spacing[2],
    alignSelf: 'flex-end',
    maxWidth: '80%',
  },
  suggestionsContainer: {
    marginTop: lightTokens.spacing[3],
    alignSelf: 'flex-start',
    maxWidth: '90%',
  },
  suggestionsLabel: {
    fontSize: lightTokens.typography.size.sm,
    color: lightTokens.colors.subtle,
    marginBottom: lightTokens.spacing[2],
  },
  suggestionChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: lightTokens.spacing[2],
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: lightTokens.colors.bg,
  },
});
