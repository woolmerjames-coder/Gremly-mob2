/**
 * FirstDropSpotlight - Prompts new users to make their first drop
 *
 * Shows a dark overlay covering the top portion of the screen with Gremly and speech bubble.
 * The input area at the bottom remains fully visible and interactive.
 */

import React from 'react';
import { View, StyleSheet, Image, Pressable, Dimensions } from 'react-native';
import { Text } from '../../ui/Text';
import { BRAND } from '../../design/brand';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { FadeIn, FadeOut } from 'react-native-reanimated';

import GREMLY_MASCOT from '../../assets/mascot/gremly-mascot.png';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Height of the bottom area to keep visible (input + button + tab bar + padding)
const BOTTOM_CLEAR_ZONE = 220;

interface FirstDropSpotlightProps {
  visible: boolean;
  mode?: 'pre-drop' | 'post-drop';
  onDismiss: () => void;
  onShowSweepDemo?: () => void;
}

export default function FirstDropSpotlight({
  visible,
  mode = 'pre-drop',
  onDismiss,
  onShowSweepDemo,
}: FirstDropSpotlightProps) {
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  const overlayHeight = SCREEN_HEIGHT - BOTTOM_CLEAR_ZONE - insets.bottom;

  return (
    <Reanimated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(200)}
      style={[StyleSheet.absoluteFill, styles.container]}
      pointerEvents="box-none"
    >
      {/* Overlay covering top portion only */}
      <Pressable
        style={[styles.overlay, { height: overlayHeight }]}
        onPress={mode === 'pre-drop' ? onDismiss : undefined}
      />

      {/* Gremly + Speech - positioned 1/3 down the screen */}
      <View style={[styles.contentContainer, { top: overlayHeight * 0.4 }]}>
        <Image source={GREMLY_MASCOT} style={styles.mascot} resizeMode="contain" />
        <View style={styles.speechBubble}>
          {mode === 'pre-drop' ? (
            <>
              <Text style={styles.speechText}>
                Drop your first thought! A task, a worry, an idea, something you keep forgetting —
                anything. I'll sort it out later.
              </Text>
              <Text style={styles.hintText}>Tap anywhere or start typing</Text>
            </>
          ) : (
            <>
              <Text style={styles.speechText}>
                Nice! That's your first drop. Want me to show you how the Sweep works?
              </Text>
              <View style={styles.buttonRow}>
                <Pressable style={styles.primaryButton} onPress={onShowSweepDemo}>
                  <Text style={styles.primaryButtonText}>Show me</Text>
                </Pressable>
                <Pressable style={styles.secondaryLink} onPress={onDismiss}>
                  <Text style={styles.secondaryLinkText}>Maybe later</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 1000,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  contentContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  mascot: {
    width: 80,
    height: 80,
  },
  speechBubble: {
    flex: 1,
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.lg,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  speechText: {
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    lineHeight: 22,
    color: BRAND.colors.charcoalInk,
  },
  hintText: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    marginTop: 8,
  },
  buttonRow: {
    marginTop: 16,
    gap: 4,
  },
  primaryButton: {
    backgroundColor: BRAND.colors.mossGreen,
    paddingVertical: 12,
    borderRadius: BRAND.radius.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: '#FFFFFF',
  },
  secondaryLink: {
    paddingVertical: 6,
    alignItems: 'center',
  },
  secondaryLinkText: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: BRAND.colors.inkMuted,
  },
});
