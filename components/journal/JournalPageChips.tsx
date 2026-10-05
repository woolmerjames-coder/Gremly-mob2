/**
 * The pages to choose from, as a row of chips like the ones on Chat's home.
 * The chosen page is brought into view.
 */
import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import {
  Bookmark,
  HandHeart,
  Lightbulb,
  MoonStar,
  Plus,
  Sparkles,
  SquarePen,
  Sunrise,
} from 'lucide-react-native';
import type { JournalPageDef, JournalPageIcon } from '../../lib/journal/pages';
import { JOURNAL_COPY } from '../../lib/journal/words';
import { BRIEF } from '../brief/briefStyles';

const ICONS: Record<JournalPageIcon, typeof SquarePen> = {
  free: SquarePen,
  proud: HandHeart,
  good: Sparkles,
  rose: Sunrise,
  review: MoonStar,
  head: Lightbulb,
  own: Bookmark,
};

export type JournalPageChipsProps = {
  pages: JournalPageDef[];
  chosen: string;
  onPick: (id: string) => void;
  /** Left out where the app cannot keep pages of the person's own */
  onMakeOwn?: () => void;
};

export function JournalPageChips({ pages, chosen, onPick, onMakeOwn }: JournalPageChipsProps) {
  const row = useRef<ScrollView>(null);
  const left = useRef<Record<string, number>>({});

  useEffect(() => {
    const x = left.current[chosen];
    if (x !== undefined) row.current?.scrollTo({ x: Math.max(0, x - 48), animated: true });
  }, [chosen]);

  return (
    <ScrollView
      ref={row}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.row}
      accessibilityRole="tablist"
      testID="journal-pages"
    >
      {pages.map((p) => {
        const on = p.id === chosen;
        const Icon = ICONS[p.icon] ?? SquarePen;
        return (
          <Pressable
            key={p.id}
            style={[styles.chip, on && styles.chipOn]}
            onPress={() => onPick(p.id)}
            onLayout={(e) => {
              left.current[p.id] = e.nativeEvent.layout.x;
              if (on) row.current?.scrollTo({ x: Math.max(0, e.nativeEvent.layout.x - 48) });
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={p.name}
            testID={`journal-page-${p.id}`}
          >
            <Icon size={16} color={on ? BRIEF.sageWash : BRIEF.moss} strokeWidth={2} />
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{p.name}</Text>
          </Pressable>
        );
      })}
      {onMakeOwn ? (
        <Pressable
          style={[styles.chip, styles.chipNew]}
          onPress={onMakeOwn}
          accessibilityRole="button"
          accessibilityLabel={JOURNAL_COPY.makeOwn}
          testID="journal-page-make-own"
        >
          <Plus size={16} color={BRIEF.moss} strokeWidth={2.3} />
          <Text style={styles.chipText}>{JOURNAL_COPY.makeOwn}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: 20, paddingTop: 2, paddingBottom: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 38,
    paddingLeft: 12,
    paddingRight: 14,
    borderRadius: 19,
    backgroundColor: BRIEF.white,
    borderWidth: 1,
    borderColor: 'rgba(46, 85, 64, 0.12)',
    shadowColor: BRIEF.mossInk,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  chipOn: { backgroundColor: BRIEF.moss, borderColor: BRIEF.moss, shadowOpacity: 0.22 },
  chipNew: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(46, 85, 64, 0.30)',
    shadowOpacity: 0,
    elevation: 0,
  },
  chipText: { fontFamily: 'Inter-SemiBold', fontSize: 13.5, color: BRIEF.mossInk },
  chipTextOn: { color: BRIEF.linen },
});
