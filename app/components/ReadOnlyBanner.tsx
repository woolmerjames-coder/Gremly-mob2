import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useIsReadOnly } from '../../lib/store/lifecycleSelectors';
import type { RootStackParamList } from '../../navigation/RootNavigator';

export function ReadOnlyBanner() {
  const isReadOnly = useIsReadOnly();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  if (!isReadOnly) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(300)}
      style={styles.container}
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
