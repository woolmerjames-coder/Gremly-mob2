import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSpaceById, useSpaceItemsGrouped, type GroupedByType } from '../../lib/store/selectors';
import { useAuth } from '../../providers/AuthProvider';
import { SupabaseSpaceChatRepo } from '../../lib/repo/supabase';
import { MemorySpaceChatRepo } from '../../lib/repo/memory';
import MascotIcon from '../../components/MascotIcon';
import PlusFAB from '../../components/PlusFAB';
import { UnifiedCreateOverlay } from '../../components/overlay/UnifiedCreateOverlay';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import type { Space, AppRecord, SpaceChat } from '../../lib/types';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { Box, Text } from '../../ui';
import { Card, ListItem } from '../../design-system';
import { useTokens } from '../../design/makeStyles';
import { lightTokens } from '../../design/tokens';
import { getNoteLabel } from '../../lib/canonicalTypes';
import TagFilterBar from '../../components/tags/TagFilterBar';
import { normalizeSearchTagArray } from '../../lib/tags/search';

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
  const { userId } = useAuth();
  const tokens = useTokens();
  const overlayController = useUnifiedOverlayController();
  const [selectedTagNames, setSelectedTagNames] = useState<string[]>([]);
  const [chats, setChats] = useState<SpaceChat[]>([]);
  const [loading, setLoading] = useState(false);

  // Use Zustand store for space and items
  const space = useSpaceById(id);
  const groups = useSpaceItemsGrouped(
    id,
    selectedTagNames.length > 0 ? selectedTagNames : undefined,
  );

  const noteLabelPlural = getNoteLabel({ plural: true });
  const availableTags = useMemo(() => {
    const set = new Set<string>();
    const groupKeys: Array<keyof GroupedByType> = ['habits', 'todos', 'notes'];

    groupKeys.forEach((key) => {
      groups[key].forEach((item) => {
        const itemTags = (item as AppRecord & { tags?: string[] | null }).tags ?? [];
        itemTags.forEach((tag) => set.add(tag));
      });
    });

    return Array.from(set).sort();
  }, [groups]);

  // Create SpaceChatRepo instance
  const spaceChatRepo = React.useMemo(() => {
    const backend = process.env.EXPO_PUBLIC_REPO_BACKEND || 'memory';
    return backend === 'supabase'
      ? new SupabaseSpaceChatRepo(userId || undefined)
      : new MemorySpaceChatRepo(userId || 'anonymous');
  }, [userId]);

  // Load chats (still uses repo pattern until chat is in Zustand)
  const loadChats = useCallback(async () => {
    if (process.env.EXPO_PUBLIC_FEATURE_CHAT === 'on') {
      try {
        setLoading(true);
        const chatsData = await spaceChatRepo.list(id);
        setChats(chatsData);
      } catch (error) {
        console.warn('Failed to load chats:', error);
      } finally {
        setLoading(false);
      }
    }
  }, [spaceChatRepo, id]);

  useEffect(() => {
    // Redirect to v3 SpaceHome when flag is enabled
    const raw = (process.env.EXPO_PUBLIC_SPACE_V3 ?? 'on').toString().trim().toLowerCase();
    const v3 = raw === 'on' || raw === 'true' || raw === '1' || raw === 'enabled';
    if (v3) {
      navigation.replace('SpaceHome', { spaceId: id });
      return; // don't load legacy content
    }
    loadChats();
  }, [loadChats, navigation, id]);

  const handleOverlaySaved = useCallback(() => {
    // Store updates automatically, no need to reload
  }, []);

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

      <Box px={4} py={3}>
        <TagFilterBar
          selected={selectedTagNames}
          available={availableTags}
          onChange={(next) => setSelectedTagNames(normalizeSearchTagArray(next))}
          testID="space-tag-filter"
        />
      </Box>

      {/* Chats Section - Feature flag gated */}
      {process.env.EXPO_PUBLIC_FEATURE_CHAT === 'on' && (
        <ChatsSection chats={chats} onNewChat={handleNewChat} onChatPress={handleChatPress} />
      )}

      <Section title="Habits" items={groups.habits} />
      <Section title="To-Dos" items={groups.todos} />
      <Section title={noteLabelPlural} items={groups.notes} />

      {/* Plus FAB for Manual Add with spaceId context */}
      <PlusFAB onPress={() => overlayController.openCreate({ spaceId: id })} />

      {/* Unified Create Overlay */}
      {overlayController.state.visible &&
        (overlayController.state.mode === 'create' || overlayController.state.mode === 'edit') && (
          <UnifiedCreateOverlay
            visible={overlayController.state.visible}
            mode={overlayController.state.mode}
            initialEntity={overlayController.state.initialEntity}
            initialSpaceId={overlayController.state.initialSpaceId}
            onClose={overlayController.close}
            onSaved={handleOverlaySaved}
          />
        )}
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
