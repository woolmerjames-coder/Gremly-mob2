import React from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { COLORS } from './_tokens';

export default function KebabMenu({ onPress }: { onPress?: () => void }) {
  return (
    <TouchableOpacity accessibilityLabel="More" accessibilityRole="button" onPress={onPress}>
      <Text style={{ color: COLORS.Linen, fontSize: 18 }}>⋯</Text>
    </TouchableOpacity>
  );
}
