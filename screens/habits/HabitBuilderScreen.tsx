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
  Keyboard,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { useAuth } from '../../providers/AuthProvider';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { callHabitBuilderStreaming } from '../../lib/cortex/CortexClient';
import { ChatBubble } from '../../components/chat/ChatBubble';
import { ChatComposer } from '../../components/chat/ChatComposer';
import { HabitSummaryCard } from './HabitSummaryCard';
import SaveButton from '../../components/chat/SaveButton';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import { Text } from '../../ui/Text';
import { lightTokens } from '../../design/tokens';
import { useNetworkStatus } from '../../lib/network/useNetworkStatus';
import type { SpaceChatMessage, HabitBuilderResolvedFields, HabitSubtype } from '../../lib/types';
import type { SaveableType } from '../../lib/chat/saveableTypes';
import { dateService, getDateService, nowTimestamp } from '../../lib/date/DateService';
import { renderFormattedContent } from '../../lib/markdown/renderFormattedContent';

// ─── Streaming Bubble ─────────────────────────────────────────────
// Self-updating component that reads from a content ref.
// Renders DIRECTLY — does NOT use ChatBubble, which has Layout.springify()
// animations that cause visible jank on every content update.
interface StreamingBubbleProps {
  contentRef: React.MutableRefObject<string>;
  visible: boolean;
  isSearching: boolean;
  searchQuery: string | null;
}

function StreamingBubble({ contentRef, visible, isSearching, searchQuery }: StreamingBubbleProps) {
  const [displayContent, setDisplayContent] = useState('');
  const prevRef = useRef('');

  useEffect(() => {
    if (!visible) {
      setDisplayContent('');
      prevRef.current = '';
      return;
    }

    const timer = setInterval(() => {
      const current = contentRef.current;
      if (current !== prevRef.current) {
        prevRef.current = current;
        setDisplayContent(current);
      }
    }, 60);

    return () => clearInterval(timer);
  }, [visible, contentRef]);

  if (!visible) return null;

  if (isSearching && !displayContent) {
    return (
      <View style={styles.searchingContainer}>
        <Text style={styles.searchingText}>Searching: {searchQuery}</Text>
      </View>
    );
  }

  // Render directly — matches ChatBubble assistant style exactly.
  // Plain View only, no Animated.View, no layout animations.
  return (
    <View style={styles.streamingContainer}>
      <View style={styles.streamingBubble}>{renderFormattedContent(displayContent)}</View>
    </View>
  );
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
  // V2
  readiness: 'exploring',
  conversation_value: 'low',
  trigger: null,
  replacement_behavior: null,
  environment_change: null,
  boundary_rule: null,
  current_frequency: null,
  event_name: null,
  is_restart: false,
  restart_context: null,
  check_in_after: null,
  builder_mode: null,
  steering_chips: null,
  edit_field: null,
  edit_value: null,
};

