import React, { useEffect, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { haptics } from '../../../lib/haptics';

const PALETTE = {
  linenCream: '#FAF8F4',
  moss: '#5C7457',
  promptFg: '#4A4A4A',
};

export interface CategoryChip {
  kind: 'todo' | 'log' | 'habit';
  label: string;
}

export type TimingOption =
  | 'today'
  | 'today-actually'
  | 'tomorrow'
  | 'later-this-week'
  | 'this-weekend'
  | 'monday'
  | 'someday';

export interface TimingChip {
  option: TimingOption;
  label: string;
}

interface MidConfidenceChipsProps {
  variant?: 'category' | 'timing';
  categoryChips?: CategoryChip[];
  timingChips?: TimingChip[];
  onDirectPick?: (kind: 'todo' | 'log' | 'habit') => void;
  onTimingPick?: (option: TimingOption) => void;
  prompt?: string;
  supportingText?: string;
  autoDismissMs?: number;
}

export function MidConfidenceChips({
  variant = 'category',
  categoryChips = [],
  timingChips = [],
  onDirectPick,
  onTimingPick,
  prompt,
  supportingText,
  autoDismissMs = 12000,
}: MidConfidenceChipsProps) {
  const fade = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [fade, categoryChips, timingChips]);

  useEffect(() => {
    const hasChips = categoryChips.length > 0 || timingChips.length > 0;
    if (!autoDismissMs || !hasChips) return;

    const pulseDelay = Math.max(0, autoDismissMs - 800);
    const timeout = setTimeout(() => {
      Animated.sequence([
        Animated.timing(fade, { toValue: 0.8, duration: 120, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 120, useNativeDriver: true }),
      ]).start();
    }, pulseDelay);

    return () => clearTimeout(timeout);
  }, [autoDismissMs, fade, categoryChips.length, timingChips.length]);

  if (variant === 'category') {
    if (!categoryChips.length) return null;

    const message = prompt ?? supportingText ?? null;

    return (
      <Animated.View style={[styles.wrapper, { opacity: fade }]}>
        {message ? (
          <Text style={styles.prompt} accessibilityRole="text" accessibilityLabel={message}>
            {message}
          </Text>
        ) : null}

        <View style={styles.row}>
          {categoryChips.map((chip, idx) => {
            const testID =
              chip.kind === 'todo'
                ? 'minddrop-category-todo'
                : chip.kind === 'habit'
                  ? 'minddrop-category-habit'
                  : 'minddrop-category-log';

            return (
              <Pressable
                key={`${chip.kind}-${idx}`}
                testID={testID}
                onPress={() => {
                  try {
                    if (typeof haptics?.light === 'function') {
                      haptics.light();
                    }
                  } catch {
                    // no-op
                  }
                  onDirectPick?.(chip.kind);
                }}
                style={({ pressed }) => [
                  styles.chip,
                  styles.categoryChip,
                  pressed && styles.categoryPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={chip.label}
              >
                <Text style={[styles.chipText, styles.categoryChipText]}>{chip.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    );
  }

  if (variant === 'timing') {
    if (!timingChips.length) return null;

    const message = prompt ?? supportingText ?? null;

    return (
      <Animated.View style={[styles.wrapper, { opacity: fade }]} testID="minddrop-timing-chips">
        {message ? (
          <Text style={styles.prompt} accessibilityRole="text" accessibilityLabel={message}>
            {message}
          </Text>
        ) : null}

        <View style={styles.row}>
          {timingChips.map((chip, idx) => {
            return (
              <Pressable
                key={`${chip.option}-${idx}`}
                testID={`minddrop-timing-${chip.option}`}
                onPress={() => {
                  try {
                    if (typeof haptics?.light === 'function') {
                      haptics.light();
                    }
                  } catch {
                    // no-op
                  }
                  onTimingPick?.(chip.option);
                }}
                style={({ pressed }) => [
                  styles.chip,
                  styles.timingChip,
                  pressed && styles.timingPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={chip.label}
              >
                <Text style={[styles.chipText, styles.timingChipText]}>{chip.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    );
  }

  // No other variants supported
  return null;
}

const styles = StyleSheet.create({
  wrapper: { gap: 6, paddingTop: 8 },
  prompt: { fontSize: 14, fontWeight: '600', color: PALETTE.promptFg, marginBottom: 2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: 14, fontWeight: '500' },
  pressed: { opacity: 0.7 },

  // Category chip styles (linenCream background, moss border when active)
  categoryChip: {
    backgroundColor: PALETTE.linenCream,
    borderColor: PALETTE.moss,
    borderWidth: 1,
  },
  categoryChipText: {
    color: PALETTE.moss,
  },
  categoryPressed: {
    transform: [{ scale: 0.96 }],
  },

  // Timing chip styles (subtle tinted background, moss border, bold text)
  timingChip: {
    backgroundColor: PALETTE.linenCream,
    borderColor: PALETTE.moss,
    borderWidth: 1,
  },
  timingChipText: {
    color: PALETTE.moss,
    fontWeight: '600',
  },
  timingPressed: {
    opacity: 0.7,
  },
});
