import React, { useEffect, useMemo } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, RADII, SPACE } from '../_tokens';

export type CalendarDay = {
  dateISO: string;
  isActive?: boolean;
  hasItems?: boolean;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  days: CalendarDay[];
  selectedISO: string;
  onSelectDate: (iso: string) => void;
};

export default function CalendarOverlay({
  visible,
  onClose,
  days,
  selectedISO,
  onSelectDate,
}: Props) {
  const y = useMemo(() => new Animated.Value(320), []);
  const opacity = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(y, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(y, {
          toValue: 320,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, { toValue: 0, duration: 140, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, y, opacity]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity }]}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" />
      </Animated.View>
      <Animated.View style={[styles.sheet, { transform: [{ translateY: y }] }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Calendar</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button">
            <Text style={styles.done}>Done</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.weekRow}>
          {days.map((d) => (
            <DayPill
              key={d.dateISO}
              dateISO={d.dateISO}
              selected={d.dateISO === selectedISO}
              active={!!d.isActive}
              hasItems={!!d.hasItems}
              onPress={() => onSelectDate(d.dateISO)}
            />
          ))}
        </View>
      </Animated.View>
    </Modal>
  );
}

function DayPill({
  dateISO,
  selected,
  active,
  hasItems,
  onPress,
}: {
  dateISO: string;
  selected?: boolean;
  active?: boolean;
  hasItems?: boolean;
  onPress: () => void;
}) {
  const d = new Date(dateISO);
  const dow = d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2);
  const day = d.getDate();
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button">
      <View style={[styles.day, selected && styles.daySelected, active && styles.dayActive]}>
        <Text style={[styles.dow, selected && styles.dowSelected]}>{dow}</Text>
        <Text style={[styles.dd, selected && styles.ddSelected]}>{day}</Text>
        {hasItems && <View style={styles.dot} />}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.Linen,
    borderTopLeftRadius: RADII.overlay,
    borderTopRightRadius: RADII.overlay,
    paddingBottom: 12,
    paddingHorizontal: SPACE.md,
    paddingTop: 8,
  },
  header: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(26,51,40,0.12)',
  },
  title: { color: COLORS.Deep, fontWeight: '700' },
  done: { color: COLORS.Moss, fontWeight: '700' },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  day: {
    width: 44,
    height: 64,
    borderRadius: RADII.card,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(26,51,40,0.05)',
  },
  daySelected: {
    backgroundColor: 'rgba(46,85,64,0.15)',
  },
  dayActive: {
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.4)',
  },
  dow: { color: 'rgba(26,51,40,0.6)', fontSize: 12, fontWeight: '600' },
  dowSelected: { color: COLORS.Deep },
  dd: { color: COLORS.Deep, fontSize: 16, fontWeight: '800' },
  ddSelected: { color: COLORS.Deep },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.Pear,
    marginTop: 6,
  },
});
