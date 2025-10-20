/**
 * ChatThreadScreen - Simple chat thread view
 * Phase 8 Spaces v2 UI
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

type Props = NativeStackScreenProps<RootStackParamList, 'ChatThread'>;

export default function ChatThreadScreen({ route, navigation }: Props) {
  const { chatId } = route.params;
  const { userId } = useAuth();

  const [chat, setChat] = useState<SpaceChat | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

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

    try {
      setSending(true);
      const snippet = message.trim().slice(0, 100);

      // Update chat with last message snippet
      await spaceChatRepo.update(chatId, {
        last_message_snippet: snippet,
      });

      // In a full implementation, you'd also save the message to a messages table
      // For now, we just clear the input
      setMessage('');

      // TODO: Fire analytics
      // analytics.track('space_chat_message_sent', { chatId });
      console.log('[Analytics] space_chat_message_sent', { chatId }); // Phase 8 polish
    } catch (error) {
      console.error('Failed to send message:', error);
      Alert.alert('Error', 'Failed to send message');
    } finally {
      setSending(false);
    }
  }, [message, chat, chatId, spaceChatRepo]);

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
        <View style={styles.placeholder}>
          <Text style={styles.placeholderIcon}>💬</Text>
          <Text style={styles.placeholderTitle}>Start a conversation</Text>
          <Text style={styles.placeholderText}>
            This is a chat thread with Gremly. Type a message below to get started.
          </Text>
        </View>

        {chat.last_message_snippet && (
          <View style={styles.messageContainer}>
            <View style={styles.userMessage}>
              <Text style={styles.messageText}>{chat.last_message_snippet}</Text>
            </View>
          </View>
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
