/**
 * ToggleSwitch — iOS-style toggle matching Gremly design
 */

import React from 'react';
import { Pressable, View, StyleSheet, Animated } from 'react-native';

interface ToggleSwitchProps {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
  testID?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  on,
  onToggle,
  disabled = false,
  testID,
}) => (
  <Pressable
    onPress={onToggle}
    disabled={disabled}
    style={[
      styles.track,
      { backgroundColor: on ? '#2E5540' : '#C5C0B8' },
      disabled && { opacity: 0.5 },
    ]}
    accessibilityRole="switch"
    accessibilityState={{ checked: on }}
    testID={testID}
  >
    <View
      style={[
        styles.thumb,
        { left: on ? 20 : 2 },
      ]}
    />
  </Pressable>
);

const styles = StyleSheet.create({
  track: {
    width: 42,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
  },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    position: 'absolute',
    top: 2,
  },
});
