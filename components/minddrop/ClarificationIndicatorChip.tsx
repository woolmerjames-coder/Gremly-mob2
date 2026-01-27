import React from 'react';
import { Pressable, StyleSheet, Text, View, Animated, Easing } from 'react-native';
import { HelpCircle } from 'lucide-react-native';

interface ClarificationIndicatorChipProps {
  onPress?: () => void;
}

/**
 * ClarificationIndicatorChip - Indicates that a Mind Drop card needs user clarification
 * before it can be fully processed.
 *
 * Displays in Row 3 of Mind Drop cards alongside other chips (time estimate, mood, etc.).
 * Uses a warm, subtle attention color that stands out but isn't alarming.
 *
 * The chip has a gentle pulsing animation that starts after the initial "emerge from mist"
 * animation completes. The pulse draws subtle attention without being distracting.
 *
 * NOTE: The parent AnimatedChipsTransition handles the coordinated "emerge from mist"
 * animation for ALL chips in Row 3 together. This chip's pulse starts after that.
 */
export function ClarificationIndicatorChip({ onPress }: ClarificationIndicatorChipProps) {
  // Pulsing animation - gentle scale pulse that draws attention
  const pulseAnim = React.useMemo(() => new Animated.Value(1), []);

  React.useEffect(() => {
    // Delay start by 1000ms to let the "emerge from mist" animation finish first
    const startTimeout = setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ).start();
    }, 1000);

    return () => clearTimeout(startTimeout);
  }, [pulseAnim]);

  const chipContent = (
    <Animated.View style={[styles.chip, { transform: [{ scale: pulseAnim }] }]}>
      <HelpCircle size={11} color="#B48C50" strokeWidth={2.5} />
      <Text style={styles.text}>Clarify</Text>
    </Animated.View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [pressed && styles.pressed]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {chipContent}
      </Pressable>
    );
  }

  return chipContent;
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255, 243, 224, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(180, 140, 80, 0.3)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  text: {
    fontSize: 10,
    color: '#8B6914',
    fontFamily: 'Inter-Medium',
  },
  pressed: {
    opacity: 0.7,
  },
});

export default ClarificationIndicatorChip;
