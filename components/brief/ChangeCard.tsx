/**
 * The card for several changes at once (Gremly agent: one change model),
 * first used by the day turn in today's thread (Daily brief in Chat): every
 * change Gremly would make for one message, each with a tick. Accept (Accept
 * all when there are several) applies every row in one tap; the ticks are
 * there to leave one out, and the button then applies the ones still ticked. Nothing changes until then.
 * After it, the card shows what was done with one Undo for all of it; Not now
 * folds it to one line, and so does Undo once it has put everything back.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, CircleSlash, RotateCcw, Square, SquareCheck } from 'lucide-react-native';
import type { BriefChangesMeta } from '../../lib/brief/types';
import type { SpaceChatMessage } from '../../lib/types';
import { nameLookup } from '../../lib/changes/apply';
import { rowWords } from '../../lib/changes/words';
import { BRIEF } from './briefStyles';

/**
 * The card's rows: the day turn's changes in its own words, or the agent's in
 * the change model's words. Days are named by their date, as Gremly's reply
 * names them, so the card and the reply always read the same.
 */
export function rowsOf(meta: BriefChangesMeta): { cid: string; label: string }[] {
  if (!meta.card?.length) return meta.changes;
  const names = nameLookup();
  return meta.card.map((c) => ({ cid: c.cid, label: rowWords(c, { relative: false, names }) }));
}

/** The apply button: Accept for one row, Accept all for every row of several, else how many. */
export function applyWords(rows: number, ticked: number): string {
  if (ticked === rows) return rows === 1 ? 'Accept' : 'Accept all';
  return `Apply ${ticked}`;
}

/** What the card needs from today's thread (lib/brief/useDayTurn.ts). */
export type ChangeCardActions = {
  busy: boolean;
  apply: (message: SpaceChatMessage, unticked: string[]) => Promise<void>;
  dismiss: (message: SpaceChatMessage) => Promise<void>;
  undo: (message: SpaceChatMessage) => Promise<void>;
  canUndo: (messageId: string) => boolean;
};

/**
 * The thread's renderer for change cards. The thread's rows are memoized, so
 * a card is drawn again only when this renderer changes: it changes when
 * saving starts or ends and when Undo becomes possible or is used. Without
 * that, a card drawn while its changes were being saved kept its buttons
 * switched off, and Undo never answered.
 */
export function useRenderChanges(actions: ChangeCardActions) {
  const { busy, canUndo, apply, dismiss, undo } = actions;
  return useCallback(
    (message: SpaceChatMessage, meta: BriefChangesMeta) => (
      <ChangeCard
        meta={meta}
        interactive={!busy}
        onApply={(unticked) => void apply(message, unticked)}
        onDismiss={() => void dismiss(message)}
        onUndo={canUndo(message.id) ? () => void undo(message) : undefined}
      />
    ),
    [busy, canUndo, apply, dismiss, undo],
  );
}

export type ChangeCardProps = {
  meta: BriefChangesMeta;
  /** False while something is being saved */
  interactive?: boolean;
  onApply?: (unticked: string[]) => void;
  onDismiss?: () => void;
  /** Present while what the card did can still be put back */
  onUndo?: () => void;
};

