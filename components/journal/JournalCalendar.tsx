/**
 * The journal by month: today strongest, the days with an entry marked, and
 * under the days what the chosen day holds, to open.
 *
 * It is the same on the journal page, where it rises as a sheet, and in the
 * Hub's Journals view, where it sits above the list.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react-native';
import {
  WEEKDAY_LETTERS,
  entrySnippet,
  entryTitle,
  monthCount,
  monthDays,
  monthOf,
  monthTitle,
  monthsToShow,
  shiftMonth,
} from '../../lib/journal/calendar';
import { entryDay, journalEntries, type JournalEntry } from '../../lib/journal/entry';
import { entryPhotoCount } from '../../lib/journal/photos';
import { JOURNAL_COPY, dayWords } from '../../lib/journal/words';
import { MOOD_CONFIG } from '../../lib/shared/moods';
import { knownMoods } from '../../lib/wrapup/journal';
import { BRIEF } from '../brief/briefStyles';
import { journalStyles } from './journalStyles';

export type JournalCalendarProps = {
  /** Every journal entry */
  entries: JournalEntry[];
  /** The person's day */
  today: string;
  /** The day chosen when it opens. Today when left out. */
  startOn?: string;
  /** What is said about today, and what its button says and does */
  todayCard: { text: string; action: string; onPress: () => void };
  /** The entry that is today's page, which today's button already opens */
  todayEntryId?: string | null;
  onOpen: (entry: JournalEntry) => void;
};

