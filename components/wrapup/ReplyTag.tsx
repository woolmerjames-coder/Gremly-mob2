/**
 * The pill at the top of the box while the next message is not an ordinary one: it
 * is being saved to the journal, or it answers Gremly's question. The X sends
 * the next message to Gremly instead.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MessageCircleQuestion, NotebookPen, X } from 'lucide-react-native';

export type ReplyTagProps = {
  label: string;
  kind: 'journal' | 'question';
  onCancel: () => void;
};

const INK = '#4A4E7A';

export function ReplyTag({ label, kind, onCancel }: ReplyTagProps) {
  const Icon = kind === 'journal' ? NotebookPen : MessageCircleQuestion;
  return (
    <View style={styles.pill} testID="reply-tag">
      <Icon size={13} color={INK} strokeWidth={2.2} />
      <Text style={styles.text}>{label}</Text>
      <Pressable
        onPress={onCancel}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Send to Gremly instead"
        testID="reply-tag-cancel"
      >
        <X size={14} color={INK} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: '#ECEEFA',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  text: { fontFamily: 'Inter-SemiBold', fontSize: 12.5, color: INK },
});
