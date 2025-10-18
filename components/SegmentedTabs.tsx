import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { colors, radii, spacing } from '../theme/tokens';

type Tab = 'All' | 'Habits' | 'To-Dos' | 'Journal' | 'Catch-All';

export default function SegmentedTabs({
  value,
  onChange,
  tabs = ['All', 'Habits', 'To-Dos', 'Journal', 'Catch-All'] as Tab[],
}: {
  value: Tab;
  onChange: (t: Tab) => void;
  tabs?: Tab[];
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {tabs.map((t) => {
        const active = value === t;
        return (
          <TouchableOpacity
            key={t}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(t)}
            style={[styles.chip, active ? styles.chipActive : styles.chipIdle]}
            testID={`tab-${t.toLowerCase()}`}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
              {t}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: spacing.md, gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.xl,
    borderWidth: 1,
  },
  chipIdle: {
    backgroundColor: colors.white,
    borderColor: colors.mint,
  },
  chipActive: {
    backgroundColor: colors.deepTeal,
    borderColor: colors.deepTeal,
  },
  chipText: { color: colors.ink, fontWeight: '600' },
  chipTextActive: { color: colors.cream },
});