export function JournalCalendar({
  entries,
  today,
  startOn,
  todayCard,
  todayEntryId,
  onOpen,
}: JournalCalendarProps) {
  const [month, setMonth] = useState(() => monthOf(startOn ?? today));
  const [chosen, setChosen] = useState<string | null>(startOn ?? today);

  /** Each day's entries, in the order written */
  const byDay = useMemo(() => {
    const days = new Map<string, JournalEntry[]>();
    // oldest first within a day
    for (const e of journalEntries(entries)) {
      const day = entryDay(e);
      if (!day) continue;
      const held = days.get(day);
      if (held) held.push(e);
      else days.set(day, [e]);
    }
    return days;
  }, [entries]);
  const range = useMemo(() => monthsToShow(entries, today), [entries, today]);
  const { lead, days } = useMemo(() => monthDays(month), [month]);
  const count = days.reduce((n, d) => n + (byDay.get(d)?.length ?? 0), 0);
  /** The month in rows of seven, with empty places before the first and after the last */
  const weeks = useMemo(() => {
    const places: (string | null)[] = [...Array.from({ length: lead }, () => null), ...days];
    while (places.length % 7) places.push(null);
    const rows: (string | null)[][] = [];
    for (let i = 0; i < places.length; i += 7) rows.push(places.slice(i, i + 7));
    return rows;
  }, [lead, days]);

  const go = (by: number) => {
    const next = shiftMonth(month, by);
    if (next < range.first || next > range.last) return;
    setMonth(next);
    // a day chosen in another month is no longer in sight
    if (chosen && monthOf(chosen) !== next) setChosen(null);
  };

  const onDay = chosen ? (byDay.get(chosen) ?? []) : [];
  // today's own page is behind today's button, so it is not listed again under it
  const listed = chosen === today ? onDay.filter((e) => e.id !== todayEntryId) : onDay;

  return (
    <View testID="journal-calendar">
      <View style={styles.head}>
        <Pressable
          style={[styles.nav, month <= range.first && styles.navOff]}
          onPress={() => go(-1)}
          disabled={month <= range.first}
          accessibilityRole="button"
          accessibilityLabel={JOURNAL_COPY.calPrevMonth}
          testID="journal-cal-prev"
        >
          <ChevronLeft size={20} color={BRIEF.moss} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.month} accessibilityRole="header" testID="journal-cal-month">
          {monthTitle(month)}
        </Text>
        <Pressable
          style={[styles.nav, month >= range.last && styles.navOff]}
          onPress={() => go(1)}
          disabled={month >= range.last}
          accessibilityRole="button"
          accessibilityLabel={JOURNAL_COPY.calNextMonth}
          testID="journal-cal-next"
        >
          <ChevronRight size={20} color={BRIEF.moss} strokeWidth={2.2} />
        </Pressable>
      </View>
      <Text style={styles.count} testID="journal-cal-count">
        {monthCount(count)}
      </Text>

      <View style={styles.week} accessible={false}>
        {WEEKDAY_LETTERS.map((letter, i) => (
          <Text key={i} style={[styles.cell, styles.letter]}>
            {letter}
          </Text>
        ))}
      </View>
      {weeks.map((week, w) => (
        <View key={w} style={styles.week}>
          {week.map((day, place) => {
            if (!day) return <View key={`empty-${place}`} style={styles.cell} />;
            const isToday = day === today;
            const has = (byDay.get(day)?.length ?? 0) > 0;
            const on = day === chosen;
            const ahead = day > today;
            const words = dayWords(day);
            return (
              <View key={day} style={styles.cell}>
                <Pressable
                  style={[
                    styles.day,
                    has && styles.dayHas,
                    isToday && styles.dayToday,
                    on && styles.dayOn,
                    on && isToday && styles.dayOnToday,
                    ahead && styles.dayAhead,
                  ]}
                  onPress={() => setChosen(day)}
                  disabled={ahead}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on, disabled: ahead }}
                  accessibilityLabel={`${words.weekday} ${words.long}, ${
                    isToday ? 'today' : has ? 'has an entry' : 'nothing written'
                  }`}
                  testID={`journal-cal-day-${day}`}
                >
                  <Text
                    style={[
                      styles.dayText,
                      has && styles.dayTextHas,
                      isToday && styles.dayTextToday,
                    ]}
                  >
                    {Number(day.slice(8))}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}

      <View style={styles.legend}>
        <View style={styles.key}>
          <View style={[styles.dot, styles.dotToday]} />
          <Text style={styles.keyText}>{JOURNAL_COPY.calLegendToday}</Text>
        </View>
        <View style={styles.key}>
          <View style={styles.dot} />
          <Text style={styles.keyText}>{JOURNAL_COPY.calLegendHas}</Text>
        </View>
      </View>

      {chosen === today ? (
        <View style={styles.card} testID="journal-cal-today">
          <Text style={styles.label}>{JOURNAL_COPY.calToday}</Text>
          <Text style={styles.title}>
            {dayWords(today).weekday} {dayWords(today).long}
          </Text>
          <Text style={styles.text}>{todayCard.text}</Text>
          <Pressable
            style={styles.open}
            onPress={todayCard.onPress}
            accessibilityRole="button"
            testID="journal-cal-today-open"
          >
            <Text style={styles.openText}>{todayCard.action}</Text>
          </Pressable>
        </View>
      ) : null}
      {listed.map((e) => {
        const snippet = entrySnippet(e);
        const moods = knownMoods(e.mood);
        const photos = entryPhotoCount(e);
        return (
          <View key={e.id} style={styles.card} testID={`journal-cal-entry-${e.id}`}>
            <Text style={styles.label}>{dayWords(entryDay(e)).short}</Text>
            <Text style={styles.title} numberOfLines={2}>
              {entryTitle(e)}
            </Text>
            {snippet ? (
              <Text style={styles.text} numberOfLines={2}>
                {snippet}
              </Text>
            ) : null}
            {moods.length || photos ? (
              <View style={styles.moods}>
                {moods.map((m) => (
                  <View key={m} style={[journalStyles.mood, journalStyles.moodOn, styles.mood]}>
                    <Text
                      style={[journalStyles.moodText, journalStyles.moodTextOn, styles.moodText]}
                    >
                      {MOOD_CONFIG[m].label}
                    </Text>
                  </View>
                ))}
                {photos ? (
                  <View style={styles.photos} testID={`journal-cal-photos-${e.id}`}>
                    <ImageIcon size={12} color={BRIEF.muted} strokeWidth={2} />
                    <Text style={styles.photosText}>
                      {photos} {photos === 1 ? 'photo' : 'photos'}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            <Pressable
              style={styles.open}
              onPress={() => onOpen(e)}
              accessibilityRole="button"
              accessibilityLabel={`${JOURNAL_COPY.calOpen} ${entryTitle(e)}`}
              testID={`journal-cal-open-${e.id}`}
            >
              <Text style={styles.openText}>
                {onDay.length === 1 ? JOURNAL_COPY.calOpenDay : JOURNAL_COPY.calOpen}
              </Text>
            </Pressable>
          </View>
        );
      })}
      {chosen && chosen !== today && !onDay.length ? (
        <View style={[styles.card, styles.cardQuiet]} testID="journal-cal-nothing">
          <Text style={styles.label}>{dayWords(chosen).short}</Text>
          <Text style={styles.quiet}>{JOURNAL_COPY.calNothing}</Text>
        </View>
      ) : null}
      {!chosen ? (
        <View style={[styles.card, styles.cardQuiet]} testID="journal-cal-tap">
          <Text style={styles.quiet}>{JOURNAL_COPY.calTapDay}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center' },
  nav: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  navOff: { opacity: 0.3 },
  month: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 18,
    color: BRIEF.mossInk,
  },
  count: {
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: BRIEF.muted,
    fontVariant: ['tabular-nums'],
  },
  // seven to a row, each taking an equal share
  week: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', marginBottom: 5 },
  letter: {
    textAlign: 'center',
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 11,
    letterSpacing: 1.1,
    color: BRIEF.faint,
    paddingTop: 4,
    paddingBottom: 1,
  },
  day: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  dayHas: { backgroundColor: BRIEF.sageWash },
  dayToday: {
    backgroundColor: BRIEF.moss,
    shadowColor: BRIEF.moss,
    shadowOpacity: 0.32,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  dayOn: { borderColor: BRIEF.moss },
  dayOnToday: { borderColor: BRIEF.peri },
  dayAhead: { opacity: 0.38 },
  dayText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14.5,
    color: BRIEF.faint,
    fontVariant: ['tabular-nums'],
  },
  dayTextHas: { color: BRIEF.mossInk },
  dayTextToday: { fontFamily: 'Inter-Bold', color: BRIEF.linen },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 5,
    marginBottom: 4,
  },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: BRIEF.sageWash,
    borderWidth: 1,
    borderColor: 'rgba(46, 85, 64, 0.16)',
  },
  dotToday: { backgroundColor: BRIEF.moss, borderColor: BRIEF.moss },
  keyText: { fontFamily: 'Inter-Regular', fontSize: 12, color: BRIEF.muted },
  card: {
    marginTop: 8,
    paddingTop: 13,
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderRadius: 18,
    backgroundColor: BRIEF.white,
    borderWidth: 1,
    borderColor: BRIEF.line,
  },
  cardQuiet: { backgroundColor: 'transparent' },
  label: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 11,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: BRIEF.periInk,
  },
  title: {
    marginTop: 3,
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 16,
    lineHeight: 21,
    color: BRIEF.mossInk,
  },
  text: {
    marginTop: 5,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 20,
    color: BRIEF.mossInk,
  },
  quiet: {
    marginTop: 3,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 20,
    color: BRIEF.muted,
  },
  moods: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 },
  mood: { paddingVertical: 3, paddingHorizontal: 9 },
  moodText: { fontSize: 12 },
  photos: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 4 },
  photosText: { fontFamily: 'Inter-Regular', fontSize: 12, color: BRIEF.muted },
  open: {
    marginTop: 12,
    height: 44,
    borderRadius: 22,
    backgroundColor: BRIEF.moss,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openText: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 14.5, color: BRIEF.linen },
});
