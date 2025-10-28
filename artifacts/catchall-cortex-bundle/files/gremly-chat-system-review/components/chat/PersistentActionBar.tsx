/**
 * PersistentActionBar - Always-visible bar above the chat input
 * Reinforces user-initiated actions in a Space.
 */
import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { Plus } from 'lucide-react-native';
import { lightTokens } from '../../design/tokens';

type Props = {
  onPress?: () => void;
  testID?: string;
};

export function PersistentActionBar({ onPress, testID }: Props) {
  const scale = useMemo(() => new Animated.Value(1), []);

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.98,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start();
  };

  return (
    <View style={styles.container} testID={testID} accessibilityRole="button">
      <Animated.View style={[styles.inner, { transform: [{ scale }] }]}>
        <Pressable
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          android_ripple={{ color: 'rgba(0,0,0,0.05)' }}
          style={styles.pressable}
          accessibilityLabel="Set up an action in this Space"
        >
          <View style={styles.contentRow}>
            <View style={styles.iconWrap}>
              <Plus size={18} color="#E0C47A" />
            </View>
            <Text style={styles.label}>Set up an action in this Space</Text>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderTopWidth: 1,
    borderTopColor: lightTokens.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  inner: {},
  pressable: {
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1,
    borderColor: lightTokens.colors.border,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(224,196,122,0.12)', // Subtle golden pear halo
  },
  label: {
    fontSize: lightTokens.typography.size.md,
    color: lightTokens.colors.text,
  },
});

export default PersistentActionBar;
