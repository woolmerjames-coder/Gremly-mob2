/**
 * ChatThinkingIndicator
 * Calm thinking indicator for Space Chat: pulsing dots and optional mascot.
 */
import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { lightTokens } from '../../design/tokens';
import { Mascot } from '../../app/features/mascot/Mascot';
import { shouldShowMascot } from '../../config/featureFlags';

export type ChatThinkingIndicatorProps = {
  visible: boolean;
  variant?: 'dots' | 'mascot' | 'both';
};

export function ChatThinkingIndicator({ visible, variant = 'both' }: ChatThinkingIndicatorProps) {
  // Outer fade for smooth appear/disappear
  const containerOpacity = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    Animated.timing(containerOpacity, {
      toValue: visible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [visible, containerOpacity]);

  // Dots pulsing animation (1.2s cycle), staggered
  const dot1 = useMemo(() => new Animated.Value(0.3), []);
  const dot2 = useMemo(() => new Animated.Value(0.3), []);
  const dot3 = useMemo(() => new Animated.Value(0.3), []);

  useEffect(() => {
    const createPulse = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        ]),
      );

    const a1 = createPulse(dot1, 0);
    const a2 = createPulse(dot2, 200);
    const a3 = createPulse(dot3, 400);

    if (visible) {
      a1.start();
      a2.start();
      a3.start();
    }
    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [visible, dot1, dot2, dot3]);

  const showMascot = shouldShowMascot() && (variant === 'mascot' || variant === 'both');
  const showDots = variant === 'dots' || variant === 'both';

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]} pointerEvents="none">
      {showMascot && (
        <View style={styles.mascotWrap}>
          <Mascot size="sm" />
        </View>
      )}
      {showDots && (
        <View style={styles.dotsRow}>
          <Animated.Text style={[styles.dot, { opacity: dot1 }]}>●</Animated.Text>
          <Animated.Text style={[styles.dot, { opacity: dot2 }]}>●</Animated.Text>
          <Animated.Text style={[styles.dot, { opacity: dot3 }]}>●</Animated.Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: lightTokens.colors.border,
  },
  mascotWrap: {
    marginBottom: 4,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    fontSize: 16,
    color: lightTokens.colors.subtle,
  },
});

export default ChatThinkingIndicator;
