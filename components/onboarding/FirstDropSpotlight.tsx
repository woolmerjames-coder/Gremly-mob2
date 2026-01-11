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
  onDismiss: () => void;
}

export default function FirstDropSpotlight({ visible, onDismiss }: FirstDropSpotlightProps) {
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
      <Pressable style={[styles.overlay, { height: overlayHeight }]} onPress={onDismiss} />

      {/* Gremly + Speech - positioned 1/3 down the screen */}
      <View style={[styles.contentContainer, { top: overlayHeight * 0.4 }]}>
        <Image source={GREMLY_MASCOT} style={styles.mascot} resizeMode="contain" />
        <View style={styles.speechBubble}>
          <Text style={styles.speechText}>
            Drop your first thought! Could be a task, a worry, a random idea, something to buy,
            someone to call...
          </Text>
          <Text style={styles.hintText}>Tap anywhere or start typing</Text>
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
});
