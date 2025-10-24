/**
 * useChatMessages hook - Phase 10.5 Space Chats v1
 * Manages chat message state and operations for a specific chat thread
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { SpaceChatMessage, SpaceChatMessageInsert } from '../lib/types';
import { SupabaseSpaceChatMessageRepo, SupabaseSpaceChatRepo } from '../lib/repo/supabase';
import { useAuth } from '../providers/AuthProvider';

export function useChatMessages(chatId: string, spaceId: string) {
  const [messages, setMessages] = useState<SpaceChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { user } = useAuth();

  const messageRepo = useMemo(() => new SupabaseSpaceChatMessageRepo(user?.id), [user?.id]);

  const chatRepo = useMemo(() => new SupabaseSpaceChatRepo(user?.id), [user?.id]);

  const refresh = useCallback(async () => {
    if (!chatId || !spaceId || !user?.id) return;

    try {
      setLoading(true);
      setError(null);
      const fetchedMessages = await messageRepo.list(chatId);
      setMessages(fetchedMessages);
    } catch (err) {
      console.error('Failed to refresh chat messages:', err);
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [chatId, spaceId, user?.id, messageRepo]);

  const sendUserMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || !chatId || !spaceId || !user?.id) return;

      try {
        setError(null);

        const input: SpaceChatMessageInsert = {
          chat_id: chatId,
          space_id: spaceId,
          role: 'user',
          content: text.trim(),
        };

        const newMessage = await messageRepo.append(input);
        setMessages((prev) => [...prev, newMessage]);

        // Update chat's last message snippet
        await chatRepo.update(chatId, {
          last_message_snippet: text.trim(),
        });
      } catch (err) {
        console.error('Failed to send user message:', err);
        setError(err instanceof Error ? err.message : 'Failed to send message');
        throw err; // Re-throw so caller can handle
      }
    },
    [chatId, spaceId, user?.id, messageRepo, chatRepo],
  );

  const appendAssistantMessage = useCallback(
    async (
      text: string,
      metadata?: Record<string, unknown>,
    ): Promise<SpaceChatMessage | undefined> => {
      if (!text.trim() || !chatId || !spaceId || !user?.id) return undefined;

      try {
        setError(null);

        const input: SpaceChatMessageInsert = {
          chat_id: chatId,
          space_id: spaceId,
          role: 'assistant',
          content: text.trim(),
          metadata_json: metadata || null,
        };

        const newMessage = await messageRepo.append(input);
        setMessages((prev) => [...prev, newMessage]);

        // Update chat's last message snippet
        await chatRepo.update(chatId, {
          last_message_snippet: text.trim(),
        });

        return newMessage;
      } catch (err) {
        console.error('Failed to append assistant message:', err);
        setError(err instanceof Error ? err.message : 'Failed to append assistant message');
        throw err;
      }
    },
    [chatId, spaceId, user?.id, messageRepo, chatRepo],
  );

  const appendActionConfirmation = useCallback(
    async (
      content: string,
      metadata: Record<string, unknown>,
    ): Promise<SpaceChatMessage | undefined> => {
      if (!content.trim() || !chatId || !spaceId || !user?.id) return undefined;

      try {
        setError(null);

        const input: SpaceChatMessageInsert = {
          chat_id: chatId,
          space_id: spaceId,
          role: 'action-confirmation',
          content: content.trim(),
          metadata_json: metadata,
        };

        const newMessage = await messageRepo.append(input);
        setMessages((prev) => [...prev, newMessage]);

        return newMessage;
      } catch (err) {
        console.error('Failed to append action confirmation:', err);
        setError(err instanceof Error ? err.message : 'Failed to append action confirmation');
        throw err;
      }
    },
    [chatId, spaceId, user?.id, messageRepo, chatRepo],
  );

  // Load messages on mount and when chatId changes
  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    messages,
    loading,
    error,
    refresh,
    sendUserMessage,
    appendAssistantMessage,
    appendActionConfirmation,
  };
}
