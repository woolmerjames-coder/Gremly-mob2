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
  Alert,
  RefreshControl,
  TouchableOpacity,
  useColorScheme,
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
import InsightsRow from '../../components/spaces/v22/InsightsRow';
import NotepadOverlay from '../../components/spaces/v22/Overlays/NotepadOverlay';
import PeopleOverlay from '../../components/spaces/v22/Overlays/PeopleOverlay';
import NewChatCTA from '../../components/spaces/v22/NewChatCTA';
import NewPlusFAB from '../../components/spaces/v22/NewPlusFAB';
import { COLORS as V22 } from '../../components/spaces/v22/_tokens';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import ThreadCard from '../../components/spaces/v22/ThreadCard';
import { useIsFocused } from '@react-navigation/native';
import ConfettiBurst from '../../components/ConfettiBurst';
import { Search as SearchIcon, Settings as SettingsIcon } from '../../components/icons';

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

  // State
  const { space, chats, items, stats, upcoming, reload } = useSpaceAggregate(spaceId);
  const [aiSummaries, setAiSummaries] = useState<Record<string, string>>({});
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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
  const [showNotepad, setShowNotepad] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const overlay = useUnifiedOverlayController();
  const [showUnsortedToast, setShowUnsortedToast] = useState(false);
  const unsortedOpacity = React.useMemo(() => new Animated.Value(0), []);

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
  const mockHabits = React.useMemo(
    () => [
      { id: 'h1', title: 'Running', doneCount: 2, target: 3 },
      { id: 'h2', title: 'Read', doneCount: 1, target: 4 },
    ],
    [],
  );
  const mockTodos = React.useMemo(
    () => [
      { id: 't1', title: 'Write 3 gratitude lines', done: false },
      { id: 't2', title: 'Email Alex about plan', done: true },
    ],
    [],
  );
  const mockThreads = React.useMemo(
    () => [
      {
        id: 'c1',
        title: 'Weekly planning',
        snippet: 'Outlined goals and focus areas for the week',
        lastActive: 'Yesterday',
      },
      {
        id: 'c2',
        title: 'Reflect on energy',
        snippet: 'Noted a mid-week dip; try earlier runs',
        lastActive: 'Tue',
      },
      {
        id: 'c3',
        title: 'Prep for meeting',
        snippet: 'Drafted agenda and next steps',
        lastActive: 'Mon',
      },
    ],
    [],
  );
  // moved above to include 'all'

  // Feature flag: Space v3 layout (robust parsing)
  const isSpaceV3 = (() => {
    const raw = (process.env.EXPO_PUBLIC_SPACE_V3 ?? 'on').toString().trim().toLowerCase();
    return raw === 'on' || raw === 'true' || raw === '1' || raw === 'enabled';
  })();
  // Feature flag: Space v22 header (strict equality as requested)
  const isSpaceV22 = process.env.EXPO_PUBLIC_SPACE_V22 === 'on';

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
  }, []);

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
    async (chatId: string) => {
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

  if (!isSpaceV3) {
    // Legacy stacked layout fallback
    return (
      <View style={[styles.container, { backgroundColor: T.colors.bg }]}>
        <ScrollView
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
                    onRename={handleRenameChat}
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

        {/* New chat floating button */}
        <View style={styles.fabContainer}>
          <TouchableOpacity
            style={[styles.fab, { backgroundColor: T.colors.primary }]}
            onPress={handleNewChat}
            disabled={!!space.archived_at}
            accessibilityLabel="Start new chat"
            accessibilityRole="button"
          >
            <Text style={[styles.fabIcon, { color: T.colors.onPrimary }]}>➕</Text>
          </TouchableOpacity>
        </View>

        {/* Micro celebration overlay */}
        <ConfettiBurst visible={showConfetti} onComplete={() => setShowConfetti(false)} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: T.colors.bg }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: T.spacing[6] }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Header: v22 Moss band or existing v4 minimal band */}
        {isSpaceV22 ? (
          <HeaderV22
            title={space?.name ?? 'Space'}
            lastVisited={buildLastVisitedLabel(items, chats)}
            onBack={() => navigation.goBack()}
            onSearch={handleSearchPress}
            onSettings={() => Alert.alert('Settings', 'Coming soon')}
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
          <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
            <WeekStripV22
              days={buildMockWeek(selectedDayISO)}
              onSelect={setSelectedDayISO}
              onOpenTimeline={() => setShowTimeline(true)}
            />
          </View>
        )}

        {isSpaceV22 && (
          <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
            <DayPanelV22
              dateISO={selectedDayISO}
              habits={mockHabits}
              todos={mockTodos}
              onToggleHabit={(id) => console.log('[v22] toggle habit', id)}
              onToggleTodo={(id) => console.log('[v22] toggle todo', id)}
            />
          </View>
        )}

        {isSpaceV22 && (
          <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
            <AdaptiveSummaryV22
              mode="reflective"
              text="Take a minute to reflect on one thing that felt good today. Capture a quick note so you can build on it tomorrow."
              onSecondary={() => console.log('[v22] summary later')}
              onPrimary={() => console.log('[v22] summary now')}
            />
          </View>
        )}

        {isSpaceV22 && (
          <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
            <InsightsRow
              onOpenNotepad={() => setShowNotepad(true)}
              onOpenPeople={() => setShowPeople(true)}
              onOpenTimeline={() => setShowTimeline(true)}
            />
          </View>
        )}

        {isSpaceV22 && (
          <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
            <NewChatCTA onPress={handleNewChat} />
          </View>
        )}

        {isSpaceV22 && (
          <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
            <Text style={{ fontWeight: '700', fontSize: 16, color: T.colors.text }}>
              Recent chats
            </Text>
            <View style={{ height: 10 }} />
            <View style={{ gap: 10 }}>
              {mockThreads.slice(0, 3).map((t) => (
                <ThreadCard
                  key={t.id}
                  title={t.title}
                  snippet={t.snippet}
                  lastActive={t.lastActive}
                  onOpen={() => console.log('[v22] open thread', t.id)}
                  onMenu={() => console.log('[v22] thread menu', t.id)}
                />
              ))}
            </View>
          </View>
        )}

        {/* Collapsible search bar */}
        {searchVisible && (
          <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
            <TextInput
              placeholder="Search this space"
              placeholderTextColor={T.colors.subtle}
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={{
                backgroundColor: lightTokens.colors.linenCream,
                borderColor: T.colors.border,
                borderWidth: 1,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 8,
                color: T.colors.text,
              }}
              accessibilityLabel="Search space"
              testID="space-search"
            />
          </View>
        )}

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

          {/* Primary CTA */}
          <View style={{ marginTop: 32 }}>
            <ChatCTA onPress={handleNewChat} disabled={!!space.archived_at} />
          </View>

          {/* Optional: What we discussed */}
          {spaceInsight && (
            <View style={{ marginTop: T.spacing[3] }}>
              <WhatWeDiscussedCard
                summary={spaceInsight.summary}
                onSaveAsNote={handleSaveInsightAsNote}
                onAddTodos={handleAddInsightTodos}
                lastUpdated={spaceInsight.summary_at}
              />
            </View>
          )}

          {/* Recent reflections (last 2 chats) */}
          <View style={{ marginTop: 32, gap: 12 }}>
            {chats.slice(0, 2).map((chat) => (
              <TouchableOpacity
                key={chat.id}
                onPress={() => handleChatPress(chat.id)}
                style={{
                  backgroundColor: lightTokens.colors.linenCream,
                  borderRadius: 10,
                  padding: 12,
                }}
                accessibilityLabel={`Open chat ${chat.title}`}
                accessibilityRole="button"
              >
                <Text style={{ color: T.colors.text, fontWeight: '600' }} numberOfLines={1}>
                  {chat.title}
                </Text>
                <Text style={{ color: T.colors.subtle }} numberOfLines={1}>
                  {aiSummaries[chat.id] || chat.last_message_snippet || 'Tap to view'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Micro celebration overlay */}
      <ConfettiBurst visible={showConfetti} onComplete={() => setShowConfetti(false)} />
      {/* Timeline overlay (v22) */}
      <TimelineOverlay visible={showTimeline} onClose={() => setShowTimeline(false)} />
      {/* Notepad overlay (v22) */}
      <NotepadOverlay visible={showNotepad} onClose={() => setShowNotepad(false)} />
      {/* People overlay (v22) */}
      <PeopleOverlay visible={showPeople} onClose={() => setShowPeople(false)} />

      {/* Floating Plus (v22) */}
      {isSpaceV22 && (
        <View style={{ position: 'absolute', right: 16, bottom: 24 }} pointerEvents="box-none">
          <NewPlusFAB
            onPress={() => {
              if (overlay.state.visible) {
                showSageToast();
                return;
              }
              overlay.openCreate({ spaceId });
            }}
          />
        </View>
      )}

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
            1 unsorted item waiting in this Space.
          </Text>
        </Animated.View>
      )}
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
  fabContainer: {
    position: 'absolute',
    bottom: 24,
    right: 24,
  },
  fab: {
    display: 'none',
  },
  fabIcon: {
    fontSize: 24,
    color: lightTokens.colors.onPrimary,
  },
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
  if (parts.length === 0) return 'Nothing urgent — breathe and reflect.';
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
