/**
 * The card for several changes at once (Gremly agent: one change model),
 * first used by the day turn in today's thread (Daily brief in Chat): every
 * change Gremly would make for one message, each with a tick. Accept (Accept
 * all when there are several) applies every row in one tap; the ticks are
 * there to leave one out, and the button then applies the ones still ticked. Nothing changes until then.
 * After it, the card shows what was done with one Undo for all of it; Not now
 * folds it to one line, and so does Undo once it has put everything back.
 *
 * A row about an item opens that item when its words are tapped, before and
 * after the card is applied. On an open card the tick is then the box alone.
 * A row with no item to open (a set time, the week's shape, an item that is
 * not made yet) is one tick, words and all, as before.
 *
 * A milestone is one change with several steps. Each step is a row of its
 * own, with its own tick, under one line that says what the steps are
 * towards, so a step can be left out and the rest set up. Once it is set up,
 * a step to do opens the todo it made.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  Check,
  ChevronRight,
  CircleSlash,
  RotateCcw,
  Square,
  SquareCheck,
} from 'lucide-react-native';
import type { BriefChangesMeta } from '../../lib/brief/types';
import type { SpaceChatMessage } from '../../lib/types';
import { nameLookup } from '../../lib/changes/apply';
import type { Change, ItemType } from '../../lib/changes/model';
import { findItem } from '../../lib/changes/snapshot';
import { stepCid } from '../../lib/changes/rows';
import { milestoneHeadWords, rowWords, stepRowWords } from '../../lib/changes/words';
import { BRIEF } from './briefStyles';

/** The item a row is about, when there is one to open. */
export type ChangeRowItem = { id: string; type: ItemType; title: string };
export type ChangeRow = {
  cid: string;
  label: string;
  item?: ChangeRowItem;
  /** A step of a milestone: the change it is one part of, which is what Apply reports on */
  of?: string;
  /** A step of a milestone: what the steps are towards, said once above the first of them shown */
  head?: string;
};

const ITEM_TYPES: readonly string[] = ['todo', 'habit', 'note'];

/**
 * The item as the store has it now, for a row to open; nothing when it is not
 * there, or was put away (there is nothing of it to open and edit).
 */
function itemFor(type: string | null | undefined, id: string | null | undefined) {
  if (!type || !id || !ITEM_TYPES.includes(type)) return undefined;
  const found = findItem(type as ItemType, id);
  if (!found || found.archived === true) return undefined;
  const title = String(found.name ?? found.title ?? '').trim();
  return { id, type: type as ItemType, title };
}

/**
 * The item one of the agent's rows is about. A new item has no id until the
 * card is applied, and an item turned into another kind is, once applied, the
 * new one: both are read from what Apply made (meta.created).
 */
function itemOfChange(c: Change, meta: BriefChangesMeta): ChangeRowItem | undefined {
  const made = meta.created?.[c.cid];
  if (c.op === 'plan') return itemFor(c.plan?.item, c.plan?.id);
  if (c.op === 'add') return itemFor(c.type, made);
  if (c.op === 'convert' && made) return itemFor(c.to, made);
  return itemFor(c.type, c.id);
}

/**
 * The card's rows: the day turn's changes in its own words, or the agent's in
 * the change model's words. Days are named by their date, as Gremly's reply
 * names them, so the card and the reply always read the same.
 */
export function rowsOf(meta: BriefChangesMeta): ChangeRow[] {
  if (!meta.card?.length) {
    return meta.changes.map((c) => ({
      cid: c.cid,
      label: c.label,
      // the day turn's new todo has no kind or id of its own until it is made
      item: itemFor(
        c.item ?? (c.kind === 'create_todo' ? 'todo' : null),
        c.id ?? meta.created?.[c.cid],
      ),
    }));
  }
  const names = nameLookup();
  const fixed = { relative: false };
  return meta.card.flatMap((c): ChangeRow[] => {
    if (c.op === 'milestone' && c.milestone?.steps.length) {
      const head = milestoneHeadWords(c, fixed);
      return c.milestone.steps.map((s, i) => {
        const cid = stepCid(c.cid, i);
        return {
          cid,
          of: c.cid,
          head,
          label: stepRowWords(s, fixed),
          // once it is set up, a step to do is a todo that can be opened
          item: s.kind === 'todo' ? itemFor('todo', meta.created?.[cid]) : undefined,
        };
      });
    }
    return [{ cid: c.cid, label: rowWords(c, { ...fixed, names }), item: itemOfChange(c, meta) }];
  });
}

