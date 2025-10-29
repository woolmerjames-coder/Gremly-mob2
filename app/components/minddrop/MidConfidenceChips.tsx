import React, { useEffect, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { haptics } from '../../../lib/haptics';

export type UISuggestion =
  | {
      type: 'create.todo';
      label: string;
      payload: { name: string; undefined_due: boolean };
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
  onAutoDismiss,
  autoDismissMs = 5000,
}: {
  suggestions: UISuggestion[];
  onPick: (s: UISuggestion) => void;
  prompt?: string;
  onAutoDismiss?: () => void;
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
    const t = setTimeout(() => {
      onAutoDismiss?.();
    }, autoDismissMs);
    return () => clearTimeout(t);
  }, [autoDismissMs, limited.length, onAutoDismiss, suggestions]);

  if (!limited.length) return null;

  return (
    <Animated.View style={[styles.wrapper, { opacity: fade }]}>
      {prompt ? (
        <Text style={styles.prompt} accessibilityRole="text" accessibilityLabel={prompt}>
          {prompt}
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
