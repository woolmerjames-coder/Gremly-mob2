/**
 * useChatMessages hook - Phase 10.5 Space Chats v1
 * Manages chat message state and operations for a specific chat thread
 *
 * Supports deferred chat creation: when chatId is undefined, the chat
 * is created only when the first message is sent.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { SpaceChatMessage, SpaceChatMessageInsert, SpaceChat } from '../lib/types';
import { SupabaseSpaceChatMessageRepo, SupabaseSpaceChatRepo } from '../lib/repo/supabase';
import { formatFrequencyLabel, formatDueDateLabel } from '../src/lib/formatters/itemDisplayHelpers';
import { useAuth } from '../providers/AuthProvider';
import { useGremlyStore } from '../lib/store/useGremlyStore';
import { nowTimestamp } from '../lib/date/DateService';
import { applyEntityChange, lateCardAlreadyShown, pendingTwinOf } from '../lib/chat/entityCards';

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
  /** The chat whose messages are in `messages` (null until the first load) */
  loadedChatId: string | null;
  /**
   * Load the chat's messages again. Reads the chat id at call time, so a
   * call made from an older render still loads the chat now on screen.
   * Returns what was loaded, or undefined when nothing was.
   */
  refresh: (chatId?: string) => Promise<SpaceChatMessage[] | undefined>;
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
  /** Entity card in chat: persist the card the worker proposed as a system message. */
  appendEntityCard: (
    card: import('../lib/types').EntityCard,
    opts?: { status?: import('../lib/types').EntityCardStatus; summary?: string },
  ) => Promise<SpaceChatMessage | undefined>;
  /** Entity card in chat: persist what the user did with it, plus Gremly's closing line. */
  setEntityCardStatus: (
    messageId: string,
    status: import('../lib/types').EntityCardStatus,
    summary?: string,
  ) => Promise<void>;
  removeMessage: (messageId: string) => void;
  updateMessage: (messageId: string, updates: Partial<SpaceChatMessage>) => void;
  /**
   * Daily brief in Chat: save one message of the day's thread (a reply, a
   * Gremly line, an event line or an offer) with its brief metadata.
   */
  appendBriefMessage: (
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata: Record<string, unknown>,
  ) => Promise<SpaceChatMessage | undefined>;
  /** Merge fields into a message's metadata and save them. */
  patchMessageMetadata: (messageId: string, patch: Record<string, unknown>) => Promise<void>;
  // Streaming support
  createStreamingMessage: () => Promise<{ messageId: string; chatId: string } | undefined>;
  updateStreamingContent: (messageId: string, content: string, mode?: 'append' | 'replace') => void;
  updateStreamingSearching: (
    messageId: string,
    isSearching: boolean,
    searchQuery: string | null,
  ) => void;
  finalizeStreamingMessage: (
    messageId: string,
    finalContent: string,
  ) => Promise<SpaceChatMessage | undefined>;
  cancelStreaming: (messageId: string) => void;
}

