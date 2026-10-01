import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppFlatList } from '../../components/common/AppFlatList';
import { useChatMessages } from '../../hooks/useChatMessages';
import { ChatBubble, timingLine } from '../../components/chat/ChatBubble';
import { EntityCardBubble } from '../../components/chat/EntityCardMessage';
import {
  applyEntityChange,
  declinedOrShown,
  foldEntityCards,
  isEntityCardMessage,
  recentEntityFor,
} from '../../lib/chat/entityCards';
import { useOpenEntity } from '../../hooks/useOpenEntity';
import { ChatComposer } from '../../components/chat/ChatComposer';
import { SaveIndicatorPill } from '../../components/chat/SaveIndicatorPill';
import { SaveSheet } from '../../components/chat/SaveSheet';
import { ChatHistorySheet } from '../../components/chat/ChatHistorySheet';
import {
  callGeneralChatStreaming,
  callGeneralGreeting,
  callEnrichPhase15a,
  callEnrichPhase2,
  callChatFullSummary,
} from '../../lib/cortex/CortexClient';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useAuth } from '../../providers/AuthProvider';
import { supabase } from '../../lib/supabase/client';
import { nowTimestamp, getDateService } from '../../lib/date/DateService';
import MascotLottie from '../components/MascotLottie';
import * as Haptics from 'expo-haptics';
import {
  Clock,
  SquarePen,
  ChevronLeft,
  Bookmark,
  Target,
  Sparkles,
  CalendarDays,
  ChevronRight,
  X,
} from 'lucide-react-native';
import { NavigationRouteContext, useNavigation } from '@react-navigation/native';
import type {
  EntityCardEntity,
  EntityCardStatus,
  ChatAnchor,
  RecentEntity,
  SpaceChat,
  SpaceChatMessage,
} from '../../lib/types';
import { useCanChat, useCanCreate } from '../../lib/store/lifecycleSelectors';
import { useWakeOnInput } from '../../hooks/useWakeOnInput';
import { useMascotActions } from '../../hooks/useMascotActions';
import GremlyHelpCard from '../../components/help/GremlyHelpCard';
import { useHomeDock, useHomeMode } from '../../components/home/GremlyHomeDock';
import { talkAboutOpener, type TalkAboutItem } from '../../lib/chat/talkAboutOpeners';
import { anchorFor, anchorMetadata, anchorOf } from '../../lib/chat/chatAnchor';
import { waitForExtraction } from '../../lib/chat/waitForExtraction';
import { findItemChat } from '../../lib/chat/itemChat';
import type { ItemStarter } from '../../lib/chat/itemStarters';
import { BriefMessage } from '../../components/brief/BriefMessage';
import { BriefDayCardBlock } from '../../components/brief/BriefDayCardBlock';
import {
  briefMetaOf,
  dayPartAt,
  liveOfferId,
  visibleThreadMessages,
} from '../../lib/brief/messages';
import { useBriefInChat } from '../../lib/brief/flag';
import { useBriefOffers } from '../../lib/brief/useBriefOffers';
import { BRIEF_COPY } from '../../lib/brief/offerFlow';
import { callDailyBrief } from '../../lib/cortex/CortexClient';
import { markQuestionAsked } from '../../lib/story/storyApi';
import { isBriefUnread, useTodayThread, withinResumeWindow } from '../../lib/brief/todayThread';
import { useBriefPlayback } from '../../lib/brief/useBriefPlayback';
import { scheduleDcoRefresh } from '../../lib/brief/dcoRefresh';
import { TodayPinnedCard } from '../../components/brief/TodayPinnedCard';
import { useReducedMotion } from '../../design/animations';
import { useMascotStore } from '../../lib/store/useMascotStore';
import { ensureDailyThread, markDailyThreadOnce } from '../../lib/repo/dailyThreadRepo';
import type {
  BriefDayCardMeta,
  BriefPlanMeta,
  DailyThreadMeta,
  OfferButton,
} from '../../lib/brief/types';
import { livePlanOf, usePlanFlow } from '../../lib/plan/usePlanFlow';
import { meetingsFromStore } from '../../lib/plan/storePlan';
import { creditFirstReply } from '../../lib/brief/feeding';
import { clearFrom } from '../../lib/brief/pinned';
import { minutesOfDay } from '../../lib/brief/time';
import {
  readSweepOutcome,
  startBriefSweep,
  sweepEventText,
  sweepFollowUp,
  takeBriefSweep,
} from '../../lib/brief/sweepHandoff';
import { opFromButton } from '../../lib/plan/planFlow';
import { BriefPlanBlock } from '../../components/brief/BriefPlanBlock';

const MOSS = '#2E5540';
const LINEN = '#F9F6F1';

const STARTERS = [
  { icon: Target, label: 'What should I focus on today?' },
  { icon: Sparkles, label: 'Help me think through something' },
  { icon: CalendarDays, label: "What's coming up this week?" },
];
// With the Daily brief in Chat the brief answers the first one
const BRIEF_STARTERS = [
  { icon: Sparkles, label: 'Help me think through something' },
  { icon: CalendarDays, label: "What's coming up this week?" },
  { icon: Target, label: 'How am I doing with my habits?' },
];

/** An item's own chat (components/chat/ItemChatScreen.tsx) */
export type ItemChatOptions = {
  /** The item: every turn is sent with it, and its chat is found by it */
  anchor: ChatAnchor;
  /** What the header calls it: Todo, Habit, Event... */
  label: string;
  /** Sent straight away when the item has no chat yet (a screen asked for it) */
  initialPrompt?: string | null;
  /** The starters for its kind, shown under Gremly's opener */
  starters: ItemStarter[];
  /**
   * Starters drawn from the item itself (a note's topics), asked for only when
   * its chat is new; none back keeps the usual starters
   */
  loadStarters?: () => Promise<ItemStarter[]>;
  onClose: () => void;
};

/** How long a new item chat waits for starters drawn from the item */
export const ITEM_STARTERS_WAIT_MS = 6000;
// A brief written but not yet readable is loaded once more after this long
const BRIEF_RELOAD_MS = 1500;

/** Today's thread (Daily brief in Chat), not an earlier day's opened from history */
function isTodaysThread(chat: SpaceChat | null | undefined): boolean {
  if (chat?.chat_type !== 'daily') return false;
  const day = (chat.metadata_json as Partial<DailyThreadMeta> | null | undefined)?.ritual_day;
  return !day || day === getDateService().ritualDay();
}

type AskGremlyScreenProps = {
  /** Rendered as the Chat page inside the Gremly home, under the DROP | CHAT
   *  switch. The home's shared input box sends here; this page shows no
   *  composer or mascot of its own. */
  embedded?: boolean;
  /** The chat about one item, opened from that item: one chat per item that
   *  carries on each time, the item named at the top, no history or greeting */
  item?: ItemChatOptions;
};

