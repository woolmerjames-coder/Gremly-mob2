/**
 * ChatThreadScreen - Simple chat thread view
 * Phase 8 Spaces v2 UI
 * Phase 10.3: Wired to Cortex SDK for AI-powered decisions
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
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

type Props = NativeStackScreenProps<RootStackParamList, 'ChatThread'>;

export default function ChatThreadScreen({ route, navigation }: Props) {
  const { chatId } = route.params;
  const { userId } = useAuth();
  const repo = useRepo();

  const [chat, setChat] = useState<SpaceChat | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<
    Array<{ text: string; isUser: boolean; confirmations?: string[] }>
  >([]);

  // Create SpaceChatRepo instance
  const spaceChatRepo = React.useMemo(() => {
    const backend = process.env.EXPO_PUBLIC_REPO_BACKEND || 'memory';
    return backend === 'supabase'
      ? new SupabaseSpaceChatRepo(userId || undefined)
      : new MemorySpaceChatRepo(userId || 'anonymous');
  }, [userId]);

  // Load chat
  const loadChat = useCallback(async () => {
    try {
      // For now, we'll fetch from the space's chat list
      // In a full implementation, you'd have a getChatById method
      // For now, we'll just show a placeholder
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

  const handleSend = useCallback(async () => {
    if (!message.trim() || !chat) return;

    const userText = message.trim();
    const currentUserId = userId || 'anonymous';

    try {
      setSending(true);

      // 1. Immediately show user message
      const userMessage = { text: userText, isUser: true };
      setMessages((prev) => [...prev, userMessage]);
      setMessage('');

      // 2. Update chat with snippet
      const snippet = userText.slice(0, 100);
      await spaceChatRepo.update(chatId, {
        last_message_snippet: snippet,
      });

      // 3. Process with Cortex in parallel (Phase 10.3)
      // In a full implementation, LLM streaming would happen here
      // For now, we'll just handle Cortex decisions
      try {
        const ctx: CortexContext = {
          userId: currentUserId,
          activeSpaceId: chat.space_id || null,
          uiSurface: 'chat',
        };

        const response = await cortexDecide({ text: userText }, ctx);

        // Log event (non-blocking)
        repo
          .writeEvent(
            'cortex_decision',
            {
              source: 'chat',
              text: userText,
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
                      (action.payload.freq === 'custom' ? 'daily' : action.payload.freq) || 'daily',
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
                    title: action.payload.text || userText,
                    body: action.payload.text,
                    subtype: (action.payload.subtype as any) || 'note',
                    space_id: chat.space_id || null,
                    ai_placed: true,
                    why_string: response.explanation,
                    origin: 'catchall',
                  });
                  confirmationTexts.push(explainCreated('note', 'warm'));
                } else if (action.type === 'file.to.space' && action.payload.spaceId) {
                  // File to space action - would need itemId in real implementation
                  // For now, just show confirmation
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

          // Add confirmations to the last user message
          if (confirmationTexts.length > 0) {
            setMessages((prev) => {
              const updated = [...prev];
              const lastMsg = updated[updated.length - 1];
              if (lastMsg && lastMsg.isUser) {
                lastMsg.confirmations = confirmationTexts;
              }
              return updated;
            });
          }
        }

        // TODO: Add AI response message when LLM streaming is implemented
        // For now, just show a placeholder if there were suggestions
        if (response.mode === 'ask' && response.suggestions) {
          if (response.suggestions.length > 0) {
            setMessages((prev) => [
              ...prev,
              {
                text: `I'm not quite sure. Here are some ideas: ${response.suggestions?.join(', ') || ''}`,
                isUser: false,
              },
            ]);
          }
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
  }, [message, chat, chatId, spaceChatRepo, repo, userId]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={lightTokens.colors.primary} />
      </View>
    );
  }

  if (!chat) {
    return (
      <View style={styles.error}>
        <Text style={styles.errorText}>Chat not found</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
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
          messages.map((msg, index) => (
            <View key={index} style={styles.messageContainer}>
              <View style={msg.isUser ? styles.userMessage : styles.aiMessage}>
                <Text style={msg.isUser ? styles.messageText : styles.aiMessageText}>
                  {msg.text}
                </Text>
              </View>
              {msg.confirmations && msg.confirmations.length > 0 && (
                <View style={styles.confirmationsContainer}>
                  {msg.confirmations.map((confirmation, idx) => (
                    <ConfirmationPill
                      key={idx}
                      text={confirmation}
                      testID={`chat-confirmation-${idx}`}
                    />
                  ))}
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={message}
          onChangeText={setMessage}
          placeholder="Type a message..."
          placeholderTextColor={lightTokens.colors.subtle}
          multiline
          maxLength={500}
          editable={!sending}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!message.trim() || sending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!message.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color={lightTokens.colors.onPrimary} />
          ) : (
            <Text style={styles.sendButtonText}>Send</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightTokens.colors.bg,
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
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: lightTokens.colors.primary,
    paddingVertical: lightTokens.spacing[2],
    paddingHorizontal: lightTokens.spacing[3],
    borderRadius: lightTokens.radius[3],
    maxWidth: '80%',
  },
  messageText: {
    fontSize: lightTokens.typography.size.md,
    color: lightTokens.colors.onPrimary,
    lineHeight: 20,
  },
  aiMessage: {
    alignSelf: 'flex-start',
    backgroundColor: lightTokens.colors.surface,
    paddingVertical: lightTokens.spacing[2],
    paddingHorizontal: lightTokens.spacing[3],
    borderRadius: lightTokens.radius[3],
    maxWidth: '80%',
    borderWidth: 1,
    borderColor: lightTokens.colors.border,
  },
  aiMessageText: {
    fontSize: lightTokens.typography.size.md,
    color: lightTokens.colors.text,
    lineHeight: 20,
  },
  confirmationsContainer: {
    marginTop: lightTokens.spacing[2],
    alignSelf: 'flex-end',
    maxWidth: '80%',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: lightTokens.spacing[3],
    backgroundColor: lightTokens.colors.surface,
    borderTopWidth: 1,
    borderTopColor: lightTokens.colors.border,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    backgroundColor: lightTokens.colors.bg,
    borderRadius: lightTokens.radius[3],
    paddingVertical: lightTokens.spacing[2],
    paddingHorizontal: lightTokens.spacing[3],
    fontSize: lightTokens.typography.size.md,
    color: lightTokens.colors.text,
    maxHeight: 100,
    marginRight: lightTokens.spacing[2],
  },
  sendButton: {
    backgroundColor: lightTokens.colors.primary,
    paddingVertical: lightTokens.spacing[2],
    paddingHorizontal: lightTokens.spacing[4],
    borderRadius: lightTokens.radius[3],
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    fontSize: lightTokens.typography.size.md,
    fontWeight: '600',
    color: lightTokens.colors.onPrimary,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: lightTokens.colors.bg,
  },
  error: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: lightTokens.colors.bg,
  },
  errorText: {
    fontSize: lightTokens.typography.size.lg,
    color: lightTokens.colors.danger,
  },
});
