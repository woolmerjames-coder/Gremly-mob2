import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useMemo } from 'react';
import { format } from 'date-fns';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import MascotIcon from '../../components/MascotIcon';
import { getDateService } from '../../lib/date';

export default function WorldsScreen() {
  const dateStr = useMemo(() => {
    return format(getDateService().now(), 'EEEE, MMMM d');
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="worlds-screen">
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greet}>Your worlds</Text>
            <Text style={styles.greetSub}>{dateStr}</Text>
          </View>
          <MascotIcon size={62} />
        </View>
        <Text style={styles.placeholder}>Worlds index assembles in batches 2 through 5.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightTokens.colors.oatDeep },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 6,
  },
  greet: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 24,
    color: lightTokens.colors.deepForest,
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  greetSub: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: lightTokens.colors.warmGrey,
    marginTop: 3,
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
