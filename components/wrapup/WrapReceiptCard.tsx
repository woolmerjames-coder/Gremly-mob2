/**
 * The cards' receipt in the thread: how many were swept, and behind one tap
 * each decision with its Undo. Its rows are tonight's decisions as the thread
 * keeps them, so it is always what is saved. Undo is there while the app
 * still holds it for that decision.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, ChevronRight, Inbox } from 'lucide-react-native';
import type { SweepRecord } from '../../lib/changes/sweep';
import { sweepCounts } from '../../lib/wrapup/state';
import { CARD_COPY, receiptParts, receiptTitle } from '../../lib/wrapup/words';
import { BRIEF } from '../brief/briefStyles';
import { wrapStyles } from './wrapStyles';

export type WrapReceiptCardProps = {
  decisions: SweepRecord[];
  /** Cards still to sort tonight */
  toSort: number;
  /** Decisions whose Undo is still held, by cid */
  undoable: Record<string, true>;
  onUndo: (cid: string) => void;
  /** False while something is being saved */
  interactive?: boolean;
};

export function WrapReceiptCard({
  decisions,
  toSort,
  undoable,
  onUndo,
  interactive = true,
}: WrapReceiptCardProps) {
  const [open, setOpen] = useState(false);
  const c = sweepCounts(decisions);
  return (
    <View style={[wrapStyles.card, styles.card]} testID="wrap-receipt">
      <Pressable
        style={styles.head}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        testID="wrap-receipt-toggle"
      >
        <View style={styles.icon}>
          <Inbox size={16} color={BRIEF.moss} strokeWidth={2} />
        </View>
        <View style={wrapStyles.rowBody}>
          <Text style={wrapStyles.rowTitle}>{receiptTitle(c.decided)}</Text>
          <Text style={wrapStyles.rowSub}>{receiptParts({ ...c, toSort })}</Text>
        </View>
        {open ? (
          <ChevronDown size={16} color={BRIEF.faint} strokeWidth={2} />
        ) : (
          <ChevronRight size={16} color={BRIEF.faint} strokeWidth={2} />
        )}
      </Pressable>
      {open ? (
        <View style={styles.list}>
          {decisions.map((d) => {
            const back = !!d.undone_at;
            const quiet = back || d.out !== 'kept';
            return (
              <View key={d.cid} style={styles.row} testID={`wrap-receipt-row-${d.id}`}>
                <Text
                  style={[
                    styles.title,
                    quiet && styles.quiet,
                    d.out === 'let_go' && !back && styles.gone,
                  ]}
                  numberOfLines={2}
                >
                  {d.title}
                </Text>
                <Text style={styles.label}>{back ? CARD_COPY.receiptPutBack : d.label}</Text>
                {!back && d.out !== 'left' && undoable[d.cid] ? (
                  <Pressable
                    onPress={() => onUndo(d.cid)}
                    disabled={!interactive}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`${CARD_COPY.undo} ${d.title}`}
                    testID={`wrap-receipt-undo-${d.id}`}
                  >
                    <Text style={wrapStyles.undo}>{CARD_COPY.undo}</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: BRIEF.sageWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { gap: 10, paddingTop: 6, borderTopWidth: 1, borderTopColor: BRIEF.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 2 },
  title: { flex: 1, fontFamily: 'Inter-Medium', fontSize: 14, color: BRIEF.mossInk },
  quiet: { color: BRIEF.muted },
  gone: { textDecorationLine: 'line-through' },
  label: { fontFamily: 'Inter-Regular', fontSize: 12.5, color: BRIEF.faint },
});
