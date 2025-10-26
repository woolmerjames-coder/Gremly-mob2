import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, RADII, SPACE } from './_tokens';

export default function NewChatSection({ onPress }: { onPress?: () => void }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Talk to Gremly about this Space.</Text>
      <TouchableOpacity accessibilityRole="button" onPress={onPress}>
        <Text style={styles.cta}>Start Chat</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.Linen,
    borderRadius: RADII.card,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: 'rgba(21,51,38,0.12)',
  },
  title: { color: COLORS.Deep, fontWeight: '700', marginBottom: 8 },
  cta: { color: COLORS.Moss, fontWeight: '800' },
});
