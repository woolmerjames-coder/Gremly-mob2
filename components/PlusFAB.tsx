import { Pressable, Text, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';

/**
 * PlusFAB - Floating Action Button
 *
 * A round floating "+" button positioned at bottom-right with shadow.
 * Provides press feedback with scale animation.
 *
 * Props:
 *   - onPress: Function to call when pressed
 *   - testID: Test identifier (default: "plus-fab")
 */

interface PlusFABProps {
  onPress: () => void;
  testID?: string;
}

export default function PlusFAB({ onPress, testID = 'plus-fab' }: PlusFABProps) {
  const insets = useSafeAreaInsets();
  const [scale] = useState(new Animated.Value(1));

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.9,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 3,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          bottom: (insets.bottom || 16) + 16,
          right: 16,
          transform: [{ scale }],
        },
      ]}
    >
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel="Add new item"
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.button}
      >
        <Text style={styles.plusIcon}>+</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 999,
  },
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0F4C5C', // deepTeal
    alignItems: 'center',
    justifyContent: 'center',
    // Shadow for iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    // Elevation for Android
    elevation: 8,
  },
  plusIcon: {
    fontSize: 32,
    color: '#FFFFFF',
    fontWeight: '300',
    lineHeight: 32,
  },
});
