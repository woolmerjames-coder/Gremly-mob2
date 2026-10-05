/**
 * The pill at the top of the box while the next message is not an ordinary one: it
 * is being saved to the journal, or it answers Gremly's question. The X sends
 * the next message to Gremly instead.
 *
 * For the journal it can also open the full journal page, taking along
 * whatever is typed: as two arrows beside the X, or as a word when a page is
 * already half written.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Maximize2, MessageCircleQuestion, NotebookPen, X } from 'lucide-react-native';

export type ReplyTagProps = {
  label: string;
  kind: 'journal' | 'question';
  /** Left out when the next message can only be what the pill says */
  onCancel?: () => void;
  /** Open the full page for what the pill is about */
  onExpand?: () => void;
  /** A word for the expand button ("Open"); two arrows when left out */
  expandLabel?: string;
  /** What the expand button does, for a screen reader */
  expandHint?: string;
};

const INK = '#4A4E7A';

export function ReplyTag({
  label,
  kind,
  onCancel,
  onExpand,
  expandLabel,
  expandHint,
}: ReplyTagProps) {
  const Icon = kind === 'journal' ? NotebookPen : MessageCircleQuestion;
  return (
    <View style={styles.pill} testID="reply-tag">
      <Icon size={13} color={INK} strokeWidth={2.2} />
      <Text style={styles.text}>{label}</Text>
      {onExpand ? (
        <Pressable
          style={expandLabel ? styles.open : undefined}
          onPress={onExpand}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={expandHint ?? expandLabel}
          testID="reply-tag-expand"
        >
          <Maximize2 size={13} color={INK} strokeWidth={2.3} />
          {expandLabel ? <Text style={styles.text}>{expandLabel}</Text> : null}
        </Pressable>
      ) : null}
      {onCancel ? (
        <Pressable
          onPress={onCancel}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Send to Gremly instead"
          testID="reply-tag-cancel"
        >
          <X size={14} color={INK} strokeWidth={2.4} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    backgroundColor: '#ECEEFA',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  text: { fontFamily: 'Inter-SemiBold', fontSize: 12.5, color: INK },
  open: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
});
