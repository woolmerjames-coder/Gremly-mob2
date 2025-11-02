import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useRepo } from '../../providers/RepoProvider';
import { useAuth } from '../../providers/AuthProvider';
import { SupabaseSpaceChatRepo } from '../../lib/repo/supabase';
import { MemorySpaceChatRepo } from '../../lib/repo/memory';
import MascotIcon from '../../components/MascotIcon';
import PlusFAB from '../../components/PlusFAB';
import { UnifiedCreateOverlay } from '../../components/overlay/UnifiedCreateOverlay';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import type { Space, AppRecord, SpaceChat } from '../../lib/types';
import type { GroupedByType } from '../../lib/repo/IRepo';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { Box, Text } from '../../ui';
import { Card, ListItem } from '../../design-system';
import { useTokens } from '../../design/makeStyles';
import { lightTokens } from '../../design/tokens';

type SpaceDetailRouteProp = RouteProp<RootStackParamList, 'SpaceDetail'>;
type SpaceDetailNavigationProp = NativeStackNavigationProp<RootStackParamList, 'SpaceDetail'>;

/**
 * SpaceDetail - Shows a Space with its grouped items
 * Phase 5: Banner (theme + name) and grouped items (Habits / To-Dos / Notes)
 */
export default function SpaceDetail() {
  const route = useRoute<SpaceDetailRouteProp>();
  const navigation = useNavigation<SpaceDetailNavigationProp>();
  const { id } = route.params;
  const repo = useRepo();
  const { userId } = useAuth();
  const tokens = useTokens();
  const overlayController = useUnifiedOverlayController();
  const overlayMode =
    overlayController.state.mode === 'view' ? 'create' : overlayController.state.mode;
  const [space, setSpace] = useState<Space | null>(null);
  const [groups, setGroups] = useState<GroupedByType>({ habits: [], todos: [], notes: [] });
  const [chats, setChats] = useState<SpaceChat[]>([]);
  const [loading, setLoading] = useState(true);

  // Create SpaceChatRepo instance
  const spaceChatRepo = React.useMemo(() => {
    const backend = process.env.EXPO_PUBLIC_REPO_BACKEND || 'memory';
    return backend === 'supabase'
      ? new SupabaseSpaceChatRepo(userId || undefined)
      : new MemorySpaceChatRepo(userId || 'anonymous');
  }, [userId]);

  const load = useCallback(async () => {
    try {
      const [spaceData, groupedData] = await Promise.all([
        repo.getSpaceById(id),
        repo.listBySpaceGrouped(id),
      ]);
      setSpace(spaceData);
      setGroups(groupedData);

      // Load chats if feature is enabled
      if (process.env.EXPO_PUBLIC_FEATURE_CHAT === 'on') {
        try {
          const chatsData = await spaceChatRepo.list(id);
          setChats(chatsData);
        } catch (error) {
          console.warn('Failed to load chats:', error);
        }
      }
    } catch (error) {
      console.error('Failed to load space:', error);
    } finally {
      setLoading(false);
    }
  }, [repo, id, spaceChatRepo]);

  useEffect(() => {
    // Redirect to v3 SpaceHome when flag is enabled
    const raw = (process.env.EXPO_PUBLIC_SPACE_V3 ?? 'on').toString().trim().toLowerCase();
    const v3 = raw === 'on' || raw === 'true' || raw === '1' || raw === 'enabled';
    if (v3) {
      navigation.replace('SpaceHome', { spaceId: id });
      return; // don't load legacy content
    }
    load();
  }, [load]);

  const handleOverlaySaved = useCallback(() => {
    load();
  }, [load]);

  const handleNewChat = useCallback(async () => {
    try {
      const newChat = await spaceChatRepo.create(id, {
        title: 'New chat',
      });
      setChats((prev) => [newChat, ...prev]);
      navigation.navigate('ChatThread', { spaceId: id, chatId: newChat.id });
    } catch (error) {
      console.error('Failed to create chat:', error);
    }
  }, [id, spaceChatRepo, navigation]);

  const handleChatPress = useCallback(
    (chatId: string) => {
      navigation.navigate('ChatThread', { spaceId: id, chatId });
    },
    [navigation, id],
  );

  if (loading) {
    return (
      <Box center style={{ flex: 1, backgroundColor: tokens.colors.bg }}>
        <ActivityIndicator size="large" color={tokens.colors.primary} />
      </Box>
    );
  }

  if (!space) {
    return (
      <Box center px={6} style={{ flex: 1, backgroundColor: tokens.colors.bg }}>
        <Box mb={4}>
          <MascotIcon pose="think" />
        </Box>
        <Text variant="body" style={{ textAlign: 'center' }}>
          Space not found
        </Text>
      </Box>
    );
  }

  const Banner = (
    <Box p={5} style={{ backgroundColor: themeToColor(space.theme) }}>
      <Text variant="title" style={{ color: '#FFF', fontSize: 20 }}>
        {space.name}
      </Text>
      {space.icon ? (
        <Text
          style={{ color: '#FFF', fontSize: 28, marginTop: tokens.spacing[2] }}
          accessibilityLabel={`Icon: ${space.icon}`}
        >
          {space.icon}
        </Text>
      ) : null}
    </Box>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: tokens.colors.bg }}>
      {Banner}

      {/* Chats Section - Feature flag gated */}
      {process.env.EXPO_PUBLIC_FEATURE_CHAT === 'on' && (
        <ChatsSection chats={chats} onNewChat={handleNewChat} onChatPress={handleChatPress} />
      )}

      <Section title="Habits" items={groups.habits} />
      <Section title="To-Dos" items={groups.todos} />
      <Section title="Notes" items={groups.notes} />

      {/* Plus FAB for Manual Add with spaceId context */}
      <PlusFAB onPress={() => overlayController.openCreate({ spaceId: id })} />

      {/* Unified Create Overlay */}
      <UnifiedCreateOverlay
        visible={overlayController.state.visible}
        mode={overlayMode}
        initialEntity={overlayController.state.initialEntity}
        initialSpaceId={overlayController.state.initialSpaceId}
        onClose={overlayController.close}
        onSaved={handleOverlaySaved}
      />
    </ScrollView>
  );
}

