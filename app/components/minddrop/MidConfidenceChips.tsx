import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

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
}: {
  suggestions: UISuggestion[];
  onPick: (s: UISuggestion) => void;
  prompt?: string;
}) {
  if (!suggestions?.length) return null;

  return (
    <View style={styles.wrapper}>
      {prompt ? (
        <Text style={styles.prompt} accessibilityRole="text" accessibilityLabel={prompt}>
          {prompt}
        </Text>
      ) : null}

      <View style={styles.row}>
        {suggestions.map((s, idx) => {
          const c = stylesForType(s.type);
          return (
            <Pressable
              key={`${s.type}-${idx}`}
              onPress={() => onPick(s)}
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
    </View>
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
