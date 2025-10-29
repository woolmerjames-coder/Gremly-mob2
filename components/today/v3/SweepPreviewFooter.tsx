import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Box, Button } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { useSweepPreview } from '../../../lib/today/hooks/useSweepPreview';

type Props = { onStart?: () => void; onPeek?: () => void };

export default function SweepPreviewFooter({ onStart, onPeek }: Props) {
  const { completed, remaining, available } = useSweepPreview();

  if (!available) return null;

  return (
    <View
      style={[styles.banner, { backgroundColor: BRAND.colors.goldenPear }]}
      testID="today-v3-sweep"
    >
      <Box row style={styles.row}>
        <Text style={styles.text}>
          Sweep ready soon - {completed} done · {remaining} to tidy
        </Text>
        <Box row style={{ gap: 8 }}>
          <Button title="Peek" variant="neutral" onPress={onPeek ?? (() => {})} />
          <Button title="Start Early" variant="primary" onPress={onStart ?? (() => {})} />
        </Box>
      </Box>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'relative', // parent Screen handles layout; keep simple here
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  row: { alignItems: 'center', justifyContent: 'space-between' },
  text: { color: '#1A3328', fontWeight: '600' },
});
