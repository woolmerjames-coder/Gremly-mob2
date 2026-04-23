import { View, StyleSheet } from 'react-native';
import { useMemo } from 'react';
import { format } from 'date-fns';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import MascotLottie from '../../app/components/MascotLottie';
import { getDateService } from '../../lib/date';

export function WorldsHeader() {
  const dateStr = useMemo(() => format(getDateService().now(), 'EEEE, MMMM d'), []);
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.greet}>Your worlds</Text>
        <Text style={styles.greetSub}>{dateStr}</Text>
      </View>
      <MascotLottie width={62} />
    </View>
  );
}

const styles = StyleSheet.create({
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
    color: lightTokens.colors.worldsInk,
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  greetSub: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: lightTokens.colors.warmGrey,
    marginTop: 3,
  },
});
