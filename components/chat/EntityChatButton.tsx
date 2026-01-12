/**
 * EntityChatButton - Button to open entity chat
 * Two variants: overlay (circular icon) and sweep (text link)
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MessageCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { lightTokens } from '../../design/tokens';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface EntityChatButtonProps {
  entityId: string;
  entityType: 'todo' | 'habit' | 'note';
  variant: 'overlay' | 'sweep';
  hasExistingChat?: boolean;
  onPress: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function EntityChatButton({
  entityId: _entityId,
  entityType: _entityType,
  variant,
  hasExistingChat = false,
  onPress,
}: EntityChatButtonProps) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  // ─── Overlay Variant ─────────────────────────────────────────────────────
  if (variant === 'overlay') {
    return (
      <TouchableOpacity
        style={styles.overlayButton}
        onPress={handlePress}
        activeOpacity={0.8}
        accessibilityLabel={hasExistingChat ? 'Continue chat with Gremly' : 'Chat with Gremly'}
        accessibilityRole="button"
      >
        <MessageCircle size={18} color={lightTokens.colors.onPrimary} />
        {hasExistingChat && <View style={styles.chatIndicator} />}
      </TouchableOpacity>
    );
  }

  // ─── Sweep Variant ───────────────────────────────────────────────────────
  return (
    <TouchableOpacity
      style={styles.sweepButton}
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityLabel={hasExistingChat ? 'Continue chat with Gremly' : 'Chat about this'}
      accessibilityRole="button"
    >
      <Text style={styles.sweepText}>
        {hasExistingChat ? 'Continue chat →' : 'Chat about this →'}
      </Text>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Overlay variant
  overlayButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: lightTokens.colors.mossGreen,
    alignItems: 'center',
    justifyContent: 'center',
    ...lightTokens.elevation.sm,
  },
  chatIndicator: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: lightTokens.colors.success,
    borderWidth: 1.5,
    borderColor: lightTokens.colors.surface,
  },

  // Sweep variant
  sweepButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  sweepText: {
    fontSize: 14,
    fontFamily: lightTokens.typography.fontFamily.medium,
    color: lightTokens.colors.mossGreen,
  },
});

export default EntityChatButton;
