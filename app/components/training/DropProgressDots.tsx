import React, { useEffect, useMemo } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { BRAND } from '../../../design/brand';

interface DropProgressDotsProps {
  currentStep: number;
}

export default function DropProgressDots({ currentStep }: DropProgressDotsProps) {
  const pulseAnim = useMemo(() => new Animated.Value(1), []);

  useEffect(() => {
    if (currentStep === 5) {
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 150, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
    }
  }, [currentStep, pulseAnim]);

  if (currentStep < 1 || currentStep > 5) return null;

  const dots = Array.from({ length: 5 }, (_, i) => (
    <View key={i} style={i < currentStep ? styles.filledDot : styles.hollowDot} />
  ));

  return (
    <Animated.View style={[styles.container, { transform: [{ scale: pulseAnim }] }]}>
      {dots}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  filledDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BRAND.colors.mossGreen,
  },
  hollowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#D4D6CE',
  },
});
