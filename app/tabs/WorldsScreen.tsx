import { SafeAreaView } from 'react-native-safe-area-context';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useState, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { WorldsHeader } from '../../components/worlds/WorldsHeader';
import { ProposalBanner } from '../../components/worlds/ProposalBanner';
import { WeeklySummaryCard } from '../../components/worlds/WeeklySummaryCard';
import { PastSummariesLink } from '../../components/worlds/PastSummariesLink';
import { WorldsGrid } from '../../components/worlds/WorldsGrid';
import { ContextsChipRow } from '../../components/worlds/ContextsChipRow';
import { OpenChaptersSection } from '../../components/worlds/OpenChaptersSection';
import { RecentClosedChaptersSection } from '../../components/worlds/RecentClosedChaptersSection';
import { PeopleRow } from '../../components/worlds/PeopleRow';

export default function WorldsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const refreshWorldsGraph = useGremlyStore((s) => s.refreshWorldsGraph);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshWorldsGraph();
    setRefreshing(false);
  }, [refreshWorldsGraph]);

  function handlePressProposals() {
    console.log('[WorldsScreen] press proposals');
    // proposals sheet lands in 4b
  }

  function handlePressWeeklySummary() {
    console.log('[WorldsScreen] press weekly summary');
    // summary detail lands in a later batch
  }

  function handlePressPastSummaries() {
    console.log('[WorldsScreen] press past summaries');
    // past summaries screen lands in a later batch
  }

  function handlePressWorld(worldId: string) {
    nav.navigate('WorldDetail', { worldId });
  }

  function handlePressAdd() {
    console.log('[WorldsScreen] press add world');
    // create sheet lands in 4a.5
  }

  function handlePressContext(contextId: string) {
    console.log('[WorldsScreen] press context', contextId);
    // navigation lands in 4a.3
  }

  function handlePressChapter(chapterId: string) {
    nav.navigate('ChapterDetail', { chapterId });
  }

  function handlePressPerson(personId: string) {
    console.log('[WorldsScreen] press person', personId);
    // navigation lands in 4a.3
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="worlds-screen">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={lightTokens.colors.ambergold}
          />
        }
      >
        <WorldsHeader />
        <ProposalBanner onPress={handlePressProposals} />
        <WeeklySummaryCard onPressNew={handlePressWeeklySummary} />
        <PastSummariesLink onPress={handlePressPastSummaries} />
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>WORLDS</Text>
        </View>
        <WorldsGrid onPressWorld={handlePressWorld} onPressAdd={handlePressAdd} />
        <ContextsChipRow onPressContext={handlePressContext} />
        <OpenChaptersSection onPressChapter={handlePressChapter} />
        <RecentClosedChaptersSection onPressChapter={handlePressChapter} />
        <PeopleRow onPressPerson={handlePressPerson} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightTokens.colors.oatDeep },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  sectionHeader: {
    marginTop: 18,
    paddingHorizontal: 22,
    paddingBottom: 10,
  },
  sectionLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: lightTokens.colors.warmGrey,
    textTransform: 'uppercase',
  },
});
