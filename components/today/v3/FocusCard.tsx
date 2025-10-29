import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card } from '../../../design-system/Card';
import { Button } from '../../../design-system/Button';
import { Text, Box } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { useFocusCard } from '../../../lib/today/hooks/useFocusCard';

type Props = {
  onView?: (entryId: string | null, entryType: 'todo' | 'habit' | 'note' | null) => void;
  onChange?: () => void;
  onClear?: () => void;
  autoSuggestIfEmpty?: boolean;
};

export default function FocusCard({ onView, onChange, onClear, autoSuggestIfEmpty = true }: Props) {
  const { focus, autosuggest, clear, loading } = useFocusCard();

  useEffect(() => {
    if (autoSuggestIfEmpty && !loading && !focus) {
      void autosuggest();
    }
  }, [autoSuggestIfEmpty, loading, focus, autosuggest]);

  const subtitle =
    focus?.source === 'auto'
      ? 'Suggested by Gremly'
      : focus?.source === 'carry_forward'
        ? 'Carried forward from last night'
        : focus?.source === 'user'
          ? 'You chose this.'
          : 'Anchor for the day';

  return (
    <Card
      padding="md"
      style={{
        backgroundColor: BRAND.colors.linenCream,
        borderRadius: BRAND.radius.xl,
        ...BRAND.elevation.one,
      }}
      testID="today-v3-focus-card"
    >
      <Box gap={2}>
        <Text variant="title">Focus for today</Text>
        <Text variant="body" style={{ color: BRAND.colors.charcoalInk }}>
          {focus?.entry_id
            ? String(focus.entry_type === 'habit' ? 'Habit' : 'Task')
            : 'No set focus today - just flow.'}
        </Text>
        <Text variant="subtle">{subtitle}</Text>

        <View style={styles.row}>
          <Button
            label="View Task"
            variant="outline"
            onPress={() => onView?.(focus?.entry_id ?? null, focus?.entry_type ?? null)}
            disabled={!focus?.entry_id}
            testID="today-v3-focus-view"
          />
          <Button
            label="Change"
            variant="secondary"
            onPress={onChange}
            testID="today-v3-focus-change"
          />
          <Button
            label="Clear"
            variant="ghost"
            onPress={() => {
              void clear();
              onClear?.();
            }}
            testID="today-v3-focus-clear"
          />
        </View>
      </Box>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
});
