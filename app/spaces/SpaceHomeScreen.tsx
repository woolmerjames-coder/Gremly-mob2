/**
 * SpaceHomeScreen - Main space detail screen with chats, previews, and insights
 * Phase 8 Spaces v2 UI
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Text,
  Alert,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useRepo } from '../../providers/RepoProvider';
import { SupabaseSpaceChatRepo } from '../../lib/repo/supabase';
import { MemorySpaceChatRepo } from '../../lib/repo/memory';
import type { Space, SpaceChat, AppRecord } from '../../lib/types';
import { lightTokens } from '../../design/tokens';
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
import { CollapsibleCard } from '../../components/spaces/CollapsibleCard';
import { SchedulePreview } from '../../components/spaces/SchedulePreview';
import { HabitsTodosPreview } from '../../components/spaces/HabitsTodosPreview';
import { NotesResourcesPreview } from '../../components/spaces/NotesResourcesPreview';
import { JournalPreview } from '../../components/spaces/JournalPreview';
import { InsightsCard } from '../../components/spaces/InsightsCard';
import { WhatWeDiscussedCard } from '../../components/spaces/WhatWeDiscussedCard';
import { useAuth } from '../../providers/AuthProvider';

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

  // State
  const [space, setSpace] = useState<Space | null>(null);
  const [chats, setChats] = useState<SpaceChat[]>([]);
  const [items, setItems] = useState<AppRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [layoutState, setLayoutState] = useState<LayoutState>({});

  // Phase 10.8: Space Insight state
  const [spaceInsight, setSpaceInsight] = useState<{
    summary: string;
    summary_at: string;
    tokens: number;
  } | null>(null);

  // Create SpaceChatRepo instance
  const spaceChatRepo = React.useMemo(() => {
    const backend = process.env.EXPO_PUBLIC_REPO_BACKEND || 'memory';
    return backend === 'supabase'
      ? new SupabaseSpaceChatRepo(userId || undefined)
      : new MemorySpaceChatRepo(userId || 'anonymous');
  }, [userId]);

  // Load data
  const loadData = useCallback(async () => {
    try {
      const [spaceData, chatsData, itemsData] = await Promise.all([
        repo.getSpaceById(spaceId),
        spaceChatRepo.list(spaceId),
        repo.listBySpace(spaceId),
      ]);

      if (!spaceData) {
        Alert.alert('Error', 'Space not found');
        navigation.goBack();
        return;
      }

      setSpace(spaceData);

      // Phase 8 polish: Sort chats - pinned first, then by updated_at desc
      const sortedChats = [...chatsData].sort((a, b) => {
        // Pinned chats come first
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        // Then sort by updated_at descending
        const dateA = new Date(a.updated_at).getTime();
        const dateB = new Date(b.updated_at).getTime();
        return dateB - dateA;
      });

      setChats(sortedChats);
      setItems(itemsData);

      // Phase 10.8: Load Space Insight summary
      try {
        const insight = await repo.getLatestSpaceInsight(spaceId);
        setSpaceInsight(insight);
      } catch (err) {
        if (__DEV__) {
          console.warn('[SpaceHome][10.8] Failed to load insight:', err);
        }
      }

      // Load layout state
      if (spaceData.layout_state_json) {
        try {
          setLayoutState(spaceData.layout_state_json as LayoutState);
        } catch (e) {
          console.warn('Failed to parse layout state', e);
        }
      }

      // TODO: Fire analytics event
      // analytics.track('space_home_opened', { spaceId });
      console.log('[Analytics] space_home_opened', { spaceId }); // Phase 8 polish: Placeholder analytics
    } catch (error) {
      console.warn('Failed to load space data:', error);
      Alert.alert('Error', 'Failed to load space data. Please check your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [spaceId, repo, spaceChatRepo, navigation]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

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
      setChats((prev) => [newChat, ...prev]);
      // TODO: Fire analytics
      // analytics.track('space_chat_created', { spaceId, chatId: newChat.id });
      console.log('[Analytics] space_chat_created', { spaceId, chatId: newChat.id }); // Phase 8 polish
      navigation.navigate('ChatThread', { spaceId, chatId: newChat.id });
    } catch (error) {
      console.error('Failed to create chat:', error);
      Alert.alert('Error', 'Failed to create chat');
    }
  }, [spaceId, spaceChatRepo, navigation]);

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
        // Re-sort after pinning
        setChats((prev) => {
          const updated = prev.map((c) => (c.id === chatId ? { ...c, pinned: true } : c));
          return updated.sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            const dateA = new Date(a.updated_at).getTime();
            const dateB = new Date(b.updated_at).getTime();
            return dateB - dateA;
          });
        });
      } catch (error) {
        console.warn('Failed to pin chat:', error);
        Alert.alert('Error', 'Failed to pin chat');
      }
    },
    [spaceChatRepo],
  );

  const handleUnpinChat = useCallback(
    async (chatId: string) => {
      try {
        await spaceChatRepo.update(chatId, { pinned: false });
        // Re-sort after unpinning
        setChats((prev) => {
          const updated = prev.map((c) => (c.id === chatId ? { ...c, pinned: false } : c));
          return updated.sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            const dateA = new Date(a.updated_at).getTime();
            const dateB = new Date(b.updated_at).getTime();
            return dateB - dateA;
          });
        });
      } catch (error) {
        console.warn('Failed to unpin chat:', error);
        Alert.alert('Error', 'Failed to unpin chat');
      }
    },
    [spaceChatRepo],
  );

  const handleRenameChat = useCallback(
    async (chatId: string, newTitle: string) => {
      try {
        await spaceChatRepo.update(chatId, { title: newTitle });
        setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, title: newTitle } : c)));
      } catch (error) {
        console.error('Failed to rename chat:', error);
        Alert.alert('Error', 'Failed to rename chat');
      }
    },
    [spaceChatRepo],
  );

  const handleArchiveChat = useCallback(
    async (chatId: string) => {
      try {
        await spaceChatRepo.delete(chatId);
        setChats((prev) => prev.filter((c) => c.id !== chatId));
      } catch (error) {
        console.error('Failed to archive chat:', error);
        Alert.alert('Error', 'Failed to archive chat');
      }
    },
    [spaceChatRepo],
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
      await loadData();
    } catch (error) {
      console.error('Failed to save insight as note:', error);
      Alert.alert('Error', 'Failed to save note');
    }
  }, [spaceInsight, spaceId, repo, loadData]);

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
        <ActivityIndicator size="large" color={lightTokens.colors.primary} />
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

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Banner */}
        <SpaceBanner space={space} />

        <View style={styles.content}>
          {/* Phase 8 polish: Show archived banner if space is archived */}
          {space.archived_at && (
            <View style={styles.archivedBanner}>
              <Text style={styles.archivedBannerText}>⚠️ This space is archived</Text>
            </View>
          )}

          {/* Chats Section - Feature flag gated */}
          {process.env.EXPO_PUBLIC_FEATURE_CHAT === 'on' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Chats</Text>

              {chats.length === 0 ? (
                <View style={styles.emptyChats}>
                  <Text style={styles.emptyChatsTitle}>No chats yet</Text>
                  <Text style={styles.emptyChatsText}>
                    Start a conversation with Gremly to get insights, ask questions, or explore this
                    space together!
                  </Text>
                  <NewChatButton onPress={handleNewChat} disabled={!!space.archived_at} />
                </View>
              ) : (
                <>
                  {chats.map((chat) => (
                    <ChatCard
                      key={chat.id}
                      chat={chat}
                      onPress={() => handleChatPress(chat.id)}
                      onPin={handlePinChat}
                      onUnpin={handleUnpinChat}
                      onRename={handleRenameChat}
                      onArchive={handleArchiveChat}
                    />
                  ))}
                  {/* Plus FAB for new chat */}
                  <View style={styles.fabContainer}>
                    <TouchableOpacity
                      style={styles.fab}
                      onPress={handleNewChat}
                      disabled={!!space.archived_at}
                      accessibilityLabel="Start new chat"
                      accessibilityRole="button"
                    >
                      <Text style={styles.fabIcon}>➕</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          )}

          {/* Schedule Preview */}
          <CollapsibleCard
            title="This Week"
            icon="📅"
            initialCollapsed={layoutState.scheduleCollapsed}
            onToggle={(collapsed) =>
              persistLayoutState({ ...layoutState, scheduleCollapsed: collapsed })
            }
          >
            <SchedulePreview items={scheduleItems} />
          </CollapsibleCard>

          {/* Habits & Todos */}
          <CollapsibleCard
            title="Habits & To-Dos"
            icon="🎯"
            initialCollapsed={layoutState.habitsTodosCollapsed}
            onToggle={(collapsed) =>
              persistLayoutState({ ...layoutState, habitsTodosCollapsed: collapsed })
            }
          >
            <HabitsTodosPreview habits={habits} todos={todos} />
          </CollapsibleCard>

          {/* Notes & Resources */}
          <CollapsibleCard
            title="Notes & Resources"
            icon="📚"
            initialCollapsed={layoutState.notesResourcesCollapsed}
            onToggle={(collapsed) =>
              persistLayoutState({ ...layoutState, notesResourcesCollapsed: collapsed })
            }
          >
            <NotesResourcesPreview notes={notes} />
          </CollapsibleCard>

          {/* Journal */}
          <CollapsibleCard
            title="Journal"
            icon="📖"
            initialCollapsed={layoutState.journalCollapsed}
            onToggle={(collapsed) =>
              persistLayoutState({ ...layoutState, journalCollapsed: collapsed })
            }
          >
            <JournalPreview journals={journals} count={journalCount} />
          </CollapsibleCard>

          {/* AI Insights */}
          <InsightsCard summary={space.summary_cached} lastUpdated={space.summary_updated_at} />

          {/* Phase 10.8: What We Discussed Card */}
          {spaceInsight && (
            <WhatWeDiscussedCard
              summary={spaceInsight.summary}
              onSaveAsNote={handleSaveInsightAsNote}
              onAddTodos={handleAddInsightTodos}
              lastUpdated={spaceInsight.summary_at}
            />
          )}
        </View>
      </ScrollView>
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
    paddingBottom: lightTokens.spacing[6], // Phase 8 polish: Extra bottom padding for safe area
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
    alignItems: 'flex-end',
    marginTop: lightTokens.spacing[3],
  },
  fab: {
    backgroundColor: lightTokens.colors.primary,
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
