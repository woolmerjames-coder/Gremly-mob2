import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useRepo } from '../../providers/RepoProvider';
import MascotIcon from '../../components/MascotIcon';
import PlusFAB from '../../components/PlusFAB';
import { openManualAdd } from '../../components/ManualAddSheet';
import type { Space } from '../../lib/types';
import type { GroupedByType } from '../../lib/repo/IRepo';
import type { RootStackParamList } from '../../navigation/RootNavigator';

type SpaceDetailRouteProp = RouteProp<RootStackParamList, 'SpaceDetail'>;

/**
 * SpaceDetail - Shows a Space with its grouped items
 * Phase 5: Banner (theme + name) and grouped items (Habits / To-Dos / Notes)
 */
export default function SpaceDetail() {
  const route = useRoute<SpaceDetailRouteProp>();
  const { id } = route.params;
  const repo = useRepo();
  const [space, setSpace] = useState<Space | null>(null);
  const [groups, setGroups] = useState<GroupedByType>({ habits: [], todos: [], notes: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
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
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator size="large" color="#0D3B3A" />
      </View>
    );
  }

  if (!space) {
    return (
      <View className="flex-1 items-center justify-center bg-bg px-6">
        <MascotIcon pose="think" className="mb-4" />
        <Text className="text-center text-base text-gray-800">Space not found</Text>
      </View>
    );
  }

  const Banner = (
    <View className="p-5" style={{ backgroundColor: themeToColor(space.theme) }}>
      <Text className="text-white text-xl font-semibold">{space.name}</Text>
      {space.icon ? (
        <Text className="text-white text-3xl mt-2" accessibilityLabel={`Icon: ${space.icon}`}>
          {space.icon}
        </Text>
      ) : null}
    </View>
  );

  return (
    <ScrollView className="flex-1 bg-bg">
      {Banner}
      <Section title="Habits" items={groups.habits} />
      <Section title="To-Dos" items={groups.todos} />
      <Section title="Notes" items={groups.notes} />

      {/* Plus FAB for Manual Add with spaceId context */}
      <PlusFAB onPress={() => openManualAdd({ spaceId: id })} />
    </ScrollView>
  );
}

interface SectionProps {
  title: string;
  items: any[];
}

function Section({ title, items }: SectionProps) {
  return (
    <View className="px-4 py-3">
      <Text className="text-lg font-semibold mb-2 text-gray-900">{title}</Text>
      {items.length === 0 ? (
        <View className="rounded-2xl bg-white p-4 items-center">
          <MascotIcon pose="think" className="mb-2" size={48} />
          <Text className="text-gray-600">Nothing here yet.</Text>
        </View>
      ) : (
        items.map((item: any) => (
          <View key={item.id} className="rounded-2xl bg-white p-4 mb-2 shadow-sm">
            <Text className="font-medium text-gray-900">
              {item.title ?? item.name ?? '(untitled)'}
            </Text>
            {item.body ? (
              <Text className="text-sm text-gray-600 mt-1" numberOfLines={2}>
                {item.body}
              </Text>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

function themeToColor(t?: string | null) {
  switch (t) {
    case 'mint':
      return '#B7F7E1';
    case 'cream':
      return '#FFF6E5';
    case 'periwinkle':
      return '#C9D4FF';
    default:
      return '#0D3B3A'; // deepTeal
  }
}
