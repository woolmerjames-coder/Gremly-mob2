/**
 * FirstTodayVisitBubble - Brief orientation for new users visiting Today page
 *
 * Shows a small speech bubble from Gremly on first visit.
 * Dismisses on tap or after 5 seconds.
 */

import React, { useEffect } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from '../../ui/Text';
import { BRAND } from '../../design/brand';
import Reanimated, { FadeIn, FadeOut } from 'react-native-reanimated';

interface FirstTodayVisitBubbleProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function FirstTodayVisitBubble({ visible, onDismiss }: FirstTodayVisitBubbleProps) {
  // Auto-dismiss after 5 seconds
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [visible, onDismiss]);

  if (!visible) return null;

  return (
    <Reanimated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(200)}
      style={styles.container}
      pointerEvents="box-none"
    >
      <Pressable style={styles.bubble} onPress={onDismiss}>
        <Text style={styles.text}>Your daily game plan. It'll fill up as you drop and sweep!</Text>
      </Pressable>
      {/* Speech bubble tail pointing to Gremly */}
      <View style={styles.tail} />
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 90, // Below the header, next to Gremly
    right: 20,
    alignItems: 'flex-end',
    zIndex: 1000,
  },
  bubble: {
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.lg,
    padding: 14,
    maxWidth: 240,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  text: {
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    lineHeight: 21,
    color: BRAND.colors.charcoalInk,
  },
  tail: {
    position: 'absolute',
    top: -6,
    right: 24,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: BRAND.colors.surface,
  },
});
