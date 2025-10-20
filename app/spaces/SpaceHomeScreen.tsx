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
      setChats(chatsData);
      setItems(itemsData);

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
    } catch (error) {
      console.error('Failed to load space data:', error);
      Alert.alert('Error', 'Failed to load space data');
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
      } catch (error) {
        console.error('Failed to persist layout state:', error);
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
      navigation.navigate('ChatThread', { chatId: newChat.id });
    } catch (error) {
      console.error('Failed to create chat:', error);
      Alert.alert('Error', 'Failed to create chat');
    }
  }, [spaceId, spaceChatRepo, navigation]);

  const handleChatPress = useCallback(
    (chatId: string) => {
      // TODO: Fire analytics
      // analytics.track('space_chat_opened', { spaceId, chatId });
      navigation.navigate('ChatThread', { chatId });
    },
    [navigation],
  );

  const handlePinChat = useCallback(
    async (chatId: string) => {
      try {
        await spaceChatRepo.update(chatId, { pinned: true });
        setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, pinned: true } : c)));
      } catch (error) {
        console.error('Failed to pin chat:', error);
        Alert.alert('Error', 'Failed to pin chat');
      }
    },
    [spaceChatRepo],
  );

  const handleUnpinChat = useCallback(
    async (chatId: string) => {
      try {
        await spaceChatRepo.update(chatId, { pinned: false });
        setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, pinned: false } : c)));
      } catch (error) {
        console.error('Failed to unpin chat:', error);
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Banner */}
        <SpaceBanner space={space} />

        <View style={styles.content}>
          {/* Chats Section */}
          <View style={styles.section}>
            <NewChatButton onPress={handleNewChat} />

            {chats.length === 0 ? (
              <View style={styles.emptyChats}>
                <Text style={styles.emptyChatsText}>
                  No chats yet. Start a conversation with Gremly!
                </Text>
              </View>
            ) : (
              chats.map((chat) => (
                <ChatCard
                  key={chat.id}
                  chat={chat}
                  onPress={() => handleChatPress(chat.id)}
                  onPin={handlePinChat}
                  onUnpin={handleUnpinChat}
                  onRename={handleRenameChat}
                  onArchive={handleArchiveChat}
                />
              ))
            )}
          </View>

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
  content: {
    padding: lightTokens.spacing[4],
  },
  section: {
    marginBottom: lightTokens.spacing[4],
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
  },
  emptyChatsText: {
    fontSize: lightTokens.typography.size.sm,
    color: lightTokens.colors.subtle,
    textAlign: 'center',
  },
});