interface SectionProps {
  title: string;
  items: AppRecord[];
}

function Section({ title, items }: SectionProps) {
  const t = useTokens();

  return (
    <Box px={4} py={3}>
      <Text variant="title" style={{ marginBottom: 8 }}>
        {title}
      </Text>
      {items.length === 0 ? (
        <Card variant="elevated">
          <Box center>
            <Box mb={2}>
              <MascotIcon pose="think" size={48} />
            </Box>
            <Text variant="body" style={{ color: t.colors.subtle }}>
              Nothing here yet.
            </Text>
          </Box>
        </Card>
      ) : (
        items.map((item) => (
          <ListItem
            key={item.id}
            testID={`space-detail-${item.type}-${item.id}`}
            title={
              item.type === 'habit' || item.type === 'todo'
                ? 'name' in item
                  ? item.name
                  : '(untitled)'
                : '(untitled)'
            }
            subtitle={item.type === 'todo' && item.body ? item.body : undefined}
            style={{ marginBottom: 8 }}
          />
        ))
      )}
    </Box>
  );
}

interface ChatsSectionProps {
  chats: SpaceChat[];
  onNewChat: () => void;
  onChatPress: (chatId: string) => void;
}

function ChatsSection({ chats, onNewChat, onChatPress }: ChatsSectionProps) {
  const t = useTokens();

  return (
    <Box px={4} py={3} style={{ position: 'relative' }}>
      <Text variant="title" style={{ marginBottom: 8 }}>
        Chats
      </Text>
      {chats.length === 0 ? (
        <Card variant="elevated">
          <Box center>
            <Box mb={2}>
              <MascotIcon pose="think" size={48} />
            </Box>
            <Text variant="body" style={{ color: t.colors.subtle, marginBottom: 12 }}>
              No chats yet
            </Text>
            <TouchableOpacity
              onPress={onNewChat}
              style={{
                backgroundColor: t.colors.primary,
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 24,
              }}
            >
              <Text style={{ color: t.colors.onPrimary, fontWeight: '600' }}>Talk to Gremly</Text>
            </TouchableOpacity>
          </Box>
        </Card>
      ) : (
        <>
          {chats.map((chat) => (
            <TouchableOpacity
              key={chat.id}
              onPress={() => onChatPress(chat.id)}
              style={{
                backgroundColor: t.colors.surface,
                borderRadius: 24,
                padding: 12,
                marginBottom: 8,
                ...t.elevation.sm,
              }}
            >
              <Text variant="body" style={{ fontWeight: '600', marginBottom: 4 }}>
                {chat.title}
              </Text>
              {chat.last_message_snippet && (
                <Text variant="body" style={{ color: t.colors.subtle, fontSize: 14 }}>
                  {chat.last_message_snippet}
                </Text>
              )}
            </TouchableOpacity>
          ))}
          {/* Plus FAB for new chat */}
          <TouchableOpacity
            onPress={onNewChat}
            style={{
              position: 'absolute',
              bottom: 12,
              right: 16,
              backgroundColor: t.colors.primary,
              borderRadius: 24,
              width: 48,
              height: 48,
              alignItems: 'center',
              justifyContent: 'center',
              ...t.elevation.md,
            }}
          >
            <Text style={{ color: t.colors.onPrimary, fontSize: 24 }}>➕</Text>
          </TouchableOpacity>
        </>
      )}
    </Box>
  );
}

function themeToColor(t?: string | null) {
  const { colors } = lightTokens;
  switch (t) {
    case 'mint':
      return colors.accentMint;
    case 'cream':
      return colors.bg;
    case 'periwinkle':
      return colors.accentPeri;
    default:
      return colors.primary;
  }
}
