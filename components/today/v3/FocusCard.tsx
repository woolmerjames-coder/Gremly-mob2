import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card } from '../../../design-system/Card';
import { Button } from '../../../design-system/Button';
import { Text, Box } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { useFocusCard } from '../../../lib/today/hooks/useFocusCard';
import { useRepo } from '../../../providers/RepoProvider';

type Props = {
  onView?: (entryId: string | null, entryType: 'todo' | 'habit' | 'note' | null) => void;
  onChange?: () => void;
  onClear?: () => void;
  autoSuggestIfEmpty?: boolean;
};

export default function FocusCard({ onView, onChange, onClear, autoSuggestIfEmpty = true }: Props) {
  const { focus, autosuggest, clear, loading } = useFocusCard();
  const repo = useRepo();
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!focus?.entry_id || !focus.entry_type) {
        setTitle(null);
        return;
      }
      try {
        const rec = await (repo as any).getById?.(focus.entry_id);
        if (!cancelled) {
          const name = (rec?.name as string) || (rec?.title as string) || null;
          setTitle(name);
        }
      } catch {
        if (!cancelled) setTitle(null);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [focus?.entry_id, focus?.entry_type, repo]);

  useEffect(() => {
    if (autoSuggestIfEmpty && !loading && !focus) {
      void autosuggest();
    }
  }, [autoSuggestIfEmpty, loading, focus, autosuggest]);

  const subtitle = useMemo(() => {
    if (!focus) return 'Anchor for the day';
    switch (focus.source) {
      case 'auto':
        return 'Suggested by Gremly';
      case 'carry_forward':
        return 'Carried forward from last night';
      case 'user':
        return 'You chose this.';
      default:
        return 'Anchor for the day';
    }
  }, [focus]);

  const kindLabel = focus?.entry_type
    ? focus.entry_type === 'habit'
      ? 'Habit'
      : focus.entry_type === 'todo'
        ? 'Task'
        : 'Note'
    : null;

  return (
    <Card
      padding="md"
      style={{
        backgroundColor: BRAND.colors.linenCream,
        borderRadius: BRAND.radius.xl,
        ...BRAND.elevation.one,
      }}
      testID="today-v3-focus-card"
      accessibilityRole="summary"
      accessibilityLabel="Focus for today"
    >
      <Box gap={2}>
        <Text variant="title">Focus for today</Text>

        {focus?.entry_id ? (
          <Text variant="body" style={{ color: BRAND.colors.charcoalInk, fontWeight: '600' }}>
            {title || kindLabel || 'Untitled'}
          </Text>
        ) : (
          <Text variant="body" style={{ color: BRAND.colors.charcoalInk }}>
            No focus yet — tap Change to pick one.
          </Text>
        )}

        <Text variant="subtle">{subtitle}</Text>

        <View style={styles.row} testID="today-v3-focus-actions">
          <Button
            label="View Task"
            variant="outline"
            onPress={() => onView?.(focus?.entry_id ?? null, focus?.entry_type ?? null)}
            disabled={!focus?.entry_id}
            testID="today-v3-focus-view"
            accessibilityLabel="View focus item"
            accessibilityHint="Opens the focused item"
          />
          <Button
            label="Change"
            variant="neutral"
            onPress={onChange}
            testID="today-v3-focus-change"
            accessibilityLabel="Change focus"
            accessibilityHint="Pick a different focus"
          />
          <Button
            label="Clear"
            variant="ghost"
            onPress={() => {
              void clear();
              onClear?.();
            }}
            testID="today-v3-focus-clear"
            accessibilityLabel="Clear focus"
            accessibilityHint="Removes today’s focus"
          />
        </View>
      </Box>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
});
