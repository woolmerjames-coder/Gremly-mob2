import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Box, Button } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { useSweepPreview } from '../../../lib/today/hooks/useSweepPreview';

type Props = {
  onStart?: () => void;
  onPeek?: () => void;
  /** Count of completed items today (habits + todos) */
  completedTodayCount?: number;
};

const noop = () => {};

/**
 * Pluralize "item" based on count
 */
function itemLabel(count: number): string {
  return count === 1 ? 'item' : 'items';
}

export default function SweepPreviewFooter({ onStart, onPeek, completedTodayCount }: Props) {
  const { completed: internalCompleted, available } = useSweepPreview();

  // Use override if provided, otherwise fall back to internal count
  const completed = completedTodayCount ?? internalCompleted;

  if (!available || completed === 0) return null;

  const label = `${completed} ${itemLabel(completed)} completed today`;

  return (
    <View
      style={[styles.banner, { backgroundColor: BRAND.colors.goldenPear }]}
      testID="today-v3-sweep"
    >
      <Box row style={styles.row}>
        <Text
          style={styles.text}
          accessibilityRole="summary"
          accessibilityLabel={`Review completed items. ${label}.`}
        >
          {label}
        </Text>
        <Box row style={styles.ctaWrap}>
          <Button
            label="Peek"
            variant="ghost"
            onPress={onPeek ?? noop}
            testID="today-v3-sweep-peek"
            accessibilityLabel="Peek at sweep"
          />
          <Button
            label="Start"
            variant="primary"
            onPress={onStart ?? noop}
            testID="today-v3-sweep-start"
            accessibilityLabel="Start sweep"
          />
        </Box>
      </Box>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'relative',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  row: { alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  text: { color: '#1A3328', fontWeight: '600', flexShrink: 1 },
  ctaWrap: { gap: 8, flexShrink: 0, flexWrap: 'wrap' as const },
});
