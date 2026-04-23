import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, View, Pressable } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, MoreHorizontal } from 'lucide-react-native';
import { SheetManager } from 'react-native-actions-sheet';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import { useChapterById, useWorldById } from '../../lib/store/worldsSelectors';
import { ChapterHeroCard } from '../../components/worlds/ChapterHeroCard';
import { ParentWorldPill } from '../../components/worlds/ParentWorldPill';
import { ChapterLinkedDrops } from '../../components/worlds/ChapterLinkedDrops';
import type { RootStackParamList } from '../../navigation/RootNavigator';

type RouteT = RouteProp<RootStackParamList, 'ChapterDetail'>;
type NavT = NativeStackNavigationProp<RootStackParamList, 'ChapterDetail'>;

export default function ChapterDetailScreen() {
  const route = useRoute<RouteT>();
  const nav = useNavigation<NavT>();
  const chapter = useChapterById(route.params.chapterId);
  const parentWorld = useWorldById(chapter?.primary_world_id ?? '');
  const worldName = parentWorld?.display_name || parentWorld?.name || 'World';

  if (!chapter) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.hdr}>
          <Pressable onPress={() => nav.goBack()} style={styles.iconBtn}>
            <ChevronLeft size={22} color={lightTokens.colors.deepForest} />
          </Pressable>
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Chapter not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID={`chapter-detail-${chapter.id}`}>
      <View style={styles.hdr}>
        <Pressable onPress={() => nav.goBack()} style={styles.iconBtn} testID="chapter-detail-back">
          <ChevronLeft size={22} color={lightTokens.colors.deepForest} />
        </Pressable>
        <View style={styles.titleWrap}>
          <View style={styles.titleInner}>
            <Text style={styles.title} numberOfLines={1}>
              {chapter.title}
            </Text>
            <View style={styles.underline} />
          </View>
        </View>
        <Pressable
          onPress={() =>
            (SheetManager.show as (...args: any[]) => void)('chapter-menu', {
              payload: { chapterId: chapter.id },
            })
          }
          style={styles.iconBtn}
          testID="chapter-detail-menu"
        >
          <MoreHorizontal size={20} color={lightTokens.colors.deepForest} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <ChapterHeroCard chapter={chapter} />
        {parentWorld ? (
          <ParentWorldPill
            worldName={worldName}
            onPress={() => nav.navigate('WorldDetail', { worldId: parentWorld.id })}
          />
        ) : null}
        <ChapterLinkedDrops chapter={chapter} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightTokens.colors.oatDeep },
  hdr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  titleInner: { alignItems: 'center', paddingBottom: 4 },
  title: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: lightTokens.colors.deepForest,
    maxWidth: 240,
  },
  underline: {
    marginTop: 3,
    width: 44,
    height: 3,
    borderRadius: 2,
    backgroundColor: lightTokens.colors.ambergold,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: lightTokens.colors.warmGrey,
  },
});
