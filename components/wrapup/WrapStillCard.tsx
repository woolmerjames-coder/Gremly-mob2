/**
 * Still open today: todos that were due today and did not happen, on one
 * card. Each has a tick; one button moves the ticked ones to tomorrow, and
 * unticking leaves one where it is. Once moved, Gremly says so underneath
 * with one Undo for all of them.
 */
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ArrowRight, Check, Circle } from 'lucide-react-native';
import type { SweepStillMeta } from '../../lib/brief/types';
import {
  CARD_COPY,
  WRAP_COPY,
  stillApply,
  stillMovedLine,
  stillRowWords,
} from '../../lib/wrapup/words';
import { BRIEF } from '../brief/briefStyles';
import { wrapStyles } from './wrapStyles';

export type WrapStillCardProps = {
  meta: SweepStillMeta;
  interactive?: boolean;
  onMove?: (ids: string[]) => void;
  onLeave?: () => void;
  /** Present while the move can still be put back */
  onUndo?: () => void;
};

export function WrapStillCard({
  meta,
  interactive = true,
  onMove,
  onLeave,
  onUndo,
}: WrapStillCardProps) {
  const [ticked, setTicked] = useState<string[]>(() => meta.todos.map((t) => t.id));
  const words = stillRowWords(meta.to_word);
  const total = meta.todos.length;

  if (meta.status === 'left') {
    return (
      <View style={wrapStyles.collapsed} testID="wrap-still-left">
        <Circle size={14} color={BRIEF.faint} strokeWidth={2} />
        <Text style={wrapStyles.collapsedText}>{WRAP_COPY.stillLeftLine}</Text>
      </View>
    );
  }

  const open = meta.status === 'open';
  const moved = meta.status === 'moved';
  const movedIds = new Set(meta.moved ?? []);
  const toggle = (id: string) =>
    setTicked((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
  // the words the buttons need: tomorrow, or its weekday after midnight
  const day = { weekday: '', tomorrow: meta.to_word, late: meta.to_word !== 'tomorrow' };

  return (
    <View testID="wrap-still">
      <View style={wrapStyles.card}>
        <View style={wrapStyles.head}>
          <Text style={wrapStyles.title}>{WRAP_COPY.stillHeading}</Text>
          {moved ? (
            <View style={wrapStyles.tag}>
              <Check size={12} color={BRIEF.moss} strokeWidth={2.6} />
              <Text style={wrapStyles.tagText}>{WRAP_COPY.stillMoved}</Text>
            </View>
          ) : (
            <Text style={wrapStyles.hint}>
              {open ? WRAP_COPY.stillHint : CARD_COPY.receiptPutBack}
            </Text>
          )}
        </View>
        {meta.todos.map((t) => {
          const on = open ? ticked.includes(t.id) : moved && movedIds.has(t.id);
          const sub = open ? (
            on ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[wrapStyles.rowSub, { color: BRIEF.moss }]}>{words.from}</Text>
                <ArrowRight size={12} color={BRIEF.moss} strokeWidth={2.4} />
                <Text style={[wrapStyles.rowSub, { color: BRIEF.moss }]}>{words.going}</Text>
              </View>
            ) : (
              <Text style={wrapStyles.rowSub}>{WRAP_COPY.stillStays}</Text>
            )
          ) : (
            <Text style={wrapStyles.rowSub}>{on ? words.moved : WRAP_COPY.stillOnToday}</Text>
          );
          const body = (
            <>
              <View style={[wrapStyles.box, on && wrapStyles.boxOn]}>
                {on ? <Check size={14} color={BRIEF.white} strokeWidth={3} /> : null}
              </View>
              <View style={wrapStyles.rowBody}>
                <Text style={wrapStyles.rowTitle} numberOfLines={2}>
                  {t.title}
                </Text>
                {sub}
              </View>
            </>
          );
          return open ? (
            <Pressable
              key={t.id}
              style={wrapStyles.row}
              onPress={() => toggle(t.id)}
              disabled={!interactive}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={t.title}
              testID={`wrap-still-row-${t.id}`}
            >
              {body}
            </Pressable>
          ) : (
            <View key={t.id} style={wrapStyles.row}>
              {body}
            </View>
          );
        })}
        {open ? (
          <View style={wrapStyles.actions}>
            {ticked.length ? (
              <>
                <Pressable
                  style={[wrapStyles.btn, wrapStyles.btnGrow, wrapStyles.btnPrimary]}
                  onPress={() => onMove?.(ticked)}
                  disabled={!interactive}
                  accessibilityRole="button"
                  testID="wrap-still-move"
                >
                  <Text style={[wrapStyles.btnText, wrapStyles.btnTextPrimary]}>
                    {stillApply(ticked.length, total, day)}
                  </Text>
                </Pressable>
                <Pressable
                  style={[wrapStyles.btn, wrapStyles.btnSecondary]}
                  onPress={onLeave}
                  disabled={!interactive}
                  accessibilityRole="button"
                  testID="wrap-still-leave"
                >
                  <Text style={wrapStyles.btnText}>
                    {total === 1 ? WRAP_COPY.stillLeaveOne : WRAP_COPY.stillLeave}
                  </Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                style={[wrapStyles.btn, wrapStyles.btnGrow, wrapStyles.btnPrimary]}
                onPress={onLeave}
                disabled={!interactive}
                accessibilityRole="button"
                testID="wrap-still-leave"
              >
                <Text style={[wrapStyles.btnText, wrapStyles.btnTextPrimary]}>
                  {total === 1 ? WRAP_COPY.stillLeaveAllOne : WRAP_COPY.stillLeaveAll}
                </Text>
              </Pressable>
            )}
          </View>
        ) : null}
      </View>
      {moved ? (
        <Text style={[wrapStyles.closing, { marginTop: 10 }]} testID="wrap-still-done">
          {stillMovedLine(movedIds.size, meta.to_word)}
          {onUndo ? (
            <>
              {'  '}
              <Text
                style={wrapStyles.undo}
                onPress={interactive ? onUndo : undefined}
                accessibilityRole="button"
                testID="wrap-still-undo"
              >
                {CARD_COPY.undo}
              </Text>
            </>
          ) : null}
        </Text>
      ) : null}
      {meta.status === 'undone' ? (
        <Text style={[wrapStyles.closing, { marginTop: 10 }]}>{WRAP_COPY.stillUndone}</Text>
      ) : null}
    </View>
  );
}
