import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { format } from 'date-fns';
import { getDateService } from '../../../lib/date';
import { lightTokens as t } from '../../../design/tokens';

export type CalendarStripProps = {
  days: Array<{ date: Date; hasTodos?: boolean; hasNotes?: boolean; hasHabits?: boolean }>;
  activeDate?: Date;
};

export const CalendarStrip: React.FC<CalendarStripProps> = ({ days, activeDate = getDateService().now() }) => {
  const fmt = (d: Date) => format(d, 'EEE').slice(0, 3);
  const isSame = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.wrap}
      contentContainerStyle={{ paddingHorizontal: 8 }}
    >
      {days.map((d, idx) => {
        const active = isSame(d.date, activeDate);
        return (
          <View key={idx} style={[styles.day, active && styles.dayActive]}>
            <Text style={styles.weekday}>{fmt(d.date)}</Text>
            <View style={styles.dotsRow}>
              {d.hasHabits ? (
                <Text style={[styles.dot, { color: t.colors.mossGreen }]}>✓</Text>
              ) : (
                <View style={{ width: 12 }} />
              )}
              {d.hasTodos ? (
                <Text style={[styles.dot, { color: t.colors.charcoalInk }]}>■</Text>
              ) : (
                <View style={{ width: 12 }} />
              )}
              {d.hasNotes ? (
                <Text style={[styles.dot, { color: t.colors.periwinkleSmoke }]}>–</Text>
              ) : (
                <View style={{ width: 12 }} />
              )}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  wrap: { height: 64 },
  day: {
    width: 56,
    height: 56,
    marginHorizontal: 6,
    borderRadius: 12,
    backgroundColor: t.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  dayActive: {
    borderColor: '#E0C47A',
    borderWidth: 2,
  },
  weekday: { color: t.colors.subtle, fontSize: 12, marginBottom: 6 },
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { fontSize: 12 },
});

export default CalendarStrip;
