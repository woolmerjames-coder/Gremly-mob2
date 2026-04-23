import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, View, Pressable } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft } from 'lucide-react-native';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import { useWorldById, useCurrentChapterForWorld } from '../../lib/store/worldsSelectors';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { WorldDetailHeader } from '../../components/worlds/WorldDetailHeader';
import { WorldHero } from '../../components/worlds/WorldHero';
import { CurrentChapterBigCard } from '../../components/worlds/CurrentChapterBigCard';
import { NoCurrentChapterCard } from '../../components/worlds/NoCurrentChapterCard';
import { GremlyNoticedSlot } from '../../components/worlds/GremlyNoticedSlot';
import { WorldActionButtons } from '../../components/worlds/WorldActionButtons';
import { ModuleRenderer } from '../../components/worlds/modules/ModuleRenderer';

type RouteT = RouteProp<RootStackParamList, 'WorldDetail'>;
type NavT = NativeStackNavigationProp<RootStackParamList, 'WorldDetail'>;

export default function WorldDetailScreen() {
  const route = useRoute<RouteT>();
  const nav = useNavigation<NavT>();
  const world = useWorldById(route.params.worldId);
  const currentChapter = useCurrentChapterForWorld(route.params.worldId);

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
      <WorldDetailHeader title={worldName} onBack={() => nav.goBack()} worldId={world.id} />
      <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
        <WorldHero world={world} />
        {currentChapter ? (
          <CurrentChapterBigCard
            chapter={currentChapter}
            worldId={world.id}
            onPress={(chapterId) => nav.navigate('ChapterDetail', { chapterId })}
          />
        ) : (
          <NoCurrentChapterCard worldId={world.id} />
        )}
        <ModuleRenderer world={world} />
        <GremlyNoticedSlot worldId={world.id} />
        <View style={{ height: 60 }} />
      </ScrollView>
      <WorldActionButtons
        worldName={worldName}
        onAddPress={() => console.log('[WorldDetail] add to world', world.id)}
        onChatPress={() => console.log('[WorldDetail] chat with world', world.id)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightTokens.colors.worldsSurface },
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
