import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { COLORS, RADII, SPACE } from './_tokens';

export type WeeklyGoalCardProps = {
  title: string;
  done: number; // 0..target
  target: number; // e.g., 3 for 3×/week
  onOpenDetail: () => void;
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export default function WeeklyGoalCard({ title, done, target, onOpenDetail }: WeeklyGoalCardProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const safeTarget = Math.max(1, target || 1);
  const safeDone = clamp(Math.floor(done || 0), 0, safeTarget);
  const oneAway = safeDone === safeTarget - 1;

  const titleLower = title.toLowerCase();

  return (
    <TouchableOpacity
      onPress={onOpenDetail}
      accessibilityRole="button"
      accessibilityLabel={`Open details for ${title}`}
      style={[
        styles.card,
        isDark
          ? { backgroundColor: 'rgba(255,255,255,0.06)', shadowOpacity: 0 }
          : { backgroundColor: COLORS.Linen },
      ]}
    >
      <Text style={[styles.title, isDark ? { color: COLORS.Linen } : { color: COLORS.Deep }]}>
        {title}
      </Text>
      <View style={styles.progressWrap}>
        {Array.from({ length: safeTarget }).map((_, i) => {
          const filled = i < safeDone;
          return (
            <View
              key={i}
              style={[
                styles.block,
                filled
                  ? { backgroundColor: COLORS.Pear, borderColor: COLORS.Pear }
                  : { borderColor: COLORS.Periwinkle, backgroundColor: 'transparent' },
              ]}
            />
          );
        })}
      </View>
      {oneAway && (
        <Text style={[styles.hint, isDark ? { color: '#D9E6DA' } : { color: '#4A5A52' }]}>
          Almost there — one more {titleLower}!
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADII.card,
    padding: SPACE.md,
    // shadow approximation (RN)
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  progressWrap: {
    flexDirection: 'row',
    gap: 6,
  },
  block: {
    width: 16,
    height: 10,
    borderRadius: 3,
    borderWidth: 1,
  },
  hint: {
    marginTop: 8,
    fontSize: 12.5,
    fontWeight: '600',
  },
});
