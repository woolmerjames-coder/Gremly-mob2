import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { lightTokens } from '../../design/tokens';

interface MakeActionableButtonProps {
  onPress: () => void;
}

export function MakeActionableButton({ onPress }: MakeActionableButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Make actionable"
    >
      <Sparkles size={18} color={lightTokens.colors.mossGreen} />
      <Text style={styles.text}>Make actionable</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(107, 142, 107, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(107, 142, 107, 0.3)',
    marginVertical: 16,
    alignSelf: 'center',
  },
  pressed: {
    opacity: 0.7,
    backgroundColor: 'rgba(107, 142, 107, 0.2)',
  },
  text: {
    fontSize: 15,
    fontWeight: '600',
    color: lightTokens.colors.mossGreen,
  },
});
