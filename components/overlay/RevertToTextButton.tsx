import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { RotateCcw } from 'lucide-react-native';

interface RevertToTextButtonProps {
  onPress: () => void;
}

export function RevertToTextButton({ onPress }: RevertToTextButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Revert to text"
    >
      <RotateCcw size={16} color="#888" />
      <Text style={styles.text}>Revert to text</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 8,
  },
  pressed: {
    opacity: 0.6,
  },
  text: {
    fontSize: 14,
    color: '#888',
  },
});
