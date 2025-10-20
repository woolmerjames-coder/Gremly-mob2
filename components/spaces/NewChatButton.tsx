/**
 * NewChatButton - Button to create a new chat in a space
 */

import React from 'react';
import { Text, StyleSheet, TouchableOpacity, type ViewStyle } from 'react-native';
import { lightTokens } from '../../design/tokens';

interface NewChatButtonProps {
  onPress: () => void;
  disabled?: boolean;
}

export function NewChatButton({ onPress, disabled }: NewChatButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.button, disabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel="Start new chat"
      accessibilityRole="button"
      accessibilityHint="Opens a new chat with Gremly"
    >
      <Text style={styles.icon}>💬</Text>
      <Text style={styles.text}>Talk to Gremly</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightTokens.colors.primary,
    paddingVertical: lightTokens.spacing[3],
    paddingHorizontal: lightTokens.spacing[5],
    borderRadius: lightTokens.radius[4],
    marginBottom: lightTokens.spacing[4],
    ...lightTokens.elevation.sm,
  } as ViewStyle,
  buttonDisabled: {
    opacity: 0.5,
  },
  icon: {
    fontSize: 20,
    marginRight: lightTokens.spacing[2],
  },
  text: {
    fontSize: lightTokens.typography.size.md,
    fontWeight: '600',
    color: lightTokens.colors.onPrimary,
  },
});
