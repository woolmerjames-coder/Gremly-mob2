/**
 * Gremly's opening card in the evening wrap up: the day in four counts, how
 * the plan went, and the list of what was finished behind one tap. Drawn from
 * what was saved with the message, so it reads the same later.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronDown, ChevronUp, Circle, CircleCheck } from 'lucide-react-native';
import type { SweepRecapMeta } from '../../lib/brief/types';
import { CARD_COPY, plannedTag, recapCells, recapMore, shortDate } from '../../lib/wrapup/words';
import { BRIEF } from '../brief/briefStyles';
import { wrapStyles } from './wrapStyles';

export function WrapRecapCard({ meta }: { meta: SweepRecapMeta }) {
  const [open, setOpen] = useState(false);
  const cells = recapCells(meta.counts);
  const listed = meta.done.length + meta.missed.length;
  return (
    <View style={wrapStyles.card} testID="wrap-recap">
      <View style={wrapStyles.head}>
        <Text style={wrapStyles.kicker}>{shortDate(meta.date)}</Text>
        {meta.planned && meta.planned.total > 0 ? (
          <View style={wrapStyles.tag}>
            <Check size={12} color={BRIEF.moss} strokeWidth={2.6} />
            <Text style={wrapStyles.tagText}>{plannedTag(meta.planned)}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.grid}>
        {cells.map(([n, label], i) => (
          <View key={label} style={[styles.cell, i > 0 && styles.cellLine]}>
            <Text style={styles.count}>{n}</Text>
            <Text style={styles.label}>{label}</Text>
          </View>
        ))}
      </View>
      {listed > 0 ? (
        <>
          <View style={wrapStyles.divider} />
          <Pressable
            style={styles.more}
            onPress={() => setOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            testID="wrap-recap-more"
          >
            <Text style={styles.moreText}>
              {open ? CARD_COPY.recapHide : recapMore(meta.done.length)}
            </Text>
            {open ? (
              <ChevronUp size={15} color={BRIEF.moss} strokeWidth={2.2} />
            ) : (
              <ChevronDown size={15} color={BRIEF.moss} strokeWidth={2.2} />
            )}
          </Pressable>
          {open ? (
            <View style={styles.list}>
              {meta.done.map((d, i) => (
                <View key={`d${i}`} style={styles.item}>
                  <CircleCheck size={16} color={BRIEF.moss} strokeWidth={2} />
                  <Text style={styles.itemText} numberOfLines={2}>
                    {d.title}
                  </Text>
                  <Text style={styles.itemKind}>
                    {d.kind === 'habit' ? CARD_COPY.recapHabit : CARD_COPY.recapTodo}
                  </Text>
                </View>
              ))}
              {meta.missed.map((m) => (
                <View key={m.id} style={styles.item}>
                  <Circle size={16} color={BRIEF.faint} strokeWidth={2} />
                  <Text style={[styles.itemText, styles.missed]} numberOfLines={2}>
                    {m.title}
                  </Text>
                  <Text style={styles.itemKind}>{CARD_COPY.recapMissed}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', paddingVertical: 4 },
  cell: { flex: 1, alignItems: 'center', gap: 2 },
  cellLine: { borderLeftWidth: 1, borderLeftColor: BRIEF.line },
  count: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 24,
    color: BRIEF.moss,
    fontVariant: ['tabular-nums'],
  },
  label: { fontFamily: 'Inter-Regular', fontSize: 11.5, color: BRIEF.muted },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  moreText: { fontFamily: 'Inter-SemiBold', fontSize: 13.5, color: BRIEF.moss },
  list: { gap: 8, paddingTop: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemText: { flex: 1, fontFamily: 'Inter-Medium', fontSize: 14, color: BRIEF.mossInk },
  missed: { color: BRIEF.muted },
  itemKind: { fontFamily: 'Inter-Regular', fontSize: 12, color: BRIEF.faint },
});
