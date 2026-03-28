import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme, Animated } from 'react-native';
import { COLORS, RADII, SPACE } from './_tokens';
import { format } from 'date-fns';
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

const DayCell: React.FC<{
  d: WeekStripDay;
  isDark: boolean;
  onSelect: (iso: string) => void;
}> = ({ d, isDark, onSelect }) => {
  const date = new Date(d.dateISO);
  const weekday = format(date, 'EEEEE');
  const dayNum = date.getDate();
  const active = d.isActive;
  const selected = d.isSelected;
  const pulse = React.useMemo(() => new Animated.Value(1), []);

  const handlePress = React.useCallback(() => {
    Animated.sequence([
      Animated.timing(pulse, { toValue: 0.6, duration: 90, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 140, useNativeDriver: true }),
    ]).start();
    onSelect(d.dateISO);
  }, [d.dateISO, onSelect, pulse]);

  return (
    <Animated.View style={{ opacity: pulse }}>
      <TouchableOpacity
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`Select ${format(date, 'EEE MMM d yyyy')}`}
        style={[styles.cell, active ? styles.cellActive : styles.cellInactive]}
      >
        <Text
          style={[
            styles.weekInitial,
            active ? styles.textActive : isDark ? styles.textInactiveDark : styles.textInactive,
          ]}
        >
          {weekday}
        </Text>
        <Text
          style={[
            styles.dayNum,
            active ? styles.textActive : isDark ? styles.textInactiveDark : styles.textInactive,
          ]}
        >
          {dayNum}
        </Text>
        {selected && <View style={styles.underline} />}
      </TouchableOpacity>
    </Animated.View>
  );
};

export const WeekStrip: React.FC<WeekStripProps> = ({ days, onSelect, onOpenTimeline }) => {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return (
    <View style={styles.row}>
      <View style={styles.daysWrap}>
        {days.map((d) => (
          <DayCell key={d.dateISO} d={d} isDark={isDark} onSelect={onSelect} />
        ))}
      </View>
      <TouchableOpacity
        onPress={onOpenTimeline}
        accessibilityRole="button"
        accessibilityLabel="Open timeline"
        style={styles.timelineBtn}
      >
        <CalendarClock color={isDark ? '#E6E6E6' : COLORS.Text} size={20} />
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
  textInactiveDark: {
    color: '#E6E6E6',
  },
  timelineBtn: {
    paddingHorizontal: SPACE.xs,
    paddingVertical: SPACE.xs,
  },
});

export default WeekStrip;
