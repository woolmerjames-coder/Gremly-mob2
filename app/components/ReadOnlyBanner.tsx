import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsReadOnly } from '../../lib/store/lifecycleSelectors';
import type { RootStackParamList } from '../../navigation/RootNavigator';

export function ReadOnlyBanner() {
  const isReadOnly = useIsReadOnly();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  if (!isReadOnly) return null;

  // Check current route to hide banner on the paywall itself.
  // Use getState() instead of useNavigationState to avoid throwing
  // when the navigator hasn't finished mounting yet.
  const navState = navigation.getState();
  const currentRouteName = navState?.routes?.[navState.index]?.name ?? null;
  if (currentRouteName === 'TrialEndPaywall') return null;

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(300)}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      <Pressable
        onPress={() => navigation.navigate('TrialEndPaywall', { source: 'expiry' })}
        style={styles.pressable}
        accessibilityRole="button"
        accessibilityLabel="Your free access ended. Tap to subscribe."
      >
        <View style={styles.content}>
          <Text style={styles.text}>
            Free access ended. Tap to subscribe — your Gremly is safe.
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#E8EDE8',
  },
  pressable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  content: {
    alignItems: 'center',
  },
  text: {
    fontSize: 13,
    color: '#5C6B5C',
    fontWeight: '500',
  },
});
