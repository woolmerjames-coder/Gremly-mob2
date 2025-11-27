/**
 * TodayHabitCard - Phase 9: Energy & Momentum
 * Habit card for Today v2 screen
 */

import React, { useMemo } from 'react';
import { View, Text as RNText, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Card } from '../../design-system/Card';
import { Text } from '../../ui';
import { useTokens } from '../../design/makeStyles';
import { pop } from '../../lib/today/motion';
import { isReducedMotion } from '../../lib/a11y/reducedMotion';

export interface TodayHabitCardProps {
  id: string;
  name: string;
  dueWindow?: string;
  streakCount?: number;
  tags?: string[];
  spaceName?: string;
  onComplete: (id: string) => void;
  onLongPress?: (id: string) => void;
  reducedMotion?: boolean;
}

export default function TodayHabitCard({
  id,
  name,
  dueWindow,
  streakCount,
  tags = [],
  spaceName,
  onComplete,
  onLongPress,
  reducedMotion,
}: TodayHabitCardProps) {
  const t = useTokens();
  const scale = useMemo(() => new Animated.Value(1), []);

  // Determine if reduced motion should be active
  const rm = typeof reducedMotion === 'boolean' ? reducedMotion : isReducedMotion();

  // Handle completion with animation
  const handleComplete = () => {
    if (!rm) {
      pop(scale, rm);
    }
    onComplete(id);
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Card variant="outlined" padding="md" testID={`habit-card-${id}`}>
        <View style={styles.container}>
          {/* Left: Progress ring placeholder */}
          <View style={[styles.ring, { borderColor: t.colors.accentMint }]}>
            <Text style={styles.ringText}>○</Text>
          </View>

          {/* Center: Habit info */}
          <TouchableOpacity
            style={styles.info}
            onLongPress={() => onLongPress?.(id)}
            activeOpacity={0.7}
            testID={`habit-longpress-${id}`}
            accessibilityLabel={`Options for habit '${name}'`}
          >
            <Text variant="body" style={styles.name}>
              {name}
            </Text>

            {/* Metadata row */}
            <View style={styles.metaRow}>
              {dueWindow && (
                <Text variant="subtle" style={styles.metaText}>
                  {dueWindow}
                </Text>
              )}
              {streakCount !== undefined && streakCount > 0 && (
                <Text variant="subtle" style={styles.metaText}>
                  🔥 {streakCount}
                </Text>
              )}
            </View>

            {/* Chips row */}
            <View style={styles.chipsRow}>
              {spaceName && (
                <View style={[styles.chip, { backgroundColor: t.colors.surface }]}>
                  <Text style={[styles.chipText, { color: t.colors.subtle }]}>{spaceName}</Text>
                </View>
              )}
              {tags.slice(0, 2).map((tag, idx) => (
                <View key={idx} style={[styles.chip, { backgroundColor: t.colors.surface }]}>
                  <Text style={[styles.chipText, { color: t.colors.subtle }]}>{tag}</Text>
                </View>
              ))}
            </View>
          </TouchableOpacity>

          {/* Right: Check button */}
          <TouchableOpacity
            onPress={handleComplete}
            style={[styles.checkButton, { backgroundColor: t.colors.success }]}
            testID={`habit-check-${id}`}
            accessibilityRole="button"
            accessibilityLabel={`Complete habit '${name}'`}
          >
            <Text style={styles.checkIcon}>✓</Text>
          </TouchableOpacity>
        </View>
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ring: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringText: {
    fontSize: 20,
  },
  info: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metaText: {
    fontSize: 13,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  chipText: {
    fontSize: 12,
  },
  checkButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkIcon: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
});
