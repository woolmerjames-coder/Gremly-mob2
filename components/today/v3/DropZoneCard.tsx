import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card } from '../../../design-system/Card';
import { Button } from '../../../design-system/Button';
import { Text, Box } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { useDropZoneSummary } from '../../../lib/today/hooks/useDropZoneSummary';

type Props = { onViewDrops?: () => void };

export default function DropZoneCard({ onViewDrops }: Props) {
  const { count, quote, loading } = useDropZoneSummary();

  return (
    <Card
      padding="md"
      style={{
        backgroundColor: 'rgba(191,216,192,0.1)',
        borderRadius: BRAND.radius.xl,
        ...BRAND.elevation.one,
      }}
      testID="today-v3-dropzone"
    >
      <Box gap={2}>
        <Text variant="title">Drop Zone</Text>
        <Text variant="subtle">
          {loading ? 'Loading\u2026' : `${count} drop${count === 1 ? '' : 's'} since yesterday`}
        </Text>
        <Text variant="body" style={{ fontStyle: 'italic' }}>
          {`\u201C${quote}\u201D`}
        </Text>
        <View style={styles.row}>
          <Button
            label="View Drops"
            variant="outline"
            onPress={onViewDrops}
            testID="today-v3-dropzone-view"
          />
        </View>
      </Box>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
});
