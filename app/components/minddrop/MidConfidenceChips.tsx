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

export function MidConfidenceChips({
  suggestions,
  onPick,
}: {
  suggestions: UISuggestion[];
  onPick: (s: UISuggestion) => void;
}) {
  if (!suggestions?.length) return null;

  return (
    <View style={styles.row}>
      {suggestions.map((s, idx) => (
        <Pressable
          key={idx}
          onPress={() => onPick(s)}
          style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
        >
          <Text style={styles.chipText}>{s.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#EEE', borderRadius: 16 },
  chipText: { fontSize: 14, color: '#222' },
  pressed: { opacity: 0.7 },
});
