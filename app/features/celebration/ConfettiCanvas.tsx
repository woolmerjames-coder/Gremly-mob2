/**
 * Phase 10.9: Confetti Canvas
 *
 * Animated confetti burst using Reanimated for streak milestones.
 * Duration: 1.4 seconds, then auto-dismisses.
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ConfettiPiece {
  id: number;
  x: number;
  y: number;
  color: string;
  rotation: number;
  size: number;
}

export interface ConfettiCanvasProps {
  onComplete?: () => void;
}

const COLORS = ['#FFD700', '#FF6B6B', '#4ECDC4', '#95E1D3', '#F38181', '#AA96DA'];

function generateConfetti(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * SCREEN_WIDTH,
    y: -20,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    rotation: Math.random() * 360,
    size: 6 + Math.random() * 6,
  }));
}

function ConfettiPieceComponent({ piece, delay }: { piece: ConfettiPiece; delay: number }) {
  const translateY = useSharedValue(-20);
  const opacity = useSharedValue(1);
  const rotate = useSharedValue(piece.rotation);

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withTiming(SCREEN_HEIGHT + 100, {
        duration: 1400,
        easing: Easing.out(Easing.cubic),
      }),
    );

    opacity.value = withDelay(
      delay + 1000,
      withTiming(0, {
        duration: 400,
      }),
    );

    rotate.value = withDelay(
      delay,
      withTiming(piece.rotation + 720, {
        duration: 1400,
        easing: Easing.linear,
      }),
    );
  }, [delay, piece.rotation, translateY, opacity, rotate]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: piece.x },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.confettiPiece,
        animatedStyle,
        {
          backgroundColor: piece.color,
          width: piece.size,
          height: piece.size,
        },
      ]}
    />
  );
}

export function ConfettiCanvas({ onComplete }: ConfettiCanvasProps) {
  const [confetti] = useState(() => generateConfetti(50));

  useEffect(() => {
    const timer = setTimeout(() => {
      if (onComplete) {
        onComplete();
      }
    }, 1800); // Slightly longer than animation to ensure cleanup

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <View style={styles.container} pointerEvents="none">
      {confetti.map((piece, index) => (
        <ConfettiPieceComponent
          key={piece.id}
          piece={piece}
          delay={index * 10} // Stagger slightly
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9998,
    overflow: 'hidden',
  },
  confettiPiece: {
    position: 'absolute',
    borderRadius: 2,
  },
});
