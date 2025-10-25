import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { lightTokens as t } from '../../../design/tokens';

export type ChatCTAProps = {
  onPress: () => void;
  disabled?: boolean;
};

export const ChatCTA: React.FC<ChatCTAProps> = ({ onPress, disabled }) => {
  const scale = useMemo(() => new Animated.Value(0.96), []);
  React.useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 6,
      tension: 120,
    }).start();
  }, [scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[styles.button, disabled && { opacity: 0.5 }]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Chat with Gremly"
        disabled={disabled}
      >
        <Text style={styles.icon}>✚</Text>
        <Text style={styles.label}>Chat with Gremly</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  button: {
    width: '100%',
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: t.colors.mossGreen,
  },
  icon: {
    color: t.colors.mossGreen,
    fontSize: 18,
    marginRight: 6,
  },
  label: {
    color: t.colors.mossGreen,
    fontSize: t.typography.size.md,
    fontWeight: '600',
  },
});

export default ChatCTA;
