import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import LottieView from 'lottie-react-native';

export interface ConfettiBurstProps {
  visible: boolean;
  onComplete?: () => void;
  /**
   * How long to keep the burst visible before calling onComplete.
   * Defaults to 350ms for subtle micro-celebrations.
   */
  durationMs?: number;
}

/**
 * ConfettiBurst - lightweight, subtle confetti overlay for micro-celebrations.
 * Auto-plays once when visible and then hides via onComplete().
 */
export default function ConfettiBurst({
  visible,
  onComplete,
  durationMs = 350,
}: ConfettiBurstProps) {
  const ref = useRef<LottieView>(null);

  useEffect(() => {
    if (visible) {
      // Play the animation and schedule completion
      ref.current?.reset();
      ref.current?.play();
      const t = setTimeout(() => onComplete?.(), Math.max(200, durationMs));
      return () => clearTimeout(t);
    }
  }, [visible, onComplete]);

  if (!visible) return null;

  return (
    <View pointerEvents="none" style={styles.overlay} accessibilityLabel="confetti-burst">
      <LottieView
        ref={ref}
        source={require('../assets/lottie/confetti.json')}
        autoPlay
        loop={false}
        style={styles.lottie}
        resizeMode={Platform.select({ ios: 'cover', android: 'cover', default: 'cover' })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lottie: {
    width: '100%',
    height: '100%',
    opacity: 0.9,
  },
});