export function useChatMessages(
  chatId: string | undefined,
  spaceId: string | null,
): UseChatMessagesResult {
  const [messages, setMessages] = useState<SpaceChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedChatId, setLoadedChatId] = useState<string | null>(null);

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

  // Update currentChatId if chatId prop changes. Moving from one chat to
  // another, or back to the empty state, drops the old chat's messages at
  // once, so nothing sent from the next chat carries the last one's history.
  const previousChatIdRef = useRef<string | undefined>(chatId);
  useEffect(() => {
    const previous = previousChatIdRef.current;
    previousChatIdRef.current = chatId;
    if (previous && previous !== chatId) {
      setMessages([]);
      setLoadedChatId(null);
      saveableDataRef.current.clear();
    }
    if (chatId) {
      setCurrentChatId(chatId);
      currentChatIdRef.current = chatId;
    } else if (previous) {
      setCurrentChatId(null);
      currentChatIdRef.current = null;
    }
  }, [chatId]);

  const refresh = useCallback(
    async (chatIdOverride?: string): Promise<SpaceChatMessage[] | undefined> => {
      // Skip refresh during active send/append operations to prevent race conditions
      if (isAddingMessageRef.current) {
        if (__DEV__) {
          console.log('[useChatMessages] Skipping refresh - message operation in progress');
        }
        return undefined;
      }

      // The ref holds the chat on screen even when this callback came from an
      // earlier render, before the state caught up
      const targetChatId =
        (typeof chatIdOverride === 'string' && chatIdOverride) ||
        currentChatIdRef.current ||
        currentChatId;
      if (!targetChatId || !user?.id) {
        setLoading(false);
        return undefined;
      }

      try {
        setLoading(true);
        setError(null);
        const fetchedMessages = await messageRepo.list(targetChatId);
        // Moved to another chat while this one loaded: leave its messages be
        if (currentChatIdRef.current !== targetChatId) {
          return undefined;
        }

        // Restore saveable data: Priority 1 = session ref, Priority 2 = database column
        const messagesWithSaveable = fetchedMessages.map((msg) => {
          // Priority 1: Session ref (most recent, set this session)
          const refData = saveableDataRef.current.get(msg.id);
          if (refData) {
            return {
              ...msg,
              saveable: refData.saveable,
              saveableDismissed: refData.saveableDismissed,
            };
          }

          // Priority 2: Database column (persisted from previous session)
          if (msg.saveable_json) {
            const dbSaveable = msg.saveable_json as {
              type: string;
              title: string;
              dismissed?: boolean;
              savedItemId?: string;
              savedItemType?: string;
            };
            return {
              ...msg,
              saveable: {
                type: dbSaveable.type as 'todo' | 'habit' | 'note',
                title: dbSaveable.title,
                savedItemId: dbSaveable.savedItemId,
                savedItemType: dbSaveable.savedItemType as 'habit' | 'todo' | 'log' | undefined,
              },
              saveableDismissed: dbSaveable.dismissed ?? false,
            };
          }

          return msg;
        });

        setMessages(messagesWithSaveable);
        setLoadedChatId(targetChatId);
        return messagesWithSaveable;
      } catch (err) {
        console.error('Failed to refresh chat messages:', err);
        setError(err instanceof Error ? err.message : 'Failed to load messages');
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [currentChatId, spaceId, user?.id, messageRepo],
  );

  /**
   * Send a user message. If this is a new chat (no chatId), creates the chat first.
   * Returns the chatId (useful for new chats).
   */
  const sendUserMessage = useCallback(
    async (text: string): Promise<string | undefined> => {
      if (!text.trim() || !user?.id) return undefined;

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

          // Sync to Zustand store for immediate UI update in chat list
          const syncSpaceChat = useGremlyStore.getState().syncSpaceChat;
          syncSpaceChat({
            ...newChat,
            scope_id: spaceId,
            user_id: user.id,
            title: generatedTitle,
            last_message_snippet: text.trim().slice(0, 100),
            is_archived: false,
            pinned: false,
            created_at: newChat.created_at || nowTimestamp(),
            updated_at: newChat.updated_at || nowTimestamp(),
          } as SpaceChat);
        }

        const input: SpaceChatMessageInsert = {
          chat_id: activeChatId,
          scope_id: spaceId,
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
          // Sync to Zustand store
          const updateSpaceChat = useGremlyStore.getState().updateSpaceChat;
          updateSpaceChat(activeChatId, {
            title: generatedTitle,
            last_message_snippet: text.trim().slice(0, 100),
          });
        } else {
          // Just update last message snippet
          await chatRepo.update(activeChatId, {
            last_message_snippet: text.trim(),
          });
          // Sync to Zustand store
          const updateSpaceChat = useGremlyStore.getState().updateSpaceChat;
          updateSpaceChat(activeChatId, {
            last_message_snippet: text.trim().slice(0, 100),
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
      if (!hasContent || !targetChatId || !user?.id) {
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
          scope_id: spaceId,
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
      if (!content.trim() || !currentChatId || !user?.id) return undefined;

      try {
        setError(null);

        // CRITICAL FIX: Use 'system' role instead of 'action-confirmation'
        // The metadata.type stores the actual message type
        const input: SpaceChatMessageInsert = {
          chat_id: currentChatId,
          scope_id: spaceId,
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
      if (!entry || !currentChatId || !user?.id) return undefined;

      try {
        setError(null);

        // Generate summary for content
        const entryName =
          entryType === 'person' ? entry.name : entry.title || entry.name || 'Untitled';

        // CRITICAL FIX: Use 'system' role instead of 'entry-card'
        const input: SpaceChatMessageInsert = {
          chat_id: currentChatId,
          scope_id: spaceId,
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
    console.log('[useChatMessages] updateMessage called:', {
      messageId,
      hasSaveableUpdate: 'saveable' in updates,
      saveable: updates.saveable,
      saveableDismissed: updates.saveableDismissed,
    });

    // If updating saveable or saveableDismissed, update the ref so refresh() preserves it
    if ('saveable' in updates || 'saveableDismissed' in updates) {
      const existing = saveableDataRef.current.get(messageId);
      const newSaveable = 'saveable' in updates ? updates.saveable : existing?.saveable;
      const newDismissed =
        'saveableDismissed' in updates
          ? updates.saveableDismissed!
          : (existing?.saveableDismissed ?? false);

      saveableDataRef.current.set(messageId, {
        saveable: newSaveable,
        saveableDismissed: newDismissed,
      });
      console.log('[useChatMessages] Saved to saveableDataRef:', messageId);

      // Persist saveable data to Supabase (fire-and-forget for durability)
      if (newSaveable) {
        messageRepo
          .update(messageId, {
            saveable_json: {
              type: newSaveable.type,
              title: newSaveable.title || '',
              dismissed: newDismissed,
              savedItemId: newSaveable.savedItemId || null,
              savedItemType: newSaveable.savedItemType || null,
            },
          })
          .catch((err) => console.error('[useChatMessages] Failed to persist saveable:', err));
      }
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
      if (!entity || !currentChatId || !user?.id) return undefined;

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
          scope_id: spaceId,
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

  // the messages as of the last render, for callbacks that run between renders
  const messagesRef = useRef<SpaceChatMessage[]>(messages);
  messagesRef.current = messages;

  const appendEntityCard = useCallback(
    async (
      card: import('../lib/types').EntityCard,
      opts: { status?: import('../lib/types').EntityCardStatus; summary?: string } = {},
    ): Promise<SpaceChatMessage | undefined> => {
      const targetChatId = currentChatIdRef.current || currentChatId;
      if (!card || !targetChatId || !user?.id) return undefined;
      // The same change offered again while its card is still waiting: the
      // user has said yes in words, so that card is tapped for them instead of
      // a second copy appearing.
      if (lateCardAlreadyShown(messagesRef.current, card)) return undefined;
      const twin = pendingTwinOf(messagesRef.current, card);
      if (twin && card.kind === 'edit') {
        try {
          const applied = await applyEntityChange(card.entity, card.change);
          await setEntityCardStatusRef.current?.(twin.id, 'applied', `Done. ${applied.summary}`);
          return twin;
        } catch (err) {
          console.warn('[useChatMessages] Could not apply the waiting card', err);
        }
      }
      try {
        const title =
          card.kind === 'choose' ? `${card.candidates.length} items` : card.entity.title;
        const input: SpaceChatMessageInsert = {
          chat_id: targetChatId,
          scope_id: spaceId,
          role: 'system',
          content: `Entity card: ${title}`,
          metadata_json: {
            type: 'entity-card',
            card,
            status: opts.status || 'pending',
            ...(opts.summary ? { summary: opts.summary } : {}),
          },
        };
        const newMessage = await messageRepo.append(input);
        setMessages((prev) => [...prev, newMessage]);
        return newMessage;
      } catch (err) {
        console.error('Failed to append entity card:', err);
        return undefined;
      }
    },
    [currentChatId, spaceId, user?.id, messageRepo],
  );

  const setEntityCardStatus = useCallback(
    async (
      messageId: string,
      status: import('../lib/types').EntityCardStatus,
      summary?: string,
    ): Promise<void> => {
      // Read the card from the ref, not inside the state updater: React may run
      // an updater later (when other updates are queued), and then the status
      // was never saved, so the card came back as waiting after a reload and
      // the next turn told Gremly nothing had changed.
      const current = messagesRef.current.find((m) => m.id === messageId);
      if (!current) return;
      const nextSummary = summary ?? current.metadata_json?.summary ?? null;
      const nextMeta: Record<string, unknown> = {
        ...(current.metadata_json || {}),
        status,
        summary: nextSummary,
      };
      messagesRef.current = messagesRef.current.map((m) =>
        m.id === messageId
          ? { ...m, metadata_json: nextMeta as SpaceChatMessage['metadata_json'] }
          : m,
      );
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                metadata_json: {
                  ...(m.metadata_json || {}),
                  status,
                  summary: nextSummary,
                } as SpaceChatMessage['metadata_json'],
              }
            : m,
        ),
      );
      try {
        await messageRepo.update(messageId, { metadata_json: nextMeta });
      } catch (err) {
        console.warn('[useChatMessages] Could not persist entity card status', err);
      }
    },
    [messageRepo],
  );
  const appendBriefMessage = useCallback(
    async (
      role: 'user' | 'assistant' | 'system',
      content: string,
      metadata: Record<string, unknown>,
    ): Promise<SpaceChatMessage | undefined> => {
      const targetChatId = currentChatIdRef.current || currentChatId;
      if (!targetChatId || !user?.id) return undefined;
      isAddingMessageRef.current = true;
      try {
        const newMessage = await messageRepo.append({
          chat_id: targetChatId,
          scope_id: spaceId,
          role,
          content,
          metadata_json: metadata,
        });
        messagesRef.current = [...messagesRef.current, newMessage];
        setMessages((prev) =>
          prev.some((m) => m.id === newMessage.id) ? prev : [...prev, newMessage],
        );
        if (role !== 'system' && content.trim()) {
          chatRepo
            .update(targetChatId, { last_message_snippet: content.trim().slice(0, 100) })
            .catch(() => {});
        }
        return newMessage;
      } catch (err) {
        console.warn('[useChatMessages] Could not save a brief message', err);
        return undefined;
      } finally {
        isAddingMessageRef.current = false;
      }
    },
    [currentChatId, spaceId, user?.id, messageRepo, chatRepo],
  );

  const patchMessageMetadata = useCallback(
    async (messageId: string, patch: Record<string, unknown>): Promise<void> => {
      const current = messagesRef.current.find((m) => m.id === messageId);
      if (!current) return;
      const nextMeta = {
        ...(current.metadata_json || {}),
        ...patch,
      } as SpaceChatMessage['metadata_json'];
      messagesRef.current = messagesRef.current.map((m) =>
        m.id === messageId ? { ...m, metadata_json: nextMeta } : m,
      );
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                metadata_json: {
                  ...(m.metadata_json || {}),
                  ...patch,
                } as SpaceChatMessage['metadata_json'],
              }
            : m,
        ),
      );
      try {
        await messageRepo.update(messageId, { metadata_json: nextMeta as Record<string, unknown> });
      } catch (err) {
        console.warn('[useChatMessages] Could not save message metadata', err);
      }
    },
    [messageRepo],
  );

  const setEntityCardStatusRef = useRef(setEntityCardStatus);
  setEntityCardStatusRef.current = setEntityCardStatus;

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
    if (!targetChatId || !user?.id) return undefined;

    isAddingMessageRef.current = true;
    try {
      const input: SpaceChatMessageInsert = {
        chat_id: targetChatId,
        scope_id: spaceId,
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

  const updateStreamingSearching = useCallback(
    (messageId: string, isSearching: boolean, searchQuery: string | null) => {
      if (!streamingMessagesRef.current.has(messageId)) return;

      setMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, isSearching, searchQuery } : msg)),
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
    loadedChatId,
    refresh,
    sendUserMessage,
    appendAssistantMessage,
    appendActionConfirmation,
    appendEntryCard,
    appendSavedItemCard,
    appendEntityCard,
    setEntityCardStatus,
    removeMessage,
    updateMessage,
    appendBriefMessage,
    patchMessageMetadata,
    // Streaming support
    createStreamingMessage,
    updateStreamingContent,
    updateStreamingSearching,
    finalizeStreamingMessage,
    cancelStreaming,
  };
}
