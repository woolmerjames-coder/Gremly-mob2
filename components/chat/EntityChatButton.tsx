/**
 * EntityChatButton - Button to open entity chat
 * Two variants: overlay (row with mascot + text) and sweep (text link)
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ImageSourcePropType } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { lightTokens } from '../../design/tokens';

// Gremly mascot image
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_MASCOT: ImageSourcePropType = require('../../assets/buttonforHP.png');

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
        accessibilityLabel="Chat with Gremly"
        accessibilityRole="button"
      >
        {/* Mascot */}
        <View style={styles.mascotContainer}>
          <Image source={GREMLY_MASCOT} style={styles.mascotImage} />
        </View>

        {/* Text */}
        <Text style={styles.overlayText}>Chat with Gremly</Text>

        {/* Chevron */}
        <ChevronRight size={18} color={lightTokens.colors.subtle} />
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
  // Overlay variant - full row with mascot + text
  overlayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(191, 216, 192, 0.3)', // Subtle sage background
    borderRadius: 12,
  },
  mascotContainer: {
    position: 'relative',
    marginRight: 10,
  },
  mascotImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  overlayText: {
    flex: 1,
    fontSize: 14,
    fontFamily: lightTokens.typography.fontFamily.medium,
    color: lightTokens.colors.mossGreen,
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
