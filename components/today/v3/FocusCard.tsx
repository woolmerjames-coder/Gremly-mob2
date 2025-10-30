import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '../../../design-system/Button';
import { Text, Box } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { GRADIENTS } from '../../../design/gradients';
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

  // Resolve title
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

  // Autosuggest when empty
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

  // Edge-to-edge hero uses negative margins to bleed to screen edges
  return (
    <View
      style={styles.bleedWrap}
      testID="today-v3-focus-card"
      accessibilityRole="summary"
      accessibilityLabel="Focus for today"
    >
      <LinearGradient
        colors={GRADIENTS.focusHero}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.hero}
        testID="today-hero"
      >
        {/* Mascot top-right (small, subtle) */}
        <Image
          source={require('../../../masters/mascot/ACTUAL GREMLY.png')}
          style={styles.mascot}
          accessibilityIgnoresInvertColors
        />

        <Box gap={2}>
          <Text variant="title" style={styles.headerText}>
            Focus for today
          </Text>

          {focus?.entry_id ? (
            <Text variant="body" style={styles.focusText} numberOfLines={2}>
              {title || kindLabel || 'Untitled'}
            </Text>
          ) : (
            <Text variant="body" style={styles.focusTextMuted}>
              No focus yet — tap Change to pick one.
            </Text>
          )}

          <Text variant="subtle" style={styles.subtitleText}>
            {subtitle}
          </Text>

          <View style={styles.actions} testID="today-hero-actions">
            <Button
              label="View"
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

          {/* Golden Pear underline accent */}
          <View style={styles.underline} />
        </Box>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  bleedWrap: {
    marginHorizontal: -16,
  },
  hero: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderBottomLeftRadius: BRAND.radius['2xl'],
    borderBottomRightRadius: BRAND.radius['2xl'],
    position: 'relative',
  },
  mascot: {
    position: 'absolute',
    right: 14,
    top: 10,
    width: 28,
    height: 28,
    opacity: 0.9,
  },
  headerText: {
    color: BRAND.colors.charcoalInk,
    fontSize: 28,
    fontWeight: '700',
  },
  focusText: {
    color: BRAND.colors.linenCream,
    fontSize: 18,
    fontWeight: '700',
  },
  focusTextMuted: {
    color: BRAND.colors.linenCream,
    opacity: 0.9,
    fontSize: 16,
  },
  subtitleText: {
    color: BRAND.colors.linenCream,
    opacity: 0.9,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  underline: {
    marginTop: 10,
    height: 2,
    width: 64,
    backgroundColor: BRAND.colors.goldenPear,
    borderRadius: 2,
    opacity: 0.9,
  },
});
