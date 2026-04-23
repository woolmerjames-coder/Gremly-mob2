import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, View, Pressable } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft } from 'lucide-react-native';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import { useChapterById } from '../../lib/store/worldsSelectors';
import type { RootStackParamList } from '../../navigation/RootNavigator';

type RouteT = RouteProp<RootStackParamList, 'ChapterDetail'>;
type NavT = NativeStackNavigationProp<RootStackParamList, 'ChapterDetail'>;

export default function ChapterDetailScreen() {
  const route = useRoute<RouteT>();
  const nav = useNavigation<NavT>();
  const chapter = useChapterById(route.params.chapterId);

  if (!chapter) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.hdr}>
          <Pressable onPress={() => nav.goBack()} style={styles.back}>
            <ChevronLeft size={24} color={lightTokens.colors.deepForest} />
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
        <Pressable onPress={() => nav.goBack()} style={styles.back}>
          <ChevronLeft size={24} color={lightTokens.colors.deepForest} />
        </Pressable>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{chapter.title}</Text>
        </View>
        <View style={styles.back} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <Text style={styles.placeholder}>Chapter detail assembles in batch 5.</Text>
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
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flex: 1, alignItems: 'center' },
  title: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: lightTokens.colors.deepForest,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: lightTokens.colors.warmGrey,
  },
  placeholder: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: lightTokens.colors.warmGrey,
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: 24,
  },
});