let messageIdCounter = 0;
const nextId = () => `hb-msg-${getDateService().now().getTime()}-${++messageIdCounter}`;

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
  const saveEntityChatNote = useGremlyStore((s) => s.saveEntityChatNote);
  const overlayController = useUnifiedOverlayController();

  const { isConnected } = useNetworkStatus();

  // ─── State ──────────────────────────────────────────────────────
  const [messages, setMessages] = useState<SpaceChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [resolved, setResolved] = useState<HabitBuilderResolvedFields>(EMPTY_RESOLVED);
  const [isCreating, setIsCreating] = useState(false);
  const [habitLocked, setHabitLocked] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [currentMode, setCurrentMode] = useState<string | null>(null);
  const [turnNumber, setTurnNumber] = useState(0);
  const [isCardCollapsed, setIsCardCollapsed] = useState(false);
  const [keyboardActive, setKeyboardActive] = useState(false);
  const prevExpandedRef = useRef(true);

  // Track which messages have save cards
  const [lockedMessageId, setLockedMessageId] = useState<string | null>(null);
  const [tipsMessageId, setTipsMessageId] = useState<string | null>(null);
  const [tipsSaveState, setTipsSaveState] = useState<'initial' | 'loading' | 'confirmed'>(
    'initial',
  );

  const flatListRef = useRef<FlatList>(null);
  const streamRef = useRef<{ close: () => void } | null>(null);
  const hasStarted = useRef(false);
  const mountedRef = useRef(true);
  const streamContentRef = useRef<string>('');
  const createdHabitIdRef = useRef<string | null>(null);
  const pendingNotesRef = useRef<string | null>(null);
  const [isStreamActive, setIsStreamActive] = useState(false);

  // ─── Build context ──────────────────────────────────────────────
  const chatContext = useMemo(() => {
    const now = getDateService().now();
    return {
      currentDate: dateService.today(),
      dayOfWeek: getDateService().getDayOfWeek(),
      userName: userName || undefined,
      existingHabits: habits
        .filter((h) => !h.archived_at)
        .map((h) => ({
          name: h.name,
          subtype: h.subtype || 'start_habit',
          frequency: h.frequency || undefined,
          space_name: spaces.find((s) => s.id === h.space_id)?.name,
          cadence: h.cadence || undefined,
          time_window: h.time_window || undefined,
        })),
      spaces: spaces.filter((s) => !s.archived_at).map((s) => ({ id: s.id, name: s.name })),
      prefill: prefill || undefined,
      habitCapacity: {
        totalActive: habits.filter((h) => !h.archived_at).length,
        dailyCount: habits.filter((h) => !h.archived_at && h.cadence === 'daily').length,
        weeklyCount: habits.filter((h) => !h.archived_at && h.cadence === 'weekly').length,
      },
      currentMode,
      turnNumber,
    };
  }, [habits, spaces, userName, prefill, currentMode, turnNumber]);

  // ─── Send message ─────────────────────────────────────────────
  const handleSendMessage = useCallback(
    async (text: string, isInitial = false) => {
      if (isLoading) return;

      // Offline guard — prevent network-dependent chat when offline
      if (!isConnected) {
        const offlineMsg: SpaceChatMessage = {
          id: nextId(),
          chat_id: '',
          space_id: '',
          user_id: '',
          role: 'assistant',
          content:
            "I need an internet connection to chat. Your data is safe — I'll be ready when we're back online!",
          created_at: nowTimestamp(),
        };
        setMessages((prev) => [...prev, offlineMsg]);
        return;
      }

      setIsLoading(true);

      if (!isInitial) {
        setTurnNumber((prev) => prev + 1);
      }

      // Create user message (skip display for auto-start)
      const userMsg: SpaceChatMessage = {
        id: nextId(),
        chat_id: '',
        space_id: '',
        user_id: '',
        role: 'user',
        content: text,
        created_at: nowTimestamp(),
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
        requestMessages.push({ role: 'user', content: text });
      } else {
        requestMessages.push({ role: 'user', content: text });
      }

      streamRef.current = callHabitBuilderStreaming(
        {
          type: 'habit-builder',
          stream: true,
          messages: requestMessages,
          context: chatContext,
          userId: userId || undefined,
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

            // Add finalized message to FlatList FIRST (bubble still visible underneath)
            const finalMsg: SpaceChatMessage = {
              id: nextId(),
              chat_id: '',
              space_id: '',
              user_id: '',
              role: 'assistant',
              content: response.content,
              created_at: nowTimestamp(),
              sources: response.sources,
              wasStreamed: true, // Skip entering animation — content was already visible
            };

            setMessages((prev) => [...prev, finalMsg]);
            setIsStreamActive(false);

            // Update resolved fields with readiness non-regression guard
            if (response.resolved_fields) {
              setResolved((prev) => {
                const readinessOrder: Record<string, number> = {
                  exploring: 0,
                  shaping: 1,
                  confirmable: 2,
                  locked: 3,
                };
                const prevLevel = readinessOrder[prev.readiness] ?? 0;
                const newLevel = readinessOrder[response.resolved_fields.readiness] ?? 0;
                // Never regress readiness
                if (newLevel < prevLevel) {
                  return { ...response.resolved_fields, readiness: prev.readiness };
                }
                return response.resolved_fields;
              });
            }

            // Update mode from server
            if (response.resolved_fields?.builder_mode) {
              setCurrentMode(response.resolved_fields.builder_mode);
            }

            // Handle post-lock-in field edits
            if (
              response.resolved_fields?.edit_field &&
              response.resolved_fields?.edit_value &&
              createdHabitIdRef.current
            ) {
              const editMap: Record<string, string> = {
                frequency: 'frequency',
                start_date: 'start_date',
                end_date: 'end_date',
                time_window: 'time_window',
                name: 'name',
                notes: 'notes',
                time_estimate_minutes: 'time_estimate_minutes',
                trigger: 'triggers_json',
                replacement_behavior: 'replacement_text',
                boundary_rule: 'boundary_rule',
              };
              const dbField = editMap[response.resolved_fields.edit_field];
              if (dbField) {
                const value =
                  dbField === 'triggers_json'
                    ? { primary: response.resolved_fields.edit_value }
                    : response.resolved_fields.edit_value;
                updateHabit(createdHabitIdRef.current, { [dbField]: value }).catch((err) =>
                  console.error('[HabitBuilder] Edit failed:', err),
                );
              }
            }

            // Post-lock-in message tagging
            if (createdHabitIdRef.current) {
              if (!lockedMessageId) {
                // First response after lock-in = "Locked in, want tips?"
                setLockedMessageId(finalMsg.id);
              } else if (!tipsMessageId) {
                // Second response after lock-in = tips content (if they said yes)
                // Only tag if it's substantial content (not "No problem, good luck!")
                if (response.content.length > 80) {
                  setTipsMessageId(finalMsg.id);
                }
              }
            }

            setIsLoading(false);
            streamRef.current = null;
            streamContentRef.current = '';

            setTimeout(() => {
              if (mountedRef.current) {
                flatListRef.current?.scrollToEnd({ animated: true });
              }
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
              created_at: nowTimestamp(),
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
        if (mountedRef.current) {
          flatListRef.current?.scrollToEnd({ animated: true });
        }
      }, 100);
    },
    [isLoading, isConnected, messages, chatContext, prefill, lockedMessageId, tipsMessageId],
  );

  // ─── Keyboard collapse ────────────────────────────────────────
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        prevExpandedRef.current = !isCardCollapsed;
        setKeyboardActive(true);
        setIsCardCollapsed(true);
      },
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardActive(false);
        if (prevExpandedRef.current) {
          setIsCardCollapsed(false);
        }
      },
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [isCardCollapsed]);

  // ─── Auto-collapse after 4 messages ────────────────────────────
  useEffect(() => {
    if (messages.length >= 4 && !isCardCollapsed) {
      setIsCardCollapsed(true);
    }
  }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Auto-start ───────────────────────────────────────────────
  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      // Small delay to ensure first render completes and refs are stable
      requestAnimationFrame(() => {
        if (mountedRef.current) {
          let initialText: string;
          if (prefill) {
            initialText = prefill;
          } else {
            const activeHabitCount = habits.filter((h) => !h.archived_at).length;
            if (activeHabitCount === 0) {
              initialText = 'I want to start a new habit';
            } else if (activeHabitCount <= 4) {
              initialText = 'I want to add a new habit';
            } else {
              initialText = 'I want to add another habit';
            }
          }
          handleSendMessage(initialText, true);
        }
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Create habit ────────────────────────────────────────────
  const handleCreateHabit = useCallback(async () => {
    if (isCreating || !resolved.name || !resolved.habit_type) return;
    setIsCreating(true);
    setHabitLocked(true);
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

      // Break-specific fields
      if (resolved.habit_type === 'break') {
        if (resolved.boundary_rule && !resolved.name?.includes(resolved.boundary_rule)) {
          habitData.name = resolved.boundary_rule;
        }
        if (resolved.trigger) {
          (habitData as any).triggers_json = { primary: resolved.trigger };
        }
        if (resolved.replacement_behavior) {
          (habitData as any).replacement_text = resolved.replacement_behavior;
        }
        if (resolved.environment_change) {
          (habitData as any).environment_change = resolved.environment_change;
        }
        if (resolved.boundary_rule) {
          (habitData as any).boundary_rule = resolved.boundary_rule;
        }
      }

      // Event-anchored fields
      if (resolved.event_name) {
        (habitData as any).event_name = resolved.event_name;
      }

      // Restart tracking
      if (resolved.is_restart) {
        (habitData as any).is_restart = true;
        if (resolved.restart_context) {
          (habitData as any).restart_context = resolved.restart_context;
        }
      }

      // Builder mode metadata
      (habitData as any).builder_mode = currentMode || null;

      const newHabit = await createHabit(habitData);

      // Store ID so the send-off response can update the habit's notes
      if (newHabit?.id) {
        createdHabitIdRef.current = newHabit.id;
      }

      // If the user asked to save notes before confirming, save them now
      if (pendingNotesRef.current && newHabit?.id) {
        const motivation = resolved.notes || '';
        const research = pendingNotesRef.current;
        const combined = motivation ? `${motivation}\n\n---\n\n${research}` : research;
        pendingNotesRef.current = null;
        updateHabit(newHabit.id, { notes: combined }).catch((err: any) =>
          console.error('[HabitBuilder] Failed to save pending notes:', err),
        );
      }

      // Reset isCreating BEFORE sending the follow-up message,
      // so the disabled state is governed purely by isLoading from here on
      setIsCreating(false);

      // Send confirm message — AI will offer tips
      handleSendMessage('Lock it in ✓');
    } catch (err) {
      console.error('[HabitBuilder] Create failed:', err);
      setIsCreating(false);
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          content: 'Something went wrong creating the habit. Try again?',
          created_at: nowTimestamp(),
          chat_id: '',
          space_id: '',
          user_id: '',
        },
      ]);
    }
  }, [resolved, isCreating, spaceId, spaces, userId, createHabit, handleSendMessage, currentMode]);

  // ─── Save tips to habit ──────────────────────────────────────
  const handleSaveTips = useCallback(async () => {
    const habitId = createdHabitIdRef.current;
    if (!habitId || !tipsMessageId) return;

    setTipsSaveState('loading');

    try {
      const tipsMsg = messages.find((m) => m.id === tipsMessageId);
      if (!tipsMsg) return;

      const noteData = {
        content: tipsMsg.content,
        is_checklist: false,
        source_message_id: tipsMessageId,
        note_type: 'regular' as const,
      };

      await saveEntityChatNote(habitId, 'habit', noteData);
      setTipsSaveState('confirmed');
    } catch (err) {
      console.error('[HabitBuilder] Failed to save tips:', err);
      setTipsSaveState('initial');
    }
  }, [messages, tipsMessageId, saveEntityChatNote]);

  // ─── Open habit in overlay ───────────────────────────────────
  const handleOpenHabit = useCallback(() => {
    const habitId = createdHabitIdRef.current;
    if (!habitId) return;

    const habitRecord = habits.find((h) => h.id === habitId);
    if (!habitRecord) {
      console.warn('[HabitBuilder] Habit not found in store yet:', habitId);
      return;
    }

    overlayController.openEdit({
      record: habitRecord as any, // AppRecord
      spaceId: spaceId || undefined,
    });
  }, [habits, spaceId, overlayController]);

  // ─── Handle chip tap ─────────────────────────────────────────
  const handleChipTap = useCallback(
    (chip: string) => {
      if (chip.includes('Lock it in')) {
        handleCreateHabit();
      } else if (chip.includes('Send me a nudge') && createdHabitIdRef.current) {
        updateHabit(createdHabitIdRef.current, { check_in_after: 3 }).catch((err: any) =>
          console.error('[HabitBuilder] Failed to set check-in:', err),
        );
        handleSendMessage(chip);
      } else {
        handleSendMessage(chip);
      }
    },
    [handleCreateHabit, handleSendMessage, updateHabit],
  );

  // ─── Determine chips to show ─────────────────────────────────
  const chipConfig = useMemo(() => {
    if (isLoading || isCreating) return null;

    const chips: Array<{ text: string; type: 'answer' | 'steering' }> = [];

    if (resolved.suggested_chips?.length) {
      for (const c of resolved.suggested_chips) {
        chips.push({ text: c, type: 'answer' });
      }
    }
    if (resolved.steering_chips?.length) {
      for (const c of resolved.steering_chips) {
        chips.push({ text: c, type: 'steering' });
      }
    }

    return chips.length > 0 ? chips : null;
  }, [resolved.suggested_chips, resolved.steering_chips, isLoading, isCreating]);

  // ─── Render message ──────────────────────────────────────────
  const renderMessage = useCallback(
    ({ item, index }: { item: SpaceChatMessage; index: number }) => {
      const isLastAssistant =
        item.role === 'assistant' && index === messages.length - 1 && !isStreamActive;

      // Determine if this message should show a save card
      const isLockedMessage = item.id === lockedMessageId;
      const isTipsMessage = item.id === tipsMessageId;

      return (
        <View>
          <ChatBubble message={item} />

          {/* Save card: "Saved as Habit ✓" — after lock-in */}
          {isLockedMessage && (
            <View style={styles.saveButtonWrapper}>
              <SaveButton
                visible={true}
                state="confirmed"
                savedType="habit"
                savedItemId={createdHabitIdRef.current || undefined}
                suggestedType={'habit' as SaveableType}
                onSave={handleOpenHabit}
                onEdit={handleOpenHabit}
                onDismiss={() => {}}
              />
            </View>
          )}

          {/* Save card: "Save to habit?" — after tips */}
          {isTipsMessage && (
            <View style={styles.saveButtonWrapper}>
              <SaveButton
                visible={true}
                state={tipsSaveState}
                suggestedType={'log-general' as SaveableType}
                smartSuggestion={{
                  type: 'note',
                  title: 'Tips to make this stick',
                  steps: [],
                }}
                onSave={handleSaveTips}
                onEdit={handleSaveTips}
                onDismiss={() => setTipsMessageId(null)}
                savedType={tipsSaveState === 'confirmed' ? 'log' : undefined}
                savedItemId={
                  tipsSaveState === 'confirmed' ? createdHabitIdRef.current || undefined : undefined
                }
              />
            </View>
          )}

          {/* Chips — show on last assistant message, not on the locked message itself */}
          {isLastAssistant && chipConfig && !(isLockedMessage && habitLocked) && (
            <Animated.View style={styles.chipsRow} entering={FadeIn.duration(200).delay(100)}>
              {chipConfig.map((chip, idx) => {
                const isLockIn = chip.text.includes('Lock it in');
                const isSteering = chip.type === 'steering';
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.chip,
                      isLockIn && styles.chipPrimary,
                      isSteering && styles.chipSteering,
                    ]}
                    onPress={() => handleChipTap(chip.text)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        isLockIn && styles.chipTextPrimary,
                        isSteering && styles.chipTextSteering,
                      ]}
                    >
                      {chip.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </Animated.View>
          )}
        </View>
      );
    },
    [
      messages.length,
      chipConfig,
      handleChipTap,
      isStreamActive,
      lockedMessageId,
      tipsMessageId,
      tipsSaveState,
      handleOpenHabit,
      handleSaveTips,
      habitLocked,
    ],
  );

  // ─── Cleanup ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      streamRef.current?.close();
      flatListRef.current = null;
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

        {/* Summary Card */}
        <HabitSummaryCard
          resolved={resolved}
          mode={currentMode}
          isCollapsed={isCardCollapsed}
          onToggle={() => setIsCardCollapsed((prev) => !prev)}
          keyboardActive={keyboardActive}
          messageCount={messages.length}
        />

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
              <>
                <StreamingBubble
                  contentRef={streamContentRef}
                  visible={isStreamActive}
                  isSearching={isSearching}
                  searchQuery={searchQuery}
                />
              </>
            }
            onContentSizeChange={() => {
              if (mountedRef.current && (messages.length > 0 || isStreamActive)) {
                flatListRef.current?.scrollToEnd({ animated: true });
              }
            }}
          />
        </View>

        {/* Composer */}
        <View style={styles.composerContainer}>
          <ChatComposer
            onSend={(text) => handleSendMessage(text)}
            placeholder={
              isConnected ? 'Tell Gremly about your habit...' : 'Chat available when online'
            }
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
  chipSteering: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(92, 107, 90, 0.3)',
  },
  chipTextSteering: {
    color: 'rgba(92, 107, 90, 0.7)',
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
  // Streaming bubble — matches ChatBubble assistantContainer + assistantBubble exactly
  streamingContainer: {
    alignItems: 'flex-start',
    marginBottom: 4,
    paddingHorizontal: 16,
    marginVertical: 4,
  },
  saveButtonWrapper: {
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
  },
  streamingBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
    paddingLeft: 14,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(212, 164, 74, 0.60)',
    borderRadius: 0,
    maxWidth: '100%',
    marginLeft: -4,
    marginTop: -6,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
});
