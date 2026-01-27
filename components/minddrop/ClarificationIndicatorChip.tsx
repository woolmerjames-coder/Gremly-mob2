import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
 */
export function ClarificationIndicatorChip({ onPress }: ClarificationIndicatorChipProps) {
  const chipContent = (
    <View style={styles.chip}>
      <HelpCircle size={11} color="#B48C50" strokeWidth={2.5} />
      <Text style={styles.text}>Clarify</Text>
    </View>
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
