import React from 'react';
import { Text, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { WifiOff } from 'lucide-react-native';
import { useNetworkStatus } from '../../lib/network/useNetworkStatus';

export function OfflineBanner() {
  const { isConnected } = useNetworkStatus();

  if (isConnected) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(300)}
      style={styles.container}
    >
      <WifiOff size={14} color="#5C6B5C" />
      <Text style={styles.text}>You're offline — your drops are still safe</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    backgroundColor: '#E8EDE8',
  },
  text: {
    fontSize: 13,
    color: '#5C6B5C',
    fontWeight: '500',
  },
});
