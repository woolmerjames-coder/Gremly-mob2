/**
 * LadderCaption: the count toward the next age, under the Send button on the
 * Drop page, all day on a fed day and on any day with days banked. Nothing
 * shows at 0 of 3 on an unfed day. The dots and the words come from the store.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { getCaption } from '../../../lib/speech/momentWords';

const MOSS = '#2E5540';
const OFF = '#4B6A50';

export function LadderCaption() {
  const fedDaysCount = useGremlyStore((s) => s.fedDaysCount);
  const isFedToday = useGremlyStore((s) => s.isFedToday);
  const caption = getCaption(fedDaysCount, isFedToday);
  if (!caption) return null;
  const banked = Math.min(Math.max(Math.round(fedDaysCount), 0), 3);
  return (
    <View
      style={styles.row}
      accessibilityRole="text"
      accessibilityLabel={caption}
      testID="ladder-caption"
    >
      <View style={styles.dots}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.dot, i < banked ? styles.dotOn : null]} />
        ))}
      </View>
      <Text style={styles.text}>{caption}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginTop: 9,
    minHeight: 16,
  },
  dots: { flexDirection: 'row', gap: 5 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(46,85,64,0.3)',
    backgroundColor: 'rgba(46,85,64,0.08)',
  },
  dotOn: { backgroundColor: MOSS, borderColor: MOSS },
  text: { fontFamily: 'Inter-Regular', fontSize: 12.5, color: OFF },
});
