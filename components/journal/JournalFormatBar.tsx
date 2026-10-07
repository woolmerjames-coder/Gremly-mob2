/**
 * The bar that floats above the keyboard on the journal page: bold, italics,
 * bullets, numbers, a photo, and how much is written.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Bold, Image as ImageIcon, Italic, List, ListOrdered } from 'lucide-react-native';
import { BRIEF } from '../brief/briefStyles';
import type { FormatKind, FormatState } from './JournalEditor';

const FORMATS: { kind: FormatKind; label: string; Icon: typeof Bold }[] = [
  { kind: 'bold', label: 'Bold', Icon: Bold },
  { kind: 'italic', label: 'Italic', Icon: Italic },
  { kind: 'bullets', label: 'Bulleted list', Icon: List },
  { kind: 'numbers', label: 'Numbered list', Icon: ListOrdered },
];

export type JournalFormatBarProps = {
  state: FormatState;
  onToggle: (kind: FormatKind) => void;
  /** Left out when photos cannot be added */
  onPhoto?: () => void;
  /** How much is written, in words: "16 words, 2 photos" */
  count: string;
};

export function JournalFormatBar({ state, onToggle, onPhoto, count }: JournalFormatBarProps) {
  return (
    <View style={styles.bar} accessibilityRole="toolbar" testID="journal-format-bar">
      {FORMATS.map(({ kind, label, Icon }) => (
        <Pressable
          key={kind}
          style={[styles.btn, state[kind] && styles.btnOn]}
          onPress={() => onToggle(kind)}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ selected: state[kind] }}
          hitSlop={4}
          testID={`journal-format-${kind}`}
        >
          <Icon size={20} color={BRIEF.moss} strokeWidth={state[kind] ? 2.6 : 2} />
        </Pressable>
      ))}
      {onPhoto ? (
        <>
          <View style={styles.sep} />
          <Pressable
            style={styles.btn}
            onPress={onPhoto}
            accessibilityRole="button"
            accessibilityLabel="Add a photo"
            hitSlop={4}
            testID="journal-format-photo"
          >
            <ImageIcon size={20} color={BRIEF.moss} strokeWidth={2} />
          </Pressable>
        </>
      ) : null}
      <Text style={styles.count} numberOfLines={1} testID="journal-format-count">
        {count}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 54,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BRIEF.line,
    backgroundColor: BRIEF.white,
    shadowColor: BRIEF.mossInk,
    shadowOpacity: 0.13,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  btn: {
    width: 42,
    height: 40,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOn: { backgroundColor: BRIEF.sageWash },
  sep: { width: 1, height: 22, backgroundColor: BRIEF.line, marginHorizontal: 5 },
  count: {
    flex: 1,
    textAlign: 'right',
    paddingRight: 8,
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: BRIEF.faint,
    fontVariant: ['tabular-nums'],
  },
});
