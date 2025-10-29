import React, { useEffect, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { haptics } from '../../../lib/haptics';

export type UISuggestion =
  | {
      type: 'create.todo';
      label: string;
      payload: {
        name: string;
        undefined_due: boolean;
        due?: string | null;
        due_date?: string | null;
      };
    }
  | {
      type: 'create.habit';
      label: string;
      payload: { name: string; freq: 'daily' | 'weekly' | 'monthly' };
    }
  | {
      type: 'create.note';
      label: string;
      payload: { title: string; body: string; subtype: 'list' | 'journal' };
    };

const PALETTE = {
  todoBg: '#E6F0FF',
  todoFg: '#0A3A8B',
  habitBg: '#EAF7ED',
  habitFg: '#1F7A3D',
  noteBg: '#F4EFEA',
  noteFg: '#5C3B24',
  promptFg: '#4A4A4A',
};

function stylesForType(type: UISuggestion['type']) {
  switch (type) {
    case 'create.todo':
      return { bg: PALETTE.todoBg, fg: PALETTE.todoFg };
    case 'create.habit':
      return { bg: PALETTE.habitBg, fg: PALETTE.habitFg };
    case 'create.note':
    default:
      return { bg: PALETTE.noteBg, fg: PALETTE.noteFg };
  }
}

export function MidConfidenceChips({
  suggestions,
  onPick,
  prompt,
  supportingText,
  autoDismissMs = 12000,
}: {
  suggestions: UISuggestion[];
  onPick: (s: UISuggestion) => void;
  prompt?: string;
  supportingText?: string;
  autoDismissMs?: number;
}) {
  const limited = useMemo(() => suggestions?.slice(0, 3) ?? [], [suggestions]);
  const fade = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [fade, suggestions]);

  useEffect(() => {
    if (!autoDismissMs || !limited.length) return;

    const pulseDelay = Math.max(0, autoDismissMs - 800);
    const timeout = setTimeout(() => {
      Animated.sequence([
        Animated.timing(fade, { toValue: 0.8, duration: 120, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 120, useNativeDriver: true }),
      ]).start();
    }, pulseDelay);

    return () => clearTimeout(timeout);
  }, [autoDismissMs, fade, limited.length, suggestions]);

  if (!limited.length) return null;

  const message = prompt ?? supportingText ?? null;

  return (
    <Animated.View style={[styles.wrapper, { opacity: fade }]}>
      {message ? (
        <Text style={styles.prompt} accessibilityRole="text" accessibilityLabel={message}>
          {message}
        </Text>
      ) : null}

      <View style={styles.row}>
        {limited.map((s, idx) => {
          const c = stylesForType(s.type);
          return (
            <Pressable
              key={`${s.type}-${idx}`}
              onPress={() => {
                try {
                  if (typeof haptics?.light === 'function') {
                    haptics.light();
                  }
                } catch {
                  // no-op for environments without haptics
                }
                onPick(s);
              }}
              style={({ pressed }) => [
                styles.chip,
                { backgroundColor: c.bg, borderColor: c.fg },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={s.label}
            >
              <Text style={[styles.chipText, { color: c.fg }]}>{s.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );
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
});
