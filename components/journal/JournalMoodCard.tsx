/**
 * How the day felt, under the writing on the journal page. Picking is
 * optional: with none picked, Gremly reads the mood from the words.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ALL_MOODS, MOOD_CONFIG, type Mood } from '../../lib/shared/moods';
import { JOURNAL_COPY } from '../../lib/journal/words';
import { BRIEF } from '../brief/briefStyles';
import { journalStyles } from './journalStyles';

export type JournalMoodCardProps = {
  moods: Mood[];
  /** Left out while looking back, when the moods are only shown */
  onToggle?: (mood: Mood) => void;
};

export function JournalMoodCard({ moods, onToggle }: JournalMoodCardProps) {
  const shown = onToggle ? ALL_MOODS : ALL_MOODS.filter((m) => moods.includes(m));
  if (!shown.length) return null;
  return (
    <View testID="journal-moods">
      <View style={journalStyles.section}>
        <View style={journalStyles.sectionBar} />
        <Text style={journalStyles.sectionText}>{JOURNAL_COPY.moodsTitle}</Text>
      </View>
      <View style={[journalStyles.card, styles.card]}>
        <View style={styles.moods}>
          {shown.map((m) => {
            const on = moods.includes(m);
            return (
              <Pressable
                key={m}
                style={[journalStyles.mood, on && journalStyles.moodOn]}
                onPress={() => onToggle?.(m)}
                disabled={!onToggle}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={MOOD_CONFIG[m].label}
                testID={`journal-mood-${m}`}
              >
                <Text style={[journalStyles.moodText, on && journalStyles.moodTextOn]}>
                  {MOOD_CONFIG[m].label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {onToggle ? <Text style={styles.hint}>{JOURNAL_COPY.moodsHint}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 14, paddingTop: 13 },
  moods: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  hint: {
    marginTop: 10,
    fontFamily: 'Inter-Regular',
    fontSize: 12.5,
    lineHeight: 17.5,
    color: BRIEF.faint,
  },
});
