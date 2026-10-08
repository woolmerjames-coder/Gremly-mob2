/**
 * What is kept on a Chapter or a World: lists and notes as cards, dates in
 * order, habits with their week, and the people on a Chapter.
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check, ListChecks, StickyNote } from 'lucide-react-native';
import type { Habit, Note } from '../../lib/types';
import { F, SHADOW, TINT, W } from '../../lib/worlds/look';
import {
  dayOf,
  dayShort,
  habitLine,
  isList,
  type HabitDay,
  type WorldTint,
} from '../../lib/worlds/model';

/** A note's name: its title, or its first line. */
export function noteTitle(n: Pick<Note, 'title' | 'body'>): string {
  const t = (n.title || '').trim();
  if (t) return t;
  const first = (n.body || '').split('\n').find((l) => l.trim());
  return (first || 'Untitled note').trim();
}

export function KeptStrip({ items, onOpen }: { items: Note[]; onOpen: (n: Note) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.strip}
      contentContainerStyle={styles.stripRow}
    >
      {items.map((n) => {
        const list = isList(n);
        const rows = n.list_items || [];
        const ticked = rows.filter((r) => r.checked).length;
        const Icon = list ? ListChecks : StickyNote;
        return (
          <Pressable
            key={n.id}
            onPress={() => onOpen(n)}
            style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.98 }] }]}
            accessibilityRole="button"
            accessibilityLabel={`${noteTitle(n)}. ${list ? `${ticked} of ${rows.length} ticked` : 'Note'}`}
            testID={`kept-${n.id}`}
          >
            <View style={styles.cardTop}>
              <Icon size={18} color={W.moss} />
              <Text style={styles.cardTitle} numberOfLines={2}>
                {noteTitle(n)}
              </Text>
            </View>
            <Text style={styles.cardSub}>
              {list ? `${ticked} of ${rows.length} ticked` : 'Note'}
            </Text>
            {list ? (
              <View style={styles.bar}>
                <View
                  style={[
                    styles.barIn,
                    { width: `${rows.length ? Math.round((ticked / rows.length) * 100) : 0}%` },
                  ]}
                />
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function DateRows({ items, onOpen }: { items: Note[]; onOpen: (n: Note) => void }) {
  return (
    <View style={styles.box}>
      {items.map((n, i) => {
        const d = dayOf(n.target_date);
        return (
          <Pressable
            key={n.id}
            onPress={() => onOpen(n)}
            style={[styles.dr, i > 0 && styles.line]}
            accessibilityRole="button"
            accessibilityLabel={`${d ? dayShort(d) : ''}, ${noteTitle(n)}`}
          >
            <Text style={styles.drTime}>{d ? dayShort(d) : ''}</Text>
            <Text style={styles.drText}>{noteTitle(n)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function HabitRows({
  habits,
  weekOf,
  onToggle,
}: {
  habits: Habit[];
  weekOf: (h: Habit) => HabitDay[];
  onToggle: (h: Habit, doneToday: boolean) => void;
}) {
  return (
    <View style={styles.box}>
      {habits.map((h, i) => {
        const week = weekOf(h);
        const doneToday = !!week.find((d) => d.isToday)?.done;
        return (
          <View key={h.id} style={[styles.hb, i > 0 && styles.line]}>
            <View style={styles.hbTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.hbTitle}>{h.name}</Text>
                <Text style={styles.hbSub}>{habitLine(week)}</Text>
              </View>
              <Pressable
                onPress={() => onToggle(h, doneToday)}
                style={[styles.act, doneToday && styles.actOn]}
                accessibilityRole="button"
                accessibilityState={{ checked: doneToday }}
                accessibilityLabel={
                  doneToday ? `${h.name}, done today. Undo` : `Check in: ${h.name}`
                }
                testID={`habit-${h.id}`}
              >
                {doneToday ? <Check size={14} strokeWidth={2.6} color={W.forest} /> : null}
                <Text style={[styles.actText, doneToday && { color: W.forest }]}>
                  {doneToday ? 'Done today' : 'Check in'}
                </Text>
              </Pressable>
            </View>
            <View style={styles.week} accessible accessibilityLabel={habitLine(week)}>
              {week.map((d) => (
                <View
                  key={d.day}
                  style={[
                    styles.day,
                    d.isToday && { borderColor: W.moss },
                    d.isFuture && styles.dayFuture,
                    d.done && { backgroundColor: W.moss, borderColor: W.moss },
                  ]}
                >
                  {d.done ? (
                    <Check size={14} strokeWidth={3} color={W.linen} />
                  ) : (
                    <Text style={[styles.dayText, d.isToday && { color: W.moss }]}>{d.letter}</Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function PeopleChips({ names, tint }: { names: string[]; tint: WorldTint }) {
  return (
    <View style={styles.ppl}>
      {names.map((p) => (
        <View key={p} style={styles.pp}>
          <View style={[styles.ppI, { backgroundColor: TINT[tint].wash }]}>
            <Text style={[styles.ppIText, { color: TINT[tint].ink }]}>{p.charAt(0)}</Text>
          </View>
          <Text style={styles.ppText}>{p}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { marginHorizontal: -20, marginTop: 2 },
  stripRow: { paddingHorizontal: 20, paddingTop: 2, paddingBottom: 12, gap: 10 },
  card: {
    width: 158,
    backgroundColor: W.white,
    borderWidth: 1,
    borderColor: W.line,
    borderRadius: 18,
    paddingVertical: 13,
    paddingHorizontal: 14,
    ...SHADOW,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardTitle: { flex: 1, fontFamily: F.ui, fontSize: 15, lineHeight: 19, color: W.forest },
  cardSub: { fontFamily: F.body, fontSize: 13, lineHeight: 17, color: W.muted, marginTop: 5 },
  bar: { height: 5, borderRadius: 3, backgroundColor: W.track, marginTop: 10, overflow: 'hidden' },
  barIn: { height: '100%', borderRadius: 3, backgroundColor: W.moss },
  box: {
    backgroundColor: W.white,
    borderWidth: 1,
    borderColor: W.line,
    borderRadius: 18,
    overflow: 'hidden',
    ...SHADOW,
  },
  line: { borderTopWidth: 1, borderTopColor: W.line },
  dr: { flexDirection: 'row', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  drTime: { width: 92, fontFamily: F.ui, fontSize: 14, color: W.forest },
  drText: { flex: 1, fontFamily: F.body, fontSize: 15, lineHeight: 20, color: W.ink },
  hb: { paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  hbTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hbTitle: { fontFamily: F.bodyMedium, fontSize: 16, lineHeight: 21, color: W.ink },
  hbSub: { fontFamily: F.body, fontSize: 13, color: W.muted, marginTop: 2 },
  act: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 34,
    paddingHorizontal: 13,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: 'rgba(46,85,64,0.25)',
  },
  actOn: { backgroundColor: W.sage, borderColor: W.sage },
  actText: { fontFamily: F.bodySemi, fontSize: 13.5, color: W.moss },
  week: { flexDirection: 'row', gap: 6 },
  day: {
    flex: 1,
    height: 34,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: W.box,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayFuture: { borderStyle: 'dashed', opacity: 0.6 },
  dayText: { fontFamily: F.bodySemi, fontSize: 13, color: W.muted },
  ppl: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 38,
    paddingLeft: 5,
    paddingRight: 14,
    borderRadius: 19,
    backgroundColor: W.white,
    borderWidth: 1,
    borderColor: W.line,
  },
  ppI: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ppIText: { fontFamily: F.ui, fontSize: 13 },
  ppText: { fontFamily: F.bodySemi, fontSize: 14, color: W.forest },
});
