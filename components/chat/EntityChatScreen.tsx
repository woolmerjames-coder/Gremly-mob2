/**
 * EntityChatScreen - Full-screen chat view for entity conversations
 * Used in overlays and sweep cards to chat with Gremly about a specific entity
 * Matches design patterns from ChatThreadScreen (Spaces Chat)
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Alert,
  LayoutAnimation,
  ActivityIndicator,
  Linking,
  Image,
} from 'react-native';
import Animated, { FadeOutUp, FadeInRight, SlideOutRight, Layout } from 'react-native-reanimated';
import {
  ChevronLeft,
  X,
  ListChecks,
  AlertCircle,
  Lightbulb,
  Search,
  CheckSquare,
  Sparkles,
  Target,
  Compass,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { callEntityChatStreaming } from '../../lib/cortex/CortexClient';
import { ChatComposer } from './ChatComposer';
import { ChatBubble } from './ChatBubble';
import SaveButton from './SaveButton';
import { lightTokens } from '../../design/tokens';
import type { SaveableType } from '../../lib/chat/saveableTypes';
import type {
  EntityChatPreset,
  EntityChatMessage,
  EntityChatRequest,
  EntityChatResponse,
  SpaceChatMessage,
  Todo,
  Habit,
  Note,
} from '../../lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface EntityChatScreenProps {
  entityId: string;
  entityType: 'todo' | 'habit' | 'note';
  initialPreset?: EntityChatPreset;
  sweepContext?: {
    times_moved: number;
    days_unscheduled: number;
    is_overdue: boolean;
  };
  onClose: () => void;
  onPromoteToSpace?: (entityId: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Preset Configuration
// ─────────────────────────────────────────────────────────────────────────────

interface PresetConfig {
  label: string;
  prompt: string;
  icon: React.ComponentType<{ size: number; color: string }>;
}

const TODO_PRESETS: Record<string, PresetConfig> = {
  break_down: {
    label: 'Break it down',
    prompt: 'Help me break this task into smaller steps',
    icon: ListChecks,
  },
  whats_blocking: {
    label: "What's blocking me?",
    prompt: "What might be blocking me from doing this? Let's figure it out.",
    icon: AlertCircle,
  },
  think_through: {
    label: 'Think through',
    prompt: 'Help me think through how to approach this',
    icon: Lightbulb,
  },
  research: {
    label: 'Research needed',
    prompt: 'What should I research or learn before starting this?',
    icon: Search,
  },
  action_steps: {
    label: 'Next actions',
    prompt: 'What are the concrete next actions I should take?',
    icon: CheckSquare,
  },
};

const HABIT_PRESETS: Record<string, PresetConfig> = {
  setup: {
    label: 'Help me set this up',
    prompt:
      'Help me design this habit properly - what should it look like, when should I do it, how long should it take, and what will make it stick?',
    icon: Sparkles,
  },
  why_skipping: {
    label: 'Why do I keep skipping?',
    prompt:
      "I've been struggling to stay consistent with this habit. Help me figure out what's getting in the way.",
    icon: AlertCircle,
  },
  make_easier: {
    label: 'Make it easier',
    prompt:
      'Help me find ways to lower the friction for this habit - maybe stack it with something, reduce the scope, or find a better trigger.',
    icon: Compass,
  },
};

const NOTE_PRESETS: Record<string, PresetConfig> = {
  expand: {
    label: 'Expand on this',
    prompt: 'Help me expand on this idea',
    icon: Sparkles,
  },
  action_steps: {
    label: 'Make actionable',
    prompt: 'Turn this into actionable steps',
    icon: CheckSquare,
  },
  think_through: {
    label: 'Think deeper',
    prompt: 'Help me think deeper about this',
    icon: Lightbulb,
  },
  research: {
    label: 'What to explore',
    prompt: 'What related topics should I explore?',
    icon: Search,
  },
};

const getPresetsForType = (entityType: 'todo' | 'habit' | 'note'): Record<string, PresetConfig> => {
  switch (entityType) {
    case 'todo':
      return TODO_PRESETS;
    case 'habit':
      return HABIT_PRESETS;
    case 'note':
      return NOTE_PRESETS;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

const getEntityTitle = (entity: Todo | Habit | Note | undefined): string => {
  if (!entity) return 'Unknown';
  if ('name' in entity && entity.name) return entity.name;
  if ('title' in entity && entity.title) return entity.title;
  return 'Untitled';
};

const getEntitySubtitle = (
  entity: Todo | Habit | Note | undefined,
  entityType: 'todo' | 'habit' | 'note',
  spaceName?: string,
): string => {
  const parts: string[] = [];

  if (entityType === 'todo') {
    parts.push('Todo');
    const todo = entity as Todo | undefined;
    if (todo?.time_estimate_minutes) {
      parts.push(`${todo.time_estimate_minutes}min`);
    }
  } else if (entityType === 'habit') {
    parts.push('Habit');
    const habit = entity as Habit | undefined;
    if (habit?.frequency) {
      parts.push(habit.frequency);
    }
  } else {
    parts.push('Note');
  }

  if (spaceName) {
    parts.push(spaceName);
  }

  return parts.join(' · ');
};

const getDaysSinceCreated = (createdAt: string): number => {
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

/**
 * Liberal saveable detection - bias toward showing Save button for structured/actionable content
 */
