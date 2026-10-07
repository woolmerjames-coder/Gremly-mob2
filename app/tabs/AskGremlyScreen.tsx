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
  ChevronRight,
  ChevronDown,
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
import { addedBy, followOffset, nearBottom } from '../../lib/chat/follow';
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
import {
  ensureDailyThread,
  getDailyThread,
  markDailyThreadOnce,
  patchDailyThreadMeta,
} from '../../lib/repo/dailyThreadRepo';
import type {
  BriefDayCardMeta,
  BriefMeta,
  BriefOfferMeta,
  BriefPlanMeta,
  DailyThreadMeta,
  OfferAction,
  OfferButton,
} from '../../lib/brief/types';
import { shownOffer, useBriefWeekFacts } from '../../lib/brief/checkIn';
import { HabitWeekDots } from '../../components/brief/HabitWeekDots';
import { useWrapUp } from '../../lib/wrapup/useWrapUp';
import { useEveningTeaser } from '../../lib/wrapup/useEveningTeaser';
import { currentWrap, takeCardsVisit } from '../../lib/wrapup/session';
import { cardsLeft, pastCards } from '../../lib/wrapup/state';
import { WRAP_COPY } from '../../lib/wrapup/words';
import { wrapTurnContext } from '../../lib/wrapup/gremlyWords';
import { wrapNow } from '../../lib/wrapup/day';
import { draftKey, useJournalSession } from '../../lib/journal/session';
import { WrapRecapCard } from '../../components/wrapup/WrapRecapCard';
import { WrapReceiptCard } from '../../components/wrapup/WrapReceiptCard';
import { WrapHabitsCard } from '../../components/wrapup/WrapHabitsCard';
import { WrapJournalCard } from '../../components/wrapup/WrapJournalCard';
import { WrapItemCard } from '../../components/wrapup/WrapItemCard';
import { WrapEndMark } from '../../components/wrapup/WrapEndMark';
import { livePlanOf, usePlanFlow } from '../../lib/plan/usePlanFlow';
import { useDayTurn } from '../../lib/brief/useDayTurn';
import { chatWeekContext, useWeekReview, type WeekReview } from '../../lib/week/useWeekReview';
import { weekButton } from '../../lib/week/review/state';
import { WEEK_COPY } from '../../lib/week/review/words';
import { useThisWeek } from '../../lib/week/thisWeek';
import { WeekBoardSheet } from '../../components/week/BoardStep';
import { WeekCard } from '../../components/week/WeekCard';
import { WeekFooter, WeekOfferButton } from '../../components/week/WeekFooter';
import { useRenderChanges, type ChangeRowItem } from '../../components/brief/ChangeCard';
import { dayRecordFromStore } from '../../lib/plan/storePlan';
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
import { PlanPickSheet } from '../../components/brief/PlanPickSheet';
import { HomeChips } from '../../components/home/HomeChips';
import { chatCardMeta, chatHistoryOf, useChatCard } from '../../lib/chat/useChatCard';
import type { AgentTask } from '../../lib/cortex/CortexClient';
import { useKeyboardOpen } from '../../hooks/useKeyboardOpen';
import { chipPrompt, homeChipsFor, homePhase, type HomeChipKey } from '../../lib/chat/homeChips';
import { useNowMinutes } from '../../lib/brief/useDayCard';
import { selectWrapUp } from '../../lib/store/selectors';

const MOSS = '#2E5540';
const LINEN = '#F9F6F1';

// What Gremly says on the fresh home until his greeting arrives, or if it cannot
const GREETING_FALLBACK = "What's on your mind?";

