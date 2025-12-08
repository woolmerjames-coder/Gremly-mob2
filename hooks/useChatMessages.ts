/**
 * useChatMessages hook - Phase 10.5 Space Chats v1
 * Manages chat message state and operations for a specific chat thread
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { SpaceChatMessage, SpaceChatMessageInsert } from '../lib/types';
import { SupabaseSpaceChatMessageRepo, SupabaseSpaceChatRepo } from '../lib/repo/supabase';
import { formatFrequencyLabel, formatDueDateLabel } from '../src/lib/formatters/itemDisplayHelpers';
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

        // CRITICAL FIX: Use 'system' role instead of 'action-confirmation'
        // The metadata.type stores the actual message type
        const input: SpaceChatMessageInsert = {
          chat_id: chatId,
          space_id: spaceId,
          role: 'system', // Valid database role
          content: content.trim(),
          metadata_json: {
            ...metadata,
            type: 'action-confirmation', // Message type in metadata
          },
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

  const appendEntryCard = useCallback(
    async (
      entry: Record<string, any>,
      entryType: 'note' | 'todo' | 'habit' | 'person',
    ): Promise<SpaceChatMessage | undefined> => {
      if (!entry || !chatId || !spaceId || !user?.id) return undefined;

      try {
        setError(null);

        // Generate summary for content
        const entryName =
          entryType === 'person' ? entry.name : entry.title || entry.name || 'Untitled';

        // CRITICAL FIX: Use 'system' role instead of 'entry-card'
        const input: SpaceChatMessageInsert = {
          chat_id: chatId,
          space_id: spaceId,
          role: 'system', // Valid database role
          content: `${entryType}: ${entryName}`,
          metadata_json: {
            type: 'entry-card', // Message type in metadata
            entry,
            entryType,
            entryId: entry.id,
          },
        };

        const newMessage = await messageRepo.append(input);
        setMessages((prev) => [...prev, newMessage]);

        return newMessage;
      } catch (err) {
        console.error('Failed to append entry card:', err);
        setError(err instanceof Error ? err.message : 'Failed to append entry card');
        throw err;
      }
    },
    [chatId, spaceId, user?.id, messageRepo, chatRepo],
  );

  const removeMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  /**
   * Append a saved-item confirmation card to the chat
   * Used after creating entities via Space Chat save flow
   */
  const appendSavedItemCard = useCallback(
    async (
      entity: Record<string, any>,
      entityType: 'note' | 'todo' | 'habit' | 'person',
    ): Promise<SpaceChatMessage | undefined> => {
      if (!entity || !chatId || !spaceId || !user?.id) return undefined;

      try {
        setError(null);

        // Generate title and subtitle based on entity type
        const title = entity.title || entity.name || 'Untitled';
        let subtitle = '';

        if (entityType === 'habit') {
          // Habits store frequency in frequency_value (maps to frequency_json in DB)
          // Try frequency_value first (JSON object), then frequency (string)
          if (__DEV__) {
            console.log('[useChatMessages] Formatting frequency', {
              frequency_value: entity.frequency_value,
              frequency_json: entity.frequency_json,
              frequency: entity.frequency,
            });
          }
          const freqLabel =
            formatFrequencyLabel(entity.frequency_value) ||
            formatFrequencyLabel(entity.frequency_json);
          subtitle = freqLabel || entity.frequency || 'Habit';
          if (__DEV__) {
            console.log('[useChatMessages] Formatted subtitle:', subtitle);
          }
        } else if (entityType === 'todo') {
          // Use formatDueDateLabel for human-readable dates
          const dueLabel = formatDueDateLabel(entity.due_at);
          subtitle = dueLabel ? `Due ${dueLabel}` : 'Task';
        } else if (entityType === 'note') {
          subtitle = 'Note';
        } else if (entityType === 'person') {
          subtitle = 'Person';
        }

        const input: SpaceChatMessageInsert = {
          chat_id: chatId,
          space_id: spaceId,
          role: 'system', // Valid database role
          content: `Saved ${entityType}: ${title}`,
          metadata_json: {
            type: 'saved-item', // Message type in metadata
            entity,
            entityType,
            entityId: entity.id,
            title,
            subtitle,
          },
        };

        const newMessage = await messageRepo.append(input);
        setMessages((prev) => [...prev, newMessage]);

        return newMessage;
      } catch (err) {
        console.error('Failed to append saved item card:', err);
        setError(err instanceof Error ? err.message : 'Failed to append saved item card');
        throw err;
      }
    },
    [chatId, spaceId, user?.id, messageRepo],
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
    appendEntryCard,
    appendSavedItemCard,
    removeMessage,
  };
}
