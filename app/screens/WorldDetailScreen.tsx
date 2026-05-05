import { SafeAreaView } from 'react-native-safe-area-context';
import { Animated, StyleSheet, View, Pressable } from 'react-native';
import { useState } from 'react';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft } from 'lucide-react-native';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import { useWorldById, useCurrentChapterForWorld } from '../../lib/store/worldsSelectors';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { WorldDetailHeader } from '../../components/worlds/WorldDetailHeader';
import { ArchetypeLayoutDispatcher } from '../../components/worlds/ArchetypeLayoutDispatcher';
import { GremlyNoticedSlot } from '../../components/worlds/GremlyNoticedSlot';
import { WorldActionButtons } from '../../components/worlds/WorldActionButtons';

type RouteT = RouteProp<RootStackParamList, 'WorldDetail'>;
type NavT = NativeStackNavigationProp<RootStackParamList, 'WorldDetail'>;

export default function WorldDetailScreen() {
  const route = useRoute<RouteT>();
  const nav = useNavigation<NavT>();
  const world = useWorldById(route.params.worldId);
  const currentChapter = useCurrentChapterForWorld(route.params.worldId);

  // Must be declared before any early return (Rules of Hooks)
  const [scrollY] = useState(() => new Animated.Value(0));

  if (!world) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.hdr}>
          <Pressable onPress={() => nav.goBack()} style={styles.back}>
            <ChevronLeft size={24} color={lightTokens.colors.worldsInk} />
          </Pressable>
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>World not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const worldName = world.display_name || world.name;

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID={`world-detail-${world.id}`}>
      <WorldDetailHeader
        title={worldName}
        onBack={() => nav.goBack()}
        worldId={world.id}
        titleMode="scroll"
        scrollY={scrollY}
      />
      <Animated.ScrollView
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }, // opacity interpolation requires JS driver
        )}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}
      >
        <ArchetypeLayoutDispatcher world={world} currentChapter={currentChapter} />
        <GremlyNoticedSlot worldId={world.id} />
        <View style={{ height: 60 }} />
      </Animated.ScrollView>
      <WorldActionButtons
        worldName={worldName}
        onAddPress={() => console.log('[WorldDetail] add to world', world.id)}
        onChatPress={() => nav.navigate('ScopedChat', { scopeType: 'world', scopeId: world.id, scopeName: worldName })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightTokens.colors.worldsSurface },
  scrollContent: { paddingBottom: 12 },
  hdr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: lightTokens.colors.warmGrey,
  },
});
