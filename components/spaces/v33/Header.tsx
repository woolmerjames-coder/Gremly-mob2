import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, RADII, SPACE } from './_tokens';

export type HeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onSearch?: () => void;
  onMenu?: () => void;
};

export default function Header({ title, subtitle, onBack, onSearch, onMenu }: HeaderProps) {
  return (
    <View style={styles.wrap}>
      <TouchableOpacity accessibilityLabel="Back" accessibilityRole="button" onPress={onBack}>
        <Text style={styles.chevron}>‹</Text>
      </TouchableOpacity>
      <View style={styles.center}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      <View style={styles.actions}>
        <TouchableOpacity accessibilityLabel="Search" accessibilityRole="button" onPress={onSearch}>
          <Text style={styles.action}>⌕</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityLabel="Menu" accessibilityRole="button" onPress={onMenu}>
          <Text style={styles.action}>⋯</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.Moss,
    paddingHorizontal: SPACE.md,
    paddingVertical: 18,
    borderBottomLeftRadius: RADII.card,
    borderBottomRightRadius: RADII.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chevron: { color: COLORS.Linen, fontSize: 22, lineHeight: 24 },
  center: { flex: 1, alignItems: 'center' },
  title: { color: COLORS.Linen, fontSize: 20, fontWeight: '800' },
  subtitle: { marginTop: 2, color: COLORS.Sage, fontSize: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  action: { color: COLORS.Linen, fontSize: 16, fontWeight: '700' },
});
