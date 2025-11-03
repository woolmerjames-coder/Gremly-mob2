import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Box, Button } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { useSweepPreview } from '../../../lib/today/hooks/useSweepPreview';

type Props = { onStart?: () => void; onPeek?: () => void };

const noop = () => {};

export default function SweepPreviewFooter({ onStart, onPeek }: Props) {
  const { completed, remaining, available } = useSweepPreview();

  if (!available || (completed === 0 && remaining === 0)) return null;

  return (
    <View
      style={[styles.banner, { backgroundColor: BRAND.colors.goldenPear }]}
      testID="today-v3-sweep"
    >
      <Box row style={styles.row}>
        <Text
          style={styles.text}
          accessibilityRole="summary"
          accessibilityLabel={`Sweep ready soon. ${completed} done and ${remaining} to tidy.`}
        >
          Sweep ready soon — {completed} done · {remaining} to tidy
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
