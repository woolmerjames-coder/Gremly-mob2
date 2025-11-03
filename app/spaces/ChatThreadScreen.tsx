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
  Pressable,
} from 'react-native';
import { Search as SearchIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { SupabaseSpaceChatRepo } from '../../lib/repo/supabase';
import { MemorySpaceChatRepo } from '../../lib/repo/memory';
import type { SpaceChat, SpaceChatMessage } from '../../lib/types';
import type { CreateRecordInput } from '../../lib/repo/IRepo';
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
import { decideChatToastGating, type ChatIntentInfo } from '../../lib/chat/decideToastGating';
import { logCatchallDecision } from '../../lib/telemetry/catchallLogger';
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
import { computeDuePrefill } from './chat/duePrefill';
import { Chip } from '../../ui/Chip';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import { useGlobalOverlay } from '../../contexts/OverlayContext';
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

function mapDetectedKindToPolicyKind(kind: DetectedIntent['kind']): ChatIntentInfo['kind'] {
  switch (kind) {
    case 'todo':
    case 'habit':
    case 'note':
    case 'reflection':
    case 'idea':
    case 'question':
    case 'ambiguous':
    case 'none':
      return kind;
    case 'habit_reminder':
      return 'habit';
    default:
      return 'ambiguous';
  }
}

function mapPolicyDecision(mode: 'auto' | 'ask' | 'keep' | 'unsorted') {
  switch (mode) {
    case 'auto':
      return 'auto_create' as const;
    case 'ask':
      return 'ask_chip' as const;
    case 'keep':
      return 'keep_note' as const;
    default:
      return 'unsorted' as const;
  }
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
    const duePrefill = computeDuePrefill(trimmedUserText);
    const { dueDate: heuristicDueDate, dueTime } = deriveTodoDetails(trimmedUserText);
    const dueDate = duePrefill.dueDate ?? heuristicDueDate ?? null;

    if (process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
      console.log(
        '[ChatPrefill][Due] confidence=%s due=%s',
        duePrefill.confidence,
        duePrefill.dueDate || '-',
      );
    }

    return {
      type,
      content: title,
      metadata: {
        ...commonMetadata,
        dueDate,
        dueTime: dueTime ?? null,
        onConfirm: handlers?.onConfirm as any,
        onCancel: handlers?.onCancel,
        onEdit: handlers?.onEdit,
        onAutoDismiss: handlers?.onAutoDismiss,
        conversionMeta: {
          initialTitle: title,
          initialDueDate: dueDate,
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

  // Phase 14: Track conversation context for cross-message memory
  const [conversationContext, setConversationContext] = useState<{
    lastActivity: string | null; // "running", "meditation", etc.
    lastFrequency: string | null; // "3 times a week", "daily", etc.
    lastDuration: string | null; // "30 minutes", etc.
    contextExpiry: number; // Timestamp when context expires
  }>({
    lastActivity: null,
    lastFrequency: null,
    lastDuration: null,
    contextExpiry: 0,
  });

  // Phase 14: Track if we're actively building a habit/todo/note (enables lower thresholds)
  const [buildingMode, setBuildingMode] = useState<{
    type: 'habit' | 'todo' | 'note' | null;
    startedAt: number;
  }>({
    type: null,
    startedAt: 0,
  });

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
    removeMessage,
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

  // Phase 14: Update conversation context from user messages
  const updateContext = useCallback((text: string) => {
    // Activity detection - common activities
    const activityMatch = text.match(
      /\b(run|running|jog|jogging|meditate|meditation|meditating|exercise|exercising|walk|walking|read|reading|write|writing|stretch|stretching|yoga|swim|swimming|bike|biking|cycling|gym|workout|working out)\b/i,
    );
    if (activityMatch) {
      const rawActivity = activityMatch[1].toLowerCase();

      // Normalize: map -ing forms to base forms
      const activityMap: Record<string, string> = {
        running: 'run',
        jogging: 'jog',
        meditating: 'meditate',
        meditation: 'meditate',
        exercising: 'exercise',
        walking: 'walk',
        reading: 'read',
        writing: 'write',
        stretching: 'stretch',
        swimming: 'swim',
        biking: 'bike',
        cycling: 'bike',
        'working out': 'workout',
      };

      const normalized = activityMap[rawActivity] || rawActivity;

      setConversationContext((prev) => ({
        ...prev,
        lastActivity: normalized,
        contextExpiry: Date.now() + 300000, // Context valid for 5 minutes
      }));
    }

    // Frequency detection
    const freqMatch = text.match(
      /(\d+)\s*(?:times?|x)\s*(?:a|per)?\s*(?:week|day)|daily|every\s*day|every\s*week|weekdays?|weekends?/i,
    );
    if (freqMatch) {
      setConversationContext((prev) => ({
        ...prev,
        lastFrequency: freqMatch[0],
        contextExpiry: Date.now() + 300000,
      }));
    }

    // Duration detection
    const durationMatch = text.match(/(\d+)\s*(?:minutes?|mins?|hours?|hrs?)/i);
    if (durationMatch) {
      setConversationContext((prev) => ({
        ...prev,
        lastDuration: durationMatch[0],
        contextExpiry: Date.now() + 300000,
      }));
    }
  }, []);

  // Phase 11.3: Inline action confirmation function (moved after useChatMessages)
  const maybeTriggerActionToast = useCallback(
    async (
      intent: DetectedIntent | null,
      _meta: Record<string, any> | undefined,
      userText: string,
    ) => {
      // Phase 11.3: Add inline action confirmation messages instead of overlay toast
      if (!intent) return false;

      if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
        console.log('[DEBUG][Toast] maybeTriggerActionToast called:', {
          text: userText.substring(0, 50),
          intentKind: intent.kind,
          confidence: intent.confidence,
          suppressChips: intent.suppressChips,
          isMetaComment: intent.isMetaComment,
        });
      }

      if (intent.isMetaComment) {
        if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
          console.log('[DEBUG][Toast] Blocking - meta-comment detected');
        }
        return false;
      }

      if (intent.suppressChips) {
        if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
          console.log('[DEBUG][Toast] Blocking - suppressChips flag set');
        }
        return false;
      }

      const policyDecision = decideChatToastGating(userText, {
        kind: mapDetectedKindToPolicyKind(intent.kind),
        confidence: typeof intent.confidence === 'number' ? intent.confidence : 0,
        isCommand: !!intent.isCommand,
        isMetaComment: !!intent.isMetaComment,
      });

      const originalMode =
        typeof _meta?.mode === 'string'
          ? _meta.mode
          : typeof _meta?.policyMode === 'string'
            ? _meta.policyMode
            : null;

      const engineMode: 'LLM' | 'HEURISTIC' | 'DISABLED' = 'LLM';
      const modelVersion = process.env.EXPO_PUBLIC_CORTEX_MODEL || 'gpt-4o-mini';
      const decisionLabel = mapPolicyDecision(policyDecision.mode);

      void logCatchallDecision({
        userId: userId || 'anonymous',
        text: userText,
        surface: 'space_chat',
        engine: engineMode,
        modelVersion,
        intent: mapDetectedKindToPolicyKind(intent.kind),
        confidence: typeof intent.confidence === 'number' ? intent.confidence : 0,
        mode: policyDecision.mode,
        decision: decisionLabel,
        createdTodos: 0,
        createdNotes: 0,
        createdHabits: 0,
      });

      if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
        console.log('[Chat][Policy] toast gating', {
          originalMode,
          policyMode: policyDecision.mode,
          kind: intent.kind,
          conf: intent.confidence,
        });
      }

      if (policyDecision.mode !== 'auto') {
        if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
          console.log('[ChatToast][gate] skip_toast', {
            reason: policyDecision.reason,
            policyMode: policyDecision.mode,
          });
        }
        return false;
      }

      const actionType = INTENT_KIND_TO_ACTION[intent.kind] as
        | 'todo'
        | 'note'
        | 'habit'
        | undefined;

      if (!actionType) {
        if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
          console.log('[ChatToast][gate] skip_toast', {
            reason: 'non_actionable_intent',
            intentKind: intent.kind,
          });
        }
        return false;
      }

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

      // Phase 11.3: Add inline action confirmation message
      // Store the message ID so handlers can remove it
      let toastMessageId: string | undefined;

      // Build action metadata with handlers
      const metadata: Record<string, any> = {
        actionType,
        autoOrigin: 'space_chat' as const,
        aiPlaced: true,
        spaceId: spaceId ?? null,
        confidence: intent.confidence,
        policyMode: policyDecision.mode,
        policyReason: policyDecision.reason,
        policyVersion: policyDecision.policyVersion,
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
          // Remove the toast message from UI
          if (toastMessageId) {
            console.log('[Toast] Removing toast message:', toastMessageId);
            removeMessage(toastMessageId);
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

      try {
        const toastMessage = await appendActionConfirmation(userText, metadata);
        toastMessageId = toastMessage?.id;

        if (__DEV__ || process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
          console.log('[ChatToast] Inline action confirmation added:', {
            type: actionType,
            content: userText.substring(0, 50),
          });
        }

        // Phase 14: Enter building mode when toast is shown
        if (
          actionType &&
          (actionType === 'habit' || actionType === 'todo' || actionType === 'note')
        ) {
          setBuildingMode({
            type: actionType,
            startedAt: Date.now(),
          });
          if (__DEV__) {
            console.log('[BuildingMode] Entered:', actionType);
          }
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
                policyMode: policyDecision.mode,
                policyReason: policyDecision.reason,
                policyVersion: policyDecision.policyVersion,
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
    [
      spaceId,
      recordToastOutcome,
      repo,
      userId,
      appendActionConfirmation,
      overlayController,
      removeMessage,
      messages,
    ],
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

        // Phase 14: Update conversation context from user message
        updateContext(trimmedText);

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
            // Phase 14: Pass conversation context for intent enhancement
            conversationContext: {
              lastActivity: conversationContext.lastActivity,
              lastFrequency: conversationContext.lastFrequency,
              lastDuration: conversationContext.lastDuration,
              contextExpiry: conversationContext.contextExpiry,
              // Include building mode for smart thresholds
              buildingMode: buildingMode.type,
              buildingStartedAt: buildingMode.startedAt,
            },
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
              const suggestionLabels = response.suggestions
                .map((suggestion) =>
                  typeof suggestion === 'string' ? suggestion : suggestion?.label,
                )
                .filter(
                  (label): label is string => typeof label === 'string' && label.trim().length > 0,
                );

              setActiveSuggestions(suggestionLabels);

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
      updateContext,
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
      let initial: { title?: string; note?: string; dueDate?: string | null };

      if (kind === 'note') {
        // For notes: smart title + full text in note field
        initial = {
          title: smartTitle(userText),
          note: userText,
        };
      } else if (kind === 'todo') {
        // For todos: extract imperative title and high-confidence due date
        const title = extractTodoTitle(userText);
        const due = computeDuePrefill(userText);
        if (process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
          console.log(
            '[ChatPrefill][Due] confidence=%s due=%s',
            due.confidence,
            due.dueDate || '-',
          );
        }

        initial = {
          title,
          ...(due.dueDate ? { dueDate: due.dueDate } : {}),
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

                  // Helper function to get icon for each type
                  const getIconForType = (type: string): string => {
                    switch (type) {
                      case 'habit':
                        return '🔒';
                      case 'todo':
                        return '✓';
                      case 'note':
                        return '📝';
                      case 'person':
                        return '👤';
                      default:
                        return '📌';
                    }
                  };

                  // Helper function to get title for each locked type
                  const getLockedTitle = (metadata: any): string => {
                    const itemType = metadata.itemType;
                    switch (itemType) {
                      case 'habit':
                        return `Habit locked in for ${metadata.frequency}`;
                      case 'todo':
                        return `Task added${metadata.dueDate ? ` for ${metadata.dueDate}` : ''}`;
                      case 'note':
                        return 'Note captured';
                      case 'person':
                        return `${metadata.personName} added to connections`;
                      default:
                        return 'Item created';
                    }
                  };

                  // Helper function to get subtext for each locked type
                  const getLockedSubtext = (metadata: any): string => {
                    const itemType = metadata.itemType;
                    if (itemType === 'note' && metadata.noteContent) {
                      return metadata.noteContent.substring(0, 50);
                    }
                    return 'Click this entry or find it in the Space to edit';
                  };

                  // Helper function to get item ID based on type
                  const getItemId = (metadata: any): string | undefined => {
                    const itemType = metadata.itemType;
                    switch (itemType) {
                      case 'habit':
                        return metadata.habitId;
                      case 'todo':
                        return metadata.todoId;
                      case 'note':
                        return metadata.noteId;
                      case 'person':
                        return metadata.personId;
                      default:
                        return undefined;
                    }
                  };

                  // Unified renderer for all locked confirmation types
                  if (
                    message.role === 'assistant' &&
                    (message.metadata_json as any)?.type?.includes('-locked')
                  ) {
                    const metadata = message.metadata_json || {};
                    const itemType = metadata.itemType;
                    const itemId = getItemId(metadata);
                    const icon = getIconForType(itemType);
                    const title = getLockedTitle(metadata);
                    const subtext = getLockedSubtext(metadata);

                    // Determine which style to use based on itemType
                    const lockedStyle =
                      itemType === 'habit'
                        ? styles.lockedHabit
                        : itemType === 'todo'
                          ? styles.lockedTodo
                          : itemType === 'note'
                            ? styles.lockedNote
                            : itemType === 'person'
                              ? styles.lockedPerson
                              : styles.lockedHabit; // fallback

                    return (
                      <Pressable
                        key={message.id}
                        style={lockedStyle}
                        onPress={() => {
                          if (itemId && itemType) {
                            console.log(`[Locked${itemType}] Tapped, itemId:`, itemId);
                            overlayController.openEdit({
                              record: { id: itemId, type: itemType } as any,
                              spaceId: spaceId ?? undefined,
                            });
                          }
                        }}
                      >
                        <View style={styles.lockedContent}>
                          <Text style={styles.lockIcon}>{icon}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.lockedTitle}>{title}</Text>
                            <Text
                              style={styles.lockedSubtext}
                              numberOfLines={itemType === 'note' ? 1 : undefined}
                            >
                              {subtext}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  }

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
              const actionType = metadata.actionType as
                | 'habit'
                | 'todo'
                | 'note'
                | 'person'
                | undefined;
              const toastActionType =
                actionType === 'habit' || actionType === 'todo' || actionType === 'note'
                  ? actionType
                  : undefined;

              // Recreate handlers for this toast (functions can't be serialized in DB)
              const handleConfirm = async () => {
                console.log('[Toast] Confirm clicked for:', metadata);
                if (toastActionType) {
                  recordToastOutcome(toastActionType, 'confirm');
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

                // Create the item directly (don't open overlay for confirmation)
                if (!actionType || !spaceId) return;

                try {
                  let created: any = null;

                  // Create based on type using repo.create() with CreateRecordInput
                  if (actionType === 'habit') {
                    // Phase 14: Use conversation context if available
                    const contextValid = conversationContext.contextExpiry > Date.now();

                    let activityName = metadata.activityName || pendingActionConfirmation.content;
                    let frequency = (metadata.summary?.split(' - ')[1]?.toLowerCase() ||
                      'daily') as any;

                    if (contextValid) {
                      // Use remembered context from previous messages
                      if (conversationContext.lastActivity) {
                        activityName = conversationContext.lastActivity;
                      }
                      if (conversationContext.lastFrequency) {
                        const rawFreq = conversationContext.lastFrequency;
                        // Normalize frequency format
                        if (rawFreq.includes('3') && rawFreq.includes('week')) {
                          frequency = '3x/week';
                        } else if (rawFreq.includes('daily') || rawFreq.includes('every day')) {
                          frequency = 'daily';
                        } else if (rawFreq.match(/(\d+)\s*x/i)) {
                          const match = rawFreq.match(/(\d+)/);
                          if (match) frequency = `${match[1]}x/week`;
                        } else {
                          frequency = rawFreq.toLowerCase();
                        }
                      }
                      console.log('[Toast] Using conversation context:', {
                        activity: activityName,
                        frequency,
                        contextExpiry: new Date(conversationContext.contextExpiry).toISOString(),
                      });
                    }

                    const habitData: CreateRecordInput = {
                      type: 'habit',
                      name: activityName,
                      frequency: frequency,
                      // subtype removed - column doesn't exist in habits table
                      space_id: spaceId,
                      origin: 'catchall',
                    };
                    created = await repo.create(habitData);
                    console.log('[Toast] Habit created directly:', created.id);
                  } else if (actionType === 'todo') {
                    const todoData: CreateRecordInput = {
                      type: 'todo',
                      name: pendingActionConfirmation.content,
                      title: pendingActionConfirmation.content,
                      due_date: null,
                      space_id: spaceId,
                      origin: 'catchall',
                    };
                    created = await repo.create(todoData);
                    console.log('[Toast] Todo created directly:', created.id);
                  } else if (actionType === 'note') {
                    const noteData: CreateRecordInput = {
                      type: 'note',
                      title: pendingActionConfirmation.content.slice(0, 100),
                      body: pendingActionConfirmation.content,
                      subtype: 'idea',
                      space_id: spaceId,
                      origin: 'catchall',
                    };
                    created = await repo.create(noteData);
                    console.log('[Toast] Note created directly:', created.id);
                  }

                  if (created) {
                    // Remove the toast message
                    removeMessage(pendingActionConfirmation.id);

                    // Phase 14: Exit building mode after successful creation
                    setBuildingMode({ type: null, startedAt: 0 });
                    if (__DEV__) {
                      console.log('[BuildingMode] Exited: item created');
                    }

                    // Add locked confirmation message
                    await appendAssistantMessage('', {
                      type: `${actionType}-locked`,
                      [`${actionType}Name`]:
                        actionType === 'habit'
                          ? (created as any).name
                          : actionType === 'todo'
                            ? (created as any).title
                            : 'Item',
                      frequency: actionType === 'habit' ? (created as any).frequency : undefined,
                      dueDate: actionType === 'todo' ? (created as any).due_date : undefined,
                      noteContent: actionType === 'note' ? (created as any).content : undefined,
                      [`${actionType}Id`]: created.id,
                      locked: true,
                      itemType: actionType,
                    });

                    // Add follow-up message after short delay
                    setTimeout(async () => {
                      try {
                        const itemName =
                          actionType === 'habit'
                            ? (created as any).name || 'habit'
                            : actionType === 'todo'
                              ? 'task'
                              : 'note';
                        const continuationMessage =
                          actionType === 'habit'
                            ? `Great! Your ${itemName} is set. What else would you like to work on?`
                            : actionType === 'todo'
                              ? 'Task added to your list. Anything else you need to get done?'
                              : "Got it! Note saved. What's next?";
                        await appendAssistantMessage(continuationMessage);
                        console.log('[Chat] Follow-up message added after direct creation');
                      } catch (err) {
                        console.error('[Chat] Failed to add follow-up message:', err);
                      }
                    }, 1500);
                  }
                } catch (error) {
                  console.error(`[Toast] Failed to create ${actionType}:`, error);
                  // TODO: Show error message to user
                }
              };

              // Extract core action/name from conversational text
              const extractActionName = (text: string, type: 'habit' | 'todo' | 'note'): string => {
                if (type === 'habit') {
                  // Remove common habit prefixes and suffixes
                  const cleaned = text
                    .replace(
                      /^(i want to|i need to|i should|let's|i'm going to|i'd like to)\s+/i,
                      '',
                    )
                    .replace(/\s+(every (day|morning|evening|night|week|month))/gi, '')
                    .replace(/\s+(daily|weekly|monthly)/gi, '')
                    .replace(/\s+(in the (morning|evening|afternoon))/gi, '')
                    .replace(/\s+habit$/i, '')
                    .trim();

                  // Capitalize first letter
                  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
                } else if (type === 'todo') {
                  // Remove todo prefixes
                  const cleaned = text
                    .replace(/^(i need to|i should|i have to|todo:|task:)\s+/i, '')
                    .trim();
                  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
                } else {
                  // For notes, just capitalize
                  return text.trim().charAt(0).toUpperCase() + text.trim().slice(1);
                }
              };

              const handleEdit = () => {
                console.log('[Toast] Edit clicked');
                if (toastActionType) {
                  recordToastOutcome(toastActionType, 'edit');
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
                if (actionType === 'habit' || actionType === 'todo' || actionType === 'note') {
                  const rawTitle = pendingActionConfirmation.content;
                  const cleanedTitle = extractActionName(rawTitle, actionType);

                  if (__DEV__) {
                    console.log('[Toast] Extracted name:', {
                      raw: rawTitle,
                      cleaned: cleanedTitle,
                      type: actionType,
                    });
                  }

                  overlayController.openCreate({
                    type: actionType,
                    spaceId: spaceId ?? undefined,
                    conversionMeta: {
                      initialTitle: cleanedTitle,
                    },
                  });
                }
              };

              const handleCancel = () => {
                console.log('[Toast] Cancel clicked');
                if (toastActionType) {
                  recordToastOutcome(toastActionType, 'cancel');
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

                // Phase 14: Exit building mode on cancellation
                setBuildingMode({ type: null, startedAt: 0 });
                if (__DEV__) {
                  console.log('[BuildingMode] Exited: cancelled');
                }

                // Remove the toast message from UI
                console.log('[Toast] Removing toast message:', pendingActionConfirmation.id);
                removeMessage(pendingActionConfirmation.id);

                // Add acknowledgment message to resume conversation
                setTimeout(async () => {
                  try {
                    await appendAssistantMessage("No problem! Let me know when you're ready.");
                    console.log('[Chat] Acknowledgment message added after cancellation');
                  } catch (err) {
                    console.error('[Chat] Failed to add acknowledgment message:', err);
                  }
                }, 500);
              };

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
                      onCancel={handleCancel}
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
                    onConfirm={handleConfirm}
                    onEdit={handleEdit}
                    onCancel={handleCancel}
                    testID={`inline-action-${pendingActionConfirmation.id}`}
                  />
                </View>
              );
            })()}
        </KeyboardAvoidingView>

        {/* Unified Create Overlay for Chat Conversions */}
        {overlayController.state.visible &&
          (overlayController.state.mode === 'create' ||
            overlayController.state.mode === 'edit') && (
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

                // Remove the action confirmation toast after successful creation
                const actionConfirmation = messages.find(
                  (msg) => msg.metadata_json?.type === 'action-confirmation',
                );
                if (actionConfirmation) {
                  console.log(
                    '[Toast] Removing action confirmation after save:',
                    actionConfirmation.id,
                  );
                  removeMessage(actionConfirmation.id);
                }

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
                    // Helper function to get continuation message based on type
                    const getContinuationMessage = (
                      type: 'habit' | 'todo' | 'note',
                      itemName?: string,
                    ): string => {
                      switch (type) {
                        case 'habit':
                          return `Great! Your ${itemName || 'habit'} is set. What else would you like to work on?`;
                        case 'todo':
                          return 'Task added to your list. Anything else you need to get done?';
                        case 'note':
                          return "Got it! Note saved. What's next?";
                        default:
                          return 'Done! What would you like to do next?';
                      }
                    };

                    // Add locked confirmation message for all types
                    if (result.type === 'habit') {
                      const habitRecord = record as any;
                      await appendAssistantMessage('', {
                        type: 'habit-locked',
                        habitName: habitRecord.name || 'Habit',
                        frequency: habitRecord.frequency || 'regularly',
                        habitId: record.id,
                        locked: true,
                        itemType: 'habit',
                      });

                      // Add follow-up message after short delay
                      setTimeout(async () => {
                        try {
                          await appendAssistantMessage(
                            getContinuationMessage('habit', habitRecord.name),
                          );
                          console.log('[Chat] Follow-up message added after habit creation');
                        } catch (err) {
                          console.error('[Chat] Failed to add follow-up message:', err);
                        }
                      }, 1500);
                    } else if (result.type === 'todo') {
                      const todoRecord = record as any;
                      await appendAssistantMessage('', {
                        type: 'todo-locked',
                        todoTitle: todoRecord.title || 'Task',
                        dueDate: todoRecord.due_date || null,
                        todoId: record.id,
                        locked: true,
                        itemType: 'todo',
                      });

                      // Add follow-up message after short delay
                      setTimeout(async () => {
                        try {
                          await appendAssistantMessage(getContinuationMessage('todo'));
                          console.log('[Chat] Follow-up message added after todo creation');
                        } catch (err) {
                          console.error('[Chat] Failed to add follow-up message:', err);
                        }
                      }, 1500);
                    } else if (result.type === 'note') {
                      const noteRecord = record as any;
                      await appendAssistantMessage('', {
                        type: 'note-locked',
                        noteContent: noteRecord.content || noteRecord.title || 'Note',
                        noteId: record.id,
                        locked: true,
                        itemType: 'note',
                      });

                      // Add follow-up message after short delay
                      setTimeout(async () => {
                        try {
                          await appendAssistantMessage(getContinuationMessage('note'));
                          console.log('[Chat] Follow-up message added after note creation');
                        } catch (err) {
                          console.error('[Chat] Failed to add follow-up message:', err);
                        }
                      }, 1500);
                    }
                  }
                } catch (err) {
                  console.error('[EntryCard] Failed to add entry card to chat:', err);
                }
              }}
            />
          )}

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
  lockedHabit: {
    backgroundColor: '#E8F5E9', // Light green background
    borderLeftWidth: 4,
    borderLeftColor: '#2E5540', // Moss Green
    padding: 12,
    marginVertical: 8,
    marginHorizontal: 16,
    borderRadius: 8,
  },
  lockedTodo: {
    backgroundColor: '#E3F2FD', // Light blue background
    borderLeftWidth: 4,
    borderLeftColor: '#1976D2', // Blue
    padding: 12,
    marginVertical: 8,
    marginHorizontal: 16,
    borderRadius: 8,
  },
  lockedNote: {
    backgroundColor: '#FFF9E6', // Light yellow background
    borderLeftWidth: 4,
    borderLeftColor: '#F9A825', // Amber
    padding: 12,
    marginVertical: 8,
    marginHorizontal: 16,
    borderRadius: 8,
  },
  lockedPerson: {
    backgroundColor: '#F3E5F5', // Light purple background
    borderLeftWidth: 4,
    borderLeftColor: '#7B1FA2', // Purple
    padding: 12,
    marginVertical: 8,
    marginHorizontal: 16,
    borderRadius: 8,
  },
  lockedContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lockIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  lockedTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2E5540', // Moss Green
  },
  lockedSubtext: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
});
