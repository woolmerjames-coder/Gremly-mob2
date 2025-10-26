import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, RADII, SPACE } from './_tokens';

export default function Menu() {
  return (
    <View style={styles.menu} accessibilityLabel="Menu">
      <Text style={styles.item}>Rename Space</Text>
      <Text style={styles.item}>Edit Theme</Text>
      <Text style={styles.item}>Archive</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  menu: {
    backgroundColor: COLORS.Linen,
    borderRadius: RADII.card,
    padding: SPACE.sm,
    borderWidth: 1,
    borderColor: 'rgba(21,51,38,0.12)',
  },
  item: { paddingVertical: 8, paddingHorizontal: 12, color: COLORS.Deep, fontWeight: '600' },
});
