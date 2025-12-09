/**
 * useChatMessages hook - Phase 10.5 Space Chats v1
 * Manages chat message state and operations for a specific chat thread
 *
 * Supports deferred chat creation: when chatId is undefined, the chat
 * is created only when the first message is sent.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { SpaceChatMessage, SpaceChatMessageInsert } from '../lib/types';
import { SupabaseSpaceChatMessageRepo, SupabaseSpaceChatRepo } from '../lib/repo/supabase';
import { formatFrequencyLabel, formatDueDateLabel } from '../src/lib/formatters/itemDisplayHelpers';
import { useAuth } from '../providers/AuthProvider';

/**
 * Generate a chat title from the first user message.
 * Truncates to ~50 chars at a word boundary.
 */
function generateChatTitleFromMessage(message: string): string {
  if (!message || message.trim().length === 0) {
    return 'New Chat';
  }
  const maxLength = 50;
  const trimmed = message.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  // Find last space before maxLength
  const truncated = trimmed.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > 20) {
    return truncated.substring(0, lastSpace) + '...';
  }
  return truncated + '...';
}

/**
 * Return type for useChatMessages hook, including the current chatId
 * (which may be created during the session)
 */
export interface UseChatMessagesResult {
  messages: SpaceChatMessage[];
  loading: boolean;
  error: string | null;
  /** The current chat ID - may be null for new chats until first message */
  currentChatId: string | null;
  refresh: () => Promise<void>;
  sendUserMessage: (text: string) => Promise<string | undefined>;
  appendAssistantMessage: (
    text: string,
    metadata?: Record<string, unknown>,
    overrideChatId?: string,
  ) => Promise<SpaceChatMessage | undefined>;
  appendActionConfirmation: (
    content: string,
    metadata: Record<string, unknown>,
  ) => Promise<SpaceChatMessage | undefined>;
  appendEntryCard: (
    entry: Record<string, any>,
    entryType: 'note' | 'todo' | 'habit' | 'person',
  ) => Promise<SpaceChatMessage | undefined>;
  appendSavedItemCard: (
    entity: Record<string, any>,
    entityType: 'note' | 'todo' | 'habit' | 'person',
  ) => Promise<SpaceChatMessage | undefined>;
  removeMessage: (messageId: string) => void;
}

