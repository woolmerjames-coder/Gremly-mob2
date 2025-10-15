import React, { useEffect, useState, useCallback } from 'react';
import { FlatList, Pressable, View, Text, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useRepo } from '../../providers/RepoProvider';
import { SheetManager } from 'react-native-actions-sheet';
import MascotIcon from '../../components/MascotIcon';
import { setNewSpaceCallback } from '../../components/NewSpaceModal';
import type { Space } from '../../lib/types';
import type { RootStackParamList } from '../../navigation/RootNavigator';

/**
 * SpacesScreen - Grid view of user's Spaces
 * Phase 5: Bulletproof with SafeAreaView, FAB, and dual CTAs
 */
export default function SpacesScreen() {
  const insets = useSafeAreaInsets();
  const repo = useRepo();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadSpaces = useCallback(async () => {
    setLoading(true);
    try {
      const result = await repo.listSpaces();
      setSpaces(result);
    } catch (error) {
      console.error('Failed to load spaces:', error);
    } finally {
      setLoading(false);
    }
  }, [repo]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSpaces();
    setRefreshing(false);
  }, [loadSpaces]);

  // Load spaces on mount
  useEffect(() => {
    loadSpaces();
  }, [loadSpaces]);

  // Reload on tab focus
  useFocusEffect(
    useCallback(() => {
      loadSpaces();
    }, [loadSpaces]),
  );

  // Open new space modal with callback
  const openNewSpace = useCallback(() => {
    setNewSpaceCallback((space: Space) => {
      // Optimistic update + navigate
      setSpaces((prev) => [...prev, space]);
      navigation.navigate('SpaceDetail', { id: space.id });
    });
    SheetManager.show('new-space');
  }, [navigation]);

  // DEV-ONLY: Clear all spaces for testing empty state
  const clearAllSpaces = useCallback(async () => {
    if (!__DEV__) return;
    try {
      // Delete all spaces
      const allSpaces = await repo.listSpaces();
      for (const space of allSpaces) {
        await repo.deleteSpace(space.id);
      }
      await loadSpaces();
    } catch (error) {
      console.error('Failed to clear spaces:', error);
    }
  }, [repo, loadSpaces]);

  // Primary CTA button component
  const PrimaryButton = ({ title, onPress }: { title: string; onPress: () => void }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      className="bg-deepTeal rounded-2xl px-5 py-3 items-center justify-center active:bg-deepTeal/80"
      style={{ minHeight: 44 }}
    >
      <Text className="text-white font-semibold text-base">{title}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-bg" edges={['top', 'left', 'right']}>
      {/* Header */}
      <View className="flex-row justify-between items-center px-4 py-2 bg-white border-b border-gray-200">
        <Text className="text-xl font-semibold text-gray-900">Spaces</Text>
        <View className="flex-row items-center gap-2">
          {__DEV__ && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear all spaces"
              onPress={clearAllSpaces}
              className="px-3 py-2"
            >
              <Text className="text-xs text-gray-500">Clear</Text>
            </Pressable>
          )}
          <PrimaryButton title="New Space" onPress={openNewSpace} />
        </View>
      </View>

      {/* Grid */}
      <FlatList
        data={spaces}
        keyExtractor={(s) => s.id}
        numColumns={2}
        contentContainerStyle={{
          padding: 12,
          paddingBottom: (insets.bottom || 16) + 96, // Extra space for FAB
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
        ListEmptyComponent={
          !loading ? (
            <View className="flex-1 items-center justify-center px-6 py-20">
              <MascotIcon pose="think" className="mb-4" size={80} />
              <Text className="text-center text-base text-gray-800 mb-4">
                No Spaces yet. Create one to organize your habits, todos, and notes!
              </Text>
              <PrimaryButton title="New Space" onPress={openNewSpace} />
            </View>
          ) : null
        }
      />

      {/* Floating Action Button (FAB) */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create a new space"
        onPress={openNewSpace}
        style={{
          position: 'absolute',
          right: 16,
          bottom: (insets.bottom || 16) + 16,
          elevation: 4,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 4,
        }}
        className="h-14 w-14 rounded-full bg-deepTeal items-center justify-center active:bg-deepTeal/80"
      >
        <Text className="text-white text-2xl font-normal" accessibilityLabel="Plus">
          +
        </Text>
      </Pressable>
    </SafeAreaView>
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
