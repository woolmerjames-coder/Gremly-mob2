// @ts-nocheck - Legacy file using className (deprecated, requires NativeWind)
// This file is kept for reference only. Use DS version via FLAGS.USE_DS_UI = true
import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useRepo } from '../../providers/RepoProvider';
import MascotIcon from '../../components/MascotIcon';
import type { RootStackParamList } from '../../navigation/RootNavigator';

/**
 * SpacesScreen - Grid view of user's Spaces
 * Bulletproof with SafeAreaView, FAB, dual CTAs, and proper styling
 */
export default function SpacesScreen() {
  const insets = useSafeAreaInsets();
  const repo = useRepo();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [spaces, setSpaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSpaces(await repo.listSpaces());
    } finally {
      setLoading(false);
    }
  }, [repo]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const openNewSpace = useCallback(() => {
    navigation.navigate('NewSpace');
  }, [navigation]);

  const PrimaryButton = ({ title, onPress }: { title: string; onPress: () => void }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      className="bg-deepTeal rounded-2xl px-6 py-3 items-center justify-center active:bg-deepTeal/80"
      style={{ minHeight: 48 }}
    >
      <Text className="text-white font-semibold text-lg">{title}</Text>
    </Pressable>
  );

  const Header = () => (
    <View
      className="flex-row items-center justify-between px-4 bg-white border-b border-gray-200"
      style={{ paddingTop: Math.max(insets.top, 8), paddingBottom: 8 }}
    >
      <Text className="text-2xl font-semibold text-gray-900">Spaces</Text>
      <PrimaryButton title="New Space" onPress={openNewSpace} />
    </View>
  );

  // Empty state
  if (!loading && spaces.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1 }} className="bg-bg" edges={['top', 'left', 'right']}>
        <Header />
        <View className="flex-1 items-center justify-center px-6">
          <MascotIcon pose="neutral" className="mb-4" size={80} />
          <Text className="text-center text-base text-gray-800 mb-4">
            No Spaces yet. Create one to organize your habits, todos, and notes!
          </Text>
          <PrimaryButton title="New Space" onPress={openNewSpace} />
        </View>

        {/* FAB always available */}
        <Fab onPress={openNewSpace} bottom={insets.bottom} />
      </SafeAreaView>
    );
  }

  // Grid view
  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-bg" edges={['top', 'left', 'right']}>
      <Header />
      <FlatList
        data={spaces}
        keyExtractor={(s) => s.id}
        numColumns={2}
        contentContainerStyle={{
          padding: 12,
          paddingBottom: (insets.bottom || 16) + 96,
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.name} space`}
            onPress={() => navigation.navigate('SpaceDetail', { id: item.id })}
            className="m-2 flex-1 rounded-2xl bg-white p-4 shadow-sm active:bg-gray-50"
            style={{ minHeight: 120 }}
          >
            {/* Theme bar */}
            <View className={`h-2 rounded-full mb-3 ${themeToBar(item.theme)}`} />

            {/* Content */}
            <View className="flex-1 justify-between">
              <Text className="text-base font-semibold mb-1" numberOfLines={2}>
                {item.name}
              </Text>
              {item.icon ? (
                <Text className="text-2xl" accessibilityLabel={`Icon: ${item.icon}`}>
                  {item.icon}
                </Text>
              ) : null}
            </View>
          </Pressable>
        )}
      />

      {/* FAB always available */}
      <Fab onPress={openNewSpace} bottom={insets.bottom} />
    </SafeAreaView>
  );
}

function Fab({ onPress, bottom }: { onPress: () => void; bottom: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Create a new space"
      onPress={onPress}
      style={{
        position: 'absolute',
        right: 16,
        bottom: (bottom || 16) + 16,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      }}
      className="h-14 w-14 rounded-full bg-deepTeal items-center justify-center active:bg-deepTeal/80"
    >
      <Text className="text-white text-2xl" accessibilityLabel="Plus">
        +
      </Text>
    </Pressable>
  );
}

function themeToBar(t?: string | null) {
  switch (t) {
    case 'mint':
      return 'bg-mint';
    case 'cream':
      return 'bg-cream';
    case 'periwinkle':
      return 'bg-periwinkle';
    default:
      return 'bg-deepTeal';
  }
}
