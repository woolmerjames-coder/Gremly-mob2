import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, RADII, SPACE } from './_tokens';
import { CalendarClock } from '../../icons';

export type WeekStripDay = {
  dateISO: string;
  isActive: boolean;
  isSelected: boolean;
  hasItems?: boolean;
};

export type WeekStripProps = {
  days: WeekStripDay[];
  onSelect: (dateISO: string) => void;
  onOpenTimeline?: () => void;
};

export const WeekStrip: React.FC<WeekStripProps> = ({ days, onSelect, onOpenTimeline }) => {
  return (
    <View style={styles.row}>
      <View style={styles.daysWrap}>
        {days.map((d) => {
          const date = new Date(d.dateISO);
          const weekday = date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1);
          const dayNum = date.getDate();
          const active = d.isActive;
          const selected = d.isSelected;
          return (
            <TouchableOpacity
              key={d.dateISO}
              onPress={() => onSelect(d.dateISO)}
              accessibilityRole="button"
              accessibilityLabel={`Select ${date.toDateString()}`}
              style={[styles.cell, active ? styles.cellActive : styles.cellInactive]}
            >
              <Text style={[styles.weekInitial, active ? styles.textActive : styles.textInactive]}>
                {weekday}
              </Text>
              <Text style={[styles.dayNum, active ? styles.textActive : styles.textInactive]}>
                {dayNum}
              </Text>
              {selected && <View style={styles.underline} />}
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity
        onPress={onOpenTimeline}
        accessibilityRole="button"
        accessibilityLabel="Open timeline"
        style={styles.timelineBtn}
      >
        <CalendarClock color={COLORS.Text} size={20} />
      </TouchableOpacity>
    </View>
  );
};

const CELL_W = 40;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  daysWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cell: {
    width: CELL_W,
    height: 44,
    borderRadius: RADII.card,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cellActive: {
    backgroundColor: COLORS.Moss,
  },
  cellInactive: {
    borderWidth: 1,
    borderColor: COLORS.Sage,
    backgroundColor: 'transparent',
  },
  underline: {
    position: 'absolute',
    bottom: 2,
    height: 2,
    width: CELL_W - 12,
    backgroundColor: COLORS.Pear,
    borderRadius: 1,
  },
  weekInitial: {
    fontSize: 12,
    marginBottom: 2,
  },
  dayNum: {
    fontSize: 14,
    fontWeight: '600',
  },
  textActive: {
    color: COLORS.Linen,
  },
  textInactive: {
    color: COLORS.Text,
  },
  timelineBtn: {
    paddingHorizontal: SPACE.xs,
    paddingVertical: SPACE.xs,
  },
});

export default WeekStrip;
