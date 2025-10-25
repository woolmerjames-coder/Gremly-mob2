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
  getSchedulePreview,
  listHabitsForSpace,
  listTodosForSpace,
  listNotesForSpace,
  countJournalForSpace,
} from '../../lib/selectors/spaceSelectors';
import { startOfWeek, formatISO } from 'date-fns';

// Components
import { SpaceBanner } from '../../components/spaces/SpaceBanner';
import { NewChatButton } from '../../components/spaces/NewChatButton';
import { ChatCard } from '../../components/spaces/ChatCard';
import { SchedulePreview } from '../../components/spaces/SchedulePreview';
import { InsightsCard } from '../../components/spaces/InsightsCard';
import { WhatWeDiscussedCard } from '../../components/spaces/WhatWeDiscussedCard';
import { useAuth } from '../../providers/AuthProvider';
import { useSpaceAggregate } from '../../hooks/useSpaceAggregate';
import { summarizeChatForCard } from '../../lib/ai/chatSummaries';
import {
  OverviewHeader,
  LastTimeCard,
  SpaceSummaryCard,
  ProgressSnapshot,
  TabbedSection,
} from '../../components/spaces/v3';
import { useIsFocused } from '@react-navigation/native';
import ConfettiBurst from '../../components/ConfettiBurst';

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
  const { userId } = useAuth();
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
  // moved above to include 'all'

  // Feature flag: Space v3 layout (robust parsing)
  const isSpaceV3 = (() => {
    const raw = (process.env.EXPO_PUBLIC_SPACE_V3 ?? 'on').toString().trim().toLowerCase();
    return raw === 'on' || raw === 'true' || raw === '1' || raw === 'enabled';
  })();

  // Phase 10.8: Space Insight state
  const [spaceInsight, setSpaceInsight] = useState<{
    summary: string;
    summary_at: string;
    tokens: number;
  } | null>(null);

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
  const scheduleItems = getSchedulePreview(items, spaceId, weekStart);
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
    let cancelled = false;

    const backend = process.env.EXPO_PUBLIC_REPO_BACKEND || 'memory';
    if (backend !== 'supabase' || !userId) {
      // For memory backend, rely on last_message_snippet fallback rendered inline
      return;
    }

    const messageRepo = new SupabaseSpaceChatMessageRepo(userId || undefined);
    const target = chats.slice(0, 3);

    (async () => {
      for (const chat of target) {
        try {
          const msgs = await messageRepo.list(chat.id);
          const summary = await summarizeChatForCard(chat.id, msgs);
          if (!cancelled) {
            setAiSummaries((prev) => (prev[chat.id] ? prev : { ...prev, [chat.id]: summary }));
          }
        } catch (e) {
          // Ignore; fallback will render
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chats, userId]);

  // Search filtering helpers
  const needle = searchQuery.trim().toLowerCase();
  const filterChats = (arr: SpaceChat[]) => {
    if (!needle) return arr;
    return arr.filter((c) => {
      const fields = [c.title, c.last_message_snippet || '', aiSummaries[c.id] || '']
        .join(' ')
        .toLowerCase();
      return fields.includes(needle);
    });
  };
  const filterHabits = (arr: any[]) => {
    if (!needle) return arr;
    return arr.filter((h) => (h.name || '').toLowerCase().includes(needle));
  };
  const filterTodos = (arr: any[]) => {
    if (!needle) return arr;
    return arr.filter((t) => `${t.name || ''} ${t.body || ''}`.toLowerCase().includes(needle));
  };
  const filterNotes = (arr: any[]) => {
    if (!needle) return arr;
    return arr.filter((n) => `${n.title || ''} ${n.body || ''}`.toLowerCase().includes(needle));
  };

  const handleAddInsightTodos = useCallback(() => {
    if (!spaceInsight) return;

    // Navigate to unified overlay in "add todo" mode with prefill
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
        {/* Header & optional banner */}
        <OverviewHeader
          spaceName={space?.name ?? 'Space'}
          onSearch={handleSearchPress}
          onBack={() => navigation.goBack()}
        />
        {/* Collapsible search bar */}
        {searchVisible && (
          <View style={{ paddingHorizontal: T.spacing[4], marginTop: T.spacing[2] }}>
            <TextInput
              placeholder="Search this space"
              placeholderTextColor={T.colors.subtle}
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={{
                backgroundColor: T.colors.surface,
                borderColor: T.colors.border,
                borderWidth: 1,
                borderRadius: T.radius[2],
                paddingHorizontal: T.spacing[3],
                paddingVertical: T.spacing[2],
                color: T.colors.text,
              }}
              accessibilityLabel="Search space"
              testID="space-search"
            />
          </View>
        )}
        <SpaceBanner space={space} />

        <View style={[styles.content, { padding: T.spacing[4] }]}>
          {/* Last time */}
          <LastTimeCard text={computeLastTimeText(items, chats)} />

          {/* Summary */}
          <View style={{ marginTop: T.spacing[3] }}>
            <Animated.View style={{ transform: [{ scale: summaryPulse }], opacity: summaryPulse }}>
              <SpaceSummaryCard
                headline={`You’ve logged ${stats.chatsActive} chats and completed ${stats.habitsCompletedThisWeek}/${stats.habitsTotalThisWeek} habits this week.`}
                secondary={`You’re ${Math.round(stats.completionPct * 100)}% to your weekly goal.`}
              />
            </Animated.View>
          </View>

          {/* Filter pills */}
          <View style={{ marginTop: T.spacing[3], flexDirection: 'row', gap: T.spacing[2] }}>
            {[
              { key: 'all', label: 'All' },
              { key: 'chats', label: 'Chats' },
              { key: 'habits', label: 'Habits' },
              { key: 'todos', label: 'To-Dos' },
              { key: 'notes', label: 'Notes' },
            ].map((p) => (
              <TouchableOpacity
                key={p.key}
                onPress={() => handleFilterPress(p.key as any)}
                accessibilityRole="button"
                accessibilityState={{ selected: activeTab === p.key }}
                style={{
                  paddingHorizontal: T.spacing[3],
                  paddingVertical: T.spacing[1],
                  borderRadius: T.radius[2],
                  backgroundColor:
                    activeTab === (p.key as any) ? T.colors.accentMint : T.colors.surface,
                  borderWidth: 1,
                  borderColor: T.colors.border,
                }}
              >
                <Text style={{ color: T.colors.text, fontSize: 14 }}>{p.label}</Text>
              </TouchableOpacity>
            ))}
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

          {/* Upcoming schedule */}
          <View style={{ marginTop: T.spacing[3] }}>
            <SchedulePreview
              items={scheduleItems}
              onViewAll={() => console.log('view all schedule')}
            />
          </View>

          {/* Progress snapshot */}
          <View style={{ marginTop: T.spacing[3] }}>
            <ProgressSnapshot
              habitsCompleted={stats.habitsCompletedThisWeek}
              habitsTotal={stats.habitsTotalThisWeek}
              todosOpen={stats.todosOpen}
              notesAddedThisWeek={stats.notesAddedThisWeek}
              chatsActive={stats.chatsActive}
            />
          </View>

          {/* Tabs */}
          <View style={{ marginTop: T.spacing[4] }}>
            <TabbedSection
              tabs={[
                { key: 'all', label: 'All' },
                { key: 'chats', label: 'Chats', count: chats.length },
                { key: 'habits', label: 'Habits', count: habits.length },
                { key: 'todos', label: 'To-Dos', count: todos.length },
                { key: 'notes', label: 'Notes', count: notes.length },
              ]}
              activeKey={activeTab}
              onChange={(k) => setActiveTab(k)}
            />
          </View>

          {/* Tab content */}
          <View style={{ marginTop: T.spacing[3], gap: T.spacing[2] }}>
            {activeTab === 'all' && (
              <>
                {filterChats(chats)
                  .slice(0, 2)
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
                  ))}
                {filterHabits(habits)
                  .slice(0, 2)
                  .map((h) => (
                    <Text key={h.id} style={{ color: T.colors.text }}>
                      {h.name}
                    </Text>
                  ))}
                {filterTodos(todos)
                  .slice(0, 2)
                  .map((t) => (
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
                {filterNotes(notes)
                  .slice(0, 2)
                  .map((n) => (
                    <Text key={n.id} style={{ color: T.colors.text }}>
                      {n.title}
                    </Text>
                  ))}
              </>
            )}
            {activeTab === 'chats' && (
              <>
                {filterChats(chats)
                  .slice(0, 3)
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
                  ))}
                {filterChats(chats).length > 3 && (
                  <TouchableOpacity
                    onPress={() => console.log('view all chats')}
                    accessibilityRole="button"
                  >
                    <Text style={{ color: T.colors.primary, fontWeight: '600' }}>
                      View all chats
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
            {activeTab === 'habits' && (
              <>
                {filterHabits(habits)
                  .slice(0, 3)
                  .map((h) => (
                    <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: T.colors.text, flex: 1 }}>{h.name}</Text>
                      <TouchableOpacity
                        accessibilityLabel={`Complete habit '${h.name}'`}
                        accessibilityRole="button"
                        onPress={async () => {
                          try {
                            await repo.completeHabit(h.id, new Date().toISOString());
                            setShowConfetti(true);
                            await reload();
                          } catch (e) {
                            console.warn('Failed to complete habit', e);
                          }
                        }}
                      >
                        <Text style={{ color: T.colors.primary }}>✓</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                {filterHabits(habits).length > 3 && (
                  <TouchableOpacity onPress={() => console.log('view all habits')}>
                    <Text style={{ color: T.colors.primary, fontWeight: '600' }}>
                      View all habits
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
            {activeTab === 'todos' && (
              <>
                {filterTodos(todos)
                  .slice(0, 3)
                  .map((t) => (
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
                {filterTodos(todos).length > 3 && (
                  <TouchableOpacity onPress={() => console.log('view all todos')}>
                    <Text style={{ color: T.colors.primary, fontWeight: '600' }}>
                      View all to-dos
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
            {activeTab === 'notes' && (
              <>
                {filterNotes(notes)
                  .slice(0, 3)
                  .map((n) => (
                    <Text key={n.id} style={{ color: T.colors.text }}>
                      {n.title}
                    </Text>
                  ))}
                {filterNotes(notes).length > 3 && (
                  <TouchableOpacity onPress={() => console.log('view all notes')}>
                    <Text style={{ color: T.colors.primary, fontWeight: '600' }}>
                      View all notes
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </View>
      </ScrollView>

      {/* New chat floating button */}
      {activeTab === 'chats' && (
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
      )}

      {/* Micro celebration overlay */}
      <ConfettiBurst visible={showConfetti} onComplete={() => setShowConfetti(false)} />
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
    borderRadius: 24, // 24pt radius as requested
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    ...lightTokens.elevation.md,
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