/** The agent's task list kept on a chat (agent plan step 9). */
function agentTasksOf(chat: SpaceChat): AgentTask[] {
  const tasks = (chat.metadata_json as { agent_tasks?: unknown } | null | undefined)?.agent_tasks;
  return Array.isArray(tasks) ? (tasks as AgentTask[]) : [];
}

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
  // set further down, once the hooks they call exist
  const wrapResumeRef = useRef<() => Promise<void>>(async () => undefined);
  const weekReviewRef = useRef<WeekReview | null>(null);
  // the way into the weekly review, for the hooks set up before it is defined
  const openWeekReviewRef = useRef<(how?: { startNow?: boolean }) => void>(() => undefined);
  const homeDockRef = useRef<ReturnType<typeof useHomeDock>>(null);
  const [activeChat, setActiveChat] = useState<SpaceChat | null>(null);
  // the chat on screen right now, for work that finishes after the user may have moved on
  const activeChatIdRef = useRef<string | null>(null);
  activeChatIdRef.current = activeChat?.id ?? null;
  // While today's brief plays in, the list stays at its first line so it is
  // read from the top down; it follows new messages again once one is added
  const scrollHoldRef = useRef<{ chatId: string; count: number } | null>(null);
  const messageCountRef = useRef(0);
  const scrollHeld = (): boolean => {
    const hold = scrollHoldRef.current;
    if (!hold) return false;
    if (hold.chatId !== activeChatIdRef.current || messageCountRef.current > hold.count) {
      scrollHoldRef.current = null;
      return false;
    }
    return true;
  };
  // an item's chat sends its item with every turn, with the title as it is now
  const itemAnchorRef = useRef<ChatAnchor | null>(item?.anchor ?? null);
  itemAnchorRef.current = item?.anchor ?? null;
  // whether this opening of an item's chat has fed the gauge yet
  const itemFedRef = useRef(false);
  const [sending, setSending] = useState(false);
  const [saveSheetVisible, setSaveSheetVisible] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [savingChat, setSavingChat] = useState(false);
  // null until Gremly's greeting arrives, so the bubble does not change under you
  const [greeting, setGreeting] = useState<string | null>(null);
  // what waits in the app, for the greeting to mention (set further down)
  const greetingWaitingRef = useRef({ briefUnread: false, toDecide: 0 });

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
      callGeneralGreeting(userId, greetingWaitingRef.current).then((g) => {
        setGreeting(g || GREETING_FALLBACK);
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
  const isDailyThread = activeChat?.chat_type === 'daily';
  const offerLive = useMemo(() => {
    if (!isDailyThread) return null;
    const id = liveOfferId(rows);
    if (!id || isTodaysThread(activeChat)) return id;
    // The weekly review is answered in today's thread only: an offer of its
    // left in an earlier day's thread keeps its words and loses its buttons.
    return briefMetaOf(rows.find((m) => m.id === id))?.week ? null : id;
  }, [isDailyThread, rows, activeChat]);
  // Planning in today's thread: the plan card, its changes and saying yes to it
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
    date: threadDay,
    messages,
    appendBriefMessage,
    patchMessageMetadata,
    onPlan: (offerMsg, button) => {
      const meta = briefMetaOf(offerMsg);
      // Just plan it, after Gremly asked what to put first: no sheet this time
      void planFlowRef.current.start(meta?.type === 'brief-offer' ? meta : null, {
        direct: button.id === 'plan_direct',
      });
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
    // Plan my week, beside the brief's offer: they have said yes, so the review goes straight in
    onPlanWeek: () => openWeekReviewRef.current({ startNow: true }),
  });
  const briefOffersRef = useRef(briefOffers);
  briefOffersRef.current = briefOffers;
  // their week as the app holds it now, for the brief's check in and its offer of the review
  const weekFacts = useBriefWeekFacts(isDailyThread ? threadDay : null);
  const showOffer = useCallback(
    (message: SpaceChatMessage, meta: BriefOfferMeta) =>
      shownOffer(message.content ?? '', meta, weekFacts),
    [weekFacts],
  );
  const renderHabitWeek = useCallback(
    (week: { habit_id: string; day: string }) => (
      <HabitWeekDots habitId={week.habit_id} day={week.day} />
    ),
    [],
  );
  // A message typed in today's thread: one day turn, one change card
  const dayTurn = useDayTurn({
    threadId: isDailyThread && activeChat ? activeChat.id : null,
    date: threadDay,
    messages,
    appendBriefMessage,
    patchMessageMetadata,
    plan: {
      livePlan: planFlow.livePlan,
      start: (day) => planFlowRef.current.start(null, { day }),
      reviseAfterChanges: (c) => planFlowRef.current.reviseAfterChanges(c),
      pauseSync: () => planFlowRef.current.pauseSync(),
      resumeSync: () => planFlowRef.current.resumeSync(),
    },
    continueBrief: () => wrapResumeRef.current(),
    // Gremly is told where the thread's rituals stand: tonight's wrap up while
    // it is under way, and their week, with the weekly review when one is
    ritualContext: () => ({
      wrap: wrapTurnContext(currentWrap(), wrapNow()),
      week: weekReviewRef.current?.context() ?? null,
    }),
    onApplied: (changes) => weekReviewRef.current?.onApplied(changes),
    onUndone: () => weekReviewRef.current?.onUndone(),
  });
  const dayTurnRef = useRef(dayTurn);
  dayTurnRef.current = dayTurn;
  // The evening wrap up, in today's thread only (lib/wrapup): Gremly opens on
  // the day, the Sweep cards, habits, the journal, his questions and the close
  const wrapUp = useWrapUp({
    threadId: activeChat && isTodaysThread(activeChat) ? activeChat.id : null,
    saved: (activeChat?.metadata_json as Partial<DailyThreadMeta> | null | undefined)?.sweep,
    messages,
    appendBriefMessage,
    patchMessageMetadata,
    canCreate,
    onPaywall: () => navigation.navigate('TrialEndPaywall', { source: 'expiry' }),
    openCards: () => navigation.navigate('Cards', { cards: 'wrap' }),
    // their week at the close: the review starts in this thread (they have
    // said yes), or the week they planned opens
    planWeek: () => openWeekReviewRef.current({ startNow: true }),
    seeWeek: () => navigation.navigate('YourWeek'),
    planDay: (day) => planFlowRef.current.start(null, { day }),
    restoreDraft: (text) => homeDockRef.current?.prefillDraft(text),
    // an answer to Gremly's question, or words typed for the journal that were for him
    askGremly: (text, about) => dayTurnRef.current.ask(text, about),
  });
  const wrapUpRef = useRef(wrapUp);
  wrapUpRef.current = wrapUp;
  // The weekly review, in today's thread only (lib/week): Gremly's read of the
  // week, then what matters most, its shape, an intention, what is ahead and
  // what needs them. Anything typed while it is under way goes to Gremly.
  const weekReview = useWeekReview({
    threadId: activeChat && isTodaysThread(activeChat) ? activeChat.id : null,
    ready: threadLoaded,
    messages,
    appendBriefMessage,
    patchMessageMetadata,
    tellGremly: (text) => dayTurnRef.current.ask(text),
    // the review is over: the brief carries on, so Plan my day comes back
    // when the morning's offer was passed by for the week
    onEnded: () => void briefOffersRef.current.continueBrief({ afterWeek: true }),
  });
  weekReviewRef.current = weekReview;
  wrapResumeRef.current = () => {
    // The weekly review never moves on by itself after a turn: its Carry on
    // button does, and the brief's own offers stay out of its way. It is under
    // way only until the wrap up speaks after it (useWeekReview), so a wrap up
    // begun later in the day gets its buttons back as it always has.
    if (weekReviewRef.current?.underWay) return Promise.resolve();
    // a turn in the thread is done: while the wrap up is under way its buttons
    // come back, so it waits where it was; otherwise the brief carries on
    const w = currentWrap();
    if (wrapUpRef.current.wrap && w && w.step !== 'done') return wrapUpRef.current.resume();
    return briefOffersRef.current.continueBrief();
  };

  // A change to an existing item that the Worker found after the reply arrives
  // through the same poll as the pill; it is shown once, under the last reply.
  const shownLateCardRef = useRef<string | null>(null);
  // (once the chat's own messages are in, so a card already shown is seen)
  useEffect(() => {
    if (!lateCard?.card || !activeChat || !threadLoaded) return;
    if (shownLateCardRef.current === lateCard.at) return;
    shownLateCardRef.current = lateCard.at;
    appendEntityCard(lateCard.card);
  }, [lateCard, activeChat, threadLoaded, appendEntityCard]);

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

  // Following what is added, at the reader's pace (lib/chat/follow.ts): the
  // thread moves only while they are at the bottom, never past the top of the
  // first line they have not seen, and shows when there is more below
  messageCountRef.current = messages.length;
  const followRef = useRef(true);
  // where the first line not yet seen starts, while there is one
  const anchorTopRef = useRef<number | null>(null);
  // the last follow reached the end: the next line added is the first one not yet seen
  const caughtUpRef = useRef(true);
  const metricsRef = useRef({ y: 0, height: 0, content: 0 });
  // the thread's height as it was last taken in, where anything added next starts
  const takenInRef = useRef(0);
  // the rows the thread has taken in, so it knows what was just added
  const seenRowsRef = useRef(0);
  // the typing bubble under the thread, part of its height until a line takes its place
  const footerHeightRef = useRef(0);
  const [moreBelow, setMoreBelow] = useState(false);
  // a chat opened afresh starts at its end, following
  useEffect(() => {
    followRef.current = true;
    anchorTopRef.current = null;
    caughtUpRef.current = true;
    seenRowsRef.current = 0;
    setMoreBelow(false);
  }, [activeChat?.id]);

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

  // the agent's task list, kept on the chat so asks carry across messages
  const keepAgentTasks = useCallback(async (chat: SpaceChat, tasks: AgentTask[]) => {
    const patch = { agent_tasks: tasks };
    setActiveChat((prev) =>
      prev && prev.id === chat.id
        ? { ...prev, metadata_json: { ...((prev.metadata_json as object) ?? {}), ...patch } }
        : prev,
    );
    try {
      await patchDailyThreadMeta(chat.id, patch);
    } catch (err) {
      console.warn('[AskGremly] could not keep the task list:', err);
    }
  }, []);

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
      // what was said, and what each of Gremly's cards came to
      const conversationHistory = chatHistoryOf(prior);
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
          // the agent's task list kept on this chat, so asks carry across messages
          agentTasks: opts.fresh ? [] : agentTasksOf(chat),
          // their week, so Gremly can put the button to it under a reply in Ask Gremly
          week: chat.chat_type === 'daily' ? null : chatWeekContext(),
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
            // the agent's status lines say it is still working, as a chunk would
            if (receivedChunks || isLoadingHint) {
              if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
              streamTimeoutRef.current = setTimeout(handleStreamTimeout, 15000);
            }
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
            const agent = richResult?.agent;
            if (agent) {
              // the agent answered: its card under the reply, and the chat's task list
              if (agent.card?.length) {
                await appendBriefMessage(
                  'system',
                  '',
                  chatCardMeta(
                    agent.card,
                    agent.tasks ?? [],
                    agent.prompt_version,
                  ) as unknown as Record<string, unknown>,
                );
              }
              // the button to their week, under the reply (the agent's offer_week)
              if (agent.offer?.kind === 'week') {
                await appendBriefMessage('system', '', {
                  type: 'week-offer',
                  done: agent.offer.done === true,
                  week: true,
                });
              }
              void keepAgentTasks(chat, agent.tasks ?? []);
            }
            if (richResult?.entity_card) {
              await appendEntityCard(richResult.entity_card);
            } else if (opts.briefQuestion && isTodaysThread(chat)) {
              // the question is answered: the brief carries on (a card first
              // waits for its tap, see entityCardHandlers)
              void briefOffersRef.current.continueBrief();
            } else if (isTodaysThread(chat) && briefOffersRef.current.owesOffer()) {
              // a habit check in answered by typing, in a message that was not
              // about the day: the brief's own offer follows the reply
              void wrapResumeRef.current();
            } else if (isTodaysThread(chat) && currentWrap() && currentWrap()?.step !== 'done') {
              // an ordinary turn during the wrap up: its buttons come back
              void wrapResumeRef.current();
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
      appendBriefMessage,
      keepAgentTasks,
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
      // The weekly review is under way: the message is for Gremly, with the
      // review as it stands, and the review stays where it is until Carry on.
      // Of the review and the wrap up, the one that spoke last in the thread
      // is the one under way (useWeekReview), so this comes before the wrap
      // up's own wait and is false once the wrap up has spoken since.
      if (isDailyThread && weekReviewRef.current?.underWay) {
        if (dayTurnRef.current.thinking || dayTurnRef.current.busy) return;
        await weekReviewRef.current.takeTyped(trimmed);
        scheduleDcoRefresh();
        return;
      }
      // The wrap up is waiting for this message: tonight's journal entry, or
      // the answer to Gremly's question (the pill above the box says which)
      if (isDailyThread && (await wrapUpRef.current.takeTyped(trimmed))) return;
      // Gremly asked what has to happen or comes first: it plans around the answer
      if (isDailyThread && planFlowRef.current.awaitingAnswer()) {
        if (await planFlowRef.current.planWithAnswer(trimmed)) return;
      }
      // A typed message is a reply to the brief too (feeds Gremly once a day)
      if (isDailyThread && activeChat) void creditFirstReply(activeChat.id);
      // In today's thread every typed message is read against the day first
      // (the day turn); one that is not about the day goes to chat. Typed
      // straight under Gremly's question, it is also the reply to the question.
      if (isDailyThread && activeChat && !sending) {
        // one turn at a time: the box is held while Gremly is still working,
        // so this only guards a send that raced it
        if (dayTurnRef.current.thinking || dayTurnRef.current.busy) return;
        const question = await briefOffersRef.current.takeTypedReply(trimmed);
        if (await dayTurnRef.current.run(trimmed, question)) {
          scheduleDcoRefresh();
          return;
        }
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
  homeDockRef.current = homeDock;
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
  const threadRequest: 'today' | null = !item && params?.thread === 'today' ? 'today' : null;
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
  // Wrap up with Gremly: the same, then the wrap up starts or picks up
  const pendingWrapRef = useRef(false);
  // Plan your week: the same, then the weekly review opens
  // (now: they have already said yes, so it goes straight in)
  const pendingWeekRef = useRef<false | 'open' | 'now'>(false);
  const [skipPlayback, setSkipPlayback] = useState(false);
  useEffect(() => {
    if (threadRequest !== 'today' || !userId) return;
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
    if (params?.step === 'wrap') {
      pendingWrapRef.current = true;
      setSkipPlayback(true);
    }
    if (params?.step === 'week' || params?.step === 'week_now') {
      pendingWeekRef.current = params.step === 'week_now' ? 'now' : 'open';
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
    userId,
    navigation,
    openTodayThread,
    params?.step,
    params?.planDay,
  ]);
  // An earlier day's thread, asked for by its day: the conversation a weekly
  // review happened in, opened again from Your week. It is never made here;
  // when that day has no thread, Chat stays where it is.
  const dayRequest: string | null =
    !item && params?.thread === 'day' ? (params?.day ?? null) : null;
  useEffect(() => {
    if (!dayRequest || !userId) return;
    const key = threadKey ?? `day-${dayRequest}`;
    if (threadKeyRef.current === key) return;
    threadKeyRef.current = key;
    navigation.setParams({ thread: undefined, threadKey: undefined, day: undefined });
    void (async () => {
      try {
        const thread = await getDailyThread(userId, dayRequest);
        if (!mountedRef.current) return;
        if (!thread) {
          console.warn('[DailyBrief] there is no thread for', dayRequest);
          return;
        }
        clearAbout();
        useGremlyStore.getState().setActiveGeneralChat(thread.id);
        setActiveChat(thread);
      } catch (err) {
        console.warn("[DailyBrief] could not open that day's thread:", err);
      }
    })();
  }, [dayRequest, threadKey, userId, navigation, clearAbout]);

  const handleOfferButton = useCallback((message: SpaceChatMessage, button: OfferButton) => {
    // the weekly review's own buttons are the review's to answer
    if (briefMetaOf(message)?.week) {
      return weekReviewRef.current?.handleButton(message, button);
    }
    if (briefMetaOf(message)?.wrap) {
      // typing is how these two are answered: open the keyboard
      if (button.action === 'journal_write' || button.action === 'answer_other') {
        homeDockRef.current?.focusInput();
      }
      return wrapUpRef.current.handleButton(message, button);
    }
    return briefOffersRef.current.handleOfferButton(message, button);
  }, []);

  // Something else: the shared box asks for the answer and opens the keyboard
  const awaitingAnswer = isDailyThread && briefOffers.awaitingAnswer;
  // In the wrap up the box saves to the journal, or answers Gremly's question:
  // a pill above it says so, and its X sends the next message to Gremly instead
  // (not while the weekly review has the thread: the message is the review's then)
  const wrapAwaiting = isDailyThread && !weekReview.underWay ? wrapUp.awaiting : null;
  const weekPlaceholder = isDailyThread ? weekReview.placeholder : null;
  // A journal page was closed half written today: the pill offers to open it,
  // and what is typed in the box joins it
  const journalDraft = useJournalSession(
    (s) => !!s.drafts[draftKey({ day: getDateService().ritualDay() })],
  );
  useEffect(() => {
    if (!embedded || !homeDock) return;
    homeDock.setChatPlaceholder(
      awaitingAnswer || wrapAwaiting === 'question'
        ? BRIEF_COPY.answerPlaceholder
        : wrapAwaiting === 'journal'
          ? WRAP_COPY.journalPlaceholder
          : // the weekly review says what the box is for while it is under way
            weekPlaceholder,
    );
    const openPage = (typed: string) => wrapUpRef.current.journal.openPage(typed || undefined);
    homeDock.setChatTag(
      wrapAwaiting === 'journal'
        ? journalDraft
          ? {
              kind: 'journal',
              label: WRAP_COPY.journalDraftTag,
              onExpand: openPage,
              expandLabel: WRAP_COPY.journalDraftOpen,
            }
          : {
              kind: 'journal',
              label: WRAP_COPY.journalTag,
              onCancel: () => wrapUpRef.current.cancelAwaiting(),
              onExpand: openPage,
              expandHint: WRAP_COPY.journalExpand,
            }
        : wrapAwaiting === 'question'
          ? {
              kind: 'question',
              label: WRAP_COPY.questionTag,
              onCancel: () => wrapUpRef.current.cancelAwaiting(),
            }
          : null,
    );
    if (awaitingAnswer) homeDock.focusInput();
  }, [embedded, homeDock, awaitingAnswer, wrapAwaiting, journalDraft, weekPlaceholder]);
  useEffect(
    () => () => {
      if (embedded && homeDock) {
        homeDock.setChatPlaceholder(null);
        homeDock.setChatTag(null);
      }
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
    if (!isDailyThread || !activeChat || !threadLoaded || !chatOnScreen) return;
    const meta = (activeChat.metadata_json ?? {}) as Partial<DailyThreadMeta>;
    if (meta.seen_at) return;
    // opened to wrap the day up, or the wrap up has begun: Gremly's evening
    // opener is what is said, and no brief is written under or after it
    if (pendingWrapRef.current || meta.sweep || currentWrap()) return;
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
  }, [isDailyThread, activeChat, threadLoaded, chatOnScreen, hasBriefLines, refreshMessages]);
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
    ready: !!isDailyThread && threadLoaded && chatOnScreen && !briefWriting,
    // (with the brief off, a day's thread opened from history shows as it is)
    reducedMotion: reducedMotion || skipPlayback,
    onStart: () => useMascotStore.getState().requestMode('waving'),
    onSeen: handleBriefSeen,
  });
  // As it starts playing, the brief's first line comes to the top as it arrives
  // and the list holds there (scrollHeld)
  useEffect(() => {
    if (!playback.playing || !activeChat) return;
    scrollHoldRef.current = { chatId: activeChat.id, count: messages.length };
    const first = rows[playback.hiddenFrom ?? 0];
    if (first) pendingPlanScrollRef.current = first.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback.playing]);
  const shownRows = useMemo(
    () => (playback.hiddenFrom !== null ? rows.slice(0, playback.hiddenFrom) : rows),
    [rows, playback.hiddenFrom],
  );
  const shownRowsRef = useRef(shownRows);
  shownRowsRef.current = shownRows;

  // Gremly is working on a line in today's thread: the typing bubble under it
  const typingFooter = !!(
    (briefWriting || playback.typing || planFlow.typing || dayTurn.thinking || wrapUp.typing) &&
    isDailyThread
  );
  const typingFooterRef = useRef(typingFooter);
  typingFooterRef.current = typingFooter;
  // under today's thread while the weekly review is under way: its loading
  // card, or the Carry on button once something was said
  const weekFooter = isDailyThread && (weekReview.loading || weekReview.canCarryOn);

  /** The thread grew: take in what was added, then follow it while the reader is at the bottom. */
  const followGrowth = (content: number) => {
    const before = takenInRef.current;
    takenInRef.current = content;
    metricsRef.current.content = content;
    // the typing bubble was part of what came before; it has gone once the line it stood for is in
    const footerBefore = footerHeightRef.current;
    if (!typingFooterRef.current) footerHeightRef.current = 0;
    const rows = shownRowsRef.current;
    const seen = seenRowsRef.current;
    seenRowsRef.current = rows.length;
    const list = flatListRef.current;
    if (!list) return;
    // a new plan card, or the brief's first line as it plays in, scrolls so its top is in view,
    // with the line saying what changed above it when there is one
    const planId = pendingPlanScrollRef.current;
    const index = planId ? rows.findIndex((m) => m.id === planId) : -1;
    if (index >= 0) {
      pendingPlanScrollRef.current = null;
      const above = index > 0 ? briefMetaOf(rows[index - 1]) : null;
      list.scrollToIndex({
        index: above?.type === 'brief-event' ? index - 1 : index,
        viewPosition: 0,
        animated: true,
      });
      return;
    }
    if (scrollHeld()) return;
    // a chat just opened: its end
    if (!seen) {
      anchorTopRef.current = null;
      caughtUpRef.current = true;
      list.scrollToEnd({ animated: false });
      return;
    }
    const by = rows.length > seen ? addedBy(rows, seen) : null;
    // what they send or tap brings them to it
    if (by === 'them') followRef.current = true;
    if (by && !followRef.current) {
      setMoreBelow(true);
      return;
    }
    if (!followRef.current) return;
    if (by === 'them' || (by && (anchorTopRef.current === null || caughtUpRef.current))) {
      const pad = embedded ? 120 : 200;
      anchorTopRef.current = Math.max(0, before - pad - footerBefore);
    }
    const end = Math.max(0, content - metricsRef.current.height);
    const to = followOffset(metricsRef.current, anchorTopRef.current);
    // a line that runs past the screen stays at its top while it grows
    caughtUpRef.current = to >= end;
    if (!caughtUpRef.current) setMoreBelow(true);
    list.scrollToOffset({ offset: to, animated: true });
  };

  /** Where the reader is: at the bottom they are following again and have seen it all. */
  const readerAt = (e: {
    nativeEvent: {
      contentOffset: { y: number };
      layoutMeasurement: { height: number };
      contentSize: { height: number };
    };
  }) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const m = { y: contentOffset.y, height: layoutMeasurement.height, content: contentSize.height };
    metricsRef.current = m;
    return nearBottom(m);
  };
  const settleReader = (e: Parameters<typeof readerAt>[0]) => {
    const near = readerAt(e);
    followRef.current = near;
    if (near) {
      anchorTopRef.current = null;
      caughtUpRef.current = true;
      setMoreBelow(false);
    }
  };
  const toLatest = () => {
    followRef.current = true;
    anchorTopRef.current = null;
    caughtUpRef.current = true;
    setMoreBelow(false);
    flatListRef.current?.scrollToEnd({ animated: true });
  };
  // the message Gremly is working on, until it is saved into the thread
  const lastShown = shownRows[shownRows.length - 1];
  const pendingShown =
    dayTurn.pending && !(lastShown?.role === 'user' && lastShown.content === dayTurn.pending)
      ? dayTurn.pending
      : null;

  // A habit check in answered on an earlier visit whose own offer never
  // arrived, because the app closed or a save failed part way: it follows
  // once each time today's thread is loaded (useBriefOffers checkInOfferOwed).
  // Not when the thread was opened to plan, wrap up or plan the week: that
  // takes the thread from here, and the effects below start it. This one runs
  // before them, while what they are waiting on is still set.
  const owedCheckedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!threadLoaded) {
      owedCheckedRef.current = null;
      return;
    }
    if (!isDailyThread || !activeChat || briefWriting || !isTodaysThread(activeChat)) return;
    if (messages.length && messages[0].chat_id !== activeChat.id) return;
    if (owedCheckedRef.current === activeChat.id) return;
    // a turn still being answered brings the offer itself when it is done
    if (sendingRef.current || dayTurnRef.current.thinking || dayTurnRef.current.busy) return;
    owedCheckedRef.current = activeChat.id;
    if (pendingPlanRef.current || pendingWrapRef.current || pendingWeekRef.current) return;
    if (briefOffersRef.current.owesOffer()) void wrapResumeRef.current();
  }, [isDailyThread, activeChat, threadLoaded, briefWriting, messages]);

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

  // The wrap up, once today's thread is on screen with its messages
  useEffect(() => {
    if (!pendingWrapRef.current || !isDailyThread || !activeChat || !threadLoaded) return;
    if (briefWriting || !isTodaysThread(activeChat)) return;
    if (messages.length && messages[0].chat_id !== activeChat.id) return;
    pendingWrapRef.current = false;
    setSkipPlayback(false);
    void wrapUpRef.current.open();
  }, [isDailyThread, activeChat, threadLoaded, briefWriting, messages]);

  // The weekly review, the same way
  useEffect(() => {
    if (!pendingWeekRef.current || !isDailyThread || !activeChat || !threadLoaded) return;
    if (briefWriting || !isTodaysThread(activeChat)) return;
    if (messages.length && messages[0].chat_id !== activeChat.id) return;
    const how = pendingWeekRef.current;
    pendingWeekRef.current = false;
    setSkipPlayback(false);
    if (how === 'now') void weekReviewRef.current?.startNow();
    else void weekReviewRef.current?.open();
  }, [isDailyThread, activeChat, threadLoaded, briefWriting, messages]);

  // Their weekly day and this week's review, read whenever a chat comes on
  // screen, so Gremly is told where their week stands with each message
  useEffect(() => {
    if (userId) void useThisWeek.getState().refresh();
  }, [userId, activeChat?.id]);

  // Coming into Chat (Daily brief in Chat on): an unread brief opens today's
  // thread; within five minutes of leaving, the chat as it was left; after
  // longer, the fresh home with today pinned. A jump from another screen
  // (the notification, Talk it through, a drop) brings its own chat.
  const briefUnreadHere = useTodayThread((st) => isBriefUnread(st.thread));
  // the brief starts on the second day of training, so the pinned card does too
  const gremlyAge = useGremlyStore((st) => st.gremlyAge);

  // Chat's fresh home: Gremly's greeting and chips that follow the part of the
  // day. Inside the Gremly home they sit at the foot of this page, left of
  // Gremly, so the shared box and Gremly stay exactly where they are on Drop
  const nowMinutes = useNowMinutes();
  const dayBoundaryHour = useGremlyStore((st) => st.dayBoundaryHour);
  const phase = homePhase(nowMinutes, dayBoundaryHour);
  // tonight's cards still to sort: what the pinned card, the chip and the receipt say
  const wrapCards = useGremlyStore(selectWrapUp).cards;
  const sessionWrap = useTodayThread(
    (st) => (st.thread?.metadata_json as Partial<DailyThreadMeta> | undefined)?.sweep ?? null,
  );
  const toDecide = useMemo(
    () => cardsLeft(sessionWrap, wrapCards).length,
    [sessionWrap, wrapCards],
  );
  // the ways into the wrap up: the pinned card's line and the Wrap up today chip
  const wrapTeaser = useEveningTeaser();
  const homeChips = useMemo(
    () => homeChipsFor(phase, { wrap: wrapTeaser.start, planned: wrapTeaser.planned }),
    [phase, wrapTeaser.start, wrapTeaser.planned],
  );
  greetingWaitingRef.current = { briefUnread: briefUnreadHere, toDecide };
  const freshHome = !activeChat && !item && !aboutItem;
  const openWrapUp = useCallback(() => {
    // today's thread, then the wrap up starts or picks up where it was left
    pendingWrapRef.current = true;
    setSkipPlayback(true);
    if (isTodaysThread(activeChat) && threadLoaded) {
      pendingWrapRef.current = false;
      setSkipPlayback(false);
      void wrapUpRef.current.open();
      return;
    }
    void openTodayThread();
  }, [activeChat, threadLoaded, openTodayThread]);
  const openWeekReview = useCallback(
    (how: { startNow?: boolean } = {}) => {
      // once this week is planned, the button opens the week itself (Your week)
      const week = useThisWeek.getState();
      if (weekButton(getDateService().ritualDay(), week.weeklyDay, week.review).done) {
        navigation.navigate('YourWeek');
        return;
      }
      // today's thread, then the weekly review opens: started, or picked up
      // where it was left. With startNow they have already said yes (Plan my
      // week on the brief's offer or the wrap up's close), so it goes straight in.
      if (isTodaysThread(activeChat) && threadLoaded) {
        if (how.startNow) void weekReviewRef.current?.startNow();
        else void weekReviewRef.current?.open();
        return;
      }
      pendingWeekRef.current = how.startNow ? 'now' : 'open';
      setSkipPlayback(true);
      void openTodayThread();
    },
    [activeChat, threadLoaded, openTodayThread, navigation],
  );
  openWeekReviewRef.current = openWeekReview;
  const pressChip = useCallback(
    (key: HomeChipKey) => {
      if (key === 'plan_day') {
        void openTodayThread();
        return;
      }
      if (key === 'wrap_up') {
        openWrapUp();
        return;
      }
      const prompt = chipPrompt(key);
      if (prompt) void handleSend(prompt);
    },
    [openTodayThread, openWrapUp, handleSend],
  );
  // put away while typing, for room to read
  const keyboardOpen = useKeyboardOpen();
  const jumpPending = !!(
    params?.thread ||
    params?.talkAbout ||
    params?.autoSendKey ||
    params?.prefillPrompt
  );
  const jumpPendingRef = useRef(jumpPending);
  jumpPendingRef.current = jumpPending;
  const enterChat = useCallback(() => {
    if (item || jumpPendingRef.current) return;
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
      // the quick sweep: only the cards that still need a decision, then back here
      navigation.navigate('Cards', { cards: 'quick' });
    },
    [activeChat, navigation],
  );
  const openBriefSweepRef = useRef(openBriefSweep);
  openBriefSweepRef.current = openBriefSweep;
  useEffect(() => {
    // an item's chat is never today's thread
    if (item || typeof navigation.addListener !== 'function') return undefined;
    return navigation.addListener('focus', () => {
      // tonight's cards have closed: the receipt, and what comes next
      if (takeCardsVisit()) {
        void wrapUpRef.current.backFromCards();
        return;
      }
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
          const day = dayRecordFromStore(date);
          const planFrom = clearFrom(day.busy, minutesOfDay(), day.planEnd);
          const follow = sweepFollowUp(outcome, {
            livePlan: !!planFlowRef.current.livePlan,
            planFrom,
          });
          await appendBriefMessage('assistant', follow.text, {
            type: 'brief-offer',
            kind: 'follow_up',
            buttons: follow.buttons,
            plan_from: planFrom ?? undefined,
            // a plan made from here holds what was kept
            kept_ids: outcome.kept.length ? outcome.kept.map((k) => k.id) : undefined,
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
  // Ask Gremly's agent card (agent plan step 9): the same card, in a chat
  const chatCard = useChatCard({
    appendBriefMessage,
    patchMessageMetadata,
    say: async (text) => {
      await appendAssistantMessage(text);
    },
  });
  // Accept on a change card: the thread follows to what it did, the
  // "Updated" line and the plan it changed, wherever they were reading
  const changeActions = isDailyThread ? dayTurn : chatCard;
  const applyChanges = changeActions.apply;
  const applyAndFollow = useCallback(
    (message: SpaceChatMessage, unticked: string[]) => {
      followRef.current = true;
      anchorTopRef.current = null;
      caughtUpRef.current = true;
      setMoreBelow(false);
      return applyChanges(message, unticked);
    },
    [applyChanges],
  );
  // A tap on a change card's row opens the item the row is about. An item's
  // own chat sits on top of that item, so there the chat closes onto it; a
  // row about another item closes the chat and opens that one. The chat may
  // sit on an overlay, which a habit's page would open behind.
  const openChangeItem = useCallback(
    (target: ChangeRowItem) => {
      if (item) {
        item.onClose();
        if (item.anchor.id === target.id) return;
      }
      openEntity(
        { id: target.id, type: target.type, title: target.title },
        { overOverlay: !!item },
      );
    },
    [item, openEntity],
  );
  // drawn again when saving ends and when Undo becomes possible (ChangeCard.tsx)
  const renderChanges = useRenderChanges(
    { ...changeActions, apply: applyAndFollow },
    openChangeItem,
  );
  const renderPlan = useCallback(
    (message: SpaceChatMessage, meta: BriefPlanMeta) => (
      <BriefPlanBlock
        meta={meta}
        interactive={!planFlowRef.current.typing}
        onRemove={(id) => void planFlowRef.current.removeItem(message, id)}
        onAdd={(picks) => void planFlowRef.current.addItems(message, picks)}
        onRetime={(id, start, minutes) =>
          void planFlowRef.current.retimeItem(message, id, start, minutes)
        }
        onAddBusy={(block) => void planFlowRef.current.addBusy(message, block)}
        onYes={() =>
          void planFlowRef.current.accept(message).then(() => wrapUpRef.current.afterPlan())
        }
        onDismiss={() =>
          void planFlowRef.current.dismiss(message).then(() => wrapUpRef.current.afterPlan())
        }
        onShowAgain={() => void planFlowRef.current.showAgain(message)}
        onSeeToday={() => navigation.navigate('Tabs', { screen: 'Today' })}
      />
    ),
    [navigation],
  );

  // The evening wrap up's cards (lib/wrapup). A day's thread from history
  // draws them from what it saved; only today's can still be acted on.
  const wrapToday = isTodaysThread(activeChat) ? wrapUp.wrap : null;
  const savedWrap =
    wrapToday ??
    (activeChat?.metadata_json as Partial<DailyThreadMeta> | null | undefined)?.sweep ??
    null;
  const wrapBusy = wrapUp.busy;
  const wrapUndoable = wrapUp.undoable;
  const renderWrap = useCallback(
    (message: SpaceChatMessage, meta: BriefMeta) => {
      const live = !!wrapToday;
      const w = wrapUpRef.current;
      switch (meta.type) {
        case 'sweep-recap':
          return <WrapRecapCard meta={meta} />;
        case 'sweep-receipt':
          return (
            <WrapReceiptCard
              decisions={savedWrap?.decisions ?? []}
              toSort={live && !pastCards(savedWrap) ? toDecide : 0}
              undoable={live ? wrapUndoable : {}}
              onUndo={(cid) => void w.undoDecision(cid)}
              interactive={!wrapBusy}
            />
          );
        case 'sweep-habits':
          return (
            <WrapHabitsCard
              meta={meta}
              interactive={live && !wrapBusy}
              onSave={(done, held, moved) => void w.habits.save(message, done, held, moved)}
              onAll={() => navigation.navigate('Habits')}
            />
          );
        case 'sweep-journal':
          return (
            <WrapJournalCard
              meta={meta}
              interactive={live && !wrapBusy}
              onSaveMoods={(moods) => void w.journal.saveMoods(message, moods)}
              onSkipMoods={() => void w.journal.skipMoods(message)}
              onEditMoods={
                live && meta.note_id
                  ? (moods) => void w.journal.editMoods(message, moods)
                  : undefined
              }
              onUndo={
                live && meta.note_id && wrapUndoable[`journal:${meta.note_id}`]
                  ? () => void w.journal.undo(message)
                  : undefined
              }
              onOpen={
                live && meta.note_id && meta.status === 'saved'
                  ? () => w.journal.openSaved(message)
                  : undefined
              }
            />
          );
        case 'sweep-item':
          return (
            <WrapItemCard
              meta={meta}
              onOpen={(it) =>
                openEntity({ id: it.id, type: it.kind, title: it.title } as EntityCardEntity)
              }
            />
          );
        case 'sweep-end':
          return <WrapEndMark meta={meta} />;
        default:
          return null;
      }
    },
    [wrapToday, savedWrap, wrapBusy, wrapUndoable, toDecide, navigation, openEntity],
  );
  // The weekly review's cards (lib/week), and the button to their week that
  // Gremly puts under a reply. The button reads what it opens today; in a
  // thread from an earlier day, what it read then.
  const weekly = useThisWeek();
  const weekNow = useMemo(
    () => weekButton(getDateService().ritualDay(), weekly.weeklyDay, weekly.review),
    [weekly.weeklyDay, weekly.review],
  );
  const onTodaysThread = isTodaysThread(activeChat);
  const renderWeek = useCallback(
    (message: SpaceChatMessage, meta: BriefMeta) => {
      if (meta.type === 'week-card') {
        return <WeekCard messageId={message.id} meta={meta} review={weekReview} />;
      }
      if (meta.type === 'week-offer') {
        const label =
          onTodaysThread || !isDailyThread
            ? weekNow.label
            : meta.done
              ? WEEK_COPY.seeWeek
              : WEEK_COPY.planWeek;
        return <WeekOfferButton label={label} onPress={() => openWeekReview()} />;
      }
      return null;
    },
    [weekReview, weekNow.label, onTodaysThread, isDailyThread, openWeekReview],
  );
  // Write a few lines is left out while the box already saves to the journal
  const hiddenActions = useMemo(
    () => (wrapAwaiting === 'journal' ? (['journal_write'] as OfferAction[]) : undefined),
    [wrapAwaiting],
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
          void wrapResumeRef.current();
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
            interactive={!briefOffers.busy && !playback.playing && !wrapBusy && !weekReview.busy}
            onOfferButton={handleOfferButton}
            renderDayCard={renderDayCard}
            renderPlan={renderPlan}
            renderChanges={renderChanges}
            renderWrap={renderWrap}
            renderWeek={renderWeek}
            hiddenActions={hiddenActions}
            showOffer={showOffer}
            renderHabitWeek={renderHabitWeek}
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
      renderChanges,
      renderWrap,
      renderWeek,
      hiddenActions,
      showOffer,
      renderHabitWeek,
      wrapBusy,
      weekReview.busy,
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
            <>
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
                onLayout={(e) => {
                  metricsRef.current.height = e.nativeEvent.layout.height;
                }}
                onContentSizeChange={(_w: number, h: number) => {
                  setTimeout(() => followGrowth(h), 100);
                }}
                scrollEventThrottle={64}
                onScroll={(e) => {
                  if (readerAt(e) && moreBelow) setMoreBelow(false);
                }}
                onScrollToIndexFailed={() => flatListRef.current?.scrollToEnd({ animated: true })}
                // Inside the Gremly home, Gremly steps aside while you scroll
                onScrollBeginDrag={embedded ? () => homeDock?.setChatScrolling(true) : undefined}
                onScrollEndDrag={(e) => {
                  settleReader(e);
                  if (embedded) homeDock?.setChatScrolling(false);
                }}
                onMomentumScrollBegin={
                  embedded ? () => homeDock?.setChatScrolling(true) : undefined
                }
                onMomentumScrollEnd={(e) => {
                  settleReader(e);
                  if (embedded) homeDock?.setChatScrolling(false);
                }}
                ListEmptyComponent={
                  // today's thread with nothing in it yet (the brief could not be
                  // written, or it is someone's first day): the day card, from the store
                  isDailyThread &&
                  threadLoaded &&
                  !briefWriting &&
                  !playback.playing &&
                  !playback.waiting ? (
                    <View style={styles.dailyEmpty} testID="daily-thread-empty">
                      <BriefDayCardBlock date={threadDay} />
                    </View>
                  ) : (
                    <View style={styles.flex} />
                  )
                }
                ListFooterComponent={
                  typingFooter ? (
                    <View
                      onLayout={(e) => {
                        footerHeightRef.current = e.nativeEvent.layout.height;
                      }}
                    >
                      {pendingShown ? (
                        // what they just sent, at once, while Gremly works on it
                        <View style={styles.messageContainer} testID="day-turn-pending">
                          <ChatBubble
                            message={
                              {
                                id: 'day-turn-pending',
                                role: 'user',
                                content: pendingShown,
                              } as unknown as SpaceChatMessage
                            }
                          />
                        </View>
                      ) : null}
                      <View style={styles.messageContainer} testID="brief-writing">
                        <ChatBubble
                          message={
                            {
                              id: 'brief-writing',
                              role: 'assistant',
                              content: '',
                              isStreaming: true,
                              // what Gremly is doing while it works on a message in the thread
                              loadingMessage: dayTurn.thinking ? dayTurn.status : null,
                            } as unknown as SpaceChatMessage
                          }
                        />
                      </View>
                    </View>
                  ) : weekFooter ? (
                    // the weekly review: Gremly making his read, or Carry on after a message
                    <WeekFooter
                      loading={weekReview.loading}
                      canCarryOn={weekReview.canCarryOn}
                      disabled={weekReview.busy}
                      onCarryOn={() => void weekReview.carryOn()}
                    />
                  ) : null
                }
              />
              {moreBelow ? (
                <TouchableOpacity
                  style={[styles.moreBelow, embedded && styles.moreBelowEmbedded]}
                  onPress={toLatest}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Jump to the latest"
                  testID="chat-more-below"
                >
                  <ChevronDown size={15} color={MOSS} strokeWidth={2.4} />
                  <Text style={styles.moreBelowText}>Latest</Text>
                </TouchableOpacity>
              ) : null}
            </>
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
              {gremlyAge >= 1 ? (
                <View style={styles.pinnedToday}>
                  <TodayPinnedCard
                    date={getDateService().ritualDay()}
                    unread={briefUnreadHere}
                    onPress={() => void openTodayThread()}
                    phase={phase}
                    wrapLine={wrapTeaser.pinned}
                    wrapNudge={wrapTeaser.nudge}
                    onWrapUp={wrapTeaser.offer ? openWrapUp : undefined}
                  />
                </View>
              ) : null}
              {/* Inside the Gremly home the greeting and chips sit by the shared box */}
              {!embedded && <Text style={styles.greeting}>{greeting ?? GREETING_FALLBACK}</Text>}

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

              {!embedded && (
                <HomeChips chips={homeChips} onPress={pressChip} style={styles.homeChips} />
              )}
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
            {/* Chat's fresh home: Gremly's greeting and the chips, left of him */}
            {freshHome && !keyboardOpen ? (
              <View style={styles.homeFoot} pointerEvents="box-none" testID="chat-home-foot">
                {greeting ? (
                  <View style={styles.homeGreeting} testID="chat-home-greeting">
                    <Text style={styles.homeGreetingText}>{greeting}</Text>
                  </View>
                ) : null}
                {/* left of Gremly the room is narrow: the chips wrap, so none hides behind him */}
                <HomeChips chips={homeChips} onPress={pressChip} wrap />
              </View>
            ) : null}
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
                // in today's thread a message waits in the box while Gremly is
                // still working on the last one, rather than being lost
                disabled={sending || (isDailyThread && (dayTurn.thinking || dayTurn.busy))}
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

      {/* the week's board, the weekly review's last step: a full sheet over today's thread */}
      {onTodaysThread ? <WeekBoardSheet review={weekReview} /> : null}

      {isDailyThread && planFlow.pickSession ? (
        <PlanPickSheet
          session={planFlow.pickSession}
          onConfirm={(picks) => void planFlowRef.current.planPicked(picks)}
          onAsk={() => void planFlowRef.current.askFirst()}
          onClose={() => planFlowRef.current.closePicks()}
        />
      ) : null}

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
  homeChips: {
    flexGrow: 0,
    marginTop: 8,
    paddingHorizontal: 24,
  },
  // the foot of Chat's fresh home: just above the shared box, left of where
  // Gremly perches on it, the greeting with its tail towards him
  homeFoot: {
    position: 'absolute',
    left: 16,
    right: 104,
    bottom: 8,
    alignItems: 'flex-start',
    gap: 10,
  },
  homeGreeting: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderBottomRightRadius: 6,
    borderWidth: 1,
    borderColor: '#ECEAE4',
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#28322C',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  homeGreetingText: {
    fontFamily: 'Inter-Regular',
    fontSize: 16,
    lineHeight: 22,
    color: '#2B3630',
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
  // there is more below while they read further up: one tap to the latest
  moreBelow: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.18)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  // inside the Gremly home, above the save pill's line
  moreBelowEmbedded: {
    bottom: 52,
  },
  moreBelowText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: MOSS,
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
