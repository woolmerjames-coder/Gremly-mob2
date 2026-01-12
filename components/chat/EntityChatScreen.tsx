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
  ScrollView,
} from 'react-native';
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
  stay_consistent: {
    label: 'Stay consistent',
    prompt: 'Help me stay consistent with this habit',
    icon: Target,
  },
  whats_blocking: {
    label: "What's blocking me?",
    prompt: "What might be getting in the way of this habit? Let's troubleshoot.",
    icon: AlertCircle,
  },
  approach: {
    label: 'Better approach',
    prompt: 'Is there a better way to approach this habit?',
    icon: Compass,
  },
  think_through: {
    label: 'Think through',
    prompt: 'Help me think through why this habit matters to me',
    icon: Lightbulb,
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
  const saveEntityChatNote = useGremlyStore((s) => s.saveEntityChatNote);

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
  const [streamingContent, setStreamingContent] = useState('');
  const [lastSaveable, setLastSaveable] = useState<EntityChatResponse['saveable'] | null>(null);
  const [lastAssistantMessageId, setLastAssistantMessageId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'initial' | 'loading' | 'confirmed'>('initial');

  const flatListRef = useRef<FlatList>(null);
  const streamRef = useRef<{ close: () => void } | null>(null);
  const hasUsedInitialPresetRef = useRef(false);

  // ─── Presets ───────────────────────────────────────────────────────────────
  const presets = getPresetsForType(entityType);
  const showPresets = storedMessages.length === 0 && !isLoading;

  // ─── Combined Messages (including streaming) ─────────────────────────────────
  // Include streaming message in the data array for stable rendering
  const messages = useMemo(() => {
    const result = [...storedMessages];

    // Add streaming message if loading
    if (isLoading) {
      const streamingMessage: EntityChatMessage = {
        id: 'streaming-temp',
        role: 'assistant',
        content: streamingContent,
        created_at: new Date().toISOString(),
        metadata: { isStreaming: true },
      };
      result.push(streamingMessage);
    }

    return result;
  }, [storedMessages, isLoading, streamingContent]);

  // ─── Send Message Handler ──────────────────────────────────────────────────
  const handleSendMessage = useCallback(
    async (text: string, preset?: EntityChatPreset) => {
      if (!entity || isLoading) return;

      setIsLoading(true);
      setStreamingContent('');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      try {
        // 1. Append user message to store
        await appendEntityChatMessage(entityId, entityType, {
          role: 'user',
          content: text,
          metadata: preset ? { preset_used: preset } : undefined,
        });

        // 2. Build entity context for request
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

        // 3. Build messages for request (include history)
        const requestMessages = [
          ...storedMessages.map((m) => ({ role: m.role, content: m.content })),
          { role: 'user' as const, content: text },
        ];

        // 4. Build full request
        const request: EntityChatRequest = {
          type: 'entity-chat',
          stream: true,
          entity: entityContext,
          messages: requestMessages,
          preset,
          sweepContext,
        };

        // 5. Call streaming API
        streamRef.current = callEntityChatStreaming(request, {
          onDelta: (delta) => {
            setStreamingContent((prev) => prev + delta);
          },
          onComplete: async (response) => {
            // Append assistant message to store
            const newMessage = await appendEntityChatMessage(entityId, entityType, {
              role: 'assistant',
              content: response.content,
              metadata: {
                has_saveable_content: response.saveable?.detected,
              },
            });

            // Track saveable content for SaveButton
            if (response.saveable?.detected && newMessage) {
              setLastSaveable(response.saveable);
              setLastAssistantMessageId(newMessage.id);
              setSaveState('initial');
            }

            setStreamingContent('');
            setIsLoading(false);
            streamRef.current = null;

            // Scroll to bottom after message added
            setTimeout(() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
          },
          onError: async (error) => {
            console.error('[EntityChatScreen] Stream error:', error);

            // Append error message
            await appendEntityChatMessage(entityId, entityType, {
              role: 'assistant',
              content: "I'm having trouble responding right now. Please try again.",
            });

            setStreamingContent('');
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
        setStreamingContent('');
      }
    },
    [
      entity,
      entityId,
      entityType,
      isLoading,
      appendEntityChatMessage,
      storedMessages,
      spaceName,
      sweepContext,
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

  // ─── Handle Preset Tap ─────────────────────────────────────────────────────
  const handlePresetTap = useCallback(
    (presetKey: string) => {
      const presetConfig = presets[presetKey];
      if (presetConfig) {
        handleSendMessage(presetConfig.prompt, presetKey as EntityChatPreset);
      }
    },
    [presets, handleSendMessage],
  );

  // ─── Handle Save Note ──────────────────────────────────────────────────────
  const handleSaveNote = useCallback(
    async (saveable: EntityChatResponse['saveable']) => {
      if (!saveable) return;

      setSaveState('loading');

      try {
        await saveEntityChatNote(entityId, entityType, {
          content: saveable.checklist_items?.join('\n') || 'Saved from chat',
          is_checklist: saveable.type === 'checklist',
          checklist_items: saveable.checklist_items?.map((label, idx) => ({
            id: `item_${idx}`,
            label,
            completed: false,
          })),
          source_message_id: lastAssistantMessageId || '',
        });

        setSaveState('confirmed');
      } catch (error) {
        console.error('[EntityChatScreen] Save error:', error);
        setSaveState('initial'); // Reset on error
      }
    },
    [entityId, entityType, saveEntityChatNote, lastAssistantMessageId],
  );

  // ─── Handle Dismiss Saveable ───────────────────────────────────────────────
  const handleDismissSaveable = useCallback(() => {
    setLastSaveable(null);
    setLastAssistantMessageId(null);
    setSaveState('initial');
  }, []);

  // ─── Get Saveable Type for SaveButton ──────────────────────────────────────
  const getSaveableType = (type: string | undefined): SaveableType => {
    if (type === 'checklist') return 'log-general';
    return 'log-general'; // 'note' maps to 'log-general'
  };

  // ─── Render Message ────────────────────────────────────────────────────────
  const renderMessage = useCallback(
    ({ item }: { item: EntityChatMessage }) => {
      // Check if this is the streaming message
      const isStreamingMessage = item.metadata?.isStreaming === true;

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

      // Check if this is the last assistant message with saveable content
      const showSaveButton =
        item.id === lastAssistantMessageId && lastSaveable?.detected && saveState !== 'confirmed';

      return (
        <View>
          <ChatBubble message={bubbleMessage as SpaceChatMessage} />
          {showSaveButton && (
            <View style={styles.saveButtonWrapper}>
              <SaveButton
                visible={true}
                state={saveState}
                suggestedType={getSaveableType(lastSaveable?.type)}
                onSave={() => handleSaveNote(lastSaveable)}
                onEdit={() => {
                  // For now, just save - edit functionality can be added later
                  handleSaveNote(lastSaveable);
                }}
                onDismiss={handleDismissSaveable}
              />
            </View>
          )}
        </View>
      );
    },
    [
      entity,
      entityId,
      lastAssistantMessageId,
      lastSaveable,
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
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.presetsScroll}
              >
                {Object.entries(presets).map(([key, config]) => {
                  const IconComponent = config.icon;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={styles.presetChip}
                      onPress={() => handlePresetTap(key)}
                      activeOpacity={0.7}
                    >
                      <IconComponent size={16} color={lightTokens.colors.mossGreen} />
                      <Text style={styles.presetLabel}>{config.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Message List */}
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
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
  },
  presetsTitle: {
    fontSize: 15,
    fontFamily: lightTokens.typography.fontFamily.medium,
    color: lightTokens.colors.text,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  presetsScroll: {
    paddingHorizontal: 16,
    gap: 10,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 8,
    // Subtle shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  presetLabel: {
    fontSize: 14,
    fontFamily: lightTokens.typography.fontFamily.regular,
    color: lightTokens.colors.text,
  },

  // Messages - ChatBubble handles its own styling
  messageList: {
    paddingVertical: 16,
    paddingBottom: 8,
  },
  saveButtonWrapper: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
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
