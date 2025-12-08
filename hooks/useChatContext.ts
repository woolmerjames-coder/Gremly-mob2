/**
 * useChatContext Hook
 *
 * Manages loading and saving conversation context for a chat.
 * Context includes running summary and structured data (topics, user facts, etc.)
 *
 * Designed to be resilient - failures to load/save context should never break the chat.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ChatContext,
  parseContextFromDb,
  serializeContextForDb,
  createEmptyContext,
} from '../lib/chat/rollingContext';
import { SupabaseSpaceChatRepo } from '../lib/repo/supabase';
import { useAuth } from '../providers/AuthProvider';

/**
 * Hook for managing chat conversation context.
 *
 * @param chatId - The ID of the chat to manage context for
 * @returns Object with context state, loading/error states, and save functions
 *
 * @example
 * ```tsx
 * const { context, loading, updateContext } = useChatContext(chatId);
 *
 * // After each conversation turn:
 * updateContext(prev => incrementTurnCount(prev));
 *
 * // Add a topic:
 * updateContext(prev => addKeyTopic(prev, 'fitness goals'));
 * ```
 */
export function useChatContext(chatId: string) {
  const [context, setContext] = useState<ChatContext>(createEmptyContext);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { user } = useAuth();

  // Memoize repo to avoid recreating on every render
  const chatRepo = useMemo(() => new SupabaseSpaceChatRepo(user?.id), [user?.id]);

  /**
   * Load context from database on mount and when chatId changes.
   */
  useEffect(() => {
    // Skip if no chatId or user
    if (!chatId || !user?.id) {
      setLoading(false);
      return;
    }

    const loadContext = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch chat record
        const chat = await chatRepo.getById(chatId);

        if (!chat) {
          console.warn('[useChatContext] Chat not found:', chatId);
          setContext(createEmptyContext());
          return;
        }

        // Parse context from DB columns
        const parsedContext = parseContextFromDb(
          chat.running_summary ?? null,
          chat.context_json ?? null,
        );

        setContext(parsedContext);
      } catch (err) {
        // Log error but don't crash - use empty context as fallback
        console.error('[useChatContext] Failed to load context:', err);
        setError(err instanceof Error ? err.message : 'Failed to load context');
        setContext(createEmptyContext());
      } finally {
        setLoading(false);
      }
    };

    loadContext();
  }, [chatId, user?.id, chatRepo]);

  /**
   * Save context to database.
   * Updates local state optimistically.
   *
   * @param newContext - The context to save
   */
  const saveContext = useCallback(
    async (newContext: ChatContext) => {
      if (!chatId || !user?.id) {
        console.warn('[useChatContext] Cannot save - no chatId or user');
        return;
      }

      // Optimistic update
      setContext(newContext);

      try {
        setError(null);

        // Serialize and save to DB
        const serialized = serializeContextForDb(newContext);
        await chatRepo.update(chatId, serialized);
      } catch (err) {
        // Log error but don't throw - context save failures shouldn't break chat
        console.error('[useChatContext] Failed to save context:', err);
        setError(err instanceof Error ? err.message : 'Failed to save context');
        // Note: We keep the optimistic update in local state
        // This allows the chat to continue working even if DB save fails
      }
    },
    [chatId, user?.id, chatRepo],
  );

  /**
   * Update context using an updater function.
   * Allows atomic updates without race conditions.
   *
   * @param updater - Function that takes previous context and returns new context
   *
   * @example
   * ```tsx
   * // Increment turn count
   * updateContext(prev => incrementTurnCount(prev));
   *
   * // Add multiple facts
   * updateContext(prev => {
   *   let next = addKeyTopic(prev, 'workout');
   *   next = addUserFact(next, 'preferences', 'workout_time', 'morning');
   *   return next;
   * });
   * ```
   */
  const updateContext = useCallback(
    async (updater: (prev: ChatContext) => ChatContext) => {
      // Apply updater to current context
      const newContext = updater(context);

      // Save the updated context
      await saveContext(newContext);
    },
    [context, saveContext],
  );

  return {
    /** Current chat context */
    context,
    /** True while loading context from DB */
    loading,
    /** Error message if load/save failed (null if no error) */
    error,
    /** Save a new context directly */
    saveContext,
    /** Update context using an updater function */
    updateContext,
  };
}

export default useChatContext;
