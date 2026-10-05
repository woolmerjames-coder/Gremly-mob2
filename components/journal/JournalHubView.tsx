/**
 * The journal in the Hub: the month, then every entry, newest first.
 *
 * A day in the month or a row in the list opens that entry on the journal
 * page, and today's page can be started or carried on from here.
 */
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { getDateService } from '../../lib/date/DateService';
import {
  entrySnippet,
  entryTitle,
  monthOf,
  monthTitle,
  todayCard,
  type TodayState,
} from '../../lib/journal/calendar';
import { entryDay, journalEntries, pageEntryFor, type JournalEntry } from '../../lib/journal/entry';
import { draftKey, openJournal, useJournalSession } from '../../lib/journal/session';
import { JOURNAL_COPY, dayWords } from '../../lib/journal/words';
import { BRIEF } from '../brief/briefStyles';
import { JournalCalendar } from './JournalCalendar';
import { journalStyles } from './journalStyles';

export type JournalHubViewProps = {
  /** Every journal entry */
  entries: JournalEntry[];
  /** Open a saved entry, as the Hub opens any of its items */
  onOpen: (entry: JournalEntry) => void;
};

export function JournalHubView({ entries, onOpen }: JournalHubViewProps) {
  const today = getDateService().ritualDay();
  const started = useJournalSession((s) => !!s.drafts[draftKey({ day: today })]);
  const todayEntry = useMemo(() => pageEntryFor(entries, today), [entries, today]);
  const state: TodayState = todayEntry ? 'saved' : started ? 'started' : 'empty';

  /** The entries by month, newest month and newest day first */
  const months = useMemo(() => {
    const out: { month: string; entries: JournalEntry[] }[] = [];
    for (const e of journalEntries(entries)) {
      const day = entryDay(e);
      if (!day) continue;
      const month = monthOf(day);
      const last = out[out.length - 1];
      if (last && last.month === month) last.entries.push(e);
      else out.push({ month, entries: [e] });
    }
    return out;
  }, [entries]);

  return (
    <View style={styles.view}>
      <View style={[journalStyles.card, styles.calendar]}>
        <JournalCalendar
          entries={entries}
          today={today}
          todayCard={{ ...todayCard(state), onPress: () => openJournal({ day: today }) }}
          todayEntryId={todayEntry?.id}
          onOpen={onOpen}
        />
      </View>

      {months.length === 0 ? (
        <Text style={styles.empty} testID="journal-view-empty">
          {JOURNAL_COPY.hubEmpty}
        </Text>
      ) : (
        <View testID="journal-view-timeline">
          {months.map((m) => (
            <View key={m.month}>
              <View style={[journalStyles.section, styles.section]}>
                <View style={journalStyles.sectionBar} />
                <Text style={journalStyles.sectionText}>{monthTitle(m.month)}</Text>
              </View>
              <View style={[journalStyles.card, styles.list]}>
                {m.entries.map((e, i) => {
                  const words = dayWords(entryDay(e));
                  const snippet = entrySnippet(e);
                  return (
                    <Pressable
                      key={e.id}
                      style={[styles.row, i > 0 && styles.rowLine]}
                      onPress={() => onOpen(e)}
                      accessibilityRole="button"
                      accessibilityLabel={`${words.weekday} ${words.long}. ${entryTitle(e)}`}
                      testID={`journal-timeline-${e.id}`}
                    >
                      <View style={styles.date}>
                        <Text style={styles.dayNumber}>{Number(entryDay(e).slice(8))}</Text>
                        <Text style={styles.weekday}>{words.weekday.slice(0, 3)}</Text>
                      </View>
                      <View style={styles.words}>
                        <Text style={styles.title} numberOfLines={1}>
                          {entryTitle(e)}
                        </Text>
                        {snippet ? (
                          <Text style={styles.snippet} numberOfLines={1}>
                            {snippet}
                          </Text>
                        ) : null}
                      </View>
                      <ChevronRight size={16} color={BRIEF.faint} strokeWidth={2.2} />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  view: { marginTop: 12 },
  calendar: { paddingTop: 8, paddingHorizontal: 12, paddingBottom: 12 },
  empty: {
    marginTop: 18,
    textAlign: 'center',
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 20,
    color: BRIEF.muted,
  },
  section: { marginHorizontal: 6 },
  list: { paddingTop: 2, paddingBottom: 2, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BRIEF.line },
  date: { width: 38, alignItems: 'center' },
  dayNumber: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 18,
    lineHeight: 22,
    color: BRIEF.moss,
    fontVariant: ['tabular-nums'],
  },
  weekday: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 10.5,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: BRIEF.faint,
  },
  words: { flex: 1 },
  title: { fontFamily: 'Inter-SemiBold', fontSize: 15, lineHeight: 20, color: BRIEF.mossInk },
  snippet: {
    marginTop: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 13.5,
    lineHeight: 19,
    color: BRIEF.muted,
  },
});
