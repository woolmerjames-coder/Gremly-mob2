/**
 * SpaceHomeScreen - Space v3 layout
 * Header + context + summary + upcoming + progress + tabs (compact)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Text,
  TextInput,
  Animated,
  Easing,
  Alert,
  RefreshControl,
  TouchableOpacity,
  useColorScheme,
  BackHandler,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useRepo } from '../../providers/RepoProvider';
import { SupabaseSpaceChatRepo, SupabaseSpaceChatMessageRepo } from '../../lib/repo/supabase';
import { MemorySpaceChatRepo } from '../../lib/repo/memory';
import type { Space, SpaceChat, AppRecord } from '../../lib/types';
import { lightTokens, darkTokens } from '../../design/tokens';
import {
  listHabitsForSpace,
  listTodosForSpace,
  listNotesForSpace,
  countJournalForSpace,
} from '../../lib/selectors/spaceSelectors';
import { startOfWeek, formatISO, addDays } from 'date-fns';

// Components
import { SpaceBanner } from '../../components/spaces/SpaceBanner';
import { ChatCard } from '../../components/spaces/ChatCard';
import { WhatWeDiscussedCard } from '../../components/spaces/WhatWeDiscussedCard';
import { useAuth } from '../../providers/AuthProvider';
import { useSpaceAggregate } from '../../hooks/useSpaceAggregate';
import { summarizeChatForCard } from '../../lib/ai/chatSummaries';
// v3 legacy components removed in v4 path
import { FocusCard, CalendarStrip, QuickStatsRow, ChatCTA } from '../../components/spaces/v4';
import HeaderV22 from '../../components/spaces/v22/Header';
import WeekStripV22 from '../../components/spaces/v22/WeekStrip';
import TimelineOverlay from '../../components/spaces/v22/Overlays/TimelineOverlay';
import DayPanelV22 from '../../components/spaces/v22/DayPanel';
import AdaptiveSummaryV22 from '../../components/spaces/v22/AdaptiveSummary';
import FocusTodayCard from '../../components/spaces/v22/FocusTodayCard';
import InsightsRow from '../../components/spaces/v22/InsightsRow';
import NotepadOverlay from '../../components/spaces/v22/Overlays/NotepadOverlay';
import PeopleOverlay from '../../components/spaces/v22/Overlays/PeopleOverlay';
import NewChatCTA from '../../components/spaces/v22/NewChatCTA';
import { COLORS as V22 } from '../../components/spaces/v22/_tokens';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import UnifiedCreateOverlay from '../../components/overlay/UnifiedCreateOverlay';
import ThreadCard from '../../components/spaces/v22/ThreadCard';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ConfettiBurst from '../../components/ConfettiBurst';
import WeeklyGoalCard from '../../components/spaces/v22/WeeklyGoalCard';
import { Search as SearchIcon, Settings as SettingsIcon } from '../../components/icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useSpaceTimeline from '../../hooks/useSpaceTimeline';
import { useSpaceNotes } from '../../hooks/useSpaceNotes';
// v33 components (Space v3.3)
import HeaderV33 from '../../components/spaces/v33/Header';
import NewChatSectionV33 from '../../components/spaces/v33/NewChatSection';
import ThreadCardV33 from '../../components/spaces/v33/ThreadCard';
// v33 goal components
import GoalListV33 from '../../components/spaces/v33/GoalList';
import GoalSectionV33, { GoalsZone } from '../../components/spaces/v33/GoalSection';
import SearchOverlayV33 from '../../components/spaces/v33/Overlays/SearchOverlay';
import IconRowV33 from '../../components/spaces/v33/IconRow';
import CalendarOverlayV33 from '../../components/spaces/v33/Overlays/CalendarOverlay';
import EditGoalModal from '../../components/spaces/v33/Overlays/EditGoalModal';
import NotepadOverlayV33 from '../../components/spaces/v33/Overlays/NotepadOverlay';
import UnifiedAddOverlay from '../../components/spaces/v33/Overlays/UnifiedAddOverlay';
import RenameChatModal from '../../components/spaces/v33/Overlays/RenameChatModal';
import GoalPlaceholder from '../../components/spaces/v33/GoalPlaceholder';
import Menu from '../../components/spaces/v33/Menu';
import { getWittyLine, type Mood } from '../../lib/ai/moodLines';

type Props = NativeStackScreenProps<RootStackParamList, 'SpaceHome'>;

interface LayoutState {
  scheduleCollapsed?: boolean;
  habitsTodosCollapsed?: boolean;
  notesResourcesCollapsed?: boolean;
  journalCollapsed?: boolean;
}

export default function SpaceHomeScreen({ route, navigation }: Props) {
  const { spaceId } = route.params;
  const repo = useRepo();
  const { userId, user } = useAuth();
  const colorScheme = useColorScheme();
  const T = colorScheme === 'dark' ? darkTokens : lightTokens;
  const insets = useSafeAreaInsets();

  // Feature flag: Space v3 layout (robust parsing)
  const isSpaceV3 = (() => {
    const raw = (process.env.EXPO_PUBLIC_SPACE_V3 ?? 'on').toString().trim().toLowerCase();
    return raw === 'on' || raw === 'true' || raw === '1' || raw === 'enabled';
  })();
  // Feature flag: Space v3.3 (v33) - strict equality per spec
  const isSpaceV33 = process.env.EXPO_PUBLIC_SPACE_V33 === 'on';
  // Debug flags (dev only)
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log('[SpaceHome] flags', {
      v3: isSpaceV3,
      v22: process.env.EXPO_PUBLIC_SPACE_V22 === 'on',
      v33: isSpaceV33,
    });
  }

  // State
  const { space, chats, items, stats, upcoming, intent, nextItem, weekly, reload } =
    useSpaceAggregate(spaceId);
  const { totalCount: notesCount } = useSpaceNotes(spaceId);
  const [aiSummaries, setAiSummaries] = useState<Record<string, string>>({});
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // v33 search filter chip state
  const [searchActiveV33, setSearchActiveV33] = useState<'chats' | 'notes' | 'habits'>('chats');
  // Local search results (computed client-side)
  const [activeTab, setActiveTab] = useState<'all' | 'chats' | 'habits' | 'todos' | 'notes'>(
    'chats',
  );
  const isFocused = useIsFocused();
  const [summaryPulse] = useState(() => new Animated.Value(1));
  const [showConfetti, setShowConfetti] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [layoutState, setLayoutState] = useState<LayoutState>({});
  const [selectedDayISO, setSelectedDayISO] = useState<string>(() =>
    formatISO(new Date(), { representation: 'date' }),
  );
  const [showTimeline, setShowTimeline] = useState(false);
  // v33 calendar overlay state (separate from v22 timeline)
  const [showCalendarV33, setShowCalendarV33] = useState(false);
  // v33: edit goal modal state
  const [editGoalVisible, setEditGoalVisible] = useState(false);
  const [editGoalRecord, setEditGoalRecord] = useState<import('../../lib/types').AppRecord | null>(
    null,
  );
  const [showNotepad, setShowNotepad] = useState(false);
  const [intentDraft, setIntentDraft] = useState<string | undefined>(undefined);
  const [showPeople, setShowPeople] = useState(false);
  // v33: Unified Add overlay state
  const [showUnifiedAdd, setShowUnifiedAdd] = useState(false);
  // v33: goal menu (inline Menu component)
  const [goalMenuId, setGoalMenuId] = useState<string | null>(null);
  // v33: rename chat modal state
  const [renameChatModalOpen, setRenameChatModalOpen] = useState(false);
  const [renameChatId, setRenameChatId] = useState<string | null>(null);
  const [renameChatTitle, setRenameChatTitle] = useState('');
  const overlay = useUnifiedOverlayController();
  const [showUnsortedToast, setShowUnsortedToast] = useState(false);
  const unsortedOpacity = React.useMemo(() => new Animated.Value(0), []);
  // Undo snackbar (Sage bg)
  const [showUndoToast, setShowUndoToast] = useState(false);
  const [undoText, setUndoText] = useState<string>('Marked complete');
  const undoOpacity = React.useMemo(() => new Animated.Value(0), []);
  const undoHandlerRef = React.useRef<null | (() => Promise<void>)>(null);
  // Unified timeline hook (v22)
  const { days: timelineDays, reload: reloadTimeline } = useSpaceTimeline(spaceId);
  // v33 page load motion
  // Safe defaults so content is visible even if animation doesn’t kick in
  const oV33 = React.useMemo(() => new Animated.Value(1), []);
  const yV33 = React.useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    if (!isSpaceV33) return;
    Animated.parallel([
      Animated.timing(oV33, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.timing(yV33, {
        toValue: 0,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpaceV33]);

  // Android hardware back button support
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return true;
        }
        return false;
      });
      return () => subscription.remove();
    }, [navigation]),
  );

  // Refs for smooth scrolling to sections (v22)
  const scrollRef = React.useRef<ScrollView | null>(null);
  const [dayPanelY, setDayPanelY] = React.useState<number | null>(null);
  // Cascade fade-in for v22 sections
  const oWeek = React.useMemo(() => new Animated.Value(0), []);
  const oDay = React.useMemo(() => new Animated.Value(0), []);
  const oSummary = React.useMemo(() => new Animated.Value(0), []);
  const oInsights = React.useMemo(() => new Animated.Value(0), []);
  const oCTA = React.useMemo(() => new Animated.Value(0), []);
  const oThreads = React.useMemo(() => new Animated.Value(0), []);
  // Slide-up motion for v22 sections
  const yWeek = React.useMemo(() => new Animated.Value(20), []);
  const yDay = React.useMemo(() => new Animated.Value(20), []);
  const ySummary = React.useMemo(() => new Animated.Value(20), []);
  const yInsights = React.useMemo(() => new Animated.Value(20), []);
  const yCTA = React.useMemo(() => new Animated.Value(20), []);
  const yThreads = React.useMemo(() => new Animated.Value(20), []);
  // Focus card snooze state
  const [focusDismissed, setFocusDismissed] = useState<boolean>(false);
  // Feature flag: Space v22 header (strict equality as requested)
  const isSpaceV22 = process.env.EXPO_PUBLIC_SPACE_V22 === 'on';

  useEffect(() => {
    if (!isSpaceV22) return;
    const ops = [oWeek, oDay, oSummary, oInsights, oCTA, oThreads];
    const tys = [yWeek, yDay, ySummary, yInsights, yCTA, yThreads];
    const groups = ops.map((op, i) =>
      Animated.parallel([
        Animated.timing(op, { toValue: 1, duration: 250, delay: i * 50, useNativeDriver: true }),
        Animated.timing(tys[i], {
          toValue: 0,
          duration: 250,
          delay: i * 50,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    Animated.stagger(50, groups).start();
  }, [
    isSpaceV22,
    oCTA,
    oDay,
    oInsights,
    oSummary,
    oThreads,
    oWeek,
    yCTA,
    yDay,
    yInsights,
    ySummary,
    yThreads,
    yWeek,
  ]);
  // Header mood line heuristic
  const headerMood = React.useMemo(() => {
    const lastChatTs = chats.reduce((acc, c) => Math.max(acc, new Date(c.updated_at).getTime()), 0);
    const lastItemTs = items.reduce((acc, it: any) => {
      const ts = new Date(it.updated_at || it.created_at || 0).getTime();
      return Math.max(acc, ts);
    }, 0);
    const lastTs = Math.max(lastChatTs, lastItemTs);
    const daysSince = lastTs ? Math.floor((Date.now() - lastTs) / (1000 * 60 * 60 * 24)) : 999;
    if (daysSince >= 7)
      return { tone: 'low' as const, text: 'It’s been quiet — want to revisit your goals?' };
    const todayISO = formatISO(new Date(), { representation: 'date' });
    const today = (timelineDays || []).find((d) => d.dateISO === todayISO);
    const anyDone = (timelineDays || []).some((d) => (d.items || []).some((it: any) => !!it.done));
    if (anyDone || (today && (today.items || []).length > 0)) {
      return { tone: 'proud' as const, text: 'Steady rhythm — keep the momentum.' };
    }
    return { tone: 'calm' as const, text: 'Nothing urgent — breathe and reflect.' };
  }, [chats, items, timelineDays]);

  // v33: Derive mood for witty line
  const v33Mood: Mood = React.useMemo(() => {
    const lastChatTs = chats.reduce((acc, c) => Math.max(acc, new Date(c.updated_at).getTime()), 0);
    const lastItemTs = items.reduce((acc, it: any) => {
      const ts = new Date(it.updated_at || it.created_at || 0).getTime();
      return Math.max(acc, ts);
    }, 0);
    const lastTs = Math.max(lastChatTs, lastItemTs);
    const daysSince = lastTs ? Math.floor((Date.now() - lastTs) / (1000 * 60 * 60 * 24)) : 999;

    if (daysSince >= 7) return 'low';

    const todayISO = formatISO(new Date(), { representation: 'date' });
    const today = (timelineDays || []).find((d) => d.dateISO === todayISO);
    const anyDone = (timelineDays || []).some((d) => (d.items || []).some((it: any) => !!it.done));

    if (anyDone || (today && (today.items || []).length > 0)) return 'proud';

    return 'neutral';
  }, [chats, items, timelineDays]);

  // v33: Compute daily witty line
  const v33WittyLine = React.useMemo(() => {
    const dailySeed = new Date().toISOString().slice(0, 10);
    return getWittyLine(space?.name ?? 'Space', v33Mood, dailySeed);
  }, [space?.name, v33Mood]);

  // Header mascot micro-states
  const [headerMascot, setHeaderMascot] = useState<'calm' | 'focused' | 'proud' | 'playful'>(
    'calm',
  );
  useEffect(() => {
    if (!isSpaceV22) return;
    // playful peek on screen focus
    if (isFocused) {
      setHeaderMascot('playful');
      const t = setTimeout(() => setHeaderMascot('calm'), 600);
      return () => clearTimeout(t);
    }
  }, [isFocused, isSpaceV22]);

  // When selected day changes in v22, scroll DayPanel into view (place before any early return)
  useEffect(() => {
    if (!isSpaceV22) return;
    if (dayPanelY == null) return;
    const t = setTimeout(() => {
      try {
        const y = Math.max(0, dayPanelY - 80);
        scrollRef.current?.scrollTo({ y, animated: true });
      } catch {
        // no-op
      }
    }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDayISO]);

  // Load focus card dismissal from AsyncStorage
  useEffect(() => {
    const run = async () => {
      try {
        const todayISO = formatISO(new Date(), { representation: 'date' });
        const key = `focusCard:dismiss:${spaceId}:${todayISO}`;
        const until = await AsyncStorage.getItem(key);
        if (until) {
          const ts = new Date(until).getTime();
          if (!isNaN(ts) && ts > Date.now()) setFocusDismissed(true);
        }
      } catch {
        /* ignore */
      }
    };
    run();
  }, [spaceId]);

  const showSageToast = useCallback(() => {
    setShowUnsortedToast(true);
    unsortedOpacity.setValue(0);
    Animated.timing(unsortedOpacity, {
      toValue: 1,
      duration: 160,
      useNativeDriver: true,
    }).start(() => {
      setTimeout(() => {
        Animated.timing(unsortedOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) setShowUnsortedToast(false);
        });
      }, 1800);
    });
  }, [unsortedOpacity]);

  const showUndoSnackbar = useCallback(
    (text: string, onUndo: () => Promise<void>) => {
      setUndoText(text);
      undoHandlerRef.current = onUndo;
      setShowUndoToast(true);
      undoOpacity.setValue(0);
      Animated.timing(undoOpacity, { toValue: 1, duration: 160, useNativeDriver: true }).start(
        () => {
          setTimeout(() => {
            Animated.timing(undoOpacity, {
              toValue: 0,
              duration: 180,
              useNativeDriver: true,
            }).start(({ finished }) => {
              if (finished) setShowUndoToast(false);
            });
          }, 3000);
        },
      );
    },
    [undoOpacity],
  );
  //
  // removed legacy mock data used during design polish; real data wired via hooks
  //

  // Phase 10.8: Space Insight state
  const [spaceInsight, setSpaceInsight] = useState<{
    summary: string;
    summary_at: string;
    tokens: number;
  } | null>(null);

  // Dev-only diagnostics to confirm layout branch
  useEffect(() => {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log('[SpaceHome] v3 flag is', isSpaceV3);
    }
  }, [isSpaceV3]);

  // Create SpaceChatRepo instance (for actions)
  const spaceChatRepo = React.useMemo(() => {
    const backend = process.env.EXPO_PUBLIC_REPO_BACKEND || 'memory';
    return backend === 'supabase'
      ? new SupabaseSpaceChatRepo(userId || undefined)
      : new MemorySpaceChatRepo(userId || 'anonymous');
  }, [userId]);

  // Initial visual loading phase mirrors hook's first fetch
  useEffect(() => {
    // When hook provides any space value, consider initial load complete
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (space || space === null) setLoading(false);
  }, [space]);

  // Screen focus pulse for SpaceSummaryCard
  useEffect(() => {
    if (isFocused) {
      summaryPulse.setValue(0.98);
      Animated.timing(summaryPulse, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    }
  }, [isFocused, summaryPulse]);

  // Load insight and layout state when space changes
  useEffect(() => {
    if (space?.layout_state_json) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLayoutState(space.layout_state_json as LayoutState);
      } catch (e) {
        console.warn('Failed to parse layout state', e);
      }
    }
    repo
      .getLatestSpaceInsight(spaceId)
      .then(setSpaceInsight)
      .catch(() => undefined);
  }, [spaceId, space, repo]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([
      reload(),
      repo
        .getLatestSpaceInsight(spaceId)
        .then(setSpaceInsight)
        .catch(() => undefined),
    ]).finally(() => setRefreshing(false));
  }, [reload, repo, spaceId]);

  const handleSearchPress = useCallback(() => {
    setSearchVisible((v) => !v);
  }, []);

  const handleFilterPress = useCallback((key: 'all' | 'chats' | 'habits' | 'todos' | 'notes') => {
    setActiveTab(key);
  }, []);

  const v33FilteredResults = React.useMemo(() => {
    const empty = { items: [] as AppRecord[], chats: [] as SpaceChat[] };
    const q = searchQuery.trim().toLowerCase();
    if (!searchVisible || q.length === 0) return empty;

    const match = (s?: string | null) => (s || '').toLowerCase().includes(q);

    const matchedChats = chats.filter((c) => match(c.title) || match(c.last_message_snippet || ''));

    const matchedNotes = (items as AppRecord[]).filter(
      (it: any) => it.type === 'note' && (match((it as any).title) || match((it as any).body)),
    );
    const matchedHabits = (items as AppRecord[]).filter(
      (it: any) => it.type === 'habit' && (match((it as any).name) || match((it as any).notes)),
    );

    if (searchActiveV33 === 'chats') return { items: [], chats: matchedChats };
    if (searchActiveV33 === 'notes') return { items: matchedNotes, chats: [] };
    if (searchActiveV33 === 'habits') return { items: matchedHabits, chats: [] };
    return empty;
  }, [searchActiveV33, searchQuery, searchVisible, chats, items]);

  // Persist layout state
  const persistLayoutState = useCallback(
    async (newState: LayoutState) => {
      if (!space) return;
      try {
        await repo.updateSpace(spaceId, {
          layout_state_json: newState,
        });
        setLayoutState(newState);
        // Phase 8 polish: Track module collapse/expand
        console.log('[Analytics] space_module_toggled', { spaceId, layoutState: newState });
      } catch (error) {
        console.warn('Failed to persist layout state:', error);
      }
    },
    [space, spaceId, repo],
  );

  // Chat actions
  const handleNewChat = useCallback(async () => {
    try {
      const newChat = await spaceChatRepo.create(spaceId, {
        title: 'New Chat',
      });
      // TODO: Fire analytics
      // analytics.track('space_chat_created', { spaceId, chatId: newChat.id });
      console.log('[Analytics] space_chat_created', { spaceId, chatId: newChat.id }); // Phase 8 polish
      navigation.navigate('ChatThread', { spaceId, chatId: newChat.id });
      reload();
    } catch (error) {
      console.error('Failed to create chat:', error);
      Alert.alert('Error', 'Failed to create chat');
    }
  }, [spaceId, spaceChatRepo, navigation, reload]);

  const handleChatPress = useCallback(
    (chatId: string) => {
      // TODO: Fire analytics
      // analytics.track('space_chat_opened', { spaceId, chatId });
      console.log('[Analytics] space_chat_opened', { spaceId, chatId }); // Phase 8 polish
      navigation.navigate('ChatThread', { spaceId, chatId });
    },
    [navigation, spaceId],
  );

  const handlePinChat = useCallback(
    async (chatId: string) => {
      try {
        await spaceChatRepo.update(chatId, { pinned: true });
        await reload();
      } catch (error) {
        console.warn('Failed to pin chat:', error);
        Alert.alert('Error', 'Failed to pin chat');
      }
    },
    [spaceChatRepo, reload],
  );

  const handleUnpinChat = useCallback(
    async (chatId: string) => {
      try {
        await spaceChatRepo.update(chatId, { pinned: false });
        await reload();
      } catch (error) {
        console.warn('Failed to unpin chat:', error);
        Alert.alert('Error', 'Failed to unpin chat');
      }
    },
    [spaceChatRepo, reload],
  );

  const handleRenameChat = useCallback(
    (chatId: string) => {
      const chat = chats.find((c) => c.id === chatId);
      if (chat) {
        setRenameChatId(chatId);
        setRenameChatTitle(chat.title || 'New Chat');
        setRenameChatModalOpen(true);
      }
    },
    [chats],
  );

  // v22 compatible wrapper for handleRenameChat (takes newTitle directly)
  const handleRenameChatV22 = useCallback(
    async (chatId: string, newTitle: string) => {
      try {
        await spaceChatRepo.update(chatId, { title: newTitle });
        await reload();
      } catch (error) {
        console.error('Failed to rename chat:', error);
        Alert.alert('Error', 'Failed to rename chat');
      }
    },
    [spaceChatRepo, reload],
  );

  const handleRenameChatSubmit = useCallback(
    async (newTitle: string) => {
      if (!renameChatId) return;
      try {
        await spaceChatRepo.update(renameChatId, { title: newTitle });
        await reload();
      } catch (error) {
        console.error('Failed to rename chat:', error);
        Alert.alert('Error', 'Failed to rename chat');
      }
    },
    [renameChatId, spaceChatRepo, reload],
  );

  // v33: Goal menu handled via Menu component (see inline render in v33 branch)

  const handleArchiveChat = useCallback(
    async (chatId: string) => {
      try {
        // Archive is the safer default: soft-archive when supported
        const backend = process.env.EXPO_PUBLIC_REPO_BACKEND || 'memory';
        if (backend === 'supabase' && spaceChatRepo instanceof SupabaseSpaceChatRepo) {
          await spaceChatRepo.archive(chatId);
        } else {
          // Memory repo uses delete() to mark archived
          await spaceChatRepo.delete(chatId);
        }
        await reload();
      } catch (error) {
        console.error('Failed to archive chat:', error);
        Alert.alert('Error', 'Failed to archive chat');
      }
    },
    [spaceChatRepo, reload],
  );

  // Hard delete handler
  const handleDeleteChat = useCallback(
    (chatId: string) => {
      Alert.alert('Delete chat?', 'This will permanently remove the chat and all its messages.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const backend = process.env.EXPO_PUBLIC_REPO_BACKEND || 'memory';
              if (backend === 'supabase' && spaceChatRepo instanceof SupabaseSpaceChatRepo) {
                await spaceChatRepo.delete(chatId);
              } else {
                // Memory repo: mimic hard delete by archiving (existing behavior)
                await spaceChatRepo.delete(chatId);
              }
              await reload();
            } catch (error) {
              console.error('Failed to delete chat:', error);
              Alert.alert('Error', 'Failed to delete chat');
            }
          },
        },
      ]);
    },
    [spaceChatRepo, reload],
  );

  // Compute preview data using selectors
  const weekStart = formatISO(startOfWeek(new Date()), { representation: 'date' });
  const habits = listHabitsForSpace(items, spaceId, { limit: 3 });
  const todos = listTodosForSpace(items, spaceId, { limit: 3 });
  const notes = listNotesForSpace(items, spaceId, { limit: 5 });
  const journals = listNotesForSpace(items, spaceId, { subtype: 'journal', limit: 3 });
  const journalCount = countJournalForSpace(items, spaceId);

  // Phase 10.8: Space Insight action handlers
  const handleSaveInsightAsNote = useCallback(async () => {
    if (!spaceInsight) return;

    try {
      await repo.create({
        type: 'note',
        title: 'Conversation Summary',
        body: spaceInsight.summary,
        subtype: 'reference',
        space_id: spaceId,
        ai_placed: true,
        origin: 'catchall',
      });

      Alert.alert('Success', 'Summary saved as note');
      // Refresh to show new note
      await reload();
    } catch (error) {
      console.error('Failed to save insight as note:', error);
      Alert.alert('Error', 'Failed to save note');
    }
  }, [spaceInsight, spaceId, repo, reload]);

  // Compute AI summaries for visible chats (top 3)
  useEffect(() => {
    const run = async () => {
      try {
        const backend = process.env.EXPO_PUBLIC_REPO_BACKEND || 'memory';
        if (backend !== 'supabase' || !userId) return;
        const msgRepo = new SupabaseSpaceChatMessageRepo(userId);
        const subset = chats.slice(0, 3);
        const entries = await Promise.all(
          subset.map(async (c) => {
            const msgs = await msgRepo.list(c.id);
            const summary = await summarizeChatForCard(c.id, msgs);
            return [c.id, summary] as const;
          }),
        );
        setAiSummaries((prev) => {
          const next = { ...prev };
          for (const [id, s] of entries) next[id] = s;
          return next;
        });
      } catch {
        // ignore summarization errors in UI
      }
    };
    run();
  }, [chats, userId]);

  const handleAddInsightTodos = useCallback(() => {
    if (!spaceInsight) return;
    Alert.alert('Add Next Step', 'This will open the quick add overlay', [
      { text: 'OK', onPress: () => console.log('[10.8] TODO: Open unified overlay for todos') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [spaceInsight]);

  if (loading && !space) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={T.colors.primary} />
      </View>
    );
  }

  if (!space) {
    return (
      <View style={styles.error}>
        <Text style={styles.errorText}>Space not found</Text>
      </View>
    );
  }

  // New: Space v33 gated layout
  if (isSpaceV33) {
    if (__DEV__) {
      console.log('[SpaceHome] render v33');
      console.log(
        '[SpaceHome v33] space?',
        !!space,
        'items:',
        items.length,
        'chats:',
        chats.length,
      );
      console.log('[SpaceHome v33] title:', space?.name ?? 'Space');
    }
    return (
      <View style={[styles.container, { backgroundColor: T.colors.bg }]}>
        <Animated.View style={{ flex: 1, opacity: oV33, transform: [{ translateY: yV33 }] }}>
          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: T.spacing[6] }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          >
            <HeaderV33
              title={space?.name ?? 'Space'}
              lastVisited={buildLastVisitedLabel(items, chats)}
              wittyLine={v33WittyLine}
              mood={v33Mood}
            />

            {/* Slide-down search overlay under header */}
            <SearchOverlayV33
              visible={searchVisible}
              onClose={() => setSearchVisible(false)}
              spaceId={spaceId}
              onOpenChat={(chatId) => {
                setSearchVisible(false);
                navigation.navigate('ChatThread', { spaceId, chatId });
              }}
              onOpenNote={(noteId) => {
                setSearchVisible(false);
                const note = items.find((it: any) => it.id === noteId);
                if (note) overlay.openEdit({ record: note as any, spaceId });
              }}
              onOpenHabit={(habitId) => {
                setSearchVisible(false);
                const habit = items.find((it: any) => it.id === habitId);
                if (habit) overlay.openEdit({ record: habit as any, spaceId });
              }}
            />

            {/* Goals Zone: wraps IconRow and Goals with Sage tint background */}
            <GoalsZone>
              {/* Centered icon row */}
              <IconRowV33
                counts={{
                  notes: notesCount,
                  milestones: (upcoming || []).length,
                }}
                onOpenNotepad={() => setShowNotepad(true)}
                onOpenCalendar={() => setShowCalendarV33(true)}
                onAdd={() => setShowUnifiedAdd(true)}
                onOpenSearch={() => setSearchVisible(true)}
              />

              {/* Goals: expandable GoalList with See All / Show Less */}
              {(() => {
                const wk = weekly?.habits || [];
                if (!wk.length) return <GoalPlaceholder />;
                const byId = new Map<string, any>((items as any[]).map((r: any) => [r.id, r]));
                const goals = wk.map((row) => {
                  const rec = byId.get(row.id);
                  const done = row.doneCount ?? 0;
                  const target = row.target ?? 3;
                  const state: 'idle' | 'active' | 'complete' =
                    done >= target && target > 0 ? 'complete' : done > 0 ? 'active' : 'idle';
                  return {
                    id: row.id,
                    title: (rec?.title || rec?.name || 'Habit') as string,
                    subtitle: `${done}/${target} this week`,
                    state,
                    lastActivityAt: (rec?.updated_at as string) || null,
                    createdAt: (rec?.created_at as string) || null,
                    pinned: !!rec?.pinned,
                  } as const;
                });
                return (
                  <GoalListV33
                    goals={goals as any}
                    topN={3}
                    persistKey={`goalList:expanded:${spaceId}`}
                    totalCountLabel={(n) => `See All Goals (${n})`}
                    onOpen={(id) => {
                      console.log('[SpaceHome] Goal clicked:', id);
                      const rec = (items as any[]).find((r) => r.id === id);
                      console.log('[SpaceHome] Found record:', rec ? rec.type : 'NOT FOUND');
                      if (rec) {
                        console.log('[SpaceHome] Navigating to Hub to edit habit');
                        // Navigate to Hub with the habit pre-selected for editing
                        (navigation as any).navigate('Hub', {
                          initialTab: 'Habits',
                          highlightId: id,
                        });
                      }
                    }}
                    onMenu={() => {}}
                  />
                );
              })()}
            </GoalsZone>

            {/* Chat CTA */}
            {(() => {
              // Calculate inactivity days for sparkle
              const lastChatTs = chats.reduce(
                (acc, c) => Math.max(acc, new Date(c.updated_at).getTime()),
                0,
              );
              const lastItemTs = items.reduce((acc, it: any) => {
                const ts = new Date(it.updated_at || it.created_at || 0).getTime();
                return Math.max(acc, ts);
              }, 0);
              const lastTs = Math.max(lastChatTs, lastItemTs);
              const daysSince = lastTs
                ? Math.floor((Date.now() - lastTs) / (1000 * 60 * 60 * 24))
                : 999;
              return (
                <NewChatSectionV33
                  spaceName={space?.name ?? 'this space'}
                  inactiveDays={daysSince}
                  onPress={handleNewChat}
                />
              );
            })()}

            {/* Recent Chats (last 3) */}
            {(() => {
              const list = chats.slice(0, 3);
              if (list.length === 0)
                return (
                  <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
                    <Text style={{ color: T.colors.subtle }}>
                      No conversations yet — want to ask Gremly something?
                    </Text>
                  </View>
                );
              return (
                <View style={{ paddingHorizontal: 16, marginTop: 16, gap: 10 }}>
                  {list.map((c) => (
                    <ThreadCardV33
                      key={c.id}
                      chat={c}
                      onPress={(chatId) => navigation.navigate('ChatThread', { spaceId, chatId })}
                      onRename={handleRenameChat}
                      onDelete={handleDeleteChat}
                    />
                  ))}
                </View>
              );
            })()}
          </ScrollView>
        </Animated.View>

        {/* Micro celebration overlay */}
        <ConfettiBurst
          visible={showConfetti}
          durationMs={350}
          onComplete={() => setShowConfetti(false)}
        />
        {/* Calendar overlay (v33) */}
        <CalendarOverlayV33
          visible={showCalendarV33}
          onClose={() => setShowCalendarV33(false)}
          spaceId={spaceId}
          spaceName={space?.name || 'Space'}
          days={(timelineDays || []) as any}
          selectedISO={selectedDayISO}
          onSelectDate={(iso: string) => {
            setSelectedDayISO(iso);
          }}
          onAddMilestone={() => {
            overlay.openCreate({
              spaceId,
              conversionMeta: { initialTitle: 'Milestone' },
            });
          }}
          onEditItem={(id: string) => {
            const rec = (items as any[]).find((r) => r.id === id);
            if (rec) overlay.openEdit({ record: rec, spaceId });
          }}
          onToggleTodoPause={async (id: string) => {
            const rec = (items as any[]).find((r) => r.id === id);
            if (!rec) return;
            try {
              const paused = !!rec.undefined_due || !rec.due_date;
              const patch: any = {};
              if (paused) {
                // Resume: set due_date to today and clear undefined_due
                patch.due_date = formatISO(new Date(), { representation: 'date' });
                patch.undefined_due = false;
              } else {
                // Pause: unset due_date and mark undefined_due
                patch.due_date = null;
                patch.undefined_due = true;
              }
              await repo.update({ id, patch });
              await reload();
            } catch (e) {
              console.warn('[v33] toggle todo pause failed', e);
            }
          }}
          onDeleteItem={async (id: string) => {
            try {
              await repo.remove(id);
              await reload();
            } catch (e) {
              console.warn('[v33] delete item failed', e);
            }
          }}
          onViewChatContext={async () => {
            try {
              const backend = process.env.EXPO_PUBLIC_REPO_BACKEND || 'memory';
              const chatRepo =
                backend === 'supabase'
                  ? new SupabaseSpaceChatRepo(userId || undefined)
                  : new MemorySpaceChatRepo(userId || 'anonymous');
              const list = await chatRepo.list(spaceId).catch(() => []);
              const chat = list[0] || (await chatRepo.create(spaceId, { title: 'General' }));
              navigation.navigate('ChatThread', { spaceId, chatId: chat.id } as any);
            } catch (e) {
              console.warn('[v33] view chat context (overlay) failed', e);
            }
          }}
        />
        {/* Notepad overlay (v33) */}
        <NotepadOverlayV33
          spaceId={spaceId}
          isOpen={showNotepad}
          onClose={() => setShowNotepad(false)}
        />
        {/* Unified Add overlay (v33) - Space-locked create */}
        <UnifiedAddOverlay
          isOpen={showUnifiedAdd}
          onClose={() => setShowUnifiedAdd(false)}
          space={{ id: spaceId, name: space?.name || 'Space' }}
        />
        {/* Edit Goal modal (v33) */}
        {editGoalRecord && (
          <EditGoalModal
            visible={editGoalVisible}
            onClose={() => setEditGoalVisible(false)}
            record={editGoalRecord as any}
            onSaved={async () => {
              await reload();
            }}
          />
        )}
        {/* Rename Chat modal (v33) */}
        <RenameChatModal
          isOpen={renameChatModalOpen}
          onClose={() => setRenameChatModalOpen(false)}
          initialTitle={renameChatTitle}
          onSubmit={handleRenameChatSubmit}
        />
      </View>
    );
  }

  if (!isSpaceV3) {
    if (__DEV__) console.log('[SpaceHome] render legacy (not v3)');
    // Legacy stacked layout fallback
    return (
      <View style={[styles.container, { backgroundColor: T.colors.bg }]}>
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: T.spacing[6] }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        >
          <SpaceBanner space={space} />
          <View style={[styles.content, { padding: T.spacing[4] }]}>
            <Text style={styles.sectionTitle}>Chats</Text>
            {chats.length === 0 ? (
              <View style={styles.emptyChats}>
                <Text style={styles.emptyChatsTitle}>No chats yet</Text>
                <Text style={styles.emptyChatsText}>
                  Start a conversation with Gremly to plan, reflect, and track progress.
                </Text>
                <TouchableOpacity onPress={handleNewChat} accessibilityRole="button">
                  <Text style={{ color: T.colors.primary, fontWeight: '600' }}>New chat</Text>
                </TouchableOpacity>
              </View>
            ) : (
              chats
                .slice(0, 5)
                .map((chat) => (
                  <ChatCard
                    key={chat.id}
                    chat={chat}
                    onPress={() => handleChatPress(chat.id)}
                    onPin={handlePinChat}
                    onUnpin={handleUnpinChat}
                    onRename={handleRenameChatV22}
                    onArchive={handleArchiveChat}
                    onDelete={handleDeleteChat}
                    aiSummary={aiSummaries[chat.id] || chat.last_message_snippet || 'Tap to view'}
                  />
                ))
            )}

            <View style={{ height: T.spacing[4] }} />
            <Text style={styles.sectionTitle}>Habits</Text>
            {habits.slice(0, 5).map((h) => (
              <Text key={h.id} style={{ color: T.colors.text, marginBottom: 8 }}>
                {h.name}
              </Text>
            ))}

            <View style={{ height: T.spacing[4] }} />
            <Text style={styles.sectionTitle}>To-Dos</Text>
            {todos.slice(0, 5).map((t) => (
              <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: T.colors.text, flex: 1 }}>{t.name}</Text>
                <TouchableOpacity
                  accessibilityLabel={`Complete to-do '${t.name}'`}
                  accessibilityRole="button"
                  onPress={async () => {
                    try {
                      await repo.completeTodo(t.id, new Date().toISOString());
                      setShowConfetti(true);
                      await reload();
                    } catch (e) {
                      console.warn('Failed to complete todo', e);
                    }
                  }}
                >
                  <Text style={{ color: T.colors.primary }}>✓</Text>
                </TouchableOpacity>
              </View>
            ))}

            <View style={{ height: T.spacing[4] }} />
            <Text style={styles.sectionTitle}>Notes</Text>
            {notes.slice(0, 5).map((n) => (
              <Text key={n.id} style={{ color: T.colors.text, marginBottom: 8 }}>
                {n.title}
              </Text>
            ))}
          </View>
        </ScrollView>

        {/* Floating FAB removed in v3.3; use IconRow + button actions instead */}

        {/* Micro celebration overlay */}
        <ConfettiBurst
          visible={showConfetti}
          durationMs={350}
          onComplete={() => setShowConfetti(false)}
        />
      </View>
    );
  }

  // (moved above)

  // (effect moved above to satisfy hooks rules)

  return (
    <View style={[styles.container, { backgroundColor: T.colors.bg }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: T.spacing[6] }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Header: v22 Moss band or existing v4 minimal band */}
        {isSpaceV22 ? (
          <HeaderV22
            title={space?.name ?? 'Space'}
            lastVisited={buildLastVisitedLabel(items, chats)}
            contextLine={headerMood}
            onBack={() => navigation.goBack()}
            onSearch={handleSearchPress}
            onSettings={() => Alert.alert('Settings', 'Coming soon')}
            mascotState={headerMascot}
            spaceId={spaceId}
          />
        ) : (
          <View
            style={{
              backgroundColor: lightTokens.colors.mossGreen,
              paddingHorizontal: 16,
              paddingTop: 16,
              paddingBottom: 16,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                accessibilityLabel="Back"
                accessibilityRole="button"
              >
                <Text style={{ color: lightTokens.colors.linenCream, fontSize: 18 }}>‹</Text>
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text
                  style={{
                    color: lightTokens.colors.linenCream,
                    fontSize: 20,
                    fontWeight: '700',
                  }}
                  numberOfLines={1}
                >
                  {space?.name ?? 'Space'}
                </Text>
                <Text
                  style={{ color: lightTokens.colors.sageMist, fontSize: 12, marginTop: 2 }}
                  numberOfLines={1}
                >
                  {buildLastVisitedLabel(items, chats)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity onPress={handleSearchPress} accessibilityRole="button">
                  <SearchIcon color={lightTokens.colors.linenCream} size={18} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => Alert.alert('Settings', 'Coming soon')}
                  accessibilityRole="button"
                >
                  <SettingsIcon color={lightTokens.colors.linenCream} size={18} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Week strip (v22) */}
        {isSpaceV22 && (
          <Animated.View style={{ paddingHorizontal: 16, marginTop: 24, opacity: oWeek }}>
            <WeekStripV22
              days={(() => {
                const todayISO = formatISO(new Date(), { representation: 'date' });
                return (timelineDays || []).map((d) => ({
                  dateISO: d.dateISO,
                  isActive: d.dateISO === todayISO,
                  isSelected: d.dateISO === selectedDayISO,
                  hasItems: (d.items?.length ?? 0) > 0,
                }));
              })()}
              onSelect={setSelectedDayISO}
              onOpenTimeline={() => setShowTimeline(true)}
            />
          </Animated.View>
        )}

        {/* Focus Today Card (v22) */}
        {isSpaceV22 && !focusDismissed && (
          <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
            {(() => {
              const todayISO = formatISO(new Date(), { representation: 'date' });
              const day = (timelineDays || []).find((d) => d.dateISO === todayISO);
              const actionable = (day?.items || []).filter(
                (it) => (it.type === 'habit' || it.type === 'todo') && !it.done,
              );
              const first = actionable[0]?.title;
              const second = actionable[1]?.title;
              const countHabits = (day?.items || []).filter(
                (it) => it.type === 'habit' && !it.done,
              ).length;
              const countTodos = (day?.items || []).filter(
                (it) => it.type === 'todo' && !it.done,
              ).length;
              const total = countHabits + countTodos;

              if (total > 0) {
                const summary = `You’ve got ${countHabits} habit${
                  countHabits === 1 ? '' : 's'
                } and ${countTodos} to-do${countTodos === 1 ? '' : 's'} today — start with ${
                  first || 'the first task'
                }${second ? ` or ${second}` : ''}?`;
                return (
                  <FocusTodayCard
                    summary={summary}
                    mode="action"
                    onPrimary={() => {
                      // Ensure today is selected
                      setSelectedDayISO(todayISO);
                    }}
                    onSecondary={async () => {
                      try {
                        const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                        const key = `focusCard:dismiss:${spaceId}:${todayISO}`;
                        await AsyncStorage.setItem(key, until);
                        setFocusDismissed(true);
                      } catch {
                        setFocusDismissed(true);
                      }
                    }}
                  />
                );
              }

              const summary = 'All calm here — want to set an intention for the day?';
              return (
                <FocusTodayCard
                  summary={summary}
                  mode="reflect"
                  onPrimary={() => {
                    setIntentDraft('Today, I intend to…');
                    setShowNotepad(true);
                  }}
                  onSecondary={async () => {
                    try {
                      const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                      const key = `focusCard:dismiss:${spaceId}:${todayISO}`;
                      await AsyncStorage.setItem(key, until);
                      setFocusDismissed(true);
                    } catch {
                      setFocusDismissed(true);
                    }
                  }}
                />
              );
            })()}
          </View>
        )}

        {/* Weekly Goal (v22): show for the first habit in the selected day, driven by aggregate.weekly */}
        {isSpaceV22 && (
          <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
            {(() => {
              const day = (timelineDays || []).find((d) => d.dateISO === selectedDayISO);
              const habitsToday = (day?.items || []).filter((it) => it.type === 'habit');
              if (!habitsToday.length) return null;
              const firstHabit = habitsToday[0];
              const weeklyRow = (weekly?.habits || []).find((h) => h.id === firstHabit.id);
              const weeklyDone = weeklyRow?.doneCount ?? 0;
              const target = weeklyRow?.target ?? 3; // default weekly target (Phase v22)
              const title = `${firstHabit.title} ${target}×/week`;
              return (
                <WeeklyGoalCard
                  title={title}
                  done={weeklyDone}
                  target={target}
                  onOpenDetail={() => {
                    // Open overlay to edit this habit as a placeholder for habit detail
                    const rec = (items as any[]).find((r) => r.id === firstHabit.id);
                    if (rec) {
                      overlay.openEdit({ record: rec, spaceId });
                    } else {
                      Alert.alert('Habit', 'Detail screen coming soon');
                    }
                  }}
                />
              );
            })()}
          </View>
        )}

        {isSpaceV22 && (
          <Animated.View
            style={{ paddingHorizontal: 16, marginTop: 24, opacity: oDay }}
            onLayout={(e) => setDayPanelY(e.nativeEvent.layout.y)}
          >
            <DayPanelV22
              dateISO={selectedDayISO}
              habits={(() => {
                const day = (timelineDays || []).find((d) => d.dateISO === selectedDayISO);
                const habits = (day?.items || []).filter((it) => it.type === 'habit');
                return habits.map((h) => ({
                  id: h.id,
                  title: h.title,
                  // With no per-day completions history, approximate: done -> 1/3 else 0/3
                  doneCount: h.done ? 1 : 0,
                  target: 3,
                }));
              })()}
              todos={(() => {
                const day = (timelineDays || []).find((d) => d.dateISO === selectedDayISO);
                const todos = (day?.items || []).filter((it) => it.type === 'todo');
                return todos.map((t) => ({ id: t.id, title: t.title, done: !!t.done }));
              })()}
              onAddItem={() => {
                // Pre-fill space; due date prefill not yet supported by overlay API
                // We can thread the intended date via initialTitle to hint the user
                const friendly = new Date(selectedDayISO).toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                });
                overlay.openCreate({
                  spaceId,
                  conversionMeta: {
                    initialTitle: `Task for ${friendly}`,
                    initialDueDate: selectedDayISO,
                  },
                });
              }}
              onToggleHabit={async (id) => {
                try {
                  // Guard: prevent rapid double toggles for same habit+date
                  const guardKey = `habit:${id}:${selectedDayISO}`;
                  if ((SpaceHomeScreen as any)._inflight?.has(guardKey)) return;
                  (SpaceHomeScreen as any)._inflight =
                    (SpaceHomeScreen as any)._inflight || new Set<string>();
                  (SpaceHomeScreen as any)._inflight.add(guardKey);
                  // Find current state
                  const day = (timelineDays || []).find((d) => d.dateISO === selectedDayISO);
                  const h = day?.items.find((it) => it.type === 'habit' && it.id === id);
                  if (h?.done) {
                    await repo.undoCompletion(id);
                  } else {
                    await repo.completeHabit(id, new Date().toISOString());
                    // Idempotency event for logging
                    try {
                      await repo.writeEvent('habit_log', {
                        space_id: spaceId,
                        habit_id: id,
                        date: selectedDayISO,
                        idempotency_key: `${userId || 'anon'}:${id}:${selectedDayISO}:toggle`,
                      });
                    } catch (e) {
                      // Non-blocking analytics/idempotency event failure
                      console.debug('[v22] habit_log event write failed (non-blocking)', e);
                    }
                    // Micro feedback: short confetti + Undo snackbar
                    setShowConfetti(true);
                    setHeaderMascot('proud');
                    setTimeout(() => setHeaderMascot('calm'), 800);
                    showUndoSnackbar('Marked habit complete', async () => {
                      try {
                        await repo.undoCompletion(id);
                        await Promise.all([reload(), reloadTimeline()]);
                      } catch (e) {
                        console.warn('[v22] undo habit failed', e);
                      }
                    });
                  }
                  await Promise.all([reload(), reloadTimeline()]);
                  (SpaceHomeScreen as any)._inflight.delete(guardKey);
                } catch (e) {
                  console.warn('[v22] toggle habit failed', e);
                  try {
                    (SpaceHomeScreen as any)._inflight.delete(`habit:${id}:${selectedDayISO}`);
                  } catch (e2) {
                    // Ensure inflight guard is cleared even if Set.delete throws
                    console.debug('[v22] inflight guard cleanup failed (habit)', e2);
                  }
                }
              }}
              onToggleTodo={async (id) => {
                try {
                  const guardKey = `todo:${id}:${selectedDayISO}`;
                  if ((SpaceHomeScreen as any)._inflight?.has(guardKey)) return;
                  (SpaceHomeScreen as any)._inflight =
                    (SpaceHomeScreen as any)._inflight || new Set<string>();
                  (SpaceHomeScreen as any)._inflight.add(guardKey);
                  const day = (timelineDays || []).find((d) => d.dateISO === selectedDayISO);
                  const t = day?.items.find((it) => it.type === 'todo' && it.id === id);
                  if (t?.done) {
                    await repo.undoCompletion(id);
                  } else {
                    await repo.completeTodo(id, new Date().toISOString());
                    try {
                      await repo.writeEvent('todo_log', {
                        space_id: spaceId,
                        todo_id: id,
                        date: selectedDayISO,
                        idempotency_key: `${userId || 'anon'}:${id}:${selectedDayISO}:toggle`,
                      });
                    } catch (e) {
                      // Non-blocking analytics/idempotency event failure
                      console.debug('[v22] todo_log event write failed (non-blocking)', e);
                    }
                  }
                  await Promise.all([reload(), reloadTimeline()]);
                  if (!t?.done) {
                    // Micro feedback: short confetti + Undo snackbar
                    setShowConfetti(true);
                    setHeaderMascot('proud');
                    setTimeout(() => setHeaderMascot('calm'), 800);
                    showUndoSnackbar('Marked to-do complete', async () => {
                      try {
                        await repo.undoCompletion(id);
                        await Promise.all([reload(), reloadTimeline()]);
                      } catch (e) {
                        console.warn('[v22] undo todo failed', e);
                      }
                    });
                  }
                  (SpaceHomeScreen as any)._inflight.delete(guardKey);
                } catch (e) {
                  console.warn('[v22] toggle todo failed', e);
                  try {
                    (SpaceHomeScreen as any)._inflight.delete(`todo:${id}:${selectedDayISO}`);
                  } catch (e2) {
                    // Ensure inflight guard is cleared even if Set.delete throws
                    console.debug('[v22] inflight guard cleanup failed (todo)', e2);
                  }
                }
              }}
            />
          </Animated.View>
        )}

        {isSpaceV22 && (
          <Animated.View
            style={{
              paddingHorizontal: 16,
              marginTop: 24,
              opacity: oCTA,
              transform: [{ translateY: yCTA }],
            }}
          >
            <NewChatCTA onPress={handleNewChat} />
          </Animated.View>
        )}

        {isSpaceV22 && (
          <Animated.View
            style={{
              paddingHorizontal: 16,
              marginTop: 24,
              opacity: oSummary,
              transform: [{ translateY: ySummary }],
            }}
          >
            <AdaptiveSummaryV22
              mode="reflective"
              intent={intent}
              nextItem={nextItem ?? undefined}
              spaceName={space?.name}
              onSecondary={handleSaveInsightAsNote}
              onPrimary={handleAddInsightTodos}
            />
          </Animated.View>
        )}

        {isSpaceV22 && (
          <Animated.View
            style={{
              paddingHorizontal: 16,
              marginTop: 24,
              opacity: oInsights,
              transform: [{ translateY: yInsights }],
            }}
          >
            <InsightsRow
              onOpenNotepad={() => setShowNotepad(true)}
              onOpenPeople={() => setShowPeople(true)}
              onOpenTimeline={() => setShowTimeline(true)}
            />
          </Animated.View>
        )}

        {isSpaceV22 && (
          <Animated.View
            style={{
              paddingHorizontal: 16,
              marginTop: 24,
              opacity: oThreads,
              transform: [{ translateY: yThreads }],
            }}
          >
            <Text style={{ fontWeight: '700', fontSize: 16, color: T.colors.text }}>
              Recent chats
            </Text>
            <View style={{ height: 10 }} />
            <View style={{ gap: 10 }}>
              {chats.slice(0, 3).map((c) => (
                <ThreadCard
                  key={c.id}
                  title={c.title}
                  snippet={aiSummaries[c.id] || c.last_message_snippet || 'Tap to view'}
                  lastActive={new Date(c.updated_at).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                  onOpen={() => handleChatPress(c.id)}
                  onMenu={() => {}}
                  onArchive={async () => {
                    try {
                      const backend = process.env.EXPO_PUBLIC_REPO_BACKEND || 'memory';
                      if (
                        backend === 'supabase' &&
                        spaceChatRepo instanceof SupabaseSpaceChatRepo
                      ) {
                        await spaceChatRepo.archive(c.id);
                      } else {
                        await spaceChatRepo.delete(c.id);
                      }
                      await reload();
                    } catch (e) {
                      console.warn('Archive chat failed', e);
                      Alert.alert('Error', 'Failed to archive chat');
                    }
                  }}
                  onDelete={async () => {
                    try {
                      const backend = process.env.EXPO_PUBLIC_REPO_BACKEND || 'memory';
                      if (
                        backend === 'supabase' &&
                        spaceChatRepo instanceof SupabaseSpaceChatRepo
                      ) {
                        await spaceChatRepo.delete(c.id);
                      } else {
                        await spaceChatRepo.delete(c.id);
                      }
                      await reload();
                    } catch (e) {
                      console.warn('Delete chat failed', e);
                      Alert.alert('Error', 'Failed to delete chat');
                    }
                  }}
                />
              ))}
            </View>
          </Animated.View>
        )}

        {/* Collapsible search bar (legacy) removed in favor of v22 Search overlay */}

        <View style={[styles.content, { padding: T.spacing[4] }]}>
          {/* Focus card */}
          <FocusCard
            spaceType={
              listHabitsForSpace(items, spaceId, { limit: 1 }).length > 0 ? 'habit' : 'other'
            }
            summaryText={buildFocusText(
              listHabitsForSpace(items, spaceId, { limit: 1 }).length,
              upcoming,
              todos,
            )}
            onPress={() => {}}
          />

          {/* Calendar snapshot */}
          <View style={{ marginTop: 24 }}>
            <CalendarStrip days={buildCalendarDays(items)} />
          </View>

          {/* Quick stats (non-zero only) */}
          <View style={{ marginTop: 24 }}>
            <QuickStatsRow
              habitsCount={listHabitsForSpace(items, spaceId, { limit: 9999 }).length}
              todosCount={listTodosForSpace(items, spaceId, { limit: 9999 }).length}
              notesCount={listNotesForSpace(items, spaceId, { limit: 9999 }).length}
              journalCount={
                listNotesForSpace(items, spaceId, { subtype: 'journal', limit: 9999 }).length
              }
            />
          </View>

          {/* Primary CTA + What we discussed moved to v22 blocks above */}

          {/* Recent chats list de-duplicated; see v22 section above */}
        </View>
      </ScrollView>

      {/* Micro celebration overlay */}
      <ConfettiBurst
        visible={showConfetti}
        durationMs={350}
        onComplete={() => setShowConfetti(false)}
      />
      {/* Timeline overlay (v22) */}
      <TimelineOverlay
        visible={showTimeline}
        onClose={() => setShowTimeline(false)}
        spaceId={spaceId}
        onSelectDate={(iso) => {
          setSelectedDayISO(iso);
          setShowTimeline(false);
        }}
      />
      {/* Notepad overlay (v22) */}
      <NotepadOverlay
        visible={showNotepad}
        onClose={() => setShowNotepad(false)}
        spaceId={spaceId}
        initialDraft={intentDraft}
      />
      {/* People overlay (v22) */}
      <PeopleOverlay visible={showPeople} onClose={() => setShowPeople(false)} spaceId={spaceId} />

      {/* Floating Plus removed in v3.3; v22 FAB retired */}

      {/* Sage toast for unsorted items */}
      {showUnsortedToast && (
        <Animated.View
          style={{
            position: 'absolute',
            bottom: 96,
            alignSelf: 'center',
            backgroundColor: V22.Sage,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 10,
            opacity: unsortedOpacity,
          }}
        >
          <Text style={{ color: '#153326', fontWeight: '700' }}>
            1 unsorted item waiting in {space?.name || 'this Space'}.
          </Text>
        </Animated.View>
      )}

      {/* Undo snackbar (Sage) */}
      {showUndoToast && (
        <Animated.View
          style={{
            position: 'absolute',
            bottom: 140,
            alignSelf: 'center',
            backgroundColor: V22.Sage,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            opacity: undoOpacity,
          }}
        >
          <Text style={{ color: '#153326', fontWeight: '700' }}>{undoText}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Undo completion"
            onPress={async () => {
              const fn = undoHandlerRef.current;
              setShowUndoToast(false);
              if (fn) {
                try {
                  await fn();
                } catch (e) {
                  console.warn('[v22] undo action failed', e);
                }
              }
            }}
          >
            <Text style={{ color: V22.Deep, fontWeight: '800' }}>Undo</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Unified Overlay for creating/editing habits, todos, notes, people */}
      <UnifiedCreateOverlay
        visible={overlay.state.visible}
        mode={overlay.state.mode}
        initialEntity={overlay.state.initialEntity}
        initialSpaceId={overlay.state.initialSpaceId}
        conversionMeta={overlay.state.conversionMeta}
        onClose={overlay.close}
        onSave={async () => {
          // Refresh space data after save
          await reload();
          await reloadTimeline();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightTokens.colors.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: lightTokens.spacing[6], // will be overridden with token variable at runtime
  },
  content: {
    padding: lightTokens.spacing[4],
  },
  section: {
    marginBottom: lightTokens.spacing[4],
  },
  archivedBanner: {
    backgroundColor: '#FF9500', // Orange warning color
    padding: lightTokens.spacing[3],
    borderRadius: lightTokens.radius[2],
    marginBottom: lightTokens.spacing[4],
    alignItems: 'center',
  },
  archivedBannerText: {
    color: '#FFFFFF',
    fontSize: lightTokens.typography.size.sm,
    fontWeight: '600',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: lightTokens.colors.bg,
  },
  error: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: lightTokens.colors.bg,
  },
  errorText: {
    fontSize: lightTokens.typography.size.lg,
    color: lightTokens.colors.danger,
  },
  emptyChats: {
    padding: lightTokens.spacing[5],
    alignItems: 'center',
    backgroundColor: lightTokens.colors.surface,
    borderRadius: lightTokens.radius[3],
    marginTop: lightTokens.spacing[3],
    borderWidth: 1,
    borderColor: lightTokens.colors.border,
  },
  emptyChatsTitle: {
    fontSize: lightTokens.typography.size.md,
    fontWeight: '600',
    color: lightTokens.colors.text,
    marginBottom: lightTokens.spacing[2],
    textAlign: 'center',
  },
  emptyChatsText: {
    fontSize: lightTokens.typography.size.sm,
    color: lightTokens.colors.subtle,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: lightTokens.spacing[4],
  },
  sectionTitle: {
    fontSize: lightTokens.typography.size.lg,
    fontWeight: '600',
    color: lightTokens.colors.text,
    marginBottom: lightTokens.spacing[3],
  },
  // FAB styles removed with v3.3 icon row
});

// Helpers
function computeLastTimeText(items: AppRecord[], chats: SpaceChat[]): string {
  const lastChatTs = chats.reduce((acc, c) => Math.max(acc, new Date(c.updated_at).getTime()), 0);
  const lastItemTs = items.reduce((acc, it: any) => {
    const ts = new Date(it.updated_at || it.created_at || 0).getTime();
    return Math.max(acc, ts);
  }, 0);
  const lastTs = Math.max(lastChatTs, lastItemTs);
  if (!lastTs) return 'Last time you were here, we set things up. Ready to explore?';
  const d = new Date(lastTs);
  return `Last time you were here on ${d.toLocaleDateString()}.`;
}

// Build concise one-line summary
function buildSummaryHeadline(
  email: string,
  chatsActive: number,
  habitsCompleted: number,
  habitsTotal: number,
): string {
  const first = deriveFirstName(email);
  const base = `${first}, ${chatsActive} chats this week — ${habitsCompleted}/${habitsTotal} habits done.`;
  return base.replace(/\s+/g, ' ').trim().slice(0, 110);
}

function deriveFirstName(email: string): string {
  if (!email) return 'You';
  const namePart = email.split('@')[0] || 'You';
  const cleaned = namePart.replace(/[._-]+/g, ' ');
  const cap = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return cap || 'You';
}

// v4 helpers
function buildLastVisitedLabel(items: AppRecord[], chats: SpaceChat[]): string {
  const lastChatTs = chats.reduce((acc, c) => Math.max(acc, new Date(c.updated_at).getTime()), 0);
  const lastItemTs = items.reduce((acc, it: any) => {
    const ts = new Date(it.updated_at || it.created_at || 0).getTime();
    return Math.max(acc, ts);
  }, 0);
  const lastTs = Math.max(lastChatTs, lastItemTs);
  if (!lastTs) return 'Welcome — new space';
  const d = new Date(lastTs);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) return 'Last visited today';
  return `Last visited ${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`;
}

// v22 helpers
function buildMockWeek(selectedISO: string) {
  const start = startOfWeek(new Date());
  const todayISO = formatISO(new Date(), { representation: 'date' });
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    const iso = formatISO(d, { representation: 'date' });
    return {
      dateISO: iso,
      isActive: iso === todayISO,
      isSelected: iso === selectedISO,
      hasItems: false,
    };
  });
}

