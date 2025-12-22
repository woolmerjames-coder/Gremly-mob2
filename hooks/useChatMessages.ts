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
    saveable?: {
      type: 'todo' | 'habit' | 'note';
      title: string;
      content?: string;
      prefillData?: any;
    } | null,
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
  updateMessage: (messageId: string, updates: Partial<SpaceChatMessage>) => void;
  // Streaming support
  createStreamingMessage: () => Promise<{ messageId: string; chatId: string } | undefined>;
  updateStreamingContent: (messageId: string, content: string, mode?: 'append' | 'replace') => void;
  finalizeStreamingMessage: (
    messageId: string,
    finalContent: string,
  ) => Promise<SpaceChatMessage | undefined>;
  cancelStreaming: (messageId: string) => void;
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

  // CRITICAL: Use a ref to track currentChatId synchronously
  // React state updates are batched/async, so if sendUserMessage is called twice
  // before React re-renders, currentChatId state will still be null on second call.
  // The ref provides immediate synchronous access to the latest chat ID.
  const currentChatIdRef = useRef<string | null>(chatId || null);

  // Track if we've already set the chat title from first message
  const titleSetRef = useRef(false);

  // CRITICAL: Prevent duplicate messages during send/append operations
  // When isAddingMessageRef is true, refresh() will skip to avoid race conditions
  // where a database refresh overwrites in-flight optimistic UI updates
  const isAddingMessageRef = useRef(false);

  // Preserve saveable data across refresh cycles
  // Maps message ID -> { saveable, saveableDismissed }, so refresh doesn't lose detection results
  const saveableDataRef = useRef<Map<string, { saveable: any; saveableDismissed: boolean }>>(
    new Map(),
  );

  // Streaming message support
  const streamingMessagesRef = useRef<Set<string>>(new Set());
  const streamingContentRef = useRef<Map<string, string>>(new Map());

  const { user } = useAuth();

  const messageRepo = useMemo(() => new SupabaseSpaceChatMessageRepo(user?.id), [user?.id]);

  const chatRepo = useMemo(() => new SupabaseSpaceChatRepo(user?.id), [user?.id]);

  // Update currentChatId if chatId prop changes
  useEffect(() => {
    if (chatId) {
      setCurrentChatId(chatId);
      currentChatIdRef.current = chatId;
    }
  }, [chatId]);

  const refresh = useCallback(async () => {
    // Skip refresh during active send/append operations to prevent race conditions
    if (isAddingMessageRef.current) {
      if (__DEV__) {
        console.log('[useChatMessages] Skipping refresh - message operation in progress');
      }
      return;
    }

    if (!currentChatId || !spaceId || !user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const fetchedMessages = await messageRepo.list(currentChatId);

      // Restore saveable data that was preserved across refresh
      const messagesWithSaveable = fetchedMessages.map((msg) => {
        const savedData = saveableDataRef.current.get(msg.id);
        if (savedData) {
          return {
            ...msg,
            saveable: savedData.saveable,
            saveableDismissed: savedData.saveableDismissed,
          };
        }
        return msg;
      });

      setMessages(messagesWithSaveable);
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

      // Set flag to prevent refresh() from overwriting our optimistic update
      isAddingMessageRef.current = true;

      try {
        setError(null);

        // CRITICAL: Use ref for synchronous access to current chat ID
        // State may not have updated yet if this is called rapidly
        let activeChatId = currentChatIdRef.current;

        // If no chatId exists, create the chat now
        if (!activeChatId) {
          const generatedTitle = generateChatTitleFromMessage(text.trim());
          const newChat = await chatRepo.create(spaceId, {
            title: generatedTitle,
          });
          activeChatId = newChat.id;
          // Update BOTH state and ref - ref provides immediate sync access
          currentChatIdRef.current = activeChatId;
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
      } finally {
        // Always clear the flag, even on error
        isAddingMessageRef.current = false;
      }
    },
    [currentChatId, spaceId, user?.id, messageRepo, chatRepo, messages],
  );

  const appendAssistantMessage = useCallback(
    async (
      text: string,
      metadata?: Record<string, unknown>,
      overrideChatId?: string,
      saveable?: {
        type: 'todo' | 'habit' | 'note';
        title: string;
        content?: string;
        prefillData?: any;
      } | null,
    ): Promise<SpaceChatMessage | undefined> => {
      console.log('[useChatMessages] appendAssistantMessage called', {
        text: text.substring(0, 50),
        metadata,
        targetChatId: overrideChatId || currentChatIdRef.current || currentChatId,
      });
      // Priority: overrideChatId > ref (sync) > state (may be stale)
      const targetChatId = overrideChatId || currentChatIdRef.current || currentChatId;
      // Allow empty text if metadata is provided (for locked cards, confirmations)
      const hasContent = text.trim() || (metadata && Object.keys(metadata).length > 0);
      if (!hasContent || !targetChatId || !spaceId || !user?.id) {
        if (!targetChatId) {
          console.error('[useChatMessages] Cannot append assistant message - no chat ID');
        }
        if (!hasContent) {
          console.error(
            '[useChatMessages] Cannot append assistant message - no content or metadata',
          );
        }
        return undefined;
      }

      // Set flag to prevent refresh() from overwriting our optimistic update
      isAddingMessageRef.current = true;

      try {
        setError(null);

        const input: SpaceChatMessageInsert = {
          chat_id: targetChatId,
          space_id: spaceId,
          role: 'assistant',
          content: text.trim() || `[${(metadata as any)?.type || 'system'}]`,
          metadata_json: metadata || null,
        };

        const newMessage = await messageRepo.append(input);

        // Attach saveable data to message (local state only, not persisted)
        const messageWithSaveable: SpaceChatMessage = {
          ...newMessage,
          saveable: saveable || null,
          saveableDismissed: false,
        };

        // Preserve saveable data in ref so refresh() can restore it
        if (saveable) {
          saveableDataRef.current.set(newMessage.id, { saveable, saveableDismissed: false });
        }

        setMessages((prev) => {
          // Prevent duplicate: check if message already exists
          const exists = prev.some((m) => m.id === newMessage.id);
          if (exists) {
            if (__DEV__) {
              console.log(
                '[useChatMessages] Preventing duplicate assistant message:',
                newMessage.id,
              );
            }
            return prev;
          }
          console.log('[useChatMessages] Adding new message to state:', newMessage.id, metadata);
          return [...prev, messageWithSaveable];
        });

        // Update chat's last message snippet
        await chatRepo.update(targetChatId, {
          last_message_snippet: text.trim(),
        });

        return messageWithSaveable;
      } catch (err) {
        console.error('Failed to append assistant message:', err);
        setError(err instanceof Error ? err.message : 'Failed to append assistant message');
        throw err;
      } finally {
        // Always clear the flag, even on error
        isAddingMessageRef.current = false;
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
    // Clean up saveable data when message is removed
    saveableDataRef.current.delete(messageId);
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  const updateMessage = useCallback((messageId: string, updates: Partial<SpaceChatMessage>) => {
    // If updating saveable or saveableDismissed, update the ref so refresh() preserves it
    if ('saveable' in updates || 'saveableDismissed' in updates) {
      const existing = saveableDataRef.current.get(messageId);
      saveableDataRef.current.set(messageId, {
        saveable: 'saveable' in updates ? updates.saveable : existing?.saveable,
        saveableDismissed:
          'saveableDismissed' in updates
            ? updates.saveableDismissed!
            : (existing?.saveableDismissed ?? false),
      });
    }

    setMessages((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, ...updates } : msg)));
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

  // ============================================================================
  // Streaming Support
  // ============================================================================

  const createStreamingMessage = useCallback(async (): Promise<
    { messageId: string; chatId: string } | undefined
  > => {
    const targetChatId = currentChatIdRef.current || currentChatId;
    if (!targetChatId || !spaceId || !user?.id) return undefined;

    isAddingMessageRef.current = true;
    try {
      const input: SpaceChatMessageInsert = {
        chat_id: targetChatId,
        space_id: spaceId,
        role: 'assistant',
        content: '',
        metadata_json: { streaming: true },
      };

      const newMessage = await messageRepo.append(input);
      streamingMessagesRef.current.add(newMessage.id);
      streamingContentRef.current.set(newMessage.id, '');
      setMessages((prev) => [...prev, { ...newMessage, isStreaming: true } as SpaceChatMessage]);
      return { messageId: newMessage.id, chatId: targetChatId };
    } finally {
      isAddingMessageRef.current = false;
    }
  }, [currentChatId, spaceId, user?.id, messageRepo]);

  const updateStreamingContent = useCallback(
    (messageId: string, content: string, mode: 'append' | 'replace' = 'replace') => {
      if (!streamingMessagesRef.current.has(messageId)) return;

      if (mode === 'append') {
        const existing = streamingContentRef.current.get(messageId) || '';
        streamingContentRef.current.set(messageId, existing + content);
      } else {
        streamingContentRef.current.set(messageId, content);
      }

      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== messageId) return msg;
          const newContent = mode === 'append' ? (msg.content || '') + content : content;
          return { ...msg, content: newContent };
        }),
      );
    },
    [],
  );

  const finalizeStreamingMessage = useCallback(
    async (messageId: string, finalContent: string) => {
      streamingMessagesRef.current.delete(messageId);
      streamingContentRef.current.delete(messageId);

      await messageRepo.update(messageId, {
        content: finalContent,
        metadata_json: { streaming: false },
      });

      let finalizedMessage: SpaceChatMessage | undefined;
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== messageId) return msg;
          finalizedMessage = {
            ...msg,
            content: finalContent,
            isStreaming: false,
          } as SpaceChatMessage;
          return finalizedMessage;
        }),
      );

      const targetChatId = currentChatIdRef.current || currentChatId;
      if (targetChatId) {
        await chatRepo.update(targetChatId, { last_message_snippet: finalContent.slice(0, 100) });
      }
      return finalizedMessage;
    },
    [currentChatId, messageRepo, chatRepo],
  );

  const cancelStreaming = useCallback((messageId: string) => {
    const partialContent = streamingContentRef.current.get(messageId) || '';
    streamingMessagesRef.current.delete(messageId);
    streamingContentRef.current.delete(messageId);
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId) return msg;
        return {
          ...msg,
          content: partialContent || msg.content,
          isStreaming: false,
          streamingCancelled: true,
        } as SpaceChatMessage;
      }),
    );
  }, []);

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
    updateMessage,
    // Streaming support
    createStreamingMessage,
    updateStreamingContent,
    finalizeStreamingMessage,
    cancelStreaming,
  };
}