export default function AskGremlyScreen({ embedded = false, item }: AskGremlyScreenProps = {}) {
  // The screen's route, when there is one. An item's chat opens in the item
  // overlay, which sits above the screens, where useRoute would throw; and its
  // params (a Talk it through, a prompt to send) are not for it anyway.
  const route = React.useContext(NavigationRouteContext) as { params?: any } | undefined;
  const params = item ? undefined : route?.params;
  // An item's chat opens in a full screen modal, where the SafeAreaView can
  // measure no top inset while the modal slides in (and keep it), putting the
  // header under the clock. The app's own insets are always right there.
  const insets = useSafeAreaInsets();
  const prefillPrompt = params?.prefillPrompt || null;
  const { userId } = useAuth();
  const navigation = useNavigation<any>();
  const canChat = useCanChat();
  const canCreate = useCanCreate();
  const { celebrate } = useMascotActions();
  const flatListRef = useRef<any>(null);
  const streamingControllerRef = useRef<{ close: () => void } | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wordBufferRef = useRef<string[]>([]);
  const wordFlushIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const wakeOnInput = useWakeOnInput();
  const [activeChat, setActiveChat] = useState<SpaceChat | null>(null);
  // the chat on screen right now, for work that finishes after the user may have moved on
  const activeChatIdRef = useRef<string | null>(null);
  activeChatIdRef.current = activeChat?.id ?? null;
  // an item's chat sends its item with every turn, with the title as it is now
  const itemAnchorRef = useRef<ChatAnchor | null>(item?.anchor ?? null);
  itemAnchorRef.current = item?.anchor ?? null;
  // whether this opening of an item's chat has fed the gauge yet
  const itemFedRef = useRef(false);
  const [sending, setSending] = useState(false);
  const [saveSheetVisible, setSaveSheetVisible] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [savingChat, setSavingChat] = useState(false);
  const [greeting, setGreeting] = useState<string>("What's on your mind?");

  // Chat opened about a drop ("Talk it through"): Gremly's fixed opener shows
  // instead of the greeting, and nothing is sent until the user replies
  const [aboutItem, setAboutItem] = useState<TalkAboutItem | null>(null);
  const [aboutOpener, setAboutOpener] = useState<string | null>(null);
  const aboutRef = useRef<{ item: TalkAboutItem; opener: string } | null>(null);

  useEffect(() => {
    // the greeting is a model call: skip it while a drop is attached, and in
    // an item's chat, which opens with Gremly's line about the item instead
    if (item || aboutRef.current || params?.talkAbout) return;
    if (!activeChat && userId) {
      callGeneralGreeting(userId).then((g) => {
        if (g) setGreeting(g);
      });
    }
  }, [activeChat, userId]);
  const [historyVisible, setHistoryVisible] = useState(false);

  const autoTitle = useGremlyStore((s) => s.generalChatAutoTitle);
  const extractions = useGremlyStore((s) => s.generalChatExtractions);
  const runningSummary = useGremlyStore((s) => s.generalChatRunningSummary);
  const lateCard = useGremlyStore((s) => s.generalChatLateCard);

  const {
    messages,
    loading: messagesLoading,
    loadedChatId,
    sendUserMessage,
    appendAssistantMessage,
    createStreamingMessage,
    updateStreamingContent,
    updateStreamingSearching,
    finalizeStreamingMessage,
    cancelStreaming,
    updateMessage,
    appendEntityCard,
    setEntityCardStatus,
    appendBriefMessage,
    patchMessageMetadata,
    refresh: refreshMessages,
  } = useChatMessages(activeChat?.id, null, {
    // today's thread keeps its day as its name
    keepTitle: activeChat?.chat_type === 'daily',
  });
  // The open chat's own messages are in: not still loading, and not the
  // last chat's left over from before the switch
  const threadLoaded = !!activeChat && loadedChatId === activeChat.id && !messagesLoading;
  const openEntity = useOpenEntity();
  // entity cards live inside the reply they came with (one list row for the two)
  const { rows, cardFor } = useMemo(
    () => foldEntityCards(visibleThreadMessages(messages)),
    [messages],
  );
  // Daily brief in Chat: today's thread is a chat of its own (chat_type 'daily')
  const briefInChat = useBriefInChat();
  const isDailyThread = activeChat?.chat_type === 'daily';
  const offerLive = useMemo(
    () => (isDailyThread ? liveOfferId(rows) : null),
    [isDailyThread, rows],
  );
  // Planning in today's thread: the plan card, its changes and Lock it in
  const threadDay =
    (activeChat?.metadata_json as Partial<DailyThreadMeta> | null | undefined)?.ritual_day ??
    getDateService().ritualDay();
  const pendingPlanScrollRef = useRef<string | null>(null);
  const planFlow = usePlanFlow({
    threadId: isDailyThread && activeChat ? activeChat.id : null,
    date: threadDay,
    messages,
    appendBriefMessage,
    patchMessageMetadata,
    onNewPlan: (id) => {
      pendingPlanScrollRef.current = id;
    },
  });
  const planFlowRef = useRef(planFlow);
  planFlowRef.current = planFlow;
  // The brief's buttons: replies, the question, Catch me up, Just today, Not
  // today, planning and What can wait. Sweep (package 6) is handed back here.
  const briefOffers = useBriefOffers({
    threadId: isDailyThread && activeChat ? activeChat.id : null,
    messages,
    appendBriefMessage,
    patchMessageMetadata,
    onPlan: (offerMsg) => {
      const meta = briefMetaOf(offerMsg);
      void planFlowRef.current.start(meta?.type === 'brief-offer' ? meta : null);
    },
    onSweep: (offerMsg) => openBriefSweepRef.current(offerMsg),
    onWhatCanWait: (offerMsg) => {
      const meta = briefMetaOf(offerMsg);
      void planFlowRef.current.answerWhatCanWait(meta?.type === 'brief-offer' ? meta : null);
    },
    onPlanEdit: (_offerMsg, button) => {
      const op = opFromButton(button);
      if (op) void planFlowRef.current.applySuggestion(op);
    },
    onAddKept: (ids) => void planFlowRef.current.addKept(ids),
  });
  const briefOffersRef = useRef(briefOffers);
  briefOffersRef.current = briefOffers;

  // A change to an existing item that the Worker found after the reply arrives
  // through the same poll as the pill; it is shown once, under the last reply.
  const shownLateCardRef = useRef<string | null>(null);
  useEffect(() => {
    if (!lateCard?.card || !activeChat) return;
    if (shownLateCardRef.current === lateCard.at) return;
    shownLateCardRef.current = lateCard.at;
    appendEntityCard(lateCard.card);
  }, [lateCard, activeChat, appendEntityCard]);

  // Word buffer flush (batches words at 50ms intervals, 3 at a time)
  const flushWordBuffer = useCallback(() => {
    const messageId = streamingMessageIdRef.current;
    if (!messageId || wordBufferRef.current.length === 0) return;
    const wordsToFlush = wordBufferRef.current.splice(0, 3);
    updateStreamingContent(messageId, wordsToFlush.join(''), 'append');
  }, [updateStreamingContent]);

  const startWordFlushInterval = useCallback(() => {
    if (wordFlushIntervalRef.current) return;
    wordFlushIntervalRef.current = setInterval(flushWordBuffer, 50);
  }, [flushWordBuffer]);

  const stopWordFlushInterval = useCallback(() => {
    if (wordFlushIntervalRef.current) {
      clearInterval(wordFlushIntervalRef.current);
      wordFlushIntervalRef.current = null;
    }
    if (streamingMessageIdRef.current && wordBufferRef.current.length > 0) {
      updateStreamingContent(
        streamingMessageIdRef.current,
        wordBufferRef.current.join(''),
        'append',
      );
      wordBufferRef.current = [];
    }
  }, [updateStreamingContent]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (!activeChat) return;
    const timer = setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 150);
    return () => clearTimeout(timer);
  }, [messages, activeChat]);

  // Poll extractions when resuming an existing chat
  useEffect(() => {
    if (activeChat?.id) {
      useGremlyStore.getState().updateGeneralChatExtractions(activeChat.id);
    }
  }, [activeChat?.id]);

  // Clear active chat in store when returning to empty state
  const goToEmptyState = useCallback(() => {
    setActiveChat(null);
    useGremlyStore.getState().setActiveGeneralChat(null);
  }, []);

  const clearAbout = useCallback(() => {
    aboutRef.current = null;
    setAboutItem(null);
    setAboutOpener(null);
  }, []);

  // "Talk it through with Gremly" on a drop: start a fresh chat about it
  const talkAbout: TalkAboutItem | null = params?.talkAbout ?? null;
  const talkKey: string | null = params?.talkKey ?? null;
  const talkKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!talkAbout || !talkKey || talkKeyRef.current === talkKey) return;
    talkKeyRef.current = talkKey;
    const opener = talkAboutOpener(talkAbout.title);
    aboutRef.current = { item: talkAbout, opener };
    setAboutItem(talkAbout);
    setAboutOpener(opener);
    if (activeChat) goToEmptyState();
    navigation.setParams({ talkAbout: undefined, talkKey: undefined });
  }, [talkAbout, talkKey, activeChat, goToEmptyState, navigation]);

  // Opening another chat (or starting this one) lets go of the attached drop
  useEffect(() => {
    if (activeChat && aboutRef.current) clearAbout();
  }, [activeChat, clearAbout]);

  const sendToChat = useCallback(
    async (
      chat: SpaceChat,
      text: string,
      opts: {
        fresh?: boolean;
        recentEntity?: RecentEntity | null;
        /** Gremly's opener (already saved) that this new chat starts with */
        lead?: string;
        /** The item this chat was opened about; read from the chat when not given */
        anchor?: ChatAnchor | null;
        /** Today's thread: the brief's question this message replies to */
        briefQuestion?: string | null;
      } = {},
    ) => {
      setSending(true);

      await sendUserMessage(text);
      // something said in today's thread may correct what Gremly knows
      if (chat.chat_type === 'daily') scheduleDcoRefresh();

      const streamingResult = await createStreamingMessage();
      if (!streamingResult) {
        setSending(false);
        return;
      }
      const { messageId } = streamingResult;
      streamingMessageIdRef.current = messageId;
      startWordFlushInterval();

      // A brand new chat has no history of its own; the hook's messages can
      // still be the previous chat's for a moment, so they are not used.
      // (today's thread: what is shown, so an offer held back is not sent as said)
      const prior = opts.fresh ? [] : visibleThreadMessages(messages);
      const conversationHistory = prior
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      // a chat about a drop starts with Gremly's opener, which names the item
      if (opts.fresh && opts.lead) {
        conversationHistory.unshift({ role: 'assistant', content: opts.lead });
      }
      conversationHistory.push({ role: 'user', content: text });

      let receivedChunks = false;
      const sentAt = getDateService().now().getTime();
      // written back with this turn's extraction, so the app knows when it has landed
      const turnId = `${sentAt.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      let firstChunkAt: number | null = null;
      if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);

      const handleStreamTimeout = () => {
        console.warn('[AskGremly] Stream timeout');
        stopWordFlushInterval();
        streamingControllerRef.current?.close();
        const msgId = streamingMessageIdRef.current;
        streamingMessageIdRef.current = null;
        if (msgId) {
          finalizeStreamingMessage(msgId, 'Something went wrong. Try sending your message again.');
        }
        setSending(false);
      };

      streamingControllerRef.current = callGeneralChatStreaming(
        conversationHistory,
        {
          chatId: chat.id,
          userId: userId ?? undefined,
          recentEntity: opts.fresh
            ? null
            : opts.recentEntity !== undefined
              ? opts.recentEntity
              : recentEntityFor(messages),
          // every turn of a chat opened about an item says which item
          anchorEntity:
            opts.anchor !== undefined
              ? opts.anchor
              : (itemAnchorRef.current ?? (opts.fresh ? null : anchorFor(messages))),
          turnId,
          // a correction made in today's thread is marked as made on the brief
          chatSurface: chat.chat_type === 'daily' ? 'brief' : 'chat',
          briefQuestion: opts.briefQuestion ?? null,
        },
        {
          onChunk: (delta: string) => {
            receivedChunks = true;
            if (firstChunkAt === null) firstChunkAt = getDateService().now().getTime();
            if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
            streamTimeoutRef.current = setTimeout(handleStreamTimeout, 15000);

            const chunkMsgId = streamingMessageIdRef.current;
            if (chunkMsgId) {
              updateStreamingSearching(chunkMsgId, false, null);
              updateMessage(chunkMsgId, { isLoadingHint: false } as any);
            }
            wordBufferRef.current.push(...delta.split(/(?<=\s)/));
          },
          onSearching: (query: string, isLoadingHint?: boolean) => {
            const msgId = streamingMessageIdRef.current;
            if (msgId) {
              updateStreamingSearching(msgId, true, query);
              if (isLoadingHint) updateMessage(msgId, { isLoadingHint: true } as any);
            }
          },
          onFetching: (isFetching: boolean, fetchingUrl: string | null) => {
            const msgId = streamingMessageIdRef.current;
            if (msgId) updateMessage(msgId, { isFetching, fetchingUrl } as any);
          },
          onComplete: async (finalText: string, richResult?: any) => {
            if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
            stopWordFlushInterval();
            const msgId = streamingMessageIdRef.current;
            streamingMessageIdRef.current = null;

            const content =
              typeof finalText === 'string' ? finalText : richResult?.content || finalText;

            if (msgId) {
              await finalizeStreamingMessage(msgId, content);
              if (richResult?.sources) {
                updateMessage(msgId, { sources: richResult.sources } as any);
              }
              if (__DEV__) {
                const now = getDateService().now().getTime();
                console.log(
                  '[chat timing]',
                  timingLine({
                    first_ms: (firstChunkAt ?? now) - sentAt,
                    total_ms: now - sentAt,
                    server: richResult?.timing ?? null,
                  }),
                );
              }
            }
            if (richResult?.entity_card) {
              await appendEntityCard(richResult.entity_card);
            } else if (opts.briefQuestion && isTodaysThread(chat)) {
              // the question is answered: the brief carries on (a card first
              // waits for its tap, see entityCardHandlers)
              void briefOffersRef.current.continueBrief();
            }

            // the Save items pill and any late card follow from the Worker's
            // background extraction; wait for this turn's, however long it takes
            void waitForExtraction(turnId, richResult?.extraction, {
              fetch: () => useGremlyStore.getState().updateGeneralChatExtractions(chat.id),
              sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
              stillHere: () => activeChatIdRef.current === chat.id,
            });

            supabase
              .from('scope_chats')
              .update({ updated_at: nowTimestamp() })
              .eq('id', chat.id)
              .then(() => {});

            setSending(false);
          },
          onError: (error: string, _partialText: string) => {
            if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
            console.error('[AskGremly] Stream error:', error);
            stopWordFlushInterval();
            const msgId = streamingMessageIdRef.current;
            streamingMessageIdRef.current = null;
            if (msgId) cancelStreaming(msgId);
            setSending(false);
          },
        },
      );

      // Initial timeout — if no chunks arrive within 15s
      streamTimeoutRef.current = setTimeout(() => {
        if (!receivedChunks) handleStreamTimeout();
      }, 15000);
    },
    [
      messages,
      userId,
      sendUserMessage,
      createStreamingMessage,
      startWordFlushInterval,
      stopWordFlushInterval,
      updateStreamingContent,
      updateStreamingSearching,
      updateMessage,
      finalizeStreamingMessage,
      cancelStreaming,
      appendEntityCard,
    ],
  );

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      if (!canChat) {
        navigation.navigate('TrialEndPaywall', { source: 'expiry' });
        return;
      }
      const trimmed = text.trim();
      // Something else on Gremly's question: this message is the answer
      if (isDailyThread && briefOffersRef.current.awaitingAnswer) {
        await briefOffersRef.current.answerTyped(trimmed);
        return;
      }
      // A typed message is a reply to the brief too (feeds Gremly once a day)
      if (isDailyThread && activeChat) void creditFirstReply(activeChat.id);
      // Typed straight under Gremly's question, it is the reply to the question
      if (isDailyThread && activeChat && !sending) {
        const question = await briefOffersRef.current.takeTypedReply(trimmed);
        if (question) {
          await sendToChat(activeChat, trimmed, { briefQuestion: question });
          return;
        }
      }
      // While a plan is open, a message that asks to change it changes it
      if (isDailyThread && planFlowRef.current.livePlan && !sending) {
        if (await planFlowRef.current.editFromText(trimmed)) return;
      }
      // a chat about an item feeds Gremly once each time it is opened, as the
      // old entity chat did
      if (itemAnchorRef.current && !itemFedRef.current) {
        itemFedRef.current = true;
        useGremlyStore
          .getState()
          .trackSpaceChat?.()
          ?.catch((err: unknown) => console.warn('[ItemChat] Gauge contribution failed:', err));
      }

      if (activeChat) {
        if (sending) return;
        await sendToChat(activeChat, trimmed);
        return;
      }

      // Empty state → create new chat. About a drop: named after the drop, and
      // Gremly's opener is saved first, carrying the drop as the chat's anchor,
      // so the chat (and the model, every turn) knows what it is about
      const about = aboutRef.current;
      const anchor = about ? anchorOf(about.item) : null;
      try {
        const chat = await useGremlyStore
          .getState()
          .createGeneralChat((about ? about.item.title : trimmed).slice(0, 60));
        if (!chat) {
          Alert.alert('Error', 'Could not create chat');
          return;
        }
        useGremlyStore.getState().setActiveGeneralChat(chat.id);
        setActiveChat(chat as SpaceChat);

        // Send the initial message after a tick so useChatMessages picks up the new chatId
        setTimeout(async () => {
          if (about && anchor) {
            try {
              await appendAssistantMessage(about.opener, anchorMetadata(anchor), chat.id);
            } catch {
              // this turn still sends the anchor and the opener
            }
          }
          sendToChat(chat as SpaceChat, trimmed, { fresh: true, lead: about?.opener, anchor });
        }, 200);
      } catch {
        Alert.alert('Error', 'Could not create chat');
      }
    },
    [canChat, navigation, activeChat, sending, sendToChat, appendAssistantMessage, isDailyThread],
  );

  // Inside the Gremly home, the shared input box sends through handleSend.
  // Refs keep the registration stable while handleSend and sending change.
  const homeDock = useHomeDock();
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;
  const sendingRef = useRef(sending);
  sendingRef.current = sending;
  useEffect(() => {
    if (!embedded || !homeDock) return;
    homeDock.registerChat({
      send: (text) => {
        void handleSendRef.current(text);
      },
      isSending: () => sendingRef.current,
    });
    return () => homeDock.registerChat(null);
  }, [embedded, homeDock]);
  useEffect(() => {
    if (embedded && homeDock) homeDock.setChatSending(sending);
  }, [embedded, homeDock, sending]);

  // An item's chat: the chat already about this item (started here or from
  // Talk it through) carries on. Otherwise Gremly's opener names the item and
  // nothing is sent until the user writes, unless a screen asked to start
  // with a message. Looked up once, when the screen opens.
  const itemRef = useRef(item);
  itemRef.current = item;
  const itemId = item?.anchor.id ?? null;
  const [itemReady, setItemReady] = useState(!item);
  // starters drawn from the item: undefined until asked, null while waiting
  const [itemStarters, setItemStarters] = useState<ItemStarter[] | null | undefined>(undefined);
  const itemLookedUpRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );
  useEffect(() => {
    const opened = itemRef.current;
    if (!opened || !itemId || !userId || itemLookedUpRef.current) return;
    itemLookedUpRef.current = true;
    (async () => {
      const found = await findItemChat(userId, itemId).catch(() => null);
      if (!mountedRef.current) return;
      if (found) {
        useGremlyStore.getState().setActiveGeneralChat(found.id);
        setActiveChat(found);
        setItemReady(true);
        return;
      }
      const talk: TalkAboutItem = { ...opened.anchor, label: opened.label };
      const opener = talkAboutOpener(opened.anchor.title);
      aboutRef.current = { item: talk, opener };
      setAboutItem(talk);
      setAboutOpener(opener);
      if (opened.initialPrompt) {
        setItemReady(true);
        handleSendRef.current(opened.initialPrompt);
        return;
      }
      if (opened.loadStarters) {
        setItemStarters(null);
        setItemReady(true);
        let waited: ReturnType<typeof setTimeout> | undefined;
        const drawn = await Promise.race([
          opened.loadStarters().catch((): ItemStarter[] => []),
          new Promise<ItemStarter[]>((resolve) => {
            waited = setTimeout(() => resolve([]), ITEM_STARTERS_WAIT_MS);
          }),
        ]);
        clearTimeout(waited);
        if (!mountedRef.current) return;
        setItemStarters(drawn.length ? drawn : opened.starters);
        return;
      }
      setItemReady(true);
    })();
  }, [itemId, userId]);
  // what shows under the opener: drawn starters once they are back, none while waiting
  const shownStarters = item ? (itemStarters === undefined ? item.starters : itemStarters) : null;

  // Daily brief in Chat: the notification and Plan with Gremly open today's
  // thread. It is made here if the brief job has not made it yet.
  const threadRequest: 'today' | null = item ? null : (params?.thread ?? null);
  const threadKey: string | null = params?.threadKey ?? null;
  const threadKeyRef = useRef<string | null>(null);
  const openTodayThread = useCallback(async () => {
    try {
      const thread = await ensureDailyThread(getDateService().ritualDay());
      if (!thread || !mountedRef.current) return;
      clearAbout();
      useGremlyStore.getState().setActiveGeneralChat(thread.id);
      setActiveChat(thread);
      useTodayThread.getState().setThread(thread);
    } catch (err) {
      console.warn("[DailyBrief] could not open today's thread:", err);
    }
  }, [clearAbout]);
  // Plan with Gremly (and Plan tomorrow): the brief shows at once, then the plan step
  const pendingPlanRef = useRef<{ day: string } | null>(null);
  const [skipPlayback, setSkipPlayback] = useState(false);
  useEffect(() => {
    if (threadRequest !== 'today' || !briefInChat || !userId) return;
    const key = threadKey ?? 'today';
    if (threadKeyRef.current === key) return;
    threadKeyRef.current = key;
    if (params?.step === 'plan') {
      const today = getDateService().today();
      pendingPlanRef.current = {
        day: params?.planDay === 'tomorrow' ? getDateService().addDays(today, 1) : today,
      };
      setSkipPlayback(true);
    }
    navigation.setParams({
      thread: undefined,
      threadKey: undefined,
      step: undefined,
      planDay: undefined,
    });
    void openTodayThread();
  }, [
    threadRequest,
    threadKey,
    briefInChat,
    userId,
    navigation,
    openTodayThread,
    params?.step,
    params?.planDay,
  ]);

  const handleOfferButton = useCallback(
    (message: SpaceChatMessage, button: OfferButton) =>
      briefOffersRef.current.handleOfferButton(message, button),
    [],
  );

  // Something else: the shared box asks for the answer and opens the keyboard
  const awaitingAnswer = isDailyThread && briefOffers.awaitingAnswer;
  useEffect(() => {
    if (!embedded || !homeDock) return;
    homeDock.setChatPlaceholder(awaitingAnswer ? BRIEF_COPY.answerPlaceholder : null);
    if (awaitingAnswer) homeDock.focusInput();
  }, [embedded, homeDock, awaitingAnswer]);
  useEffect(
    () => () => {
      if (embedded && homeDock) homeDock.setChatPlaceholder(null);
    },
    [embedded, homeDock],
  );
  // Leaving the thread lets go of a pending answer
  const cancelAnswerRef = useRef(briefOffers.cancelAnswer);
  cancelAnswerRef.current = briefOffers.cancelAnswer;
  useEffect(() => {
    cancelAnswerRef.current();
  }, [activeChat?.id]);

  // Today's brief is written on the first open when the morning job has not
  // written one, and once a day again when the unseen lines were written for
  // an earlier part of the day. Then the lines count as seen.
  const homeMode = useHomeMode();
  const chatOnScreen = !embedded || homeMode?.mode === 'chat';
  const [briefWriting, setBriefWriting] = useState(false);
  const briefAskedRef = useRef<string | null>(null);
  const hasBriefLines = useMemo(
    () => rows.some((m) => briefMetaOf(m)?.type === 'brief-text'),
    [rows],
  );
  // Gremly's question counts as asked once it is on screen, so the brief
  // leaves it for a few days if it is skipped or left
  const askedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isDailyThread || !chatOnScreen || briefWriting) return;
    for (const m of rows) {
      const meta = briefMetaOf(m);
      if (meta?.type !== 'brief-offer' || meta.kind !== 'question' || !meta.question_id) continue;
      if (meta.chosen || askedRef.current.has(meta.question_id)) continue;
      askedRef.current.add(meta.question_id);
      markQuestionAsked(meta.question_id).catch((err) =>
        console.warn('[DailyBrief] could not mark the question asked:', err),
      );
    }
  }, [isDailyThread, chatOnScreen, briefWriting, rows]);

  useEffect(() => {
    if (!isDailyThread || !activeChat || !threadLoaded || !chatOnScreen || !briefInChat) return;
    const meta = (activeChat.metadata_json ?? {}) as Partial<DailyThreadMeta>;
    if (meta.seen_at) return;
    const now = getDateService().now();
    const part = dayPartAt(now.getHours());
    const due: 'first_open' | 'rewrite' | null =
      !hasBriefLines && !meta.brief_written_at
        ? 'first_open'
        : meta.brief_part && meta.brief_part !== part && !meta.rewrite_requested_at
          ? 'rewrite'
          : null;
    if (!due) return;
    const key = `${activeChat.id}:${due}:${part}`;
    if (briefAskedRef.current === key) return;
    briefAskedRef.current = key;
    const threadId = activeChat.id;
    (async () => {
      setBriefWriting(true);
      const res = await callDailyBrief(due);
      if (!res.ok) console.warn('[DailyBrief] could not write the brief:', res.error);
      // the thread by its id: the screen may have rendered since this began
      const loaded = await refreshMessages(threadId);
      if (res.ok && loaded && !loaded.some((m) => briefMetaOf(m)?.type === 'brief-text')) {
        await new Promise((resolve) => setTimeout(resolve, BRIEF_RELOAD_MS));
        if (mountedRef.current && activeChatIdRef.current === threadId) {
          await refreshMessages(threadId);
        }
      }
      // the thread's own record of the brief (written, part of the day)
      const fresh = await useTodayThread.getState().refresh();
      if (mountedRef.current) {
        if (fresh && fresh.id === threadId && activeChatIdRef.current === threadId) {
          setActiveChat(fresh);
        }
        setBriefWriting(false);
      }
    })();
  }, [
    isDailyThread,
    activeChat,
    threadLoaded,
    chatOnScreen,
    briefInChat,
    hasBriefLines,
    refreshMessages,
  ]);
  // The first time today's brief is on screen it plays in, Gremly waving,
  // and then counts as seen
  const reducedMotion = useReducedMotion();
  const threadSeen = !!(activeChat?.metadata_json as Partial<DailyThreadMeta> | null | undefined)
    ?.seen_at;
  const handleBriefSeen = useCallback((threadId: string) => {
    markDailyThreadOnce(threadId, 'seen_at')
      .then((stamp) => {
        if (!stamp) return;
        useTodayThread.getState().patchMeta(threadId, { seen_at: stamp.at });
        if (mountedRef.current && activeChatIdRef.current === threadId) {
          setActiveChat((prev) =>
            prev && prev.id === threadId
              ? {
                  ...prev,
                  metadata_json: { ...(prev.metadata_json ?? {}), seen_at: stamp.at },
                }
              : prev,
          );
        }
      })
      .catch((err) => console.warn('[DailyBrief] could not mark the brief seen:', err));
  }, []);
  const playback = useBriefPlayback({
    threadId: isDailyThread && activeChat ? activeChat.id : null,
    rows,
    seen: threadSeen,
    ready: !!isDailyThread && threadLoaded && chatOnScreen && !briefWriting && briefInChat,
    reducedMotion: reducedMotion || skipPlayback,
    onStart: () => useMascotStore.getState().requestMode('waving'),
    onSeen: handleBriefSeen,
  });
  const shownRows = useMemo(
    () => (playback.hiddenFrom !== null ? rows.slice(0, playback.hiddenFrom) : rows),
    [rows, playback.hiddenFrom],
  );
  const shownRowsRef = useRef(shownRows);
  shownRowsRef.current = shownRows;

  // The plan step, once today's thread is on screen with its messages
  useEffect(() => {
    const pending = pendingPlanRef.current;
    if (!pending || !isDailyThread || !activeChat || !threadLoaded || briefWriting) return;
    if (messages.length && messages[0].chat_id !== activeChat.id) return;
    pendingPlanRef.current = null;
    setSkipPlayback(false);
    const live = livePlanOf(messages, pending.day);
    if (live) pendingPlanScrollRef.current = live.id;
    else void planFlowRef.current.start(null, { day: pending.day });
  }, [isDailyThread, activeChat, threadLoaded, briefWriting, messages]);

  // Coming into Chat (Daily brief in Chat on): an unread brief opens today's
  // thread; within five minutes of leaving, the chat as it was left; after
  // longer, the fresh home with today pinned. A jump from another screen
  // (the notification, Talk it through, a drop) brings its own chat.
  const briefUnreadHere = useTodayThread((st) => isBriefUnread(st.thread));
  // the brief starts on the second day of training, so the pinned card does too
  const gremlyAge = useGremlyStore((st) => st.gremlyAge);
  const briefInChatRef = useRef(briefInChat);
  briefInChatRef.current = briefInChat;
  const jumpPending = !!(
    params?.thread ||
    params?.talkAbout ||
    params?.autoSendKey ||
    params?.prefillPrompt
  );
  const jumpPendingRef = useRef(jumpPending);
  jumpPendingRef.current = jumpPending;
  const enterChat = useCallback(() => {
    if (!briefInChatRef.current || item || jumpPendingRef.current) return;
    const state = useTodayThread.getState();
    if (isBriefUnread(state.thread)) {
      void openTodayThread();
      return;
    }
    const nowMs = getDateService().now().getTime();
    if (withinResumeWindow(state, nowMs) && state.chatLeftId === activeChatIdRef.current) return;
    if (activeChatIdRef.current) goToEmptyState();
  }, [item, openTodayThread, goToEmptyState]);
  const leaveChat = useCallback(() => {
    useTodayThread
      .getState()
      .noteChatLeft(activeChatIdRef.current, getDateService().now().getTime());
  }, []);
  const prevModeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!embedded) return;
    const mode = homeMode?.mode ?? null;
    const prev = prevModeRef.current;
    prevModeRef.current = mode;
    if (prev === 'chat' && mode !== 'chat') leaveChat();
    else if (mode === 'chat' && prev !== 'chat') enterChat();
  }, [embedded, homeMode?.mode, enterChat, leaveChat]);
  // The app going to the background counts as leaving Chat, coming back as coming in
  useEffect(() => {
    if (!embedded) return;
    let last = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      const onChat = prevModeRef.current === 'chat';
      if (onChat && last === 'active' && next !== 'active') leaveChat();
      if (onChat && last !== 'active' && next === 'active') enterChat();
      last = next;
    });
    return () => sub.remove();
  }, [embedded, enterChat, leaveChat]);

  // Sweep from the brief: the real Sweep, handed back to the thread when it closes
  const openBriefSweep = useCallback(
    (offerMsg: SpaceChatMessage | null) => {
      if (!activeChat || activeChat.chat_type !== 'daily') return;
      const meta = briefMetaOf(offerMsg);
      startBriefSweep({
        threadId: activeChat.id,
        offerId: offerMsg?.id ?? null,
        offer: meta?.type === 'brief-offer' ? meta : null,
      });
      navigation.navigate('Sweep');
    },
    [activeChat, navigation],
  );
  const openBriefSweepRef = useRef(openBriefSweep);
  openBriefSweepRef.current = openBriefSweep;
  useEffect(() => {
    // an item's chat is never today's thread
    if (item || typeof navigation.addListener !== 'function') return undefined;
    return navigation.addListener('focus', () => {
      const p = takeBriefSweep();
      if (!p || p.threadId !== activeChatIdRef.current) return;
      const outcome = readSweepOutcome(p.before);
      void (async () => {
        if (outcome.swept > 0) {
          await appendBriefMessage('system', sweepEventText(outcome), {
            type: 'brief-event',
            icon: 'sweep',
          });
          const date = getDateService().ritualDay();
          const planFrom = clearFrom(meetingsFromStore(date), minutesOfDay());
          const follow = sweepFollowUp(outcome, {
            livePlan: !!planFlowRef.current.livePlan,
            planFrom,
          });
          await appendBriefMessage('assistant', follow.text, {
            type: 'brief-offer',
            kind: 'follow_up',
            buttons: follow.buttons,
            plan_from: planFrom ?? undefined,
          });
        } else if (p.offerId && p.offer) {
          // closed before deciding anything: the offer's buttons come back
          const { chosen: _c, held: _h, revealed_from: _r, ...offer } = p.offer;
          await appendBriefMessage('assistant', '', { ...offer, type: 'brief-offer' });
        }
      })();
    });
  }, [item, navigation, appendBriefMessage]);

  const renderDayCard = useCallback(
    (_message: SpaceChatMessage, meta: BriefDayCardMeta) => (
      <BriefDayCardBlock
        date={meta.date}
        inPlan={planFlowRef.current.inPlanIds}
        onReply={() => void creditFirstReply(activeChatIdRef.current)}
        onSweep={() => openBriefSweepRef.current(null)}
      />
    ),
    [],
  );
  const renderPlan = useCallback(
    (message: SpaceChatMessage, meta: BriefPlanMeta) => (
      <BriefPlanBlock
        meta={meta}
        interactive={!planFlowRef.current.typing}
        onRemove={(id) => void planFlowRef.current.removeItem(message, id)}
        onAdd={(id, kind) => void planFlowRef.current.addItem(message, id, kind)}
        onLock={() => void planFlowRef.current.lock(message)}
        onDismiss={() => void planFlowRef.current.dismiss(message)}
        onShowAgain={() => void planFlowRef.current.showAgain(message)}
        onSeeToday={() => navigation.navigate('Tabs', { screen: 'Today' })}
      />
    ),
    [navigation],
  );

  // Opened from a Mind Drop question ("Chat with Gremly" or "Ask Gremly now"):
  // send the drop straight away so Gremly replies, once per request.
  const autoSendKey: string | null = params?.autoSendKey || null;
  const autoSentKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoSendKey || !prefillPrompt || !userId) return;
    if (autoSentKeyRef.current === autoSendKey) return;
    autoSentKeyRef.current = autoSendKey;
    navigation.setParams({ prefillPrompt: undefined, autoSendKey: undefined });
    handleSend(prefillPrompt);
  }, [autoSendKey, prefillPrompt, userId, navigation, handleSend]);

  // Opened with a prompt to edit rather than send (e.g. the weekly summary):
  // inside the Gremly home it goes into the shared box
  useEffect(() => {
    if (!embedded || !homeDock || autoSendKey || !prefillPrompt) return;
    homeDock.prefillDraft(prefillPrompt);
    navigation.setParams({ prefillPrompt: undefined });
  }, [embedded, homeDock, autoSendKey, prefillPrompt, navigation]);

  const keyExtractor = useCallback((item: SpaceChatMessage) => item.id, []);

  const entityCardHandlers = useCallback(
    (cardMessage: SpaceChatMessage) => ({
      message: cardMessage,
      onStatus: async (status: EntityCardStatus, summary?: string) => {
        await setEntityCardStatus(cardMessage.id, status, summary);
        // a change made in today's thread is done: the brief carries on
        if (status === 'applied' && isTodaysThread(activeChat)) {
          void briefOffersRef.current.continueBrief();
        }
      },
      onPick: (entity: EntityCardEntity) => {
        setEntityCardStatus(cardMessage.id, 'declined');
        if (activeChat) sendToChat(activeChat, `I mean ${entity.title}`);
      },
      // "Not that one" goes back to Gremly with the item marked as turned down,
      // so the next reply excludes it and offers the others
      onDecline: (entity: EntityCardEntity | null) => {
        if (!activeChat) return;
        if (entity) {
          sendToChat(activeChat, 'Not that one', {
            recentEntity: declinedOrShown(entity, 'declined'),
          });
        } else {
          sendToChat(activeChat, 'None of those');
        }
      },
      onOpen: openEntity,
    }),
    [activeChat, sendToChat, setEntityCardStatus, openEntity],
  );

  const renderMessage = useCallback(
    ({ item, index }: { item: SpaceChatMessage; index: number }) => {
      if (briefMetaOf(item)) {
        return (
          <BriefMessage
            message={item}
            prev={shownRows[index - 1]}
            liveOfferId={offerLive}
            interactive={!briefOffers.busy && !playback.playing}
            onOfferButton={handleOfferButton}
            renderDayCard={renderDayCard}
            renderPlan={renderPlan}
          />
        );
      }
      if (isEntityCardMessage(item)) {
        // a card with no reply before it (should not happen, but never lose one)
        return <EntityCardBubble standalone {...entityCardHandlers(item)} />;
      }
      const cardMessage = item.role === 'assistant' ? cardFor.get(item.id) : undefined;
      return (
        <View style={styles.messageContainer}>
          <ChatBubble
            message={item}
            testID={`chat-bubble-${item.id}`}
            entityCard={cardMessage ? entityCardHandlers(cardMessage) : null}
          />
        </View>
      );
    },
    [
      cardFor,
      entityCardHandlers,
      shownRows,
      offerLive,
      handleOfferButton,
      renderDayCard,
      renderPlan,
      briefOffers.busy,
      playback.playing,
    ],
  );

  const inConversation = activeChat !== null;

  return (
    <SafeAreaView
      style={[styles.safe, item ? { paddingTop: insets.top } : null]}
      edges={embedded || item ? ['left', 'right'] : ['top', 'left', 'right']}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
        enabled={!embedded}
      >
        {/* Header. Inside the Gremly home the switch above names the page, so
            this is a slim row: history on the left, the chat's title in the
            middle, save and new chat on the right. */}
        {item ? (
          // an item's chat: back to the item, the item named in the middle
          <View style={styles.chatHeader} testID="item-chat-header">
            <TouchableOpacity
              style={styles.chatHeaderBtn}
              onPress={item.onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <ChevronLeft size={24} color="#222222" strokeWidth={2.5} />
            </TouchableOpacity>
            <View style={styles.chatHeaderCenter}>
              <Text style={styles.itemHeaderLabel}>{item.label}</Text>
              <Text style={styles.itemHeaderTitle} numberOfLines={1}>
                {item.anchor.title}
              </Text>
            </View>
            {inConversation ? (
              <TouchableOpacity
                style={styles.chatHeaderBtn}
                onPress={() => setSaveSheetVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Save from this chat"
              >
                <Bookmark size={20} color={MOSS} />
              </TouchableOpacity>
            ) : (
              <View style={styles.chatHeaderBtn} />
            )}
          </View>
        ) : embedded ? (
          <View style={styles.embeddedHeader}>
            <TouchableOpacity
              style={styles.embeddedHeaderBtn}
              onPress={() => setHistoryVisible(true)}
              accessibilityLabel="Chat history"
              accessibilityRole="button"
            >
              <Clock size={20} color={MOSS} />
            </TouchableOpacity>
            <View style={styles.embeddedHeaderCenter}>
              {isDailyThread ? (
                <>
                  <Text style={styles.embeddedHeaderTitle} numberOfLines={1}>
                    {activeChat?.title}
                  </Text>
                  <Text style={styles.embeddedHeaderSubtitle} numberOfLines={1}>
                    Today with Gremly
                  </Text>
                </>
              ) : inConversation && autoTitle ? (
                <Text style={styles.embeddedHeaderTitle} numberOfLines={1}>
                  {autoTitle}
                </Text>
              ) : null}
            </View>
            {inConversation ? (
              <View style={styles.embeddedHeaderRight}>
                <TouchableOpacity
                  style={styles.embeddedHeaderBtn}
                  onPress={() => setSaveSheetVisible(true)}
                  accessibilityLabel="Save from this chat"
                  accessibilityRole="button"
                >
                  <Bookmark size={20} color={MOSS} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.embeddedHeaderBtn}
                  onPress={goToEmptyState}
                  accessibilityLabel="New chat"
                  accessibilityRole="button"
                >
                  <SquarePen size={19} color={MOSS} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.embeddedHeaderBtn} />
            )}
          </View>
        ) : inConversation ? (
          <View style={styles.chatHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <TouchableOpacity
                style={styles.chatHeaderBtn}
                onPress={goToEmptyState}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <ChevronLeft size={24} color="#222222" strokeWidth={2.5} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerButton}
                onPress={() => setHistoryVisible(true)}
                accessibilityLabel="Chat history"
              >
                <Clock size={18} color={MOSS} />
              </TouchableOpacity>
            </View>
            <View style={styles.chatHeaderCenter}>
              <Text style={styles.chatHeaderTitle}>Ask Gremly</Text>
              <View style={styles.chatHeaderUnderline} />
              {autoTitle ? <Text style={styles.chatHeaderSubtitle}>{autoTitle}</Text> : null}
            </View>
            <TouchableOpacity
              style={styles.chatHeaderBtn}
              onPress={() => setSaveSheetVisible(true)}
            >
              <Bookmark size={20} color={MOSS} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setHistoryVisible(true)}
              accessibilityLabel="Chat history"
            >
              <Clock size={20} color={MOSS} />
            </TouchableOpacity>
            <View style={styles.headerTitle}>
              <Text style={styles.headerTitleText}>Ask Gremly</Text>
              <View style={styles.headerUnderline} />
            </View>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => {
                if (activeChat) goToEmptyState();
              }}
              accessibilityLabel="New chat"
            >
              <SquarePen size={20} color={MOSS} />
            </TouchableOpacity>
          </View>
        )}

        {/* Content area — takes remaining space */}
        <View style={styles.flex}>
          {inConversation ? (
            <AppFlatList
              ref={flatListRef}
              data={shownRows}
              keyExtractor={keyExtractor}
              renderItem={renderMessage}
              style={styles.messages}
              contentContainerStyle={[
                styles.messagesContent,
                embedded && styles.messagesContentEmbedded,
                messages.length === 0 && styles.emptyListContent,
              ]}
              removeClippedSubviews={false}
              maxToRenderPerBatch={10}
              windowSize={10}
              initialNumToRender={15}
              onContentSizeChange={() => {
                setTimeout(() => {
                  // a new plan card scrolls so its top is in view
                  const planId = pendingPlanScrollRef.current;
                  const index = planId
                    ? shownRowsRef.current.findIndex((m) => m.id === planId)
                    : -1;
                  if (index >= 0) {
                    pendingPlanScrollRef.current = null;
                    flatListRef.current?.scrollToIndex({ index, viewPosition: 0, animated: true });
                    return;
                  }
                  flatListRef.current?.scrollToEnd({ animated: true });
                }, 100);
              }}
              onScrollToIndexFailed={() => flatListRef.current?.scrollToEnd({ animated: true })}
              // Inside the Gremly home, Gremly steps aside while you scroll
              onScrollBeginDrag={embedded ? () => homeDock?.setChatScrolling(true) : undefined}
              onScrollEndDrag={embedded ? () => homeDock?.setChatScrolling(false) : undefined}
              onMomentumScrollBegin={embedded ? () => homeDock?.setChatScrolling(true) : undefined}
              onMomentumScrollEnd={embedded ? () => homeDock?.setChatScrolling(false) : undefined}
              ListEmptyComponent={
                // today's thread with nothing in it yet (the brief could not be
                // written, or it is someone's first day): the day card, from the store
                isDailyThread && threadLoaded && !briefWriting && !playback.playing ? (
                  <View style={styles.dailyEmpty} testID="daily-thread-empty">
                    <BriefDayCardBlock date={threadDay} />
                  </View>
                ) : (
                  <View style={styles.flex} />
                )
              }
              ListFooterComponent={
                (briefWriting || playback.typing || planFlow.typing) && isDailyThread ? (
                  <View style={styles.messageContainer} testID="brief-writing">
                    <ChatBubble
                      message={
                        {
                          id: 'brief-writing',
                          role: 'assistant',
                          content: '',
                          isStreaming: true,
                        } as unknown as SpaceChatMessage
                      }
                    />
                  </View>
                ) : null
              }
            />
          ) : item && !itemReady ? (
            <View style={styles.flex} testID="item-chat-loading" />
          ) : aboutItem && aboutOpener ? (
            <View style={styles.aboutOpener} testID="chat-about-opener">
              <ChatBubble
                message={
                  {
                    id: 'about-opener',
                    chat_id: '',
                    scope_id: null,
                    user_id: '',
                    role: 'assistant',
                    content: aboutOpener,
                    created_at: '',
                  } as unknown as SpaceChatMessage
                }
              />
              {item && !sending && shownStarters ? (
                <View style={styles.itemStarters} testID="item-starters">
                  {shownStarters.map(({ key, label, prompt, icon: Icon }) => (
                    <TouchableOpacity
                      key={key}
                      style={styles.starterCard}
                      onPress={() => handleSend(prompt)}
                      activeOpacity={0.75}
                      testID={`item-starter-${key}`}
                    >
                      <View style={styles.starterGlyph}>
                        <Icon size={16} color={MOSS} strokeWidth={2} />
                      </View>
                      <Text style={styles.starterLabel}>{label}</Text>
                      <ChevronRight size={16} color="rgba(46,85,64,0.4)" strokeWidth={2} />
                    </TouchableOpacity>
                  ))}
                </View>
              ) : item && !sending && itemStarters === null ? (
                // the starters are being drawn from the item: their places, held
                <View style={styles.itemStarters} testID="item-starters-loading">
                  {[0, 1, 2].map((n) => (
                    <View key={n} style={[styles.starterCard, styles.starterPlaceholder]}>
                      <View style={styles.starterGlyph} />
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : (
            <View style={embedded ? styles.emptyStateTop : styles.emptyState}>
              {briefInChat && gremlyAge >= 1 ? (
                <View style={styles.pinnedToday}>
                  <TodayPinnedCard
                    date={getDateService().ritualDay()}
                    unread={briefUnreadHere}
                    onPress={() => void openTodayThread()}
                  />
                </View>
              ) : null}
              <Text style={[styles.greeting, embedded && styles.greetingTop]}>{greeting}</Text>

              {/* Inside the Gremly home, Gremly stays perched on the input (as on
                  the Drop page) so he does not jump when switching pages */}
              {!embedded && (
                <Pressable
                  style={styles.stageMascot}
                  onPress={() => setShowHelp(true)}
                  accessibilityLabel="Chat with Gremly"
                  accessibilityRole="button"
                >
                  <View style={styles.stageGroundShadow} pointerEvents="none" />
                  <MascotLottie width={180} />
                </Pressable>
              )}

              <View style={styles.startersContainer}>
                {(briefInChat ? BRIEF_STARTERS : STARTERS).map(({ icon: Icon, label }) => (
                  <TouchableOpacity
                    key={label}
                    style={styles.starterCard}
                    onPress={() => handleSend(label)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.starterGlyph}>
                      <Icon size={16} color={MOSS} strokeWidth={2} />
                    </View>
                    <Text style={styles.starterLabel}>{label}</Text>
                    <ChevronRight size={16} color="rgba(46,85,64,0.4)" strokeWidth={2} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Bottom section — fixed height, always at bottom */}
        {embedded ? (
          // The Gremly home's shared box (with Gremly on it) sits right below
          // this page, so only the save pill is shown here
          <>
            <SaveIndicatorPill
              count={extractions.length}
              visible={!!activeChat && extractions.length > 0}
              onPress={() => setSaveSheetVisible(true)}
              style={styles.savePillEmbedded}
            />
            {/* The drop this chat is about, attached to what you send next */}
            {aboutItem && !activeChat ? (
              <View style={styles.aboutChip} testID="chat-about-chip">
                <Text style={styles.aboutChipLabel}>{aboutItem.label}</Text>
                <Text style={styles.aboutChipTitle} numberOfLines={1}>
                  {aboutItem.title}
                </Text>
                <TouchableOpacity
                  onPress={clearAbout}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={`Stop talking about ${aboutItem.title}`}
                  style={styles.aboutChipClose}
                >
                  <X size={14} color="rgba(26, 51, 40, 0.6)" strokeWidth={2.2} />
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        ) : (
          <View style={styles.bottomSection}>
            <View style={styles.composerContainer}>
              <SaveIndicatorPill
                count={extractions.length}
                visible={!!activeChat && extractions.length > 0}
                onPress={() => setSaveSheetVisible(true)}
                style={{ position: 'absolute', top: -30, right: 105, zIndex: 11 }}
              />
              {/* Gremly perches on the box in a conversation, and in an item's
                  chat from the start, as on the Ask Gremly page */}
              {(inConversation || item) && (
                <Pressable
                  style={styles.mascot}
                  onPress={() => setShowHelp(true)}
                  testID="chat-mascot"
                >
                  <MascotLottie />
                </Pressable>
              )}
              <ChatComposer
                onSend={handleSend}
                onChangeText={() => wakeOnInput()}
                disabled={sending}
                placeholder={
                  awaitingAnswer
                    ? BRIEF_COPY.answerPlaceholder
                    : inConversation || item
                      ? 'Type a message...'
                      : 'Ask Gremly anything...'
                }
                initialText={autoSendKey ? undefined : prefillPrompt || undefined}
              />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      <SaveSheet
        visible={saveSheetVisible}
        onClose={() => setSaveSheetVisible(false)}
        extractions={extractions}
        autoTitle={autoTitle}
        runningSummary={runningSummary}
        saving={savingChat}
        onDismiss={(id) => {
          if (activeChat?.id) {
            useGremlyStore.getState().dismissExtraction(activeChat.id, id);
          }
        }}
        onSave={async (items, includeSummary) => {
          if (!canCreate) {
            navigation.navigate('TrialEndPaywall', { source: 'expiry' });
            return;
          }
          // Fetch full summary before closing sheet if user wants to save summary
          let fullSummary: string | null = null;
          if (includeSummary && activeChat?.id) {
            setSavingChat(true);
            try {
              const result = await callChatFullSummary(activeChat.id);
              fullSummary = result.summary;
            } catch {
              // Fall back to runningSummary
            } finally {
              setSavingChat(false);
            }
          }
          setSaveSheetVisible(false);

          const store = useGremlyStore.getState();
          const savedIds: string[] = [];
          const savedEntities: Array<{
            id: string;
            type: 'todo' | 'habit' | 'note';
            title: string;
            due_day?: string | null;
            due_time?: string | null;
            frequency?: string | null;
          }> = [];

          for (const item of items) {
            try {
              if (item.type === 'edit') {
                // The extraction's second job: a change to something already tracked.
                // Applied only now, on the user's tap, through the store like any edit.
                await applyEntityChange(
                  { id: item.entity_id, type: item.entity_type, title: item.entity_title },
                  { field: item.field, from: item.from ?? null, to: item.to },
                );
                savedIds.push(item.id);
                continue;
              }
              const bucket =
                item.type === 'todo' ? 'todo' : item.type === 'habit' ? 'habit' : 'log';
              const subtype = item.type === 'note' ? item.subtype || 'general' : null;
              const enrichText = item.title + (item.body ? '. ' + item.body : '');

              // Call both in parallel
              const [phase15, phase2] = await Promise.all([
                callEnrichPhase15a({ text: enrichText, bucket, subtype }),
                callEnrichPhase2({ text: enrichText, bucket, subtype }),
              ]);

              const smartTitle =
                (phase15.ok && phase15.smart_title) ||
                (phase2.ok && phase2.smart_title) ||
                item.title;
              const confirmationMsg = (phase15.ok && phase15.confirmation_message) || null;
              const tags = (phase2.ok && phase2.tags) || [];
              const timeEst = phase2.ok ? phase2.time_estimate_minutes : null;

              const views = {
                confirmation_message: confirmationMsg,
                bucket_confirmed: true,
              };

              let createdEntity: {
                id: string;
                type: 'todo' | 'habit' | 'note';
                title: string;
                due_day?: string | null;
                due_time?: string | null;
                frequency?: string | null;
              } | null = null;
              if (item.type === 'todo') {
                const todo = await store.createTodo({
                  title: smartTitle,
                  name: smartTitle,
                  body: item.body || null,
                  due_date: item.due_date ? new Date(item.due_date).toISOString() : null,
                  due_day: item.due_date || null,
                  tags,
                  time_estimate_minutes: timeEst,
                  views,
                  ai_placed: true,
                  origin: 'chat_save',
                });
                createdEntity = {
                  id: todo.id,
                  type: 'todo',
                  title: todo.name || todo.title || smartTitle,
                  due_day: todo.due_day ?? null,
                  due_time: todo.due_time ?? null,
                };
              } else if (item.type === 'habit') {
                const habit = await store.createHabit({
                  name: smartTitle,
                  frequency: (phase2.ok && phase2.extracted_frequency) || item.frequency || 'daily',
                  subtype: item.habit_subtype === 'break' ? 'break_habit' : 'start_habit',
                  notes: item.body || null,
                  tags,
                  time_estimate_minutes: timeEst,
                  views,
                  ai_placed: true,
                  origin: 'chat_save',
                });
                createdEntity = {
                  id: habit.id,
                  type: 'habit',
                  title: habit.name || smartTitle,
                  frequency: habit.frequency ?? null,
                };
              } else {
                const note = await store.createNote({
                  title: smartTitle,
                  body: item.body || item.title,
                  subtype: subtype || 'general',
                  tags,
                  views,
                  ai_placed: true,
                  origin: 'chat_save',
                });
                createdEntity = { id: note.id, type: 'note', title: note.title || smartTitle };
              }
              savedIds.push(item.id);
              if (createdEntity) savedEntities.push(createdEntity);
            } catch (err) {
              console.warn('[AskGremly] Save failed:', item.title, err);
            }
          }

          if (includeSummary && autoTitle) {
            try {
              await store.createNote({
                title: autoTitle,
                body: fullSummary || runningSummary || autoTitle,
                subtype: 'general',
                ai_placed: true,
                origin: 'chat_save',
              });
            } catch (err) {
              console.warn('[AskGremly] Failed to save summary:', err);
            }
          }

          if (activeChat?.id && savedIds.length > 0) {
            await store.markExtractionsSaved(activeChat.id, savedIds);

            // each saved item gets its card in the chat, the receipt that opens it
            for (const e of savedEntities) {
              await appendEntityCard(
                { kind: 'view', entity: { ...e, space_id: null }, intent: 'view', saved: true },
                { status: 'applied', summary: 'Saved to your list.' },
              );
            }
            const done = items.filter((i) => savedIds.includes(i.id));
            const edited = done.filter((i) => i.type === 'edit');
            if (edited.length === 1)
              await appendAssistantMessage(`✓ Updated ${edited[0].entity_title}.`);
            else if (edited.length > 1)
              await appendAssistantMessage(
                `✓ Updated ${edited.map((i) => i.entity_title).join(', ')}.`,
              );
          }

          for (let i = 0; i < savedIds.length + (includeSummary ? 1 : 0); i++) {
            try {
              await store.addGaugeContribution('drop', 0.08);
            } catch {
              /* non-blocking */
            }
          }

          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

          celebrate();
        }}
      />
      <ChatHistorySheet
        visible={historyVisible}
        onClose={() => setHistoryVisible(false)}
        onSelectChat={(chatId) => {
          setHistoryVisible(false);
          const chat = useGremlyStore.getState().generalChats.find((c) => c.id === chatId);
          if (chat) {
            setActiveChat(chat);
            useGremlyStore.getState().setActiveGeneralChat(chatId);
          }
        }}
      />
      <GremlyHelpCard visible={showHelp} onDismiss={() => setShowHelp(false)} screen="askgremly" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: LINEN },
  flex: { flex: 1 },

  // Empty state header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerTitle: { flex: 1, alignItems: 'center' },
  headerTitleText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 28,
    color: '#222222',
  },
  headerUnderline: {
    width: 50,
    height: 2.5,
    backgroundColor: '#E0C47A',
    borderRadius: 2,
    marginTop: 4,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(46,85,64,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Header inside the Gremly home
  embeddedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    height: 48,
  },
  embeddedHeaderBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  embeddedHeaderCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  embeddedHeaderTitle: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: 'rgba(26, 51, 40, 0.75)',
  },
  embeddedHeaderSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 11.5,
    color: 'rgba(26, 51, 40, 0.5)',
    marginTop: 1,
  },
  embeddedHeaderRight: { flexDirection: 'row', alignItems: 'center' },

  // Conversation header
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  chatHeaderBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatHeaderCenter: { flex: 1, alignItems: 'center' },
  chatHeaderTitle: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 18,
    color: '#222222',
  },
  chatHeaderUnderline: {
    width: 36,
    height: 2.5,
    backgroundColor: '#E0C47A',
    borderRadius: 2,
    marginTop: 4,
  },
  chatHeaderSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(34,34,34,0.55)',
    marginTop: 2,
  },

  // Empty state content
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 30,
    position: 'relative',
  },
  // Inside the Gremly home: questions sit at the top, Gremly stays on the input
  emptyStateTop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 4,
  },
  greetingTop: {
    marginBottom: 16,
  },
  greeting: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(26, 51, 40, 0.82)',
    textAlign: 'center',
    paddingHorizontal: 32,
    marginBottom: 24,
    maxWidth: 320,
    letterSpacing: -0.1,
    zIndex: 2,
  },
  stageMascot: {
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 2,
  },
  stageGroundShadow: {
    position: 'absolute',
    bottom: 4,
    width: 140,
    height: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(26, 51, 40, 0.12)',
    alignSelf: 'center',
  },
  dailyEmpty: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  pinnedToday: {
    width: '100%',
    paddingHorizontal: 24,
    marginBottom: 18,
  },
  startersContainer: {
    width: '100%',
    paddingHorizontal: 24,
    gap: 10,
    zIndex: 2,
  },
  starterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(46, 85, 64, 0.08)',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: 12,
    shadowColor: '#1A3328',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  starterGlyph: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: 'rgba(46, 85, 64, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  starterLabel: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: 13.5,
    color: '#1A3328',
  },

  // Messages
  messages: { flex: 1 },
  messagesContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 200,
  },
  emptyListContent: { flex: 1 },
  messageContainer: { marginBottom: 8 },

  // Bottom area
  bottomSection: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  // Inside the Gremly home: the save pill sits just above the shared box,
  // left of Gremly, and the list keeps clear of him
  savePillEmbedded: {
    position: 'absolute',
    bottom: 10,
    right: 110,
    zIndex: 11,
  },
  messagesContentEmbedded: {
    paddingBottom: 120,
  },
  // Chat opened about a drop: Gremly's opener at the top, the drop attached
  // just above the shared box (left of Gremly)
  aboutOpener: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  itemStarters: {
    marginTop: 18,
    gap: 10,
  },
  starterPlaceholder: {
    opacity: 0.5,
    height: 58,
  },
  itemHeaderLabel: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#4B6A50',
  },
  itemHeaderTitle: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 17,
    color: '#222222',
    marginTop: 2,
  },
  aboutChip: {
    position: 'absolute',
    left: 16,
    bottom: 10,
    maxWidth: '62%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingLeft: 10,
    paddingRight: 8,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(46, 85, 64, 0.14)',
    zIndex: 11,
  },
  aboutChipLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: '#4A6490',
    backgroundColor: '#E9EFF8',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  aboutChipTitle: {
    flexShrink: 1,
    fontFamily: 'Inter-Medium',
    fontSize: 13.5,
    color: '#1A3328',
  },
  aboutChipClose: {
    padding: 2,
  },
  composerContainer: { position: 'relative' as const },
  mascot: {
    position: 'absolute' as const,
    top: -88,
    right: 0,
    width: 95,
    height: 111,
    zIndex: 10,
  },
});
