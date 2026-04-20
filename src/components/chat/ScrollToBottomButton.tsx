import React from 'react';
import { StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { ChevronDown } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { lightTokens } from '../../../design/tokens';

interface Props {
  visible: boolean;
  onPress: () => void;
  /** Optional style override — position/offset tuning per screen. */
  style?: ViewStyle;
}

export function ScrollToBottomButton({ visible, onPress, style }: Props) {
  if (!visible) return null;

  const handlePress = () => {
    Haptics.selectionAsync();
    onPress();
  };

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(150)}
      style={[styles.container, style]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={styles.button}
        onPress={handlePress}
        activeOpacity={0.7}
        accessibilityLabel="Scroll to latest message"
        accessibilityRole="button"
      >
        <ChevronDown size={18} color={lightTokens.colors.mossGreen} strokeWidth={2.5} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 16,
    alignItems: 'center',
    zIndex: 15,
  },
  button: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(46, 85, 64, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1A3328',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
});

export default ScrollToBottomButton;
