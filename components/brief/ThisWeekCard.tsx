/**
 * The week's intention, at the top of the brief: a small dark card above the
 * day card, as in the approved prototype (Friday's brief). Shown only when
 * they set one for the week the day is in.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BRIEF } from './briefStyles';

type Props = {
  /** Their intention, in their own words */
  text: string;
};

export function ThisWeekCard({ text }: Props) {
  return (
    <View
      style={styles.card}
      testID="brief-this-week"
      accessible
      accessibilityLabel={`This week: ${text}`}
    >
      <Text style={styles.kicker}>THIS WEEK</Text>
      <Text style={styles.text}>{`“${text}”`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: BRIEF.mossInk,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 4,
    marginBottom: 10,
  },
  kicker: {
    fontFamily: 'Inter-Bold',
    fontSize: 11,
    letterSpacing: 0.66,
    color: '#A9C9B2',
  },
  text: {
    // the heaviest Plus Jakarta Sans the app loads
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 17,
    lineHeight: 23,
    color: BRIEF.linen,
  },
});