/** The line above a row: what a milestone's steps are towards, before the first of them shown. */
function headOf(rows: ChangeRow[], i: number): string | null {
  const row = rows[i];
  if (!row.head) return null;
  return i > 0 && rows[i - 1].of === row.of ? null : row.head;
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
export function useRenderChanges(
  actions: ChangeCardActions,
  onOpenItem?: (item: ChangeRowItem) => void,
) {
  const { busy, canUndo, apply, dismiss, undo } = actions;
  return useCallback(
    (message: SpaceChatMessage, meta: BriefChangesMeta) => (
      <ChangeCard
        meta={meta}
        interactive={!busy}
        onApply={(unticked) => void apply(message, unticked)}
        onDismiss={() => void dismiss(message)}
        onUndo={canUndo(message.id) ? () => void undo(message) : undefined}
        onOpenItem={onOpenItem}
      />
    ),
    [busy, canUndo, apply, dismiss, undo, onOpenItem],
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
  /** A tap on a row's words opens the item the row is about */
  onOpenItem?: (item: ChangeRowItem) => void;
};

export function ChangeCard({
  meta,
  interactive = true,
  onApply,
  onDismiss,
  onUndo,
  onOpenItem,
}: ChangeCardProps) {
  // The card is drawn once and kept, so the item is looked up again when its
  // row is tapped: one deleted or put away since opens nothing.
  const open = (item: ChangeRowItem) => {
    const now = itemFor(item.type, item.id);
    if (now) onOpenItem?.(now);
  };
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
    const left = new Set(meta.unticked ?? []);
    // a step is reported on with its milestone, and a step left out was never part of it
    const of = (c: ChangeRow) => c.of ?? c.cid;
    const shown = rows.filter(
      (c) => (done.has(of(c)) || failed.has(of(c))) && !(c.of && left.has(c.cid)),
    );
    return (
      <View style={styles.card} testID="changes-applied">
        <Text style={styles.title}>Changed</Text>
        {shown.map((c, i) => {
          const item = onOpenItem ? c.item : undefined;
          const head = headOf(shown, i);
          const mark = done.has(of(c)) ? (
            <Check size={16} color={BRIEF.moss} strokeWidth={2.5} />
          ) : (
            <CircleSlash size={16} color={BRIEF.warn} strokeWidth={2} />
          );
          const label = failed.has(of(c)) ? `${c.label} (could not be saved)` : c.label;
          const words = (
            <Text style={[styles.label, failed.has(of(c)) && styles.failed]}>{label}</Text>
          );
          return (
            <React.Fragment key={c.cid}>
              {head ? <Text style={styles.head}>{head}</Text> : null}
              {!item ? (
                <View style={styles.row}>
                  {mark}
                  {words}
                </View>
              ) : (
                <Pressable
                  style={styles.row}
                  onPress={() => open(item)}
                  disabled={!interactive}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityHint={openHint(item)}
                  testID={`change-open-${c.cid}`}
                >
                  {mark}
                  {words}
                  <ChevronRight size={16} color={BRIEF.faint} strokeWidth={2} />
                </Pressable>
              )}
            </React.Fragment>
          );
        })}
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
      {rows.map((c, i) => {
        const on = !unticked.includes(c.cid);
        const item = onOpenItem ? c.item : undefined;
        const head = headOf(rows, i);
        const box = on ? (
          <SquareCheck size={18} color={BRIEF.moss} strokeWidth={2} />
        ) : (
          <Square size={18} color={BRIEF.faint} strokeWidth={2} />
        );
        const tick = {
          onPress: () => toggle(c.cid),
          disabled: !interactive,
          accessibilityRole: 'checkbox' as const,
          accessibilityState: { checked: on },
          accessibilityLabel: c.label,
          testID: `change-${c.cid}`,
        };
        if (!item) {
          return (
            <React.Fragment key={c.cid}>
              {head ? <Text style={styles.head}>{head}</Text> : null}
              <Pressable style={styles.row} {...tick}>
                {box}
                <Text style={[styles.label, !on && styles.off]}>{c.label}</Text>
              </Pressable>
            </React.Fragment>
          );
        }
        // the box is the tick; the words open the item
        return (
          <React.Fragment key={c.cid}>
            {head ? <Text style={styles.head}>{head}</Text> : null}
            <View style={styles.row}>
              <Pressable style={styles.box} hitSlop={TICK_SLOP} {...tick}>
                {box}
              </Pressable>
              <Pressable
                style={styles.open}
                onPress={() => open(item)}
                disabled={!interactive}
                accessibilityRole="button"
                accessibilityLabel={c.label}
                accessibilityHint={openHint(item)}
                testID={`change-open-${c.cid}`}
              >
                <Text style={[styles.label, !on && styles.off]}>{c.label}</Text>
                <ChevronRight size={16} color={BRIEF.faint} strokeWidth={2} />
              </Pressable>
            </View>
          </React.Fragment>
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

/** A little more room around the box, on top of its own padding */
const TICK_SLOP = { top: 6, bottom: 6, left: 12, right: 4 };

const KIND_WORD: Record<ItemType, string> = { todo: 'todo', habit: 'habit', note: 'note' };

function openHint(item: ChangeRowItem): string {
  return `Opens the ${KIND_WORD[item.type]}`;
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
  // what the rows under it are steps towards
  head: { fontFamily: 'Inter-SemiBold', fontSize: 13, color: BRIEF.moss, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  // room of its own to tap, inside the row, so the tick is not a small target
  box: { paddingVertical: 8, paddingRight: 6 },
  open: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
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
