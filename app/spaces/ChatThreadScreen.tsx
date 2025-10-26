/**
 * ChatThreadScreen - Phase 10.5 Space Chats v1
 * Phase 10.7D: Added debounce, spaceId validation, note prefill fixes
 * Phase 11.3: Inline action confirmations instead of overlay toast
 * Phase 11.5: Multi-intent detection and disambiguation
 * Phase 11.6: Entry cards for created/retrieved entries
 * Phase 11.7: Calm Action Bar v1.1 with centered + button
 * Now integrated with message persistence + new UI components
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ToastAndroid,
  Image,
  TouchableOpacity,
} from 'react-native';
import { Search as SearchIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { SupabaseSpaceChatRepo } from '../../lib/repo/supabase';
import { MemorySpaceChatRepo } from '../../lib/repo/memory';
import type { SpaceChat, SpaceChatMessage } from '../../lib/types';
import { lightTokens } from '../../design/tokens';
import { useAuth } from '../../providers/AuthProvider';
import { useRepo } from '../../providers/RepoProvider';
import { cortexRoute } from '../../lib/cortex/router';
import type { CortexContext, CortexAction } from '../../lib/cortex/cortexDecide';
import type { DetectedIntent, IntentKind } from '../../lib/cortex/intents/types';
import { detectIntent } from '../../lib/cortex/intents/detectIntent';
import { detectMultipleIntents } from '../../lib/cortex/intents/multiIntentDetector';
import { explainAddedToList, explainCreated, explainFiledToSpace } from '../../lib/cortex/explain';
import { maybeRefreshSummary } from '../../lib/cortex/summarize';
import { createToastSummary, getActivityName } from '../../lib/chat/contextualSummary';
import { checkQuickResponse, getQuickResponseText } from '../../lib/chat/quickResponses';
import { perfMonitor } from '../../lib/chat/performanceMonitor';
import { searchIndex } from '../../lib/chat/searchIndex';
import { getEnv } from '../../lib/env';
import { ConfirmationPill } from '../../components/common/ConfirmationPill';
import { Placeholder } from '../../components/common/Placeholder';
import { useChatMessages } from '../../hooks/useChatMessages';
import { ChatBubble } from '../../components/chat/ChatBubble';
import { ChatComposer } from '../../components/chat/ChatComposer';
import { InlineActionConfirmation } from '../../components/chat/InlineActionConfirmation';
import { MultiIntentConfirmation } from '../../components/chat/MultiIntentConfirmation';
import { EntryCard } from '../../components/chat/EntryCard';
import { ChatActionBar } from '../../components/chat/ChatActionBar';
import { MessageSearch } from '../../components/chat/MessageSearch';
// Removed PersistentActionBar to reduce clutter per UX polish
import { ChatThinkingIndicator } from '../../src/components/ChatThinkingIndicator';

// Phase 10.6: New mascot system
import { MascotProvider } from '../features/mascot/useMascot';
import { Mascot } from '../features/mascot/Mascot';
import { emitChatEvent } from '../lib/chat/events';

// Legacy mascot imports (to be removed)
import { useMascotController } from '../../hooks/useMascotController';
import { shouldShowMascot, shouldUseHaptics } from '../../config/featureFlags';
import { openUnifiedFromChat } from './chat/openUnifiedFromChat';
import type { OverlayKind } from './chat/openUnifiedFromChat';
import { smartTitle, extractTodoTitle, parseHabit } from './chat/prefillUtils';
import { Chip } from '../../ui/Chip';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import { UnifiedCreateOverlay } from '../../components/overlay/UnifiedCreateOverlay';
import { useActionToast, type ActionToastInput } from '../../src/hooks/useActionToast';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatThread'>;

// Phase 10.7B: Type guards for safe meta access
function metaHasDetectedIntent(meta: any): meta is { detectedIntent: unknown } {
  return !!meta && typeof meta === 'object' && 'detectedIntent' in meta;
}

function metaKindAsAssistantKind(kind: any): 'classification' | 'smalltalk' | 'decision' | null {
  if (kind === 'classification' || kind === 'smalltalk' || kind === 'decision') return kind;
  return null;
}

const TODO_DUE_DATE_PATTERNS: RegExp[] = [
  /\bby\s+(?:the\s+)?(end of (?:day|week)|tomorrow|today|tonight|this weekend|this week|next week|next month|next year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\bthis\s+(weekend|week|month|morning|afternoon|evening|year)\b/i,
  /\bnext\s+(week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\bon\s+(?:this\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?\b/i,
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/,
];

const TODO_DUE_TIME_PATTERNS: RegExp[] = [
  /\b(?:at|around)\s+\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/i,
  /\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/i,
  /\b(?:at\s+)?(noon|midnight)\b/i,
  /\b(?:in the\s+)?(morning|afternoon|evening|night)\b/i,
];

const INTENT_KIND_TO_ACTION: Partial<Record<DetectedIntent['kind'], ActionToastInput['type']>> = {
  habit: 'habit',
  todo: 'todo',
  note: 'note',
  reflection: 'note',
  idea: 'note',
};

// Smart gating helpers
const TRIGGER_WORDS_RE = /\b(save|create|add|make|set|remind|log|start)\b/i;
const SOFT_SKIP_RE = /\b(just thinking|maybe|not sure)\b/i;

function cleanFragment(fragment: string | null | undefined): string | null {
  if (!fragment) return null;
  return fragment.replace(/[.,!?]+$/g, '').trim();
}

function extractMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[0]) {
      return cleanFragment(match[0]);
    }
  }
  return null;
}

function deriveTodoDetails(userText: string) {
  const dueDate = extractMatch(userText, TODO_DUE_DATE_PATTERNS);
  const dueTime = extractMatch(userText, TODO_DUE_TIME_PATTERNS);
  return { dueDate, dueTime };
}

function mapCadenceToFrequency(cadence?: string) {
  if (!cadence) return undefined;
  const normalized = cadence.toLowerCase();
  if (normalized.includes('month')) return 'monthly' as const;
  if (normalized.includes('week')) return 'weekly' as const;
  return 'daily' as const;
}

function buildActionToastPayload(
  intent: DetectedIntent | null,
  userText: string,
  spaceId: string | null,
  handlers?: {
    onConfirm?: () => Promise<void> | void;
    onCancel?: () => void;
    onEdit?: () => void;
    onAutoDismiss?: () => void;
  },
): ActionToastInput | null {
  if (!intent) return null;
  const type = INTENT_KIND_TO_ACTION[intent.kind];
  if (!type) return null;

  const trimmedUserText = userText.trim();
  const commonMetadata = {
    autoOrigin: 'space_chat' as const,
    aiPlaced: true,
    spaceId,
  };

  if (type === 'todo') {
    const title = intent.title?.trim() || extractTodoTitle(trimmedUserText) || 'Untitled';
    const { dueDate, dueTime } = deriveTodoDetails(trimmedUserText);
    return {
      type,
      content: title,
      metadata: {
        ...commonMetadata,
        dueDate: dueDate ?? null,
        dueTime: dueTime ?? null,
        onConfirm: handlers?.onConfirm as any,
        onCancel: handlers?.onCancel,
        onEdit: handlers?.onEdit,
        onAutoDismiss: handlers?.onAutoDismiss,
        conversionMeta: {
          initialTitle: title,
        },
      },
    };
  }

  if (type === 'habit') {
    const habitData = parseHabit(trimmedUserText);
    const name = intent.title?.trim() || habitData.name || 'New habit';
    const frequency = mapCadenceToFrequency(habitData.cadence);
    return {
      type,
      content: name,
      metadata: {
        ...commonMetadata,
        frequency: frequency ?? 'daily',
        habitSubtype: 'start_habit',
        frequencyValue: undefined,
        onConfirm: handlers?.onConfirm as any,
        onCancel: handlers?.onCancel,
        onEdit: handlers?.onEdit,
        onAutoDismiss: handlers?.onAutoDismiss,
        conversionMeta: {
          initialTitle: name,
        },
      },
    };
  }

  // Note & reflection/idea handling
  const noteTitle = intent.title?.trim() || smartTitle(trimmedUserText);
  const subtype =
    intent.kind === 'reflection' ? 'journal' : intent.kind === 'idea' ? 'idea' : 'catchall';
  return {
    type: 'note',
    content: noteTitle,
    metadata: {
      ...commonMetadata,
      noteSubtype: subtype,
      noteBody: trimmedUserText,
      onConfirm: handlers?.onConfirm as any,
      onCancel: handlers?.onCancel,
      onEdit: handlers?.onEdit,
      onAutoDismiss: handlers?.onAutoDismiss,
      conversionMeta: {
        initialTitle: noteTitle,
        initialNote: trimmedUserText,
      },
    },
  };
}

export default function ChatThreadScreen({ route }: Props) {
  // Navigation
  const navigation = useNavigation();

  // Scroll ref for auto-scrolling to the latest message
  const scrollViewRef = useRef<import('react-native').ScrollView | null>(null);

  const { spaceId, chatId } = route.params;
  const auth = useAuth();
  const { userId } = auth;
  const repo = useRepo();

  const [chat, setChat] = useState<SpaceChat | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [confirmations, setConfirmations] = useState<{ messageId: string; texts: string[] }[]>([]);
  const [activeSuggestions, setActiveSuggestions] = useState<string[]>([]);
  const [detectedIntent, setDetectedIntent] = useState<DetectedIntent | null>(null);
  const [lastUserMessage, setLastUserMessage] = useState<string>('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  // Phase 11.7: Track last created item for encouragement messages
  const [lastCreatedItem, setLastCreatedItem] = useState<{
    type: string;
    title?: string;
    timestamp: number;
  } | null>(null);

  // Chat-level message index and toast history for cooldowns
  const userMsgIndexRef = React.useRef(0);
  type ToastOutcome = 'confirm' | 'cancel' | 'edit' | 'auto-dismiss';
  const toastHistoryRef = React.useRef<
    Partial<Record<'todo' | 'note' | 'habit', Array<{ index: number; outcome: ToastOutcome }>>>
  >({});

  const recordToastOutcome = useCallback((t: 'todo' | 'note' | 'habit', outcome: ToastOutcome) => {
    const idx = userMsgIndexRef.current;
    const arr = toastHistoryRef.current[t] || [];
    arr.push({ index: idx, outcome });
    // Keep only recent 20
    toastHistoryRef.current[t] = arr.slice(-20);
  }, []);

  // Auto-fade suggestions after 3 seconds
  const suggestionFadeTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Phase 10.7D: Debounce timer ref
  const sendDebounceTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Track last assistant response for conversion metadata and anti-spam logic
  const lastAssistantResponseRef = React.useRef<{
    explanation?: string | null;
    replyText?: string | null;
    kind?: 'smalltalk' | 'decision' | 'classification' | null;
  }>({});

  // Mascot controller for Phase 10.6
  const mascot = useMascotController();

  // Overlay controller for conversion
  const overlayController = useUnifiedOverlayController();

  const actionToastOffset = React.useMemo(
    () => Platform.select({ ios: 128, android: 112, default: 112 }) ?? 112,
    [],
  );
  const {
    showToast: showActionToast,
    hideToast: hideActionToast,
    isVisible: isActionToastVisible,
    Toast: ActionToast,
  } = useActionToast({ bottomOffset: actionToastOffset });

  // Use new chat messages hook
  const {
    messages,
    loading: messagesLoading,
    error: messagesError,
    sendUserMessage,
    appendAssistantMessage,
    appendActionConfirmation,
    appendEntryCard,
  } = useChatMessages(chatId, spaceId);

  // Back button handler
  const handleBackPress = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      // Fallback: navigate to the space home if can't go back
      (navigation as any).navigate('SpaceHome', { spaceId });
    }
  }, [navigation, spaceId]);

  // Phase 11.3: Inline action confirmation function (moved after useChatMessages)
  const maybeTriggerActionToast = useCallback(
    async (
      intent: DetectedIntent | null,
      _meta: Record<string, any> | undefined,
      userText: string,
    ) => {
      // Phase 11.3: Add inline action confirmation messages instead of overlay toast
      if (!intent) return false;

      console.log('[DEBUG][Toast] maybeTriggerActionToast called:', {
        text: userText.substring(0, 50),
        intentKind: intent.kind,
        confidence: intent.confidence,
        suppressChips: intent.suppressChips,
        isMetaComment: intent.isMetaComment,
      });

      // CRITICAL: Block for meta-comments
      if (intent.isMetaComment || intent.suppressChips) {
        console.log('[DEBUG][Toast] Blocking - meta-comment or suppressChips detected');
        return false;
      }

      const meetsConfidence = typeof intent.confidence === 'number' && intent.confidence >= 0.9;
      const actionableKinds = new Set<DetectedIntent['kind']>(['todo', 'note', 'habit']);
      const isActionable = actionableKinds.has(intent.kind);
      const actionType = INTENT_KIND_TO_ACTION[intent.kind] as
        | 'todo'
        | 'note'
        | 'habit'
        | undefined;

      // Smart gating between 0.7-0.89 with trigger words, and soft skip phrases
      const conf = typeof intent.confidence === 'number' ? intent.confidence : 0;
      const hasTrigger = TRIGGER_WORDS_RE.test(userText);
      const isSoftSkip = SOFT_SKIP_RE.test(userText);

      // SPECIAL GATE: Habits require higher confidence or very explicit phrases
      if (intent.kind === 'habit' && conf < 0.9) {
        const isVeryExplicit = /every (day|morning|evening|night)/i.test(userText);
        if (!isVeryExplicit) {
          if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
            console.log('[ChatToast] Habit detected but confidence too low:', {
              confidence: conf,
              text: userText.substring(0, 80),
            });
          }
          return false;
        }
      }

      if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
        console.log('[ChatToast][gate] intent', {
          kind: intent.kind,
          confidence: intent.confidence,
          meetsConfidence,
          isActionable,
          spaceId,
          userTextPreview: userText.substring(0, 80),
        });
      }

      let allowed = false;
      if (meetsConfidence && isActionable) {
        allowed = true;
      } else if (isActionable && !isSoftSkip && conf >= 0.7 && conf < 0.9 && hasTrigger) {
        allowed = true;
      }

      // Cooldowns: block if same type shown within last 2 user messages; if canceled, block for 5
      if (allowed && actionType) {
        const history = toastHistoryRef.current[actionType] || [];
        const idx = userMsgIndexRef.current;
        const recentSame = history.some((h) => h.index >= idx - 2);
        const recentCancel = history.some((h) => h.outcome === 'cancel' && h.index >= idx - 5);
        if (recentSame || recentCancel) {
          if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
            console.log('[ChatToast][gate] cooldown_block', {
              actionType,
              recentSame,
              recentCancel,
            });
          }
          allowed = false;
        }
      }

      if (!allowed) {
        if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
          console.log('[ChatToast][gate] skip_toast', {
            reason: !isActionable
              ? 'non_actionable_intent'
              : isSoftSkip
                ? 'soft_skip'
                : 'threshold_not_met',
          });
        }
        return false;
      }

      // Phase 11.7+: Get recent user messages for context-aware summaries
      const recentMessages = messages
        .slice(-10) // Last 10 messages
        .filter((m) => m.role === 'user') // User messages only
        .map((m) => m.content);

      // Create context-aware summary
      const contextualSummary = createToastSummary(userText, intent.kind, recentMessages);

      // Get activity name for habit creation
      const activityName =
        intent.kind === 'habit' ? getActivityName(userText, recentMessages) : undefined;

      // Build action metadata with handlers
      const metadata: Record<string, any> = {
        actionType,
        autoOrigin: 'space_chat' as const,
        aiPlaced: true,
        spaceId: spaceId ?? null,
        confidence: intent.confidence,
        // Phase 11.7+: Context-aware summary and activity name
        summary: contextualSummary,
        activityName,
        fullText: userText,
        // Phase 11.5: Include multi-intent data if present
        alternativeIntents: intent.alternativeIntents || undefined,
        isMultiIntent: intent.isMultiIntent || false,
        onConfirm: async () => {
          if (actionType) {
            recordToastOutcome(actionType, 'confirm');
            repo
              .writeEvent(
                'toast',
                {
                  event: 'action',
                  action: 'confirm',
                  toastType: actionType,
                  index: userMsgIndexRef.current,
                },
                { userId: userId || 'anonymous' },
              )
              .catch(() => {});
          }
          // Open overlay for confirmation
          if (intent.kind === 'habit' || intent.kind === 'todo' || intent.kind === 'note') {
            overlayController.openCreate({
              type: intent.kind as 'habit' | 'todo' | 'note',
              spaceId: spaceId ?? undefined,
              conversionMeta: {
                initialTitle: userText,
              },
            });
          }
        },
        onCreateMultiple: intent.isMultiIntent
          ? async () => {
              // Create multiple items based on intent and alternatives
              console.log('[MultiIntent] Creating multiple items:', {
                primary: intent.kind,
                alternatives: intent.alternativeIntents?.map((a) => a.kind),
              });

              // Create primary first
              if (intent.kind === 'habit' || intent.kind === 'todo' || intent.kind === 'note') {
                overlayController.openCreate({
                  type: intent.kind as 'habit' | 'todo' | 'note',
                  spaceId: spaceId ?? undefined,
                  conversionMeta: {
                    initialTitle: userText,
                  },
                });
              }

              // TODO: Queue additional creations
              // For now, just open the first one - future enhancement would create all
            }
          : undefined,
        onCancel: () => {
          if (actionType) {
            recordToastOutcome(actionType, 'cancel');
            repo
              .writeEvent(
                'toast',
                {
                  event: 'action',
                  action: 'cancel',
                  toastType: actionType,
                  index: userMsgIndexRef.current,
                },
                { userId: userId || 'anonymous' },
              )
              .catch(() => {});
          }
        },
        onEdit: () => {
          if (actionType) {
            recordToastOutcome(actionType, 'edit');
            repo
              .writeEvent(
                'toast',
                {
                  event: 'action',
                  action: 'edit',
                  toastType: actionType,
                  index: userMsgIndexRef.current,
                },
                { userId: userId || 'anonymous' },
              )
              .catch(() => {});
          }
          // Open overlay for editing
          if (intent.kind === 'habit' || intent.kind === 'todo' || intent.kind === 'note') {
            overlayController.openCreate({
              type: intent.kind as 'habit' | 'todo' | 'note',
              spaceId: spaceId ?? undefined,
              conversionMeta: {
                initialTitle: userText,
              },
            });
          }
        },
      };

      // Phase 11.3: Add inline action confirmation message
      try {
        await appendActionConfirmation(userText, metadata);

        if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
          console.log('[ChatToast] Inline action confirmation added:', {
            type: actionType,
            content: userText.substring(0, 50),
          });
        }

        // Analytics: toast shown (repo event)
        if (actionType) {
          repo
            .writeEvent(
              'toast',
              {
                event: 'shown',
                toastType: actionType,
                confidence: intent.confidence,
                index: userMsgIndexRef.current,
              },
              { userId: userId || 'anonymous' },
            )
            .catch(() => {});
        }

        // Auto-scroll to show the new confirmation
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);

        return true;
      } catch (err) {
        console.error('[ChatToast] Failed to add inline confirmation:', err);
        return false;
      }
    },
    [spaceId, recordToastOutcome, repo, userId, appendActionConfirmation, overlayController],
  );

  // Auto-scroll when messages change (e.g., new assistant/user messages)
  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  // Create SpaceChatRepo instance (unused but kept for potential future use)
  const _spaceChatRepo = React.useMemo(() => {
    const backend = process.env.EXPO_PUBLIC_REPO_BACKEND || 'memory';
    return backend === 'supabase'
      ? new SupabaseSpaceChatRepo(userId || undefined)
      : new MemorySpaceChatRepo(userId || 'anonymous');
  }, [userId]);

  // Load chat
  const loadChat = useCallback(async () => {
    try {
      // For now, we'll show a placeholder
      setChat({
        id: chatId,
        user_id: userId || 'anonymous',
        space_id: spaceId,
        title: 'Chat',
        pinned: false,
        archived_at: null,
        last_message_snippet: null,
        updated_at: new Date().toISOString(),
        metadata_json: null,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to load chat:', error);
      Alert.alert('Error', 'Failed to load chat');
    } finally {
      setLoading(false);
    }
  }, [chatId, userId, spaceId]);

  useEffect(() => {
    loadChat();
  }, [loadChat]);

  // Cleanup suggestion fade timer on unmount
  useEffect(() => {
    return () => {
      if (suggestionFadeTimerRef.current) {
        clearTimeout(suggestionFadeTimerRef.current);
      }
    };
  }, []);

  // Debug: Log when activeSuggestions changes
  useEffect(() => {
    if (activeSuggestions.length > 0) {
      console.log('[Chips] activeSuggestions updated:', activeSuggestions);
      console.log('[Chips] detectedIntent:', detectedIntent);
    } else {
      console.log('[Chips] activeSuggestions cleared');
    }
  }, [activeSuggestions, detectedIntent]);

  // Initialize search index
  useEffect(() => {
    searchIndex.initialize();
  }, []);

  // Index messages as they're added
  useEffect(() => {
    messages.forEach((msg) => {
      // Only index user and assistant messages (exclude system, action, etc.)
      if (msg.role !== 'user' && msg.role !== 'assistant') return;

      searchIndex.addMessage({
        id: msg.id,
        content: msg.content,
        role: msg.role,
        timestamp: new Date(msg.created_at).getTime(),
        type: msg.metadata_json?.entryType as 'habit' | 'note' | 'task' | 'person' | undefined,
        metadata: msg.metadata_json,
      });
    });
  }, [messages]);

  const handleSend = useCallback(
    async (text: string) => {
      const trimmedText = text.trim();
      if (!trimmedText || !chat) return;

      hideActionToast();

      // P0 Fix: Strict spaceId validation with dev error
      if (!spaceId) {
        console.error('[ChatThread][10.10] Missing spaceId - this should never happen');
        if (__DEV__) {
          throw new Error('[P0] spaceId is required for space_chat lane but was undefined/null');
        }
        Alert.alert('Error', 'Invalid space context');
        return;
      }

      // Log spaceId once for debugging
      if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
        console.log('[Chat] spaceId=', spaceId);
      }

      const currentUserId = userId || 'anonymous';

      try {
        setSending(true);
        // Advance user message index for cooldown tracking
        userMsgIndexRef.current += 1;

        // Clear active suggestions when user sends a new message
        setActiveSuggestions([]);
        setDetectedIntent(null);
        setLastUserMessage(trimmedText);

        // Clear any existing fade timer
        if (suggestionFadeTimerRef.current) {
          clearTimeout(suggestionFadeTimerRef.current);
          suggestionFadeTimerRef.current = null;
        }

        // Phase 10.6: Trigger haptic feedback for send action
        if (shouldUseHaptics()) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }

        // 1. Send user message via hook
        await sendUserMessage(trimmedText);

        // Phase 10.6: Emit user message sent event
        emitChatEvent({
          type: 'user_message_sent',
          payload: { text: trimmedText, spaceId: chat.space_id || undefined },
        });

        // Check for quick response (instant reply without API call)
        const quickResponse = checkQuickResponse(trimmedText, messages.length);

        if (quickResponse && quickResponse.confidence > 0.7) {
          // Use quick response - no API call needed
          if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
            console.log('[Chat] Using quick response', {
              confidence: quickResponse.confidence,
              pattern: trimmedText.substring(0, 30),
            });
          }

          // Phase 10.6: Start thinking animation briefly
          mascot.thinking();

          // Add slight delay so response feels natural (not instantaneous)
          setTimeout(async () => {
            const responseText = getQuickResponseText(quickResponse);

            // Append assistant message with quick response metadata
            await appendAssistantMessage(responseText, {
              isQuickResponse: true,
              confidence: quickResponse.confidence,
            });

            // Phase 10.6: Transition to replying state
            mascot.replying();

            // Record performance metric
            await perfMonitor.recordQuickResponse();

            // Brief replying state, then back to idle
            setTimeout(() => {
              mascot.idle();
            }, 800);

            setSending(false);
          }, 300); // 300ms delay feels natural

          return; // Skip Cortex API call
        }

        // Phase 10.6: Start thinking animation for API call
        mascot.thinking();

        // 2. Process with Cortex in parallel (Phase 10.3)
        try {
          // Ensure we have a valid session before making cortex calls
          const validSession = await auth.waitForSession(3000);
          if (!validSession && auth.user) {
            console.warn('[ChatThread] Session timeout, cortex call skipped');
            await appendAssistantMessage(
              'I had trouble processing your message. Please try again.',
            );
            return;
          }

          const ctx: CortexContext = {
            lane: 'space_chat',
            userId: currentUserId,
            activeSpaceId: chat.space_id || null,
            uiSurface: 'chat',
            spaceId: chat.space_id || null,
            chatId: chat.id || null, // Phase 10.7E: For context building
            repo, // Phase 10.7E: For fetching messages
            recentAssistantKind: lastAssistantResponseRef.current?.kind ?? null,
          };

          // Dev-only lane logging
          if (process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
            console.log(
              '[CORTEX] lane=%s space=%s msg=%s',
              ctx.lane,
              ctx.spaceId ?? '-',
              ctx.messageId ?? '-',
            );
          }

          // Phase 10.6: Emit request started event
          emitChatEvent({
            type: 'request_started',
            payload: { requestId: Date.now().toString(), lane: 'space_chat' },
          });

          const cortexStartTime = Date.now();
          const response = await cortexRoute({ text: trimmedText }, ctx);
          const cortexDuration = Date.now() - cortexStartTime;

          // Record API call performance
          await perfMonitor.recordApiCall(cortexDuration);

          if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
            console.log('[Chat] Cortex API call completed', {
              duration: `${cortexDuration}ms`,
            });
          }

          const responseDetectedIntent = metaHasDetectedIntent(response.meta)
            ? (response.meta.detectedIntent as DetectedIntent)
            : null;
          const toastShown = maybeTriggerActionToast(
            responseDetectedIntent,
            response.meta as Record<string, any> | undefined,
            trimmedText,
          );

          if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
            console.log('[ChatToast] toast_decision', {
              toastShown,
              detectedIntent: responseDetectedIntent
                ? {
                    kind: responseDetectedIntent.kind,
                    confidence: responseDetectedIntent.confidence,
                  }
                : null,
              responseMeta: response.meta,
            });
          }

          // Simple, direct fallback: if no toast shown yet, run local detection and gate purely by confidence/kind
          if (!toastShown) {
            const localIntent = detectIntent(trimmedText);
            const fallbackShown = maybeTriggerActionToast(localIntent, undefined, trimmedText);
            if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
              console.log('[ChatToast] fallback_local_detection', {
                fallbackShown,
                localIntent: { kind: localIntent.kind, confidence: localIntent.confidence },
              });
            }
          }

          // Log event (non-blocking)
          repo
            .writeEvent(
              'cortex_decision',
              {
                source: 'chat',
                text: trimmedText,
                actions: response.actions,
                confidence: response.confidence,
                mode: response.mode,
                spaceId: chat.space_id,
              },
              { userId: currentUserId },
            )
            .catch((err) => console.error('[ChatThread] Failed to log event:', err));

          // REMOVED: Automatic action creation without user confirmation (lines 800-883)
          // CRITICAL BUG FIX: Actions should ONLY be created when user explicitly clicks "Confirm"
          // in the InlineActionConfirmation component (Phase 11.3)
          //
          // The previous code automatically created actions when:
          // - !toastShown && response.mode === 'auto' && actions.length > 0
          //
          // This bypassed user confirmation and created habits/todos/notes without permission.
          // All action creation now goes through:
          // 1. maybeTriggerActionToast() shows InlineActionConfirmation
          // 2. User clicks "Confirm" button
          // 3. InlineActionConfirmation calls repo.create()
          // 4. EntryCard shows success (Phase 11.6)
          //
          // See: components/chat/InlineActionConfirmation.tsx for proper confirmation flow

          // Phase 10.6: Determine mascot state based on cortex response
          let shouldTriggerPlayful = false;

          // Normalize actions array for type safety
          const actions = Array.isArray(response.actions) ? response.actions : [];

          // Check if this is chit-chat/conversational content
          if (response.mode === 'keep' && actions.length === 0) {
            // Simple heuristic for chit-chat detection
            const chitChatPatterns =
              /\b(hello|hi|hey|thanks|thank you|how are you|what's up|good morning|good afternoon|good evening)\b/i;
            if (chitChatPatterns.test(trimmedText.toLowerCase())) {
              shouldTriggerPlayful = true;
            }
          }

          // Add AI response message for all cortex responses (explanation or replyText)
          // CRITICAL FIX: Don't show explanation if we're showing a toast/confirmation
          // The explanation might contain "Habit locked in" which is premature before user confirms
          const shouldShowExplanation = !toastShown;
          const assistantText = shouldShowExplanation
            ? response.explanation?.trim() || response.replyText?.trim()
            : response.replyText?.trim() || '';

          if (assistantText) {
            // Phase 10.7: Handle intent-based suggestions
            if (
              response.mode === 'ask' &&
              response.suggestions &&
              response.suggestions.length > 0
            ) {
              setActiveSuggestions(response.suggestions);

              // Store detected intent from meta if available
              if (responseDetectedIntent) {
                setDetectedIntent(responseDetectedIntent);
                try {
                  const di = responseDetectedIntent;
                  console.log(
                    '[Chips] render for messageId=',
                    messages[messages.length - 1]?.id || 'unknown',
                    'kind=',
                    di.kind,
                    'confidence=',
                    typeof di.confidence === 'number' ? di.confidence.toFixed(2) : di.confidence,
                  );
                } catch {
                  // defensive: skip logging if structure unexpected
                }
              }

              // Phase 10.7B: Auto-fade suggestions after 6 seconds
              if (suggestionFadeTimerRef.current) {
                clearTimeout(suggestionFadeTimerRef.current);
              }
              suggestionFadeTimerRef.current = setTimeout(() => {
                console.log('[Chips] auto-fade triggered');
                setActiveSuggestions([]);
                setDetectedIntent(null);
              }, 6000);
            } else {
              setActiveSuggestions([]);
              setDetectedIntent(null);
            }

            const appendedMessage = await appendAssistantMessage(assistantText);

            // Phase 10.8: Maybe refresh Space Insight summary (background, fire-and-forget)
            if (getEnv('EXPO_PUBLIC_SPACE_SUMMARY_BG') === 'on' && spaceId) {
              // Convert messages to ChatTurn format
              const historyTurns = messages.map((m) => ({
                role: m.role as 'user' | 'assistant',
                text: m.content,
              }));

              const hasLatestUser = historyTurns.some(
                (turn) => turn.role === 'user' && turn.text === trimmedText,
              );

              if (!hasLatestUser) {
                historyTurns.push({ role: 'user', text: trimmedText });
              }

              historyTurns.push({ role: 'assistant', text: assistantText });

              const turns = historyTurns;

              const lastMsgId = appendedMessage?.id || messages[messages.length - 1]?.id;

              // Use static import instead of dynamic import
              maybeRefreshSummary(spaceId, turns, lastMsgId).catch((err) => {
                if (__DEV__) {
                  console.error('[ChatThread][10.8] Summary refresh failed:', err);
                }
              });
            }

            // Phase 10.6: Emit response final event with intent detection flag
            let hasIntent = false;
            if (responseDetectedIntent) {
              const di = responseDetectedIntent;
              hasIntent =
                di.kind !== 'none' && typeof di.confidence === 'number' && di.confidence >= 0.75;
            }

            emitChatEvent({
              type: 'response_final',
              payload: {
                requestId: Date.now().toString(),
                assistantKind: response.meta?.kind,
                hasActions: response.actions && response.actions.length > 0,
                hasSuggestions: response.suggestions && response.suggestions.length > 0,
                intentDetected: hasIntent,
              },
            });

            // Track assistant response for conversion metadata and anti-spam logic
            lastAssistantResponseRef.current = {
              explanation: response.explanation,
              replyText: response.replyText,
              kind: metaKindAsAssistantKind(response.meta?.kind),
            };

            // Phase 10.6: Trigger appropriate mascot state after assistant message
            if (shouldTriggerPlayful) {
              mascot.playful();
            } else {
              mascot.replying();
            }
          }
        } catch (cortexError: any) {
          // Enhanced cortex error handling with detailed logging
          console.error('[ChatThread] Cortex decision failed:', {
            error: cortexError,
            userId: currentUserId,
            spaceId: chat.space_id,
            text: trimmedText.substring(0, 100) + (trimmedText.length > 100 ? '...' : ''),
          });

          // Phase 10.6: Emit error event
          emitChatEvent({
            type: 'error',
            payload: {
              error: cortexError,
              context: 'cortex_request',
            },
          });

          // Check for specific error types and provide appropriate responses
          let errorResponse =
            "I apologize, but I'm having trouble processing your message right now.";

          if (cortexError?.message?.includes('timeout') || cortexError?.name === 'AbortError') {
            errorResponse = 'The response is taking longer than expected. Your message was saved.';
          } else if (
            cortexError?.message?.includes('network') ||
            cortexError?.message?.includes('fetch')
          ) {
            errorResponse = "I'm having network connectivity issues. Your message was saved.";
          } else if (
            cortexError?.message?.includes('auth') ||
            cortexError?.message?.includes('unauthorized')
          ) {
            errorResponse = 'There was an authentication issue. Please try refreshing the app.';
          }

          // Still add an assistant message to acknowledge the user's input
          try {
            await appendAssistantMessage(errorResponse);
            // Phase 10.6: Even on error, show replying state briefly
            mascot.replying();
          } catch (appendError) {
            console.error('[ChatThread] Failed to append error message:', appendError);
            // Phase 10.6: Return to idle on complete failure
            mascot.idle();
          }
        }

        console.log('[Analytics] space_chat_message_sent', { chatId });
      } catch (error) {
        console.error('Failed to send message:', error);
        Alert.alert('Error', 'Failed to send message');
      } finally {
        setSending(false);
      }
    },
    [
      chat,
      chatId,
      repo,
      userId,
      sendUserMessage,
      appendAssistantMessage,
      messages,
      mascot,
      maybeTriggerActionToast,
      hideActionToast,
    ],
  );

  const handlePersistentActionPress = useCallback(() => {
    if (shouldUseHaptics()) {
      Haptics.selectionAsync();
    }
    overlayController.openCreate({ spaceId: spaceId ?? null });
  }, [overlayController, spaceId]);

  // Phase 10.7D: Debounced send wrapper (200ms)
  const handleSendDebounced = useCallback(
    (text: string) => {
      // Clear any existing debounce timer
      if (sendDebounceTimerRef.current) {
        clearTimeout(sendDebounceTimerRef.current);
      }

      // Set new debounce timer
      sendDebounceTimerRef.current = setTimeout(() => {
        handleSend(text);
      }, 200);
    },
    [handleSend],
  );

  // Convert from chip handler
  const convertFromChip = useCallback(
    (kind: OverlayKind) => {
      // Phase 10.10: Use lastUserMessage (current user message that triggered action)
      // NOT first message or last assistant
      const userText = lastUserMessage.trim();

      if (!userText) {
        console.warn('[ChatThread][10.10] No user message to convert');
        return;
      }

      // Phase 10.10: Use utility functions for proper prefill mapping
      let initial: { title?: string; note?: string };

      if (kind === 'note') {
        // For notes: smart title + full text in note field
        initial = {
          title: smartTitle(userText),
          note: userText,
        };
      } else if (kind === 'todo') {
        // For todos: extract imperative title
        initial = {
          title: extractTodoTitle(userText),
        };
      } else if (kind === 'habit') {
        // For habits: parse habit with cadence
        const habitData = parseHabit(userText);
        initial = {
          title: habitData.name,
          // TODO: Pass cadence through once overlay supports it
          // cadence: habitData.cadence
        };
      } else {
        // Default: use detected intent title or message text
        const titleFromIntent = detectedIntent?.title;
        initial = { title: (titleFromIntent || userText).trim() };
      }

      const whyFromIntent = detectedIntent?.why;

      // Phase 10.10: Log before opening overlay
      console.log('[ChatThread][10.10] Opening overlay', {
        kind,
        prefill: initial,
        userText,
      });

      openUnifiedFromChat(
        kind,
        initial,
        {
          lane: 'space_chat',
          spaceId: spaceId ?? null,
          messageId: null, // Not converting from specific message ID
          whyString: whyFromIntent || (lastAssistantResponseRef.current?.explanation ?? null),
        },
        overlayController,
      );
    },
    [lastUserMessage, spaceId, overlayController, detectedIntent],
  );

  // Map suggestion text to overlay kind
  const getSuggestionKind = useCallback((suggestion: string): OverlayKind | null => {
    const lower = suggestion.toLowerCase();
    if (lower.includes('todo') || lower.includes('task') || lower.includes('do')) return 'todo';
    if (lower.includes('note') || lower.includes('remember') || lower.includes('write'))
      return 'note';
    if (lower.includes('habit') || lower.includes('routine') || lower.includes('daily'))
      return 'habit';
    if (lower.includes('reflect') || lower.includes('think') || lower.includes('journal'))
      return 'reflection';

    // Default fallback for generic suggestions
    return 'todo';
  }, []);

  const handleSuggestionPress = useCallback(
    (suggestion: string) => {
      // Phase 10.7: Use detected intent if available, otherwise parse suggestion text
      let kind: OverlayKind | null = null;

      if (detectedIntent && detectedIntent.kind !== 'none' && detectedIntent.kind !== 'question') {
        // Use intent kind directly
        kind = detectedIntent.kind as OverlayKind;
      } else {
        // Fall back to parsing suggestion text
        kind = getSuggestionKind(suggestion);
      }

      if (kind) {
        convertFromChip(kind);
        // Clear suggestions after conversion
        setActiveSuggestions([]);
        setDetectedIntent(null);
        if (suggestionFadeTimerRef.current) {
          clearTimeout(suggestionFadeTimerRef.current);
          suggestionFadeTimerRef.current = null;
        }
      }
    },
    [detectedIntent, getSuggestionKind, convertFromChip],
  );

  // Helper to show success toast cross-platform with chat-specific messaging
  const showChatConversionToast = useCallback((message: string) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    } else {
      // TODO: Implement custom toast with Golden Pear color (#E0C47A)
      Alert.alert('✅ Success', message);
    }
  }, []);

  // Environment gate - wrap entire chat UI
  if (process.env.EXPO_PUBLIC_FEATURE_CHAT !== 'on') {
    return <Placeholder text="Chat temporarily disabled" />;
  }

  if (loading || messagesLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={lightTokens.colors.primary} />
      </View>
    );
  }

  if (!chat) {
    return <Placeholder text="Chat not found" />;
  }

  if (messagesError) {
    return <Placeholder text={`Error: ${messagesError}`} />;
  }

  // Extract pending action confirmations to render outside ScrollView
  const pendingActionConfirmation = messages.find(
    (m) => m.role === 'system' && m.metadata_json?.type === 'action-confirmation',
  );

  return (
    <MascotProvider lane="space_chat">
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={[styles.flex, isActionToastVisible && { paddingBottom: actionToastOffset }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          {/* Header with Mascot - Phase 10.6 */}
          {shouldShowMascot() && (
            <View style={styles.header}>
              <View style={styles.headerContent}>
                <TouchableOpacity
                  onPress={handleBackPress}
                  style={styles.backButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityLabel="Go back to Space"
                  accessibilityRole="button"
                >
                  <Text style={styles.backButtonText}>← Space</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Chat with Gremly</Text>
                <View style={styles.headerRight}>
                  <TouchableOpacity
                    onPress={() => setSearchVisible(true)}
                    style={styles.searchButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityLabel="Search messages"
                    accessibilityRole="button"
                  >
                    <SearchIcon size={24} color="#2E5540" />
                  </TouchableOpacity>
                  <Mascot size="md" />
                </View>
              </View>
            </View>
          )}

          {/* Messages ScrollView */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.messages}
            contentContainerStyle={styles.messagesContent}
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.length === 0 ? (
              <View style={styles.placeholder}>
                {/* Gremly peeking from right edge */}
                <View style={styles.gremlyContainer}>
                  <Image
                    source={require('../../assets/mascot/Gremlychat.png')}
                    style={styles.peekingGremly}
                    resizeMode="contain"
                  />
                </View>

                {/* Text positioned on the left side */}
                <View style={styles.emptyTextContainer}>
                  <Text style={styles.placeholderTitle}>Start typing what's on your mind.</Text>
                  <Text style={styles.placeholderText}>
                    Gremly can help you sort ideas, set habits, or create next steps
                  </Text>
                </View>
              </View>
            ) : (
              <>
                {messages.map((message) => {
                  const messageConfirmations = confirmations.find(
                    (c) => c.messageId === message.id,
                  );

                  // Phase 11.6: Render entry card
                  // Check for system role with type 'entry-card' in metadata
                  if (message.role === 'system' && message.metadata_json?.type === 'entry-card') {
                    const metadata = message.metadata_json || {};
                    const entry = metadata.entry;
                    const entryType = metadata.entryType;

                    if (entry && entryType) {
                      // Add type property to entry object
                      const typedEntry = { ...entry, type: entryType };

                      return (
                        <EntryCard
                          key={message.id}
                          entry={typedEntry}
                          onPress={(entry) => {
                            // Open unified overlay with full entry data
                            overlayController.openEdit({
                              record: entry as any, // Full entry object includes all required fields
                              spaceId: spaceId ?? undefined,
                            });
                          }}
                          testID={`entry-card-${message.id}`}
                        />
                      );
                    }
                  }

                  // Phase 11.3/11.5: Skip action confirmations - they're rendered outside ScrollView
                  // CRITICAL FIX: Check for system role with type 'action-confirmation' in metadata
                  if (
                    message.role === 'system' &&
                    message.metadata_json?.type === 'action-confirmation'
                  ) {
                    // Don't render inside ScrollView - will be rendered as overlay below
                    return null;
                  }

                  return (
                    <View
                      key={message.id}
                      style={[
                        styles.messageContainer,
                        highlightedMessageId === message.id && styles.highlightedMessage,
                      ]}
                    >
                      <ChatBubble message={message} testID={`chat-bubble-${message.id}`} />
                      {messageConfirmations && messageConfirmations.texts.length > 0 && (
                        <View style={styles.confirmationsContainer}>
                          {messageConfirmations.texts.map((confirmation, idx) => (
                            <ConfirmationPill
                              key={idx}
                              text={confirmation}
                              testID={`chat-confirmation-${message.id}-${idx}`}
                            />
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}

                {/* Suggestion chips for ask mode responses */}
                {/* Phase 10.7B: Max 1 chip */}
                {activeSuggestions.length > 0 && (
                  <View style={styles.suggestionsContainer}>
                    <Text style={styles.suggestionsLabel}>You could also:</Text>
                    <View style={styles.suggestionChips}>
                      {activeSuggestions.slice(0, 1).map((suggestion, index) => {
                        console.log('[Chips] Rendering chip:', suggestion, 'index:', index);
                        return (
                          <Chip
                            key={index}
                            label={suggestion}
                            onPress={() => handleSuggestionPress(suggestion)}
                            testID={`suggestion-chip-${index}`}
                          />
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Typing indicator - Phase 10.6 */}
                {mascot.state === 'thinking' && (
                  <View style={styles.typingContainer}>
                    <ChatThinkingIndicator visible variant="both" />
                  </View>
                )}
              </>
            )}
          </ScrollView>

          {/* Persistent Action Bar removed */}

          {/* Chat Composer */}
          <ChatComposer onSend={handleSendDebounced} disabled={sending} testID="chat-composer" />

          {/* Phase 11.7: Calm Action Bar with centered + button */}
          <ChatActionBar
            onAddPress={() => {
              overlayController.openCreate({ spaceId: spaceId ?? undefined });
            }}
            lastCreatedItem={lastCreatedItem}
          />

          {ActionToast}

          {/* Phase 11.3/11.5: Render action confirmation OUTSIDE ScrollView for proper touch handling */}
          {pendingActionConfirmation &&
            (() => {
              const metadata = pendingActionConfirmation.metadata_json || {};

              // Phase 11.5: Check if this is a multi-intent confirmation
              if (metadata.alternativeIntents && metadata.alternativeIntents.length > 0) {
                return (
                  <View
                    style={{
                      position: 'absolute',
                      bottom: 100,
                      left: 16,
                      right: 16,
                      zIndex: 9999,
                      elevation: 999,
                    }}
                    pointerEvents="box-none"
                  >
                    <MultiIntentConfirmation
                      key={pendingActionConfirmation.id}
                      message={pendingActionConfirmation}
                      onSelectIntent={async (kind: IntentKind) => {
                        // Open overlay for selected intent type
                        if (kind === 'habit' || kind === 'todo' || kind === 'note') {
                          overlayController.openCreate({
                            type: kind as 'habit' | 'todo' | 'note',
                            spaceId: spaceId ?? undefined,
                            conversionMeta: {
                              initialTitle: pendingActionConfirmation.content,
                            },
                          });
                        }
                      }}
                      onCreateMultiple={metadata.onCreateMultiple}
                      onCancel={metadata.onCancel}
                      testID={`multi-intent-${pendingActionConfirmation.id}`}
                    />
                  </View>
                );
              }

              // Standard single-intent confirmation
              return (
                <View
                  style={{
                    position: 'absolute',
                    bottom: 100,
                    left: 16,
                    right: 16,
                    zIndex: 9999,
                    elevation: 999,
                  }}
                  pointerEvents="box-none"
                >
                  <InlineActionConfirmation
                    key={pendingActionConfirmation.id}
                    message={pendingActionConfirmation}
                    onConfirm={metadata.onConfirm}
                    onEdit={metadata.onEdit}
                    onCancel={metadata.onCancel}
                    testID={`inline-action-${pendingActionConfirmation.id}`}
                  />
                </View>
              );
            })()}
        </KeyboardAvoidingView>

        {/* Unified Create Overlay for Chat Conversions */}
        <UnifiedCreateOverlay
          visible={overlayController.state.visible}
          mode={overlayController.state.mode}
          initialEntity={overlayController.state.initialEntity}
          initialSpaceId={overlayController.state.initialSpaceId}
          conversionMeta={overlayController.state.conversionMeta}
          onClose={overlayController.close}
          onSaved={async (result) => {
            // Success toast with chat-specific messaging
            const itemType =
              result.type === 'note'
                ? 'Note'
                : result.type === 'todo'
                  ? 'To-Do'
                  : result.type === 'habit'
                    ? 'Habit'
                    : 'Item';
            showChatConversionToast(`${itemType} created from chat ✨`);

            // Phase 11.7: Track last created item for encouragement messages
            setLastCreatedItem({
              type: result.type,
              timestamp: Date.now(),
            });

            // Phase 11.6: Add entry card to chat thread
            try {
              // Fetch the created record
              const record = await repo.getById(result.id);

              if (
                record &&
                (result.type === 'note' || result.type === 'todo' || result.type === 'habit')
              ) {
                await appendEntryCard(record, result.type as 'note' | 'todo' | 'habit');
              }
            } catch (err) {
              console.error('[EntryCard] Failed to add entry card to chat:', err);
            }
          }}
        />

        {/* Message Search Modal */}
        <MessageSearch
          visible={searchVisible}
          onClose={() => setSearchVisible(false)}
          onSelectMessage={(messageId) => {
            // Find message index and scroll to it
            const index = messages.findIndex((m) => m.id === messageId);
            if (index >= 0) {
              // Highlight the message briefly
              setHighlightedMessageId(messageId);
              setTimeout(() => setHighlightedMessageId(null), 2000);

              // Scroll to show the message
              scrollViewRef.current?.scrollTo({
                y: index * 100, // Approximate message height
                animated: true,
              });
            }
          }}
        />
      </SafeAreaView>
    </MascotProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#D4E4D4', // Sage green background for seamless empty state
  },
  flex: {
    flex: 1,
  },
  // Atmosphere overlay for depth
  atmosphereOverlay: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
    opacity: 0.02,
  },
  header: {
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
    paddingHorizontal: lightTokens.spacing[4],
    paddingVertical: lightTokens.spacing[3],
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTokens.spacing[2],
  },
  searchButton: {
    padding: lightTokens.spacing[2],
  },
  headerTitle: {
    fontSize: lightTokens.typography.size.lg,
    fontWeight: '600',
    color: lightTokens.colors.charcoalInk,
  },
  backButton: {
    paddingVertical: lightTokens.spacing[2],
    paddingHorizontal: lightTokens.spacing[2],
    marginRight: lightTokens.spacing[3],
  },
  backButtonText: {
    fontSize: lightTokens.typography.size.md,
    color: lightTokens.colors.mossGreen,
    fontWeight: '500',
  },
  messages: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  messagesContent: {
    padding: lightTokens.spacing[4],
    paddingBottom: lightTokens.spacing[6],
  },
  typingContainer: {
    alignSelf: 'flex-start',
    marginTop: lightTokens.spacing[2],
  },
  placeholder: {
    flex: 1,
    position: 'relative',
    paddingBottom: 100, // Account for input field
  },
  gremlyContainer: {
    position: 'absolute',
    right: -30, // Negative margin to peek from edge
    top: '20%',
    width: 220,
    height: 220,
    zIndex: 1,
  },
  peekingGremly: {
    width: '100%',
    height: '100%',
  },
  emptyTextContainer: {
    position: 'absolute',
    left: 32,
    top: '30%',
    maxWidth: '60%', // Don't overlap with mascot
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2E5540', // Moss Green
    marginBottom: 12,
    lineHeight: 24,
  },
  placeholderText: {
    fontSize: 15,
    color: '#4A5F4A', // Darker green for better contrast on sage background
    lineHeight: 21,
  },
  messageContainer: {
    marginBottom: lightTokens.spacing[3],
  },
  highlightedMessage: {
    backgroundColor: 'rgba(46, 85, 64, 0.1)', // Moss green with transparency
    borderRadius: 8,
    padding: 8,
    marginHorizontal: -8,
  },
  confirmationsContainer: {
    marginTop: lightTokens.spacing[2],
    alignSelf: 'flex-end',
    maxWidth: '80%',
  },
  suggestionsContainer: {
    marginTop: lightTokens.spacing[3],
    alignSelf: 'flex-start',
    maxWidth: '90%',
  },
  suggestionsLabel: {
    fontSize: lightTokens.typography.size.sm,
    color: lightTokens.colors.subtle,
    marginBottom: lightTokens.spacing[2],
  },
  suggestionChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: lightTokens.spacing[2],
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: lightTokens.colors.linenCream,
  },
});