const isContentSaveable = (
  content: string,
  apiSaveable?: { detected?: boolean } | null,
): boolean => {
  // Trust API if it says saveable
  if (apiSaveable?.detected) return true;

  // Check for bullet points or numbered lists
  const hasBullets = /^[\s]*[-•*]\s+.+$/gm.test(content);
  const hasNumbers = /^[\s]*\d+[.)]\s+.+$/gm.test(content);
  if (hasBullets || hasNumbers) return true;

  // Check for substantial content (>100 words)
  const wordCount = content.split(/\s+/).length;
  if (wordCount > 100) return true;

  // Check for actionable phrases
  const actionable = /\b(you could|consider|try|start with|here's|here are)\b/i.test(content);
  if (actionable) return true;

  return false;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function EntityChatScreen({
  entityId,
  entityType,
  initialPreset,
  sweepContext,
  onClose,
  onPromoteToSpace,
}: EntityChatScreenProps) {
  // ─── Store Selectors ───────────────────────────────────────────────────────
  const todos = useGremlyStore((s) => s.todos);
  const habits = useGremlyStore((s) => s.habits);
  const notes = useGremlyStore((s) => s.notes);
  const spaces = useGremlyStore((s) => s.spaces);
  const getEntityChat = useGremlyStore((s) => s.getEntityChat);
  const appendEntityChatMessage = useGremlyStore((s) => s.appendEntityChatMessage);
  const createStreamingMessage = useGremlyStore((s) => s.createEntityChatStreamingMessage);
  const updateStreamingContent = useGremlyStore((s) => s.updateEntityChatStreamingContent);
  // Entity creation (for smart save)
  const createTodo = useGremlyStore((s) => s.createTodo);
  const createHabit = useGremlyStore((s) => s.createHabit);
  const createNote = useGremlyStore((s) => s.createNote);
  const updateStreamingSearching = useGremlyStore((s) => s.updateEntityChatStreamingSearching);
  const finalizeStreamingMessage = useGremlyStore((s) => s.finalizeEntityChatStreamingMessage);
  const saveEntityChatNote = useGremlyStore((s) => s.saveEntityChatNote);
  const accountCreatedAt = useGremlyStore((s) => s.accountCreatedAt);

  // ─── Get Entity ────────────────────────────────────────────────────────────
  const entity = useMemo(() => {
    if (entityType === 'todo') return todos.find((t) => t.id === entityId);
    if (entityType === 'habit') return habits.find((h) => h.id === entityId);
    return notes.find((n) => n.id === entityId);
  }, [entityId, entityType, todos, habits, notes]);

  const spaceName = useMemo(() => {
    const spaceId = entity?.space_id;
    if (!spaceId) return undefined;
    return spaces.find((s) => s.id === spaceId)?.name;
  }, [entity, spaces]);

  // ─── Chat Data ─────────────────────────────────────────────────────────────
  const chatData = getEntityChat(entityId, entityType);
  const storedMessages = chatData?.messages ?? [];

  // ─── Local State ───────────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(false);
  const [lastSaveable, setLastSaveable] = useState<EntityChatResponse['saveable'] | null>(null);
  const [lastSaveSuggestion, setLastSaveSuggestion] = useState<
    EntityChatResponse['save_suggestion'] | null
  >(null);
  const [lastAssistantMessageId, setLastAssistantMessageId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'initial' | 'loading' | 'confirmed'>('initial');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const streamRef = useRef<{ close: () => void } | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const hasUsedInitialPresetRef = useRef(false);

  // ─── Presets ───────────────────────────────────────────────────────────────
  const presets = getPresetsForType(entityType);
  // Keep presets visible during animation (selectedPreset is set but messages not yet sent)
  const showPresets = storedMessages.length === 0 && !isLoading;

  // ─── Combined Messages ───────────────────────────────────────────────
  // Streaming messages are now managed in the store, so we just use storedMessages directly
  const messages = storedMessages;

  // ─── Send Message Handler ──────────────────────────────────────────────────
  const handleSendMessage = useCallback(
    async (text: string, preset?: EntityChatPreset) => {
      if (!entity || isLoading) return;

      setIsLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      try {
        // 1. Append user message to store
        await appendEntityChatMessage(entityId, entityType, {
          role: 'user',
          content: text,
          metadata: preset ? { preset_used: preset } : undefined,
        });

        // 2. Create streaming message placeholder in store (message lives in store from start)
        const streamingMsgId = createStreamingMessage(entityId, entityType);
        streamingMessageIdRef.current = streamingMsgId;

        // 3. Build entity context for request
        const entityContext: EntityChatRequest['entity'] = {
          id: entity.id,
          type: entityType,
          title: getEntityTitle(entity),
          created_at: entity.created_at,
          days_since_created: getDaysSinceCreated(entity.created_at),
        };

        // Add type-specific fields
        if (entityType === 'todo') {
          const todo = entity as Todo;
          entityContext.body = todo.body ?? undefined;
          entityContext.due_date = todo.due_day ?? todo.due_date ?? undefined;
          entityContext.time_estimate = todo.time_estimate_minutes ?? undefined;
          entityContext.tags = todo.tags ?? undefined;
        } else if (entityType === 'habit') {
          const habit = entity as Habit;
          entityContext.frequency = habit.frequency ?? undefined;
          entityContext.tags = habit.tags ?? undefined;
        } else {
          const note = entity as Note;
          entityContext.body = note.body ?? undefined;
          entityContext.tags = note.tags ?? undefined;
        }

        if (spaceName) {
          entityContext.space_name = spaceName;
        }

        // 4. Build messages for request (include history, exclude the streaming placeholder)
        const requestMessages = [
          ...storedMessages
            .filter((m) => m.id !== streamingMsgId)
            .map((m) => ({ role: m.role, content: m.content })),
          { role: 'user' as const, content: text },
        ];

        // 5. Build full request
        const request: EntityChatRequest = {
          type: 'entity-chat',
          stream: true,
          entity: entityContext,
          messages: requestMessages,
          preset,
          sweepContext,
          accountCreatedAt,
        };

        // Track accumulated content for updates
        let accumulatedContent = '';

        // 6. Call streaming API
        streamRef.current = callEntityChatStreaming(request, {
          onSearching: (query) => {
            if (streamingMessageIdRef.current) {
              updateStreamingSearching(
                entityId,
                entityType,
                streamingMessageIdRef.current,
                true,
                query,
              );
            }
          },
          onFetching: (isFetching, fetchingUrl) => {
            if (streamingMessageIdRef.current) {
              // Reuse searching state update for fetching indicator
              // The metadata will have isFetching/fetchingUrl instead of isSearching/searchQuery
              updateStreamingSearching(
                entityId,
                entityType,
                streamingMessageIdRef.current,
                false, // Clear searching
                null,
              );
              // Update message with fetching state directly
              const state = useGremlyStore.getState();
              const updateFetching = (msg: any) => 
                msg.id === streamingMessageIdRef.current
                  ? { ...msg, metadata: { ...msg.metadata, isFetching, fetchingUrl } }
                  : msg;
              if (entityType === 'todo') {
                const todo = state.todos.find(t => t.id === entityId);
                if (todo?.views?.chat) {
                  const chat = todo.views.chat as any;
                  useGremlyStore.setState({
                    todos: state.todos.map(t => t.id === entityId ? {
                      ...t,
                      views: { ...t.views, chat: { ...chat, messages: chat.messages.map(updateFetching) } }
                    } : t)
                  });
                }
              } else if (entityType === 'habit') {
                const habit = state.habits.find(h => h.id === entityId);
                if (habit?.views?.chat) {
                  const chat = habit.views.chat as any;
                  useGremlyStore.setState({
                    habits: state.habits.map(h => h.id === entityId ? {
                      ...h,
                      views: { ...h.views, chat: { ...chat, messages: chat.messages.map(updateFetching) } }
                    } : h)
                  });
                }
              } else if (entityType === 'note') {
                const note = state.notes.find(n => n.id === entityId);
                if (note?.views?.chat) {
                  const chat = note.views.chat as any;
                  useGremlyStore.setState({
                    notes: state.notes.map(n => n.id === entityId ? {
                      ...n,
                      views: { ...n.views, chat: { ...chat, messages: chat.messages.map(updateFetching) } }
                    } : n)
                  });
                }
              }
            }
          },
          onDelta: (delta) => {
            // Accumulate content and update the streaming message in place
            accumulatedContent += delta;
            if (streamingMessageIdRef.current) {
              updateStreamingContent(
                entityId,
                entityType,
                streamingMessageIdRef.current,
                accumulatedContent,
              );
            }
          },
          onComplete: async (response) => {
            // Clear searching state when content arrives
            if (streamingMessageIdRef.current) {
              updateStreamingSearching(
                entityId,
                entityType,
                streamingMessageIdRef.current,
                false,
                null,
              );
            }
            const msgId = streamingMessageIdRef.current;
            if (!msgId) return;

            console.log('[EntityChatScreen] Stream complete:', {
              msgId,
              contentLength: response.content?.length,
              apiSaveable: response.saveable,
            });

            // Debug log for save_suggestion
            console.log('[DEBUG] save_suggestion =', response.save_suggestion);

            // Use liberal saveable detection OR save_suggestion from Worker
            const apiSuggestsSave = response.saveable?.detected === true;
            // Smart suggestion has type and title (new format)
            const workerSuggestsSave = !!(
              response.save_suggestion?.type && response.save_suggestion?.title
            );
            const shouldShowSave =
              apiSuggestsSave ||
              workerSuggestsSave ||
              isContentSaveable(response.content, response.saveable);
            console.log('[EntityChatScreen] Saveable detection:', {
              shouldShowSave,
              apiDetected: response.saveable?.detected,
              workerSuggestsSave,
            });

            // If we fetched a URL, add it to sources
            let finalSources = response.sources || [];
            if (response.fetchedUrl) {
              finalSources = [response.fetchedUrl, ...finalSources];
            }

            // Finalize the streaming message (removes isStreaming flag, persists to DB)
            await finalizeStreamingMessage(entityId, entityType, msgId, response.content, {
              has_saveable_content: shouldShowSave,
              sources: finalSources,
              search_query: response.search_query,
            });

            // Track saveable content for SaveButton
            if (shouldShowSave) {
              // Use API saveable if available, otherwise create a basic one
              const saveableData = response.saveable?.detected
                ? response.saveable
                : { detected: true, type: 'note' as const, content: response.content };
              console.log('[EntityChatScreen] Setting saveable state:', {
                saveableData,
                msgId,
                hasSaveSuggestion: response.save_suggestion != null,
              });
              setLastSaveable(saveableData);
              setLastSaveSuggestion(response.save_suggestion ?? null);
              setLastAssistantMessageId(msgId);
              setSaveState('initial');
            }

            streamingMessageIdRef.current = null;
            setIsLoading(false);
            streamRef.current = null;

            // Scroll to bottom after message finalized
            setTimeout(() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
          },
          onError: async (error) => {
            // Clear searching state on error
            if (streamingMessageIdRef.current) {
              updateStreamingSearching(
                entityId,
                entityType,
                streamingMessageIdRef.current,
                false,
                null,
              );
            }
            console.error('[EntityChatScreen] Stream error:', error);

            const msgId = streamingMessageIdRef.current;
            if (msgId) {
              // Finalize with error message
              await finalizeStreamingMessage(
                entityId,
                entityType,
                msgId,
                "I'm having trouble responding right now. Please try again.",
              );
            }

            streamingMessageIdRef.current = null;
            setIsLoading(false);
            streamRef.current = null;
          },
        });

        // Scroll to bottom
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      } catch (error) {
        console.error('[EntityChatScreen] Send error:', error);
        setIsLoading(false);
      }
    },
    [
      entity,
      entityId,
      entityType,
      isLoading,
      appendEntityChatMessage,
      createStreamingMessage,
      updateStreamingContent,
      updateStreamingSearching,
      finalizeStreamingMessage,
      storedMessages,
      spaceName,
      sweepContext,
      accountCreatedAt,
    ],
  );

  // ─── Handle Initial Preset ─────────────────────────────────────────────────
  useEffect(() => {
    if (initialPreset && !hasUsedInitialPresetRef.current && messages.length === 0 && entity) {
      hasUsedInitialPresetRef.current = true;
      const presetConfig = presets[initialPreset];
      if (presetConfig) {
        // Use queueMicrotask to avoid synchronous setState in effect
        queueMicrotask(() => {
          handleSendMessage(presetConfig.prompt, initialPreset);
        });
      }
    }
  }, [initialPreset, messages.length, entity, presets, handleSendMessage]);

  // ─── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      streamRef.current?.close();
    };
  }, []);
  // ─── Scroll to bottom on mount ───────────────────────────────────────────
  useEffect(() => {
    // Scroll to bottom when chat opens with existing messages
    if (storedMessages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 150);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount

  // ─── Handle Preset Tap ─────────────────────────────────────────────────────
  const handlePresetTap = useCallback(
    (presetKey: string) => {
      // Set selected state to trigger animations
      setSelectedPreset(presetKey);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Delay sending message to let full animation sequence play:
      // - 0-300ms: Unselected buttons float up and fade out
      // - 300-550ms: Selected button swipes right off screen
      setTimeout(() => {
        const presetConfig = presets[presetKey];
        if (presetConfig) {
          handleSendMessage(presetConfig.prompt, presetKey as EntityChatPreset);
        }
      }, 550);
    },
    [presets, handleSendMessage],
  );

  // ─── Handle Save Note ──────────────────────────────────────────────────────
  const MAX_NOTES_PER_ENTITY = 5;

  const handleSaveNote = useCallback(
    async (saveable: EntityChatResponse['saveable']) => {
      if (!saveable) return;

      setSaveState('loading');

      // Get the full content from the last assistant message
      const messages = getEntityChat(entityId, entityType)?.messages ?? [];
      const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
      const fallbackContent = lastAssistant?.content ?? 'Saved from chat';

      try {
        // ─── SMART SAVE: Create new entity (skip Phase 1 classification) ─────
        if (lastSaveSuggestion?.type && lastSaveSuggestion?.title) {
          console.log('[EntityChatScreen] Smart save - creating new entity (skipping Phase 1):', {
            type: lastSaveSuggestion.type,
            title: lastSaveSuggestion.title,
            hasSteps: !!lastSaveSuggestion.steps?.length,
          });

          const title = lastSaveSuggestion.title;
          const type = lastSaveSuggestion.type;

          if (type === 'todo') {
            // Format steps as part of the body if present
            let body = fallbackContent;
            if (lastSaveSuggestion.steps?.length) {
              const stepsText = lastSaveSuggestion.steps.map((step: string, i: number) => `${i + 1}. ${step}`).join('\n');
              body = `Steps:\n${stepsText}\n\n---\n${fallbackContent}`;
            }

            await createTodo({
              name: title,
              body,
            });
            console.log('[EntityChatScreen] Created todo:', title);
          } else if (type === 'habit') {
            await createHabit({
              name: title,
              notes: fallbackContent, // Include assistant's response as notes
            });
            console.log('[EntityChatScreen] Created habit:', title);
          } else {
            // note
            await createNote({
              title,
              body: fallbackContent,
            });
            console.log('[EntityChatScreen] Created note:', title);
          }

          setSaveState('confirmed');
          return;
        }

        // ─── FALLBACK: Save as note to current entity (existing behavior) ────
        const existingNotes = getEntityChat(entityId, entityType)?.notes ?? [];
        if (existingNotes.length >= MAX_NOTES_PER_ENTITY) {
          Alert.alert(
            'Limit Reached',
            'You can save up to 5 notes per item. Consider creating a Space for deeper work.',
          );
          setSaveState('initial');
          return;
        }

        const noteData = {
          content: fallbackContent,
          is_checklist: false,
          source_message_id: lastAssistantMessageId || '',
        };

        console.log('[EntityChatScreen] Fallback - saving note to entity:', { entityId, entityType, noteData });
        await saveEntityChatNote(entityId, entityType, noteData);
        console.log('[EntityChatScreen] Note saved successfully');
        setSaveState('confirmed');
      } catch (error) {
        console.error('[EntityChatScreen] Save error:', error);
        setSaveState('initial');
      }
    },
    [
      entityId,
      entityType,
      saveEntityChatNote,
      lastAssistantMessageId,
      getEntityChat,
      lastSaveSuggestion,
      createTodo,
      createHabit,
      createNote,
    ],
  );

  // ─── Handle Dismiss Saveable ───────────────────────────────────────────────
  const handleDismissSaveable = useCallback(() => {
    setLastSaveable(null);
    setLastSaveSuggestion(null);
    setLastAssistantMessageId(null);
    setSaveState('initial');
  }, []);

  // ─── Get Saveable Type for SaveButton ──────────────────────────────────────
  const getSaveableType = (type: string | undefined): SaveableType => {
    if (type === 'checklist') return 'log-general';
    return 'log-general'; // 'note' maps to 'log-general'
  };

  // ─── Saved Notes (for deriving saved state from persisted data) ─────────────
  const savedNotes = chatData?.notes ?? [];

  // ─── Render Message ────────────────────────────────────────────────────────
  const renderMessage = useCallback(
    ({ item }: { item: EntityChatMessage }) => {
      // Check if this is the streaming message
      const isStreamingMessage = item.metadata?.isStreaming === true;
      const isSearchingMessage = item.metadata?.isSearching === true;

      // Convert EntityChatMessage to SpaceChatMessage shape for ChatBubble
      const bubbleMessage: SpaceChatMessage & { isStreaming?: boolean } = {
        id: item.id,
        chat_id: `entity-chat-${entityId}`, // Virtual chat ID for entity chats
        space_id: entity?.space_id ?? '',
        user_id: '', // Not needed for display
        role: item.role,
        content: item.content,
        created_at: item.created_at,
        isStreaming: isStreamingMessage,
      };

      // Check if this message was already saved (persisted state)
      const savedNote = savedNotes.find((n) => n.source_message_id === item.id);
      const isAlreadySaved = !!savedNote;

      // Determine if we should show the SaveButton:
      // 1. If already saved - show confirmed state (persisted)
      // 2. If this is the current saveable message - show based on local state
      const isCurrentSaveableMessage = item.id === lastAssistantMessageId && lastSaveable?.detected;
      const showSaveButton = isAlreadySaved || isCurrentSaveableMessage;

      // Determine the save button state:
      // - If already saved in store, show 'confirmed'
      // - Otherwise use the local saveState
      const buttonState: 'initial' | 'loading' | 'confirmed' = isAlreadySaved
        ? 'confirmed'
        : saveState;

      // Debug logging for save button visibility
      if (item.role === 'assistant' && !isStreamingMessage) {
        console.log('[EntityChatScreen] Render message:', {
          msgId: item.id,
          isAlreadySaved,
          isCurrentSaveableMessage,
          showSaveButton,
          buttonState,
        });
      }

      return (
        <View>
          {isSearchingMessage ? (
            <View style={styles.searchingIndicator}>
              <ActivityIndicator size="small" color="#8B5CF6" />
              <Text style={styles.searchingText}>Searching: {item.metadata?.searchQuery}</Text>
            </View>
          ) : (
            <>
              <ChatBubble message={bubbleMessage as SpaceChatMessage} />
              {item.metadata?.sources && item.metadata.sources.length > 0 && (
                <View style={styles.sourcesRow}>
                  <Text style={styles.sourcesLabel}>Sources:</Text>
                  {item.metadata.sources
                    .slice(0, 3)
                    .map((source: { title: string; url: string }, idx: number) => {
                      // Extract domain
                      let domain = '';
                      try {
                        domain = new URL(source.url).hostname.replace('www.', '');
                      } catch {
                        domain = source.url;
                      }
                      
                      // Generate consistent color from domain for fallback
                      const colors = ['#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#6366F1'];
                      const hash = domain.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
                      const dotColor = colors[hash % colors.length];
                      
                      // Use DuckDuckGo's favicon service
                      const faviconUrl = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
                      const displayName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
                      
                      return (
                        <React.Fragment key={idx}>
                          {idx > 0 && <Text style={styles.sourceSeparator}>·</Text>}
                          <TouchableOpacity
                            onPress={() => Linking.openURL(source.url)}
                            style={styles.sourceItem}
                            activeOpacity={0.7}
                          >
                            <Image
                              source={{ uri: faviconUrl }}
                              style={styles.sourceFavicon}
                              resizeMode="cover"
                              defaultSource={{ uri: `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14'><circle cx='7' cy='7' r='5' fill='${encodeURIComponent(dotColor)}'/></svg>` }}
                            />
                            <Text style={styles.sourceName} numberOfLines={1}>
                              {displayName}
                            </Text>
                          </TouchableOpacity>
                        </React.Fragment>
                      );
                    })}
                </View>
              )}
            </>
          )}
          {showSaveButton && (
            <View style={styles.saveButtonWrapper}>
              <SaveButton
                visible={true}
                state={buttonState}
                suggestedType={getSaveableType(isAlreadySaved ? 'note' : lastSaveable?.type)}
                entityName={getEntityTitle(entity)}
                onSave={() => handleSaveNote(lastSaveable ?? undefined)}
                onEdit={() => {
                  // For now, just save - edit functionality can be added later
                  handleSaveNote(lastSaveable ?? undefined);
                }}
                onDismiss={handleDismissSaveable}
                smartSuggestion={
                  lastSaveSuggestion && lastSaveSuggestion.type && lastSaveSuggestion.title
                    ? {
                        type: lastSaveSuggestion.type as 'todo' | 'habit' | 'note',
                        title: lastSaveSuggestion.title,
                        steps: lastSaveSuggestion.steps,
                      }
                    : undefined
                }
                onTypeChange={(newType) => {
                  // Update the suggestion type when user cycles through
                  if (lastSaveSuggestion) {
                    setLastSaveSuggestion({ ...lastSaveSuggestion, type: newType });
                  }
                }}
              />
            </View>
          )}
        </View>
      );
    },
    [
      entity,
      entityId,
      savedNotes,
      lastAssistantMessageId,
      lastSaveable,
      lastSaveSuggestion,
      saveState,
      handleSaveNote,
      handleDismissSaveable,
    ],
  );

  // Streaming message is now included in the messages data array above

  // ─── Render ────────────────────────────────────────────────────────────────
  if (!entity) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerButton}>
            <X size={24} color={lightTokens.colors.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Entity not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerButton}>
            <ChevronLeft size={24} color={lightTokens.colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {getEntityTitle(entity)}
            </Text>
            {/* Golden underline accent */}
            <View style={styles.headerUnderline} />
          </View>
          <TouchableOpacity onPress={onClose} style={styles.headerButton}>
            <X size={24} color={lightTokens.colors.text} />
          </TouchableOpacity>
        </View>

        {/* Context Card */}
        <View style={styles.contextCard}>
          <Text style={styles.contextText}>{getEntitySubtitle(entity, entityType, spaceName)}</Text>
        </View>

        {/* Main Content Area */}
        <View style={styles.content}>
          {/* Presets (only when no messages) */}
          {showPresets && (
            <View style={styles.presetsSection}>
              <Text style={styles.presetsTitle}>Ask Gremly to help you:</Text>
              <View style={styles.presetsList}>
                {Object.entries(presets).map(([key, config], index) => {
                  const IconComponent = config.icon;
                  const isSelected = selectedPreset === key;
                  const isUnselected = selectedPreset !== null && selectedPreset !== key;

                  // Unselected: float up and fade out
                  if (isUnselected) {
                    return (
                      <Animated.View
                        key={key}
                        style={[styles.presetChipWrapper, styles.presetChip]}
                        exiting={FadeOutUp.duration(250).delay(index * 40)}
                      >
                        <Text style={styles.presetLabel}>{config.label}</Text>
                        <IconComponent size={16} color={lightTokens.colors.mossGreen} />
                      </Animated.View>
                    );
                  }

                  // Selected: turn green immediately, then swipe right after others gone
                  if (isSelected) {
                    return (
                      <Animated.View
                        key={key}
                        style={styles.presetChipWrapper}
                        exiting={SlideOutRight.duration(250).delay(300)}
                      >
                        <View style={[styles.presetChip, styles.selectedPresetChip]}>
                          <Text style={[styles.presetLabel, styles.selectedPresetLabel]}>
                            {config.label}
                          </Text>
                          <IconComponent size={16} color="#FFFFFF" />
                        </View>
                      </Animated.View>
                    );
                  }

                  // Default state (nothing selected yet) with entrance animation
                  return (
                    <Animated.View
                      key={key}
                      style={styles.presetChipWrapper}
                      entering={FadeInRight.duration(200).delay(index * 50)}
                      layout={Layout.springify()}
                    >
                      <TouchableOpacity
                        style={styles.presetChip}
                        onPress={() => handlePresetTap(key)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.presetLabel}>{config.label}</Text>
                        <IconComponent size={16} color={lightTokens.colors.mossGreen} />
                      </TouchableOpacity>
                    </Animated.View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Message List */}
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            style={styles.messages}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() => {
              if (messages.length > 0) {
                flatListRef.current?.scrollToEnd({ animated: false });
              }
            }}
          />
        </View>

        {/* Composer */}
        <View style={styles.composerContainer}>
          <ChatComposer
            onSend={(text) => handleSendMessage(text)}
            placeholder="Ask Gremly..."
            disabled={isLoading}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#D4E4D4', // Sage green - matches Spaces Chat
  },
  keyboardAvoid: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: 'transparent',
  },
  headerButton: {
    padding: 8,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: lightTokens.typography.fontFamily.medium,
    color: lightTokens.colors.text,
  },
  headerUnderline: {
    width: 40,
    height: 3,
    backgroundColor: '#E0C47A', // Golden accent
    borderRadius: 2,
    marginTop: 4,
  },

  // Context Card
  contextCard: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.3)', // Very subtle glass on sage
  },
  contextText: {
    fontSize: 13,
    fontFamily: lightTokens.typography.fontFamily.regular,
    color: lightTokens.colors.subtle,
  },

  // Content
  content: {
    flex: 1,
  },

  // Presets
  presetsSection: {
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  presetsTitle: {
    fontSize: 15,
    fontFamily: lightTokens.typography.fontFamily.medium,
    color: lightTokens.colors.text,
    marginBottom: 12,
    textAlign: 'right',
  },
  presetsList: {
    alignItems: 'flex-end',
    gap: 10,
  },
  presetChipWrapper: {
    // Wrapper for animation targeting
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    // Subtle shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  selectedPresetChip: {
    backgroundColor: '#5C6B5A', // Sage green solid
  },
  presetLabel: {
    fontSize: 14,
    fontFamily: lightTokens.typography.fontFamily.medium,
    color: lightTokens.colors.text,
  },
  selectedPresetLabel: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // Messages container
  messages: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  // Messages content - ChatBubble handles its own styling
  messageList: {
    padding: 16,
    paddingBottom: 140, // Account for input field + SaveButton + safe area
  },
  saveButtonWrapper: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  searchingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchingText: {
    marginLeft: 8,
    color: '#6B7280',
    fontSize: 14,
    fontStyle: 'italic',
  },

  // Sources display - compact with favicons
  sourcesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 4,
  },
  sourcesLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginRight: 6,
  },
  sourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sourceFavicon: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
  sourceName: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  sourceSeparator: {
    fontSize: 12,
    color: '#D1D5DB',
    marginHorizontal: 4,
  },

  // Composer
  composerContainer: {
    backgroundColor: 'transparent',
    paddingHorizontal: 8,
    paddingBottom: 4,
  },

  // Empty State
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontFamily: lightTokens.typography.fontFamily.regular,
    color: lightTokens.colors.subtle,
  },
});

export default EntityChatScreen;
