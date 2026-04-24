import { SafeAreaView } from 'react-native-safe-area-context';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useState, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { lightTokens } from '../../design/tokens';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { WorldsHeader } from '../../components/worlds/WorldsHeader';
import { ProposalBanner } from '../../components/worlds/ProposalBanner';
import { WeeklySummaryCard } from '../../components/worlds/WeeklySummaryCard';
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

  function handlePressPastSummaries() {
    nav.navigate('WeeklySummary', undefined);
  }

  function handlePressProposals() {
    console.log('[WorldsScreen] press proposals');
    // proposals sheet lands in 4b
  }

  function handlePressWeeklySummary() {
    console.log('[WorldsScreen] press weekly summary');
    // summary detail lands in a later batch
  }

  function handlePressWorld(worldId: string) {
    nav.navigate('WorldDetail', { worldId });
  }

  function handlePressAdd() {
    console.log('[WorldsScreen] press add world');
    // create sheet lands in 4a.5
  }

  function handlePressChapter(chapterId: string) {
    nav.navigate('ChapterDetail', { chapterId });
  }

  function handlePressPerson(personName: string) {
    nav.navigate('PersonDetail', { personName });
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
        <WeeklySummaryCard
          onPressNew={handlePressWeeklySummary}
          onPressPastSummaries={handlePressPastSummaries}
        />
        <View style={{ marginTop: 20 }}>
          <WorldsGrid onPressWorld={handlePressWorld} onPressAdd={handlePressAdd} />
        </View>
        {/* TODO(4a.6): Contexts section hidden until we clarify its purpose to users. */}
        {/* <ContextsChipRow /> */}
        <OpenChaptersSection onPressChapter={handlePressChapter} />
        <RecentClosedChaptersSection onPressChapter={handlePressChapter} />
        <PeopleRow onPressPerson={handlePressPerson} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightTokens.colors.worldsSurface },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
});