export function useChatMessages(
  chatId: string | undefined,
  spaceId: string,
): UseChatMessagesResult {
  const [messages, setMessages] = useState<SpaceChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track the current chat ID (may be created during session)
  const [currentChatId, setCurrentChatId] = useState<string | null>(chatId || null);

  // Track if we've already set the chat title from first message
  const titleSetRef = useRef(false);

  const { user } = useAuth();

  const messageRepo = useMemo(() => new SupabaseSpaceChatMessageRepo(user?.id), [user?.id]);

  const chatRepo = useMemo(() => new SupabaseSpaceChatRepo(user?.id), [user?.id]);

  // Update currentChatId if chatId prop changes
  useEffect(() => {
    if (chatId) {
      setCurrentChatId(chatId);
    }
  }, [chatId]);

  const refresh = useCallback(async () => {
    if (!currentChatId || !spaceId || !user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const fetchedMessages = await messageRepo.list(currentChatId);
      setMessages(fetchedMessages);
    } catch (err) {
      console.error('Failed to refresh chat messages:', err);
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [currentChatId, spaceId, user?.id, messageRepo]);

  /**
   * Send a user message. If this is a new chat (no chatId), creates the chat first.
   * Returns the chatId (useful for new chats).
   */
  const sendUserMessage = useCallback(
    async (text: string): Promise<string | undefined> => {
      if (!text.trim() || !spaceId || !user?.id) return undefined;

      try {
        setError(null);

        let activeChatId = currentChatId;

        // If no chatId exists, create the chat now
        if (!activeChatId) {
          const generatedTitle = generateChatTitleFromMessage(text.trim());
          const newChat = await chatRepo.create(spaceId, {
            title: generatedTitle,
          });
          activeChatId = newChat.id;
          setCurrentChatId(activeChatId);
          titleSetRef.current = true; // Title already set during creation
          console.log('[useChatMessages] Created new chat on first message:', activeChatId);
        }

        const input: SpaceChatMessageInsert = {
          chat_id: activeChatId,
          space_id: spaceId,
          role: 'user',
          content: text.trim(),
        };

        const newMessage = await messageRepo.append(input);
        setMessages((prev) => [...prev, newMessage]);

        // Check if this is the first user message - auto-generate chat title
        // (Only if chat already existed - new chats get title during creation)
        const isFirstUserMessage =
          !titleSetRef.current && messages.filter((m) => m.role === 'user').length === 0;

        if (isFirstUserMessage) {
          titleSetRef.current = true;
          const generatedTitle = generateChatTitleFromMessage(text.trim());
          // Update chat title and last message snippet
          await chatRepo.update(activeChatId, {
            title: generatedTitle,
            last_message_snippet: text.trim(),
          });
        } else {
          // Just update last message snippet
          await chatRepo.update(activeChatId, {
            last_message_snippet: text.trim(),
          });
        }

        return activeChatId;
      } catch (err) {
        console.error('Failed to send user message:', err);
        setError(err instanceof Error ? err.message : 'Failed to send message');
        throw err; // Re-throw so caller can handle
      }
    },
    [currentChatId, spaceId, user?.id, messageRepo, chatRepo, messages],
  );

  const appendAssistantMessage = useCallback(
    async (
      text: string,
      metadata?: Record<string, unknown>,
      overrideChatId?: string,
    ): Promise<SpaceChatMessage | undefined> => {
      const targetChatId = overrideChatId || currentChatId;
      if (!text.trim() || !targetChatId || !spaceId || !user?.id) {
        if (!targetChatId) {
          console.error('[useChatMessages] Cannot append assistant message - no chat ID');
        }
        return undefined;
      }

      try {
        setError(null);

        const input: SpaceChatMessageInsert = {
          chat_id: targetChatId,
          space_id: spaceId,
          role: 'assistant',
          content: text.trim(),
          metadata_json: metadata || null,
        };

        const newMessage = await messageRepo.append(input);
        setMessages((prev) => [...prev, newMessage]);

        // Update chat's last message snippet
        await chatRepo.update(targetChatId, {
          last_message_snippet: text.trim(),
        });

        return newMessage;
      } catch (err) {
        console.error('Failed to append assistant message:', err);
        setError(err instanceof Error ? err.message : 'Failed to append assistant message');
        throw err;
      }
    },
    [currentChatId, spaceId, user?.id, messageRepo, chatRepo],
  );

  const appendActionConfirmation = useCallback(
    async (
      content: string,
      metadata: Record<string, unknown>,
    ): Promise<SpaceChatMessage | undefined> => {
      if (!content.trim() || !currentChatId || !spaceId || !user?.id) return undefined;

      try {
        setError(null);

        // CRITICAL FIX: Use 'system' role instead of 'action-confirmation'
        // The metadata.type stores the actual message type
        const input: SpaceChatMessageInsert = {
          chat_id: currentChatId,
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
    [currentChatId, spaceId, user?.id, messageRepo, chatRepo],
  );

  const appendEntryCard = useCallback(
    async (
      entry: Record<string, any>,
      entryType: 'note' | 'todo' | 'habit' | 'person',
    ): Promise<SpaceChatMessage | undefined> => {
      if (!entry || !currentChatId || !spaceId || !user?.id) return undefined;

      try {
        setError(null);

        // Generate summary for content
        const entryName =
          entryType === 'person' ? entry.name : entry.title || entry.name || 'Untitled';

        // CRITICAL FIX: Use 'system' role instead of 'entry-card'
        const input: SpaceChatMessageInsert = {
          chat_id: currentChatId,
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
    [currentChatId, spaceId, user?.id, messageRepo, chatRepo],
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
      if (!entity || !currentChatId || !spaceId || !user?.id) return undefined;

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
          chat_id: currentChatId,
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
    [currentChatId, spaceId, user?.id, messageRepo],
  );

  // Load messages on mount and when currentChatId changes
  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    messages,
    loading,
    error,
    currentChatId,
    refresh,
    sendUserMessage,
    appendAssistantMessage,
    appendActionConfirmation,
    appendEntryCard,
    appendSavedItemCard,
    removeMessage,
  };
}
