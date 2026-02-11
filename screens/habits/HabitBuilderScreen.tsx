/**
 * HabitBuilderScreen — Guided chat for creating a new habit
 *
 * Architecture:
 * - Pure conversation from gpt-4.1 (no metadata in AI responses)
 * - Server-side extraction via gpt-4o-mini after each stream completes
 * - Deterministic chip map based on `next_field` from server
 * - Progress bar powered by `required_count` from server
 * - On confirm, creates habit via Zustand store
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { useAuth } from '../../providers/AuthProvider';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { callHabitBuilderStreaming } from '../../lib/cortex/CortexClient';
import { ChatBubble } from '../../components/chat/ChatBubble';
import { ChatComposer } from '../../components/chat/ChatComposer';
import { HabitBuilderProgress } from './HabitBuilderProgress';
import { Text } from '../../ui/Text';
import { lightTokens } from '../../design/tokens';
import type { SpaceChatMessage, HabitBuilderResolvedFields, HabitSubtype } from '../../lib/types';
import { dateService } from '../../lib/date/DateService';

// ─── Streaming Bubble ─────────────────────────────────────────────
// Self-updating component that reads from a content ref.
// FlatList never re-renders during streaming — only this component does.
interface StreamingBubbleProps {
  contentRef: React.MutableRefObject<string>;
  visible: boolean;
  isSearching: boolean;
  searchQuery: string | null;
}

function StreamingBubble({ contentRef, visible, isSearching, searchQuery }: StreamingBubbleProps) {
  const [displayContent, setDisplayContent] = useState('');

  useEffect(() => {
    if (!visible) {
      setDisplayContent('');
      return;
    }

    // Poll the ref at 60ms intervals for smooth text appearance
    const timer = setInterval(() => {
      const current = contentRef.current;
      if (current !== displayContent) {
        setDisplayContent(current);
      }
    }, 60);

    return () => clearInterval(timer);
  }, [visible, contentRef]); // intentionally exclude displayContent to avoid re-creating timer

  if (!visible) return null;

  // Show searching indicator when waiting for Tavily
  if (isSearching && !displayContent) {
    return (
      <Animated.View style={styles.searchingContainer} entering={FadeIn.duration(200)}>
        <Text style={styles.searchingText}>Searching: {searchQuery}</Text>
      </Animated.View>
    );
  }

  // Render the streaming message using ChatBubble
  const streamingMsg: SpaceChatMessage = {
    id: 'streaming-active',
    chat_id: '',
    space_id: '',
    user_id: '',
    role: 'assistant',
    content: displayContent,
    created_at: new Date().toISOString(),
    isStreaming: true,
  };

  return <ChatBubble message={streamingMsg} />;
}

// ─── Props ───────────────────────────────────────────────────────────
export interface HabitBuilderScreenProps {
  prefill?: string;
  spaceId?: string;
  onClose: () => void;
  onHabitCreated?: (habitId: string) => void;
}

// ─── Constants ───────────────────────────────────────────────────────
const EMPTY_RESOLVED: HabitBuilderResolvedFields = {
  name: null,
  habit_type: null,
  cadence: null,
  target: null,
  start_date: null,
  time_window: null,
  space_name: null,
  notes: null,
  end_date: null,
  time_estimate_minutes: null,
  is_confirmation: false,
  next_field: null,
  required_count: 0,
  suggested_chips: null,
};

let messageIdCounter = 0;
const nextId = () => `hb-msg-${Date.now()}-${++messageIdCounter}`;

// ─── Component ───────────────────────────────────────────────────────
export function HabitBuilderScreen({
  prefill,
  spaceId,
  onClose,
  onHabitCreated,
}: HabitBuilderScreenProps) {
  // ─── Auth & Store ───────────────────────────────────────────────
  const { user } = useAuth();
  const userName = useMemo(() => {
    const meta = (user as any)?.user_metadata;
    const name = meta?.full_name ?? (user as any)?.name ?? null;
    return name ? String(name).split(' ')[0] : undefined;
  }, [user]);

  const habits = useGremlyStore((s) => s.habits);
  const spaces = useGremlyStore((s) => s.spaces);
  const userId = useGremlyStore((s) => s.userId);
  const createHabit = useGremlyStore((s) => s.createHabit);
  const updateHabit = useGremlyStore((s) => s.updateHabit);

  // ─── State ──────────────────────────────────────────────────────
  const [messages, setMessages] = useState<SpaceChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [resolved, setResolved] = useState<HabitBuilderResolvedFields>(EMPTY_RESOLVED);
  const [isCreating, setIsCreating] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const streamRef = useRef<{ close: () => void } | null>(null);
  const hasStarted = useRef(false);
  const mountedRef = useRef(true);
  const streamContentRef = useRef<string>('');
  const createdHabitIdRef = useRef<string | null>(null);
  const [isStreamActive, setIsStreamActive] = useState(false);

  // ─── Build context ──────────────────────────────────────────────
  const chatContext = useMemo(() => {
    const now = new Date();
    return {
      currentDate: dateService.today(),
      dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
      userName: userName || undefined,
      existingHabits: habits
        .filter((h) => !h.archived_at)
        .map((h) => ({
          name: h.name,
          subtype: h.subtype || 'start_habit',
          frequency: h.frequency || undefined,
          space_name: spaces.find((s) => s.id === h.space_id)?.name,
        })),
      spaces: spaces.filter((s) => !s.archived_at).map((s) => ({ id: s.id, name: s.name })),
      prefill: prefill || undefined,
    };
  }, [habits, spaces, userName, prefill]);

  // ─── Send message ─────────────────────────────────────────────
  const handleSendMessage = useCallback(
    async (text: string, isInitial = false) => {
      if (isLoading) return;
      setIsLoading(true);

      // Create user message (skip display for auto-start)
      const userMsg: SpaceChatMessage = {
        id: nextId(),
        chat_id: '',
        space_id: '',
        user_id: '',
        role: 'user',
        content: text,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, ...(isInitial ? [] : [userMsg])]);

      // Reset the content ref and show the streaming bubble
      streamContentRef.current = '';
      setIsStreamActive(true);

      // Build request messages from history (exclude streaming placeholder)
      const requestMessages = messages
        .filter((m) => !(m as any).isStreaming)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      // Add the new user message
      if (isInitial && prefill) {
        requestMessages.push({ role: 'user', content: prefill });
      } else if (isInitial) {
        requestMessages.push({ role: 'user', content: 'I want to start a new habit' });
      } else {
        requestMessages.push({ role: 'user', content: text });
      }

      streamRef.current = callHabitBuilderStreaming(
        {
          type: 'habit-builder',
          stream: true,
          messages: requestMessages,
          context: chatContext,
        },
        {
          onDelta: (delta) => {
            if (!mountedRef.current) return;
            streamContentRef.current += delta;
          },
          onSearching: (query) => {
            if (!mountedRef.current) return;
            setIsSearching(true);
            setSearchQuery(query);
          },
          onComplete: (response) => {
            if (!mountedRef.current) return;

            setIsSearching(false);
            setSearchQuery(null);

            // Hide streaming bubble
            setIsStreamActive(false);

            // Add finalized message to FlatList data
            const finalMsg: SpaceChatMessage = {
              id: nextId(),
              chat_id: '',
              space_id: '',
              user_id: '',
              role: 'assistant',
              content: response.content,
              created_at: new Date().toISOString(),
              sources: response.sources,
            };

            setMessages((prev) => [...prev, finalMsg]);

            // Update resolved fields
            if (response.resolved_fields) {
              setResolved(response.resolved_fields);
            }

            // If we just created a habit and this is the send-off response, save tips as notes
            if (createdHabitIdRef.current && response.content) {
              const habitId = createdHabitIdRef.current;
              createdHabitIdRef.current = null; // Only save once

              // Combine motivation (from extraction) with tips (from send-off)
              const motivation = resolved.notes || '';
              const tips = response.content;
              const combinedNotes = motivation ? `${motivation}\n\n---\n\n${tips}` : tips;

              // Update the habit's notes field asynchronously
              updateHabit(habitId, { notes: combinedNotes }).catch((err: any) =>
                console.error('[HabitBuilder] Failed to save tips:', err),
              );
            }

            setIsLoading(false);
            streamRef.current = null;
            streamContentRef.current = '';

            setTimeout(() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            }, 150);
          },
          onError: (error) => {
            if (!mountedRef.current) return;
            setIsSearching(false);
            setSearchQuery(null);
            setIsStreamActive(false);
            console.error('[HabitBuilder] Stream error:', error);

            const errorMsg: SpaceChatMessage = {
              id: nextId(),
              chat_id: '',
              space_id: '',
              user_id: '',
              role: 'assistant',
              content: 'Having trouble right now — try again in a sec.',
              created_at: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, errorMsg]);
            setIsLoading(false);
            streamRef.current = null;
            streamContentRef.current = '';
          },
        },
      );

      if (!isInitial) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    },
    [isLoading, messages, chatContext, prefill, resolved.notes, updateHabit],
  );

  // ─── Auto-start ───────────────────────────────────────────────
  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      // Small delay to ensure first render completes and refs are stable
      requestAnimationFrame(() => {
        if (mountedRef.current) {
          const initialText = prefill || 'I want to start a new habit';
          handleSendMessage(initialText, true);
        }
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Create habit ────────────────────────────────────────────
  const handleCreateHabit = useCallback(async () => {
    if (isCreating || !resolved.name || !resolved.habit_type) return;
    setIsCreating(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      // Resolve space_id from space_name if provided
      let resolvedSpaceId = spaceId || null;
      if (resolved.space_name && !resolvedSpaceId) {
        const matchedSpace = spaces.find(
          (s) => s.name.toLowerCase() === resolved.space_name!.toLowerCase(),
        );
        if (matchedSpace) resolvedSpaceId = matchedSpace.id;
      }

      const habitData = {
        name: resolved.name,
        subtype: (resolved.habit_type === 'break' ? 'break_habit' : 'start_habit') as HabitSubtype,
        frequency: resolved.target || 'daily',
        start_date: resolved.start_date || dateService.today(),
        start_date_confirmed: true,
        time_window: resolved.time_window
          ? ({ morning: 'morning', afternoon: 'day', evening: 'evening', anytime: 'any' } as const)[
              resolved.time_window
            ]
          : null,
        space_id: resolvedSpaceId,
        notes: resolved.notes || null,
        end_date: resolved.end_date || null,
        time_estimate_minutes: resolved.time_estimate_minutes || null,
        owner_id: userId || undefined,
      };

      const newHabit = await createHabit(habitData);

      // Store ID so the send-off response can update the habit's notes
      if (newHabit?.id) {
        createdHabitIdRef.current = newHabit.id;
      }

      // Reset isCreating BEFORE sending the follow-up message,
      // so the disabled state is governed purely by isLoading from here on
      setIsCreating(false);

      // Send confirm message so AI gives the warm send-off
      handleSendMessage('Lock it in ✓');

      if (onHabitCreated && newHabit?.id) {
        setTimeout(() => onHabitCreated(newHabit.id), 2000);
      }
    } catch (err) {
      console.error('[HabitBuilder] Create failed:', err);
      setIsCreating(false);
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          content: 'Something went wrong creating the habit. Try again?',
          created_at: new Date().toISOString(),
          chat_id: '',
          space_id: '',
          user_id: '',
        },
      ]);
    }
  }, [
    resolved,
    isCreating,
    spaceId,
    spaces,
    userId,
    createHabit,
    onHabitCreated,
    handleSendMessage,
  ]);

  // ─── Handle chip tap ─────────────────────────────────────────
  const handleChipTap = useCallback(
    (chip: string) => {
      if (chip.includes('Lock it in')) {
        handleCreateHabit();
      } else {
        handleSendMessage(chip);
      }
    },
    [handleCreateHabit, handleSendMessage],
  );

  // ─── Determine chips to show ─────────────────────────────────
  const chipConfig = useMemo(() => {
    if (isLoading || isCreating) return null;
    if (!resolved.suggested_chips || resolved.suggested_chips.length === 0) return null;
    return { chips: resolved.suggested_chips, sendsMessage: true };
  }, [resolved.suggested_chips, isLoading, isCreating]);

  // ─── Render message ──────────────────────────────────────────
  const renderMessage = useCallback(
    ({ item, index }: { item: SpaceChatMessage; index: number }) => {
      const isLastAssistant =
        item.role === 'assistant' && index === messages.length - 1 && !isStreamActive; // Only show chips when NOT streaming

      return (
        <View>
          <ChatBubble message={item} />
          {isLastAssistant && chipConfig && (
            <Animated.View style={styles.chipsRow} entering={FadeIn.duration(200).delay(100)}>
              {chipConfig.chips.map((chip, idx) => {
                const isLockIn = chip.includes('Lock it in');
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.chip, isLockIn && styles.chipPrimary]}
                    onPress={() => handleChipTap(chip)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, isLockIn && styles.chipTextPrimary]}>
                      {chip}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </Animated.View>
          )}
        </View>
      );
    },
    [messages.length, chipConfig, handleChipTap, isStreamActive],
  );

  // ─── Cleanup ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      streamRef.current?.close();
    };
  }, []);

  // ─── Render ──────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerButton} onPress={onClose}>
            <ChevronLeft size={24} color={lightTokens.colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>New Habit</Text>
            <View style={styles.headerUnderline} />
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Progress Bar */}
        <HabitBuilderProgress resolved={resolved} />

        {/* Messages */}
        <View style={styles.content}>
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            style={styles.messages}
            contentContainerStyle={styles.messageList}
            ListFooterComponent={
              <StreamingBubble
                contentRef={streamContentRef}
                visible={isStreamActive}
                isSearching={isSearching}
                searchQuery={searchQuery}
              />
            }
            onContentSizeChange={() => {
              if (messages.length > 0 || isStreamActive) {
                flatListRef.current?.scrollToEnd({ animated: false });
              }
            }}
          />
        </View>

        {/* Composer */}
        <View style={styles.composerContainer}>
          <ChatComposer
            onSend={(text) => handleSendMessage(text)}
            placeholder="Tell Gremly about your habit..."
            disabled={isLoading || isCreating}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#D4E4D4', // Sage green — matches Spaces Chat
  },
  keyboardAvoid: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  headerButton: {
    padding: 8,
    width: 40,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
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

  // Content
  content: {
    flex: 1,
  },
  messages: {
    flex: 1,
  },
  messageList: {
    padding: 16,
    paddingBottom: 140,
  },

  // Composer
  composerContainer: {
    paddingHorizontal: 8,
    paddingBottom: 4,
  },

  // Chips
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingLeft: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  chip: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  chipPrimary: {
    backgroundColor: '#5C6B5A',
  },
  chipText: {
    fontSize: 14,
    fontFamily: lightTokens.typography.fontFamily.medium,
    color: lightTokens.colors.text,
  },
  chipTextPrimary: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  searchingContainer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  searchingText: {
    fontSize: 14,
    fontFamily: lightTokens.typography.fontFamily.regular,
    color: lightTokens.colors.subtle,
    fontStyle: 'italic',
  },
});
