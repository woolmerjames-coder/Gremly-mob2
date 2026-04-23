import { SafeAreaView } from 'react-native-safe-area-context';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { lightTokens } from '../../design/tokens';
import { WorldsHeader } from '../../components/worlds/WorldsHeader';
import { WeeklySummaryCard } from '../../components/worlds/WeeklySummaryCard';
import { PastSummariesLink } from '../../components/worlds/PastSummariesLink';

export default function WorldsScreen() {
  function handleSummaryPress() {
    Alert.alert('Weekly Summary', 'Summary detail coming in a later batch.');
  }

  function handlePastPress() {
    Alert.alert('Past Summaries', 'Past summaries screen coming in a later batch.');
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="worlds-screen">
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <WorldsHeader />
        <WeeklySummaryCard onPressNew={handleSummaryPress} />
        <PastSummariesLink onPress={handlePastPress} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightTokens.colors.oatDeep },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
});