function buildFocusText(habitCount: number, upcoming: Array<{ id: string }>, todos: any[]): string {
  const parts: string[] = [];
  if (habitCount > 0) parts.push(`${habitCount} habit${habitCount > 1 ? 's' : ''}`);
  if (upcoming && upcoming.length > 0) parts.push(`${upcoming.length} upcoming`);
  if (todos && todos.length > 0) parts.push(`${todos.length} to-do${todos.length > 1 ? 's' : ''}`);
  if (parts.length === 0) return 'All clear — take a moment to reflect.';
  return parts.join(' • ');
}

function buildCalendarDays(items: AppRecord[]): Array<{
  date: Date;
  hasTodos?: boolean;
  hasNotes?: boolean;
  hasHabits?: boolean;
}> {
  const start = startOfWeek(new Date());
  const days = Array.from({ length: 7 }, (_v, i) => addDays(start, i));
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  return days.map((d) => {
    const hasTodos = items.some((it: any) => {
      if (it.type !== 'todo') return false;
      const due = it.due_date ? new Date(it.due_date) : null;
      const created = it.created_at ? new Date(it.created_at) : null;
      return (due && isSameDay(d, due)) || (created && isSameDay(d, created));
    });
    const hasNotes = items.some((it: any) => {
      if (it.type !== 'note') return false;
      const created = it.created_at ? new Date(it.created_at) : null;
      return created ? isSameDay(d, created) : false;
    });
    const hasHabits = items.some((it: any) => {
      if (it.type !== 'habit') return false;
      const created = it.created_at ? new Date(it.created_at) : null;
      return created ? isSameDay(d, created) : false;
    });
    return { date: d, hasTodos, hasNotes, hasHabits };
  });
}
