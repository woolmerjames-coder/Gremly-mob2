import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, View, Pressable } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft } from 'lucide-react-native';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import { useWorldById } from '../../lib/store/worldsSelectors';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { WorldDetailHeader } from '../../components/worlds/WorldDetailHeader';
import { WorldHero } from '../../components/worlds/WorldHero';

type RouteT = RouteProp<RootStackParamList, 'WorldDetail'>;
type NavT = NativeStackNavigationProp<RootStackParamList, 'WorldDetail'>;

export default function WorldDetailScreen() {
  const route = useRoute<RouteT>();
  const nav = useNavigation<NavT>();
  const world = useWorldById(route.params.worldId);

  if (!world) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.hdr}>
          <Pressable onPress={() => nav.goBack()} style={styles.back}>
            <ChevronLeft size={24} color={lightTokens.colors.deepForest} />
          </Pressable>
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>World not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID={`world-detail-${world.id}`}>
      <WorldDetailHeader
        title={world.display_name || world.name}
        onBack={() => nav.goBack()}
        worldId={world.id}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <WorldHero world={world} />
        <Text style={styles.placeholder}>World detail assembles in batches 2 through 4.</Text>
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
