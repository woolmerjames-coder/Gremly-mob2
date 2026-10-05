/**
 * What Gremly took from a journal entry: the line that says how much, the
 * list itself, and the sheet the saved card opens it in.
 */
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, Sparkles } from 'lucide-react-native';
import { TOOK_COPY, tookLine, type EntryFact } from '../../lib/journal/took';
import { BRIEF } from '../brief/briefStyles';
import { JOURNAL_WASH } from './journalStyles';

/** "Gremly took three things from this", to tap for the list */
export function JournalTookLine({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <Pressable
      style={styles.line}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={tookLine(count)}
      testID="journal-took-line"
    >
      <Sparkles size={15} color={BRIEF.periInk} strokeWidth={2} />
      <Text style={styles.lineText}>{tookLine(count)}</Text>
      <ChevronRight size={15} color={BRIEF.periInk} strokeWidth={2.2} />
    </Pressable>
  );
}

/** Each thing he kept, with the words it came from and how it stands now */
export function JournalTookList({ facts }: { facts: EntryFact[] }) {
  return (
    <View style={styles.list} testID="journal-took-list">
      {facts.map((f) => (
        <View key={f.id} style={styles.row} testID={`journal-took-${f.id}`}>
          <View style={styles.mark} />
          <View style={styles.rowBody}>
            <Text style={[styles.statement, f.standing === 'updated' && styles.statementOld]}>
              {f.statement}
            </Text>
            {f.quote ? (
              <Text style={styles.small} numberOfLines={2}>
                {TOOK_COPY.from}: “{f.quote}”
              </Text>
            ) : null}
            {f.standing !== 'held' ? (
              <Text style={styles.small}>
                {f.standing === 'unsure' ? TOOK_COPY.unsure : TOOK_COPY.updated}
              </Text>
            ) : null}
            {f.private ? (
              <View style={styles.tag}>
                <Text style={styles.tagText}>{TOOK_COPY.private}</Text>
              </View>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

/** The list as a sheet, for the saved card in the thread */
export function JournalTookSheet({ facts, onClose }: { facts: EntryFact[]; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.fill} testID="journal-took-sheet">
        <Pressable
          style={styles.scrim}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={TOOK_COPY.close}
          testID="journal-took-close"
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
          <View style={styles.grab} />
          <Text style={styles.title} accessibilityRole="header">
            {TOOK_COPY.title}
          </Text>
          <Text style={styles.sub}>{TOOK_COPY.sub}</Text>
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            <JournalTookList facts={facts} />
            <Text style={styles.foot}>{TOOK_COPY.foot}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingLeft: 12,
    paddingRight: 10,
    borderRadius: 12,
    backgroundColor: JOURNAL_WASH,
  },
  lineText: { flex: 1, fontFamily: 'Inter-SemiBold', fontSize: 13, color: BRIEF.periInk },
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: BRIEF.white,
    borderWidth: 1,
    borderColor: BRIEF.line,
  },
  // a small diamond
  mark: {
    width: 8,
    height: 8,
    marginTop: 6,
    borderRadius: 1.5,
    backgroundColor: BRIEF.peri,
    transform: [{ rotate: '45deg' }],
  },
  rowBody: { flex: 1, gap: 2 },
  statement: { fontFamily: 'Inter-SemiBold', fontSize: 14.5, lineHeight: 20, color: BRIEF.mossInk },
  statementOld: { color: BRIEF.muted },
  small: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 17, color: BRIEF.muted },
  tag: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: BRIEF.linen2,
  },
  tagText: { fontFamily: 'Inter-SemiBold', fontSize: 11, color: BRIEF.muted },
  fill: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(26, 51, 40, 0.34)' },
  sheet: {
    maxHeight: '80%',
    backgroundColor: BRIEF.linen,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 8,
    paddingHorizontal: 18,
  },
  grab: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(46, 85, 64, 0.22)',
    marginBottom: 14,
  },
  title: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 19, color: BRIEF.mossInk },
  sub: {
    marginTop: 5,
    marginBottom: 12,
    fontFamily: 'Inter-Regular',
    fontSize: 13.5,
    lineHeight: 19,
    color: BRIEF.muted,
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  foot: {
    marginTop: 12,
    fontFamily: 'Inter-Regular',
    fontSize: 12.5,
    lineHeight: 18,
    color: BRIEF.muted,
  },
});