export function ChangeCard({
  meta,
  interactive = true,
  onApply,
  onDismiss,
  onUndo,
}: ChangeCardProps) {
  const [unticked, setUnticked] = useState<string[]>(meta.unticked ?? []);
  // tapped Accept: it says so at once, while the changes are saved, and
  // goes back to Accept if saving ends with the card still open
  const [saving, setSaving] = useState(false);
  const sawBusy = useRef(false);
  useEffect(() => {
    if (!interactive) sawBusy.current = true;
    else if (sawBusy.current) {
      sawBusy.current = false;
      setSaving(false);
    }
  }, [interactive]);
  const rows = rowsOf(meta);

  if (meta.status === 'undone') {
    return (
      <View style={styles.collapsed} testID="changes-undone">
        <RotateCcw size={14} color={BRIEF.faint} strokeWidth={2} />
        <Text style={styles.collapsedText}>Put back as it was</Text>
      </View>
    );
  }

  if (meta.status === 'dismissed') {
    return (
      <View style={styles.collapsed} testID="changes-dismissed">
        <CircleSlash size={14} color={BRIEF.faint} strokeWidth={2} />
        <Text style={styles.collapsedText}>Left as it is</Text>
      </View>
    );
  }

  if (meta.status === 'applied') {
    const done = new Set(meta.applied ?? []);
    const failed = new Set(meta.failed ?? []);
    const shown = rows.filter((c) => done.has(c.cid) || failed.has(c.cid));
    return (
      <View style={styles.card} testID="changes-applied">
        <Text style={styles.title}>Changed</Text>
        {shown.map((c) => (
          <View key={c.cid} style={styles.row}>
            {done.has(c.cid) ? (
              <Check size={16} color={BRIEF.moss} strokeWidth={2.5} />
            ) : (
              <CircleSlash size={16} color={BRIEF.warn} strokeWidth={2} />
            )}
            <Text style={[styles.label, failed.has(c.cid) && styles.failed]}>
              {failed.has(c.cid) ? `${c.label} (could not be saved)` : c.label}
            </Text>
          </View>
        ))}
        {onUndo && done.size > 0 ? (
          <TouchableOpacity
            style={[styles.btn, styles.btnSecondary, styles.undo]}
            onPress={onUndo}
            disabled={!interactive}
            accessibilityRole="button"
            testID="changes-undo"
          >
            <Text style={styles.btnText}>Undo</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  const toggle = (cid: string) =>
    setUnticked((u) => (u.includes(cid) ? u.filter((x) => x !== cid) : [...u, cid]));
  const ticked = rows.filter((c) => !unticked.includes(c.cid)).length;

  return (
    <View style={styles.card} testID="changes-open">
      <Text style={styles.title}>Here's what I'll change</Text>
      {rows.map((c) => {
        const on = !unticked.includes(c.cid);
        return (
          <Pressable
            key={c.cid}
            style={styles.row}
            onPress={() => toggle(c.cid)}
            disabled={!interactive}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={c.label}
            testID={`change-${c.cid}`}
          >
            {on ? (
              <SquareCheck size={18} color={BRIEF.moss} strokeWidth={2} />
            ) : (
              <Square size={18} color={BRIEF.faint} strokeWidth={2} />
            )}
            <Text style={[styles.label, !on && styles.off]}>{c.label}</Text>
          </Pressable>
        );
      })}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, !ticked && styles.btnOff]}
          onPress={() => {
            setSaving(true);
            onApply?.(unticked);
          }}
          disabled={!interactive || !ticked || saving}
          testID="changes-apply"
        >
          <Text style={[styles.btnText, styles.btnTextPrimary]}>
            {saving ? 'Saving…' : applyWords(rows.length, ticked)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary]}
          onPress={onDismiss}
          disabled={!interactive}
          testID="changes-dismiss"
        >
          <Text style={styles.btnText}>Not now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: BRIEF.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BRIEF.line,
    padding: 16,
    gap: 10,
  },
  title: { fontFamily: 'Inter-SemiBold', fontSize: 16, color: BRIEF.mossInk },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  label: { flex: 1, fontFamily: 'Inter-Medium', fontSize: 14, color: BRIEF.mossInk },
  off: { color: BRIEF.faint, textDecorationLine: 'line-through' },
  failed: { color: BRIEF.warn },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 11,
  },
  btnPrimary: { backgroundColor: BRIEF.moss },
  btnSecondary: { borderWidth: 1, borderColor: BRIEF.chipBorder },
  btnOff: { opacity: 0.5 },
  undo: { flex: 0, alignSelf: 'flex-start', paddingHorizontal: 18, marginTop: 4 },
  btnText: { fontFamily: 'Inter-SemiBold', fontSize: 14, color: BRIEF.moss },
  btnTextPrimary: { color: BRIEF.white },
  collapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: BRIEF.linen2,
  },
  collapsedText: { fontFamily: 'Inter-Regular', fontSize: 13, color: BRIEF.muted },
});
