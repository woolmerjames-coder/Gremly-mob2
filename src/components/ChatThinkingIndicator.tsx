/**
 * ChatThinkingIndicator
 * Calm thinking indicator for Space Chat: breathing orb and optional mascot.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { lightTokens } from '../../design/tokens';
import { Mascot } from '../../app/features/mascot/Mascot';
import { shouldShowMascot } from '../../config/featureFlags';
import { InlineStreamingCursor } from '../../components/chat/StreamingCursor';

export type ChatThinkingIndicatorProps = {
  visible: boolean;
  variant?: 'dots' | 'mascot' | 'both';
};

export function ChatThinkingIndicator({ visible, variant = 'both' }: ChatThinkingIndicatorProps) {
  const showMascot = shouldShowMascot() && (variant === 'mascot' || variant === 'both');
  const showOrb = variant === 'dots' || variant === 'both';

  if (!visible) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {showMascot && (
        <View style={styles.mascotWrap}>
          <Mascot size="sm" />
        </View>
      )}
      {showOrb && (
        <View style={styles.orbWrap}>
          <InlineStreamingCursor visible={visible} size={12} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: lightTokens.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mascotWrap: {
    // mascot on left
  },
  orbWrap: {
    // breathing orb
  },
});

export default ChatThinkingIndicator;
