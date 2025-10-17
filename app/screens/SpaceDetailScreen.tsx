import React, { useEffect, useState } from 'react';
import { ScrollView, ActivityIndicator } from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useRepo } from '../../providers/RepoProvider';
import MascotIcon from '../../components/MascotIcon';
import PlusFAB from '../../components/PlusFAB';
import { ManualAddOverlay } from '../../components/ManualAddOverlay';
import type { ManualAddPayload } from '../../app/schemas/manualAdd';
import type { Space, AppRecord } from '../../lib/types';
import type { GroupedByType } from '../../lib/repo/IRepo';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { Box, Text } from '../../ui';
import { Card, ListItem } from '../../design-system';
import { useTokens } from '../../design/makeStyles';
import { lightTokens } from '../../design/tokens';

type SpaceDetailRouteProp = RouteProp<RootStackParamList, 'SpaceDetail'>;

/**
 * SpaceDetail - Shows a Space with its grouped items
 * Phase 5: Banner (theme + name) and grouped items (Habits / To-Dos / Notes)
 */
export default function SpaceDetail() {
  const route = useRoute<SpaceDetailRouteProp>();
  const { id } = route.params;
  const repo = useRepo();
  const tokens = useTokens();
  const [space, setSpace] = useState<Space | null>(null);
  const [groups, setGroups] = useState<GroupedByType>({ habits: [], todos: [], notes: [] });
  const [loading, setLoading] = useState(true);
  const [overlayVisible, setOverlayVisible] = useState(false);

  const load = async () => {
    try {
      const [spaceData, groupedData] = await Promise.all([
        repo.getSpaceById(id),
        repo.listBySpaceGrouped(id),
      ]);
      setSpace(spaceData);
      setGroups(groupedData);
    } catch (error) {
      console.error('Failed to load space:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleManualAddSubmit = async (payload: ManualAddPayload) => {
    try {
      switch (payload.type) {
        case 'habits':
          if (payload.subType === 'start') {
            await repo.create({
              type: 'habit',
              title: payload.data.name,
              frequency: payload.data.frequency as any,
              space_id: id,
              ai_placed: false,
            });
          } else {
            await repo.create({
              type: 'habit',
              title: `Break: ${payload.data.name}`,
              frequency: 'daily',
              space_id: id,
              ai_placed: false,
            });
          }
          break;
        case 'todos':
          await repo.create({
            type: 'todo',
            title: payload.data.name,
            due_date: payload.data.deadline || null,
            undefined_due: !payload.data.deadline,
            space_id: id,
            ai_placed: false,
          });
          break;
        case 'journal':
          await repo.create({
            type: 'note',
            title: '',
            body: payload.data.entry,
            subtype: 'journal',
            space_id: id,
            ai_placed: false,
          });
          break;
        case 'catchall':
          await repo.create({
            type: 'note',
            title: '',
            body: payload.data.entry,
            subtype: 'catchall',
            space_id: id,
            ai_placed: false,
          });
          break;
      }
      await load();
    } catch (err) {
      console.error('Failed to create item:', err);
    }
  };

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
      <Section title="Habits" items={groups.habits} />
      <Section title="To-Dos" items={groups.todos} />
      <Section title="Notes" items={groups.notes} />

      {/* Plus FAB for Manual Add with spaceId context */}
      <PlusFAB onPress={() => setOverlayVisible(true)} />

      {/* Manual Add Overlay */}
      <ManualAddOverlay
        visible={overlayVisible}
        defaultTab="habits"
        onClose={() => setOverlayVisible(false)}
        onSubmit={handleManualAddSubmit}
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
            title={item.type === 'habit' || item.type === 'todo' ? item.title : '(untitled)'}
            subtitle={item.type === 'todo' && item.body ? item.body : undefined}
            style={{ marginBottom: 8 }}
          />
        ))
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
