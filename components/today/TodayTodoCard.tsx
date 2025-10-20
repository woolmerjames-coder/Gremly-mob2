/**
 * TodayTodoCard - Phase 9: Energy & Momentum
 * Todo card for Today v2 screen
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Card } from '../../design-system/Card';
import { Text } from '../../ui';
import { useTokens } from '../../design/makeStyles';
import { pop } from '../../lib/today/motion';
import { isReducedMotion } from '../../lib/a11y/reducedMotion';

export interface TodayTodoCardProps {
  id: string;
  title: string;
  dueTime?: string;
  tags?: string[];
  spaceName?: string;
  overdue?: boolean;
  nearDue?: boolean;
  onComplete: (id: string) => void;
  onLongPress?: (id: string) => void;
  reducedMotion?: boolean;
}

export default function TodayTodoCard({
  id,
  title,
  dueTime,
  tags = [],
  spaceName,
  overdue = false,
  nearDue = false,
  onComplete,
  onLongPress,
  reducedMotion,
}: TodayTodoCardProps) {
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

  // Determine border color based on status
  const getBorderStyle = () => {
    if (overdue) {
      return { borderLeftWidth: 4, borderLeftColor: t.colors.danger };
    }
    if (nearDue) {
      return { borderLeftWidth: 4, borderLeftColor: t.colors.accentPeri };
    }
    return {};
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Card variant="outlined" padding="md" style={getBorderStyle()} testID={`todo-card-${id}`}>
        <View style={styles.container}>
          {/* Left: Todo info */}
          <TouchableOpacity
            style={styles.info}
            onLongPress={() => onLongPress?.(id)}
            activeOpacity={0.7}
          >
            {/* Title with overdue indicator */}
            <View style={styles.titleRow}>
              <Text variant="body" style={styles.title}>
                {title}
              </Text>
              {overdue && <Text style={styles.overdueIcon}>⏰</Text>}
            </View>

            {/* Due time */}
            {dueTime && (
              <Text variant="subtle" style={styles.dueTime}>
                Due: {dueTime}
              </Text>
            )}

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

          {/* Right: Complete button */}
          {/* TODO Phase 12: Replace with swipe gesture */}
          <TouchableOpacity
            onPress={handleComplete}
            style={[styles.completeButton, { backgroundColor: t.colors.success }]}
            testID={`todo-complete-${id}`}
            accessibilityRole="button"
            accessibilityLabel={`Mark ${title} as complete`}
          >
            <Text style={styles.completeText}>Done</Text>
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
  info: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    flex: 1,
    fontWeight: '600',
  },
  overdueIcon: {
    fontSize: 16,
  },
  dueTime: {
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
  completeButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 60,
    alignItems: 'center',
  },
  completeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
