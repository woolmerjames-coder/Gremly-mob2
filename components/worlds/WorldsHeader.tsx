import { View, StyleSheet } from 'react-native';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import MascotLottie from '../../app/components/MascotLottie';

export function WorldsHeader() {
  return (
    <View style={styles.header}>
      <Text style={styles.greet}>Your worlds</Text>
      <MascotLottie width={110} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 8,
  },
  greet: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 44,
    fontWeight: '700',
    color: lightTokens.colors.worldsInk,
    letterSpacing: -0.8,
    lineHeight: 48,
    flex: 1,
    flexShrink: 1,
  },
});
