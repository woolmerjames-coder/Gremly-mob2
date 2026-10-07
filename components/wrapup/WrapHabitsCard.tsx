/**
 * Habits still open today, checked in on one card: tap the ones that
 * happened, say whether a habit being broken held, then one button saves the
 * lot. Nothing is logged until then.
 *
 * A habit they planned for today in their week that did not happen can move
 * to another day of the week instead (the day the card was given for it):
 * ticking it and moving it are one or the other.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import type { SweepHabitsMeta } from '../../lib/brief/types';
import {
  CARD_COPY,
  WRAP_COPY,
  alreadyLogged,
  habitMoveButton,
  habitMoveLine,
  partWords,
} from '../../lib/wrapup/words';
import { BRIEF } from '../brief/briefStyles';
import { wrapStyles } from './wrapStyles';

export type WrapHabitsCardProps = {
  meta: SweepHabitsMeta;
  interactive?: boolean;
  /** moved: the habits to move to another day of their week, by id, with the day */
  onSave?: (
    done: string[],
    held: Record<string, 'held' | 'not'>,
    moved: Record<string, string>,
  ) => void;
  /** The full list of every habit */
  onAll?: () => void;
};

export function WrapHabitsCard({ meta, interactive = true, onSave, onAll }: WrapHabitsCardProps) {
  const [done, setDone] = useState<string[]>([]);
  const [held, setHeld] = useState<Record<string, 'held' | 'not'>>({});
  const [moved, setMoved] = useState<Record<string, string>>({});
  const saved = meta.status === 'saved';
  // asked before the evening, the card does not say tonight
  const words = partWords(meta.early);
  const shownDone = saved ? (meta.done ?? []) : done;
  const shownHeld = saved ? (meta.held ?? {}) : held;
  const shownMoved = saved ? (meta.moved ?? {}) : moved;
  const builds = meta.habits.filter((h) => h.kind === 'build');
  const breaks = meta.habits.filter((h) => h.kind === 'break');
  const picked = done.length + Object.keys(held).length + Object.keys(moved).length;

  const unmove = (id: string) =>
    setMoved((m) => {
      if (!(id in m)) return m;
      const next = { ...m };
      delete next[id];
      return next;
    });
  // done today or moved to another day: one or the other
  const toggle = (id: string) => {
    unmove(id);
    setDone((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  };
  const move = (id: string, day: string) => {
    setDone((d) => d.filter((x) => x !== id));
    setMoved((m) => {
      const next = { ...m };
      if (next[id]) delete next[id];
      else next[id] = day;
      return next;
    });
  };
  const answer = (id: string, value: 'held' | 'not') =>
    setHeld((h) => {
      const next = { ...h };
      if (next[id] === value) delete next[id];
      else next[id] = value;
      return next;
    });

  return (
    <View style={wrapStyles.card} testID="wrap-habits">
      <View style={wrapStyles.head}>
        <Text style={wrapStyles.title}>
          {saved ? words.habitsSavedHeading : WRAP_COPY.habitsHeading}
        </Text>
        {saved ? (
          <View style={wrapStyles.tag}>
            <Check size={12} color={BRIEF.moss} strokeWidth={2.6} />
            <Text style={wrapStyles.tagText}>{CARD_COPY.saved}</Text>
          </View>
        ) : (
          <Text style={wrapStyles.hint}>{WRAP_COPY.habitsHint}</Text>
        )}
      </View>

      {builds.map((h) => {
        const on = shownDone.includes(h.id);
        const movedTo = on ? undefined : shownMoved[h.id];
        const sub = movedTo
          ? habitMoveLine(movedTo, saved)
          : saved
            ? on
              ? CARD_COPY.habitLogged
              : CARD_COPY.habitNotToday
            : (h.note ?? '');
        const body = (
          <>
            <View style={[wrapStyles.box, on && wrapStyles.boxOn]}>
              {on ? <Check size={14} color={BRIEF.white} strokeWidth={3} /> : null}
            </View>
            <View style={wrapStyles.rowBody}>
              <Text style={wrapStyles.rowTitle} numberOfLines={2}>
                {h.title}
              </Text>
              <Text style={wrapStyles.rowSub} testID={`wrap-habit-${h.id}-sub`}>
                {sub}
              </Text>
            </View>
          </>
        );
        if (saved) {
          return (
            <View key={h.id} style={wrapStyles.row}>
              {body}
            </View>
          );
        }
        const moveTo = h.move_to;
        return (
          <View key={h.id} style={wrapStyles.row}>
            <Pressable
              style={styles.tick}
              onPress={() => toggle(h.id)}
              disabled={!interactive}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={h.title}
              testID={`wrap-habit-${h.id}`}
            >
              {body}
            </Pressable>
            {moveTo ? (
              <Pressable
                style={[styles.move, !!moved[h.id] && styles.moveOn]}
                onPress={() => move(h.id, moveTo)}
                disabled={!interactive}
                accessibilityRole="button"
                accessibilityState={{ selected: !!moved[h.id] }}
                accessibilityLabel={`${habitMoveButton(moveTo)}, ${h.title}`}
                testID={`wrap-habit-${h.id}-move`}
              >
                <Text style={[styles.moveText, !!moved[h.id] && styles.moveTextOn]}>
                  {habitMoveButton(moveTo)}
                </Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}

      {builds.length && breaks.length ? <View style={wrapStyles.divider} /> : null}

      {breaks.map((h) => {
        const value = shownHeld[h.id];
        return (
          <View key={h.id} style={wrapStyles.row}>
            <View style={wrapStyles.rowBody}>
              <Text style={wrapStyles.rowTitle} numberOfLines={2}>
                {h.title}
              </Text>
              <Text style={wrapStyles.rowSub}>
                {saved
                  ? value === 'held'
                    ? CARD_COPY.habitHeld
                    : value === 'not'
                      ? CARD_COPY.habitNotHeld
                      : words.habitNoAnswer
                  : CARD_COPY.habitHold}
              </Text>
            </View>
            {saved ? null : (
              <View style={styles.two} accessibilityRole="radiogroup" accessibilityLabel={h.title}>
                {(['held', 'not'] as const).map((v) => (
                  <Pressable
                    key={v}
                    style={[styles.twoBtn, value === v && styles.twoBtnOn]}
                    onPress={() => answer(h.id, v)}
                    disabled={!interactive}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: value === v }}
                    testID={`wrap-habit-${h.id}-${v}`}
                  >
                    <Text style={[styles.twoText, value === v && styles.twoTextOn]}>
                      {v === 'held' ? WRAP_COPY.held : WRAP_COPY.notHeld}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        );
      })}

      {meta.already?.length ? <Text style={styles.foot}>{alreadyLogged(meta.already)}</Text> : null}

      {saved ? null : (
        <View style={wrapStyles.actions}>
          <Pressable
            style={[wrapStyles.btn, wrapStyles.btnGrow, wrapStyles.btnPrimary]}
            onPress={() => onSave?.(done, held, moved)}
            disabled={!interactive}
            accessibilityRole="button"
            testID="wrap-habits-save"
          >
            <Text style={[wrapStyles.btnText, wrapStyles.btnTextPrimary]}>
              {picked ? WRAP_COPY.habitsSave : words.habitsNone}
            </Text>
          </Pressable>
          {onAll ? (
            <Pressable
              style={[wrapStyles.btn, wrapStyles.btnSecondary]}
              onPress={onAll}
              accessibilityRole="button"
              testID="wrap-habits-all"
            >
              <Text style={wrapStyles.btnText}>{WRAP_COPY.habitsAll}</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  two: {
    flexDirection: 'row',
    backgroundColor: BRIEF.sageWash,
    borderRadius: 999,
    padding: 3,
  },
  twoBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999 },
  twoBtnOn: { backgroundColor: BRIEF.moss },
  twoText: { fontFamily: 'Inter-SemiBold', fontSize: 12.5, color: BRIEF.moss },
  // the tick and its words fill the row, beside the move button when there is one
  tick: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  move: {
    borderWidth: 1.5,
    borderColor: BRIEF.chipBorder,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  moveOn: { backgroundColor: BRIEF.moss, borderColor: BRIEF.moss },
  moveText: { fontFamily: 'Inter-SemiBold', fontSize: 12.5, color: BRIEF.moss },
  moveTextOn: { color: BRIEF.white },
  twoTextOn: { color: BRIEF.white },
  foot: { fontFamily: 'Inter-Regular', fontSize: 12.5, color: BRIEF.faint, lineHeight: 18 },
});
