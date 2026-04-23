import { SafeAreaView } from 'react-native-safe-area-context';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import { WorldsHeader } from '../../components/worlds/WorldsHeader';
import { WeeklySummaryCard } from '../../components/worlds/WeeklySummaryCard';
import { PastSummariesLink } from '../../components/worlds/PastSummariesLink';
import { WorldsGrid } from '../../components/worlds/WorldsGrid';
import { ContextsChipRow } from '../../components/worlds/ContextsChipRow';
import { OpenChaptersSection } from '../../components/worlds/OpenChaptersSection';
import { RecentClosedChaptersSection } from '../../components/worlds/RecentClosedChaptersSection';

export default function WorldsScreen() {
  function handleSummaryPress() {
    Alert.alert('Weekly Summary', 'Summary detail coming in a later batch.');
  }

  function handlePastPress() {
    Alert.alert('Past Summaries', 'Past summaries screen coming in a later batch.');
  }

  function handlePressWorld(worldId: string) {
    console.log('[WorldsScreen] press world', worldId);
    // navigation lands in 4a.3
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
    console.log('[WorldsScreen] press chapter', chapterId);
    // navigation lands in 4a.3
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="worlds-screen">
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <WorldsHeader />
        <WeeklySummaryCard onPressNew={handleSummaryPress} />
        <PastSummariesLink onPress={handlePastPress} />
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>WORLDS</Text>
        </View>
        <WorldsGrid onPressWorld={handlePressWorld} onPressAdd={handlePressAdd} />
        <ContextsChipRow onPressContext={handlePressContext} />
        <OpenChaptersSection onPressChapter={handlePressChapter} />
        <RecentClosedChaptersSection onPressChapter={handlePressChapter} />
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
