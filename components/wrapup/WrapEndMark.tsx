/** The day, wrapped up: the last thing in the thread after good night. */
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { SweepEndMeta } from '../../lib/brief/types';
import { getDateService } from '../../lib/date/DateService';
import { weekdayOf } from '../../lib/wrapup/day';
import { endNote, endTitle } from '../../lib/wrapup/words';
import { BRIEF } from '../brief/briefStyles';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const COZY_GREMLY = require('../../assets/mascot/cozy_gremly.png');

export function WrapEndMark({ meta }: { meta: SweepEndMeta }) {
  const weekday = weekdayOf(meta.date);
  return (
    <View style={styles.wrap} testID="wrap-end">
      <Image source={COZY_GREMLY} style={styles.image} />
      <Text style={styles.title}>{endTitle({ weekday, tomorrow: '', late: false })}</Text>
      <Text style={styles.note}>{endNote(getDateService().getDayBoundaryHour())}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 2, marginTop: 8, marginBottom: 4 },
  image: { width: 92, height: 92, resizeMode: 'contain' },
  title: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 14, color: BRIEF.mossInk },
  note: { fontFamily: 'Inter-Regular', fontSize: 12.5, color: BRIEF.faint, textAlign: 'center' },
});
