/**
 * ChatThreadScreen - Phase 10.5 Space Chats v1
 * Now integrated with message persistence + new UI components
 */

import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { SupabaseSpaceChatRepo } from '../../lib/repo/supabase';
import { MemorySpaceChatRepo } from '../../lib/repo/memory';
import type { SpaceChat } from '../../lib/types';
import { lightTokens } from '../../design/tokens';
import { useAuth } from '../../providers/AuthProvider';
import { useRepo } from '../../providers/RepoProvider';
import { cortexDecide } from '../../lib/cortex/cortexDecide';
import type { CortexContext, CortexAction } from '../../lib/cortex/cortexDecide';
import { explainAddedToList, explainCreated, explainFiledToSpace } from '../../lib/cortex/explain';
import { ConfirmationPill } from '../../components/common/ConfirmationPill';
import { Placeholder } from '../../components/common/Placeholder';
import { useChatMessages } from '../../hooks/useChatMessages';
import { ChatBubble } from '../../components/chat/ChatBubble';
import { ChatComposer } from '../../components/chat/ChatComposer';
import { MiniActionBar } from '../../components/chat/MiniActionBar';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatThread'>;

export default function ChatThreadScreen({ route }: Props) {
  const { spaceId, chatId } = route.params;
  const { userId } = useAuth();
  const repo = useRepo();

  const [chat, setChat] = useState<SpaceChat | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [confirmations, setConfirmations] = useState<{ messageId: string; texts: string[] }[]>([]);

  // Use new chat messages hook
  const {
    messages,
    loading: messagesLoading,
    error: messagesError,
    sendUserMessage,
    appendAssistantMessage,
  } = useChatMessages(chatId);

  // Create SpaceChatRepo instance (unused but kept for potential future use)
  const spaceChatRepo = React.useMemo(() => {
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
        space_id: 'unknown',
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
  }, [chatId, userId]);

  useEffect(() => {
    loadChat();
  }, [loadChat]);

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim() || !chat) return;

      const currentUserId = userId || 'anonymous';

      try {
        setSending(true);

        // 1. Send user message via hook
        await sendUserMessage(text);

        // 2. Process with Cortex in parallel (Phase 10.3)
        try {
          const ctx: CortexContext = {
            userId: currentUserId,
            activeSpaceId: chat.space_id || null,
            uiSurface: 'chat',
          };

          const response = await cortexDecide({ text }, ctx);

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
            }
          }

          // Add AI response message when appropriate
          if (response.mode === 'ask' && response.suggestions && response.suggestions.length > 0) {
            const assistantText = `I'm not quite sure. Here are some ideas: ${response.suggestions.join(', ')}`;
            await appendAssistantMessage(assistantText);
          }
        } catch (cortexError) {
          // Cortex failed - fail safe, don't show error to user
          console.error('[ChatThread] Cortex decision failed:', cortexError);
        }

        console.log('[Analytics] space_chat_message_sent', { chatId });
      } catch (error) {
        console.error('Failed to send message:', error);
        Alert.alert('Error', 'Failed to send message');
      } finally {
        setSending(false);
      }
    },
    [chat, chatId, repo, userId, sendUserMessage, appendAssistantMessage, messages],
  );

  const handleMiniAction = useCallback((action: string) => {
    // Placeholder for mini action bar buttons - no logic yet as per brief
    console.log('[ChatThread] Mini action:', action);
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
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
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
            messages.map((message) => {
              const messageConfirmations = confirmations.find((c) => c.messageId === message.id);
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
            })
          )}
        </ScrollView>

        {/* Chat Composer */}
        <ChatComposer onSend={handleSend} disabled={sending} testID="chat-composer" />

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
    </SafeAreaView>
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
  messages: {
    flex: 1,
  },
  messagesContent: {
    padding: lightTokens.spacing[4],
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
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: lightTokens.colors.bg,
  },
});
