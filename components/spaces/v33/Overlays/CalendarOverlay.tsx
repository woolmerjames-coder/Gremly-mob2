import React, { useEffect, useMemo } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Svg, { Line } from 'react-native-svg';
import { addDays, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';
import { COLORS, RADII, SPACE } from '../_tokens';

export type TimelineDay = {
  dateISO: string;
  items?: Array<{
    id: string;
    type: 'habit' | 'todo' | 'note';
    title?: string | null;
    name?: string | null;
    subtype?: string | null;
    done?: boolean;
  }>;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  spaceName: string;
  days: TimelineDay[];
  selectedISO: string;
  onSelectDate: (iso: string) => void;
  onAddMilestone: () => void;
};

export default function CalendarOverlay({
  visible,
  onClose,
  spaceName,
  days,
  selectedISO,
  onSelectDate,
  onAddMilestone,
}: Props) {
  const y = useMemo(() => new Animated.Value(500), []);
  const opacity = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(y, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(y, {
          toValue: 500,
          duration: 220,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, { toValue: 0, duration: 140, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, y, opacity]);

  const selectedDate = useMemo(() => new Date(selectedISO), [selectedISO]);
  const monthStart = useMemo(() => startOfMonth(selectedDate), [selectedDate]);
  const monthEnd = useMemo(() => endOfMonth(selectedDate), [selectedDate]);
  const gridStart = useMemo(() => startOfWeek(monthStart), [monthStart]);
  const gridEnd = useMemo(() => endOfWeek(monthEnd), [monthEnd]);
  const weeks: string[][] = useMemo(() => {
    const rows: string[][] = [];
    let cur = gridStart;
    while (cur <= gridEnd) {
      const row: string[] = [];
      for (let i = 0; i < 7; i += 1) {
        row.push(format(cur, 'yyyy-MM-dd'));
        cur = addDays(cur, 1);
      }
      rows.push(row);
    }
    return rows;
  }, [gridStart, gridEnd]);

  const dayMap = useMemo(() => {
    const m = new Map<string, TimelineDay>();
    for (const d of days) m.set(d.dateISO, d);
    return m;
  }, [days]);

  const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate]);
  const weekEnd = useMemo(() => endOfWeek(selectedDate), [selectedDate]);
  const weekRangeLabel = `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d')}`;

  const weekCounts = useMemo(() => {
    let runs = 0;
    let reflections = 0;
    for (let i = 0; i < 7; i += 1) {
      const iso = format(addDays(weekStart, i), 'yyyy-MM-dd');
      const d = dayMap.get(iso);
      const items = d?.items || [];
      runs += items.filter((it) => it.type === 'habit' && !!it.done).length;
      const refls = items.filter(
        (it) => it.type === 'note' && (it.subtype === 'journal' || it.subtype === 'reflection'),
      ).length;
      reflections += refls;
    }
    return { runs, reflections, milestones: 0 };
  }, [dayMap, weekStart]);

  const selectedEntries = useMemo(() => {
    const d = dayMap.get(format(selectedDate, 'yyyy-MM-dd'));
    return d?.items || [];
  }, [dayMap, selectedDate]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity }]}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" />
      </Animated.View>
      <Animated.View style={[styles.sheet, { transform: [{ translateY: y }] }]}>
        {/* Deep Forest glass (8% blur) */}
        <BlurView intensity={8} style={StyleSheet.absoluteFill} tint="dark" />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(26,51,40,0.6)' }]} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Your {spaceName} Timeline</Text>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close" accessibilityRole="button">
            <View style={styles.closeBtn}>
              <Svg width={16} height={16} viewBox="0 0 16 16">
                <Line
                  x1="2"
                  y1="2"
                  x2="14"
                  y2="14"
                  stroke={COLORS.Sage}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
                <Line
                  x1="14"
                  y1="2"
                  x2="2"
                  y2="14"
                  stroke={COLORS.Sage}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </Svg>
            </View>
          </TouchableOpacity>
        </View>

        {/* Month grid */}
        <View style={styles.monthWrap}>
          <Text style={styles.monthLabel}>{format(selectedDate, 'MMMM yyyy')}</Text>
          <View style={styles.dowRow}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <Text key={d} style={styles.dowText}>
                {d}
              </Text>
            ))}
          </View>
          {weeks.map((row, i) => (
            <View key={i} style={styles.weekRow}>
              {row.map((iso) => {
                const dt = new Date(iso);
                const inMonth = dt.getMonth() === monthStart.getMonth();
                const isSelected = iso === format(selectedDate, 'yyyy-MM-dd');
                const hasItems = (dayMap.get(iso)?.items?.length || 0) > 0;
                return (
                  <TouchableOpacity
                    key={iso}
                    onPress={() => {
                      onSelectDate(iso);
                    }}
                    accessibilityRole="button"
                  >
                    <View
                      style={[
                        styles.dayCell,
                        isSelected && styles.dayCellSelected,
                        !inMonth && styles.dayCellMuted,
                      ]}
                    >
                      <Text style={[styles.dayNum, !inMonth && styles.dayNumMuted]}>
                        {dt.getDate()}
                      </Text>
                      {hasItems && <View style={styles.dayDot} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {/* Weekly summary */}
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>
            Week of {weekRangeLabel} • {weekCounts.runs} runs • {weekCounts.reflections} reflections
            • {weekCounts.milestones} milestones
          </Text>
          <TouchableOpacity onPress={onAddMilestone} accessibilityRole="button">
            <View style={styles.addMilestoneBtn}>
              <Text style={styles.addMilestoneText}>+ Add milestone</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Day entries */}
        <View style={styles.entriesWrap}>
          <Text style={styles.entriesTitle}>Entries for {format(selectedDate, 'EEE, MMM d')}</Text>
          {selectedEntries.length === 0 ? (
            <Text style={styles.emptyEntries}>No entries for this day.</Text>
          ) : (
            <View style={{ gap: 8 }}>
              {selectedEntries.map((it) => (
                <View key={(it as any).id} style={styles.entryRow}>
                  <Text style={styles.entryTitle}>
                    {(it as any).title || (it as any).name || 'Untitled'}
                  </Text>
                  <Text style={styles.entryMeta}>
                    {(it as any).type === 'habit'
                      ? 'Habit'
                      : (it as any).type === 'todo'
                        ? 'To-do'
                        : 'Note'}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Milestones stub */}
        <View style={styles.milestonesWrap}>
          <Text style={styles.milestonesTitle}>Milestones</Text>
          <Text style={styles.milestonesTodo}>
            TODO: Wire milestones table. Showing stub list for now.
          </Text>
          <View style={{ gap: 6 }}>
            <Text style={styles.milestoneItem}>• No milestones yet</Text>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '90%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
    paddingHorizontal: SPACE.md,
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.lg,
  },
  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(191,216,192,0.4)',
  },
  headerTitle: { color: COLORS.Linen, fontSize: 16, fontWeight: '700' },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.Sage,
  },
  monthWrap: { paddingTop: SPACE.sm },
  monthLabel: { color: COLORS.Linen, fontWeight: '700' },
  dowRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  dowText: {
    color: 'rgba(249,246,241,0.6)',
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 12,
  },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.card,
    backgroundColor: 'rgba(249,246,241,0.06)',
  },
  dayCellSelected: { backgroundColor: 'rgba(191,216,192,0.25)' },
  dayCellMuted: { opacity: 0.5 },
  dayNum: { color: COLORS.Linen, fontWeight: '700' },
  dayNumMuted: { color: 'rgba(249,246,241,0.6)' },
  dayDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.Pear, marginTop: 4 },
  summaryRow: {
    marginTop: SPACE.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryText: { color: COLORS.Linen },
  addMilestoneBtn: {
    backgroundColor: COLORS.Moss,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADII.btn,
  },
  addMilestoneText: { color: COLORS.Linen, fontWeight: '700' },
  entriesWrap: { marginTop: SPACE.md },
  entriesTitle: { color: COLORS.Linen, fontWeight: '700', marginBottom: 6 },
  emptyEntries: { color: 'rgba(249,246,241,0.7)' },
  entryRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(191,216,192,0.25)',
  },
  entryTitle: { color: COLORS.Linen, fontWeight: '600' },
  entryMeta: { color: 'rgba(249,246,241,0.7)', marginTop: 2, fontSize: 12 },
  milestonesWrap: { marginTop: SPACE.lg },
  milestonesTitle: { color: COLORS.Linen, fontWeight: '700', marginBottom: 6 },
  milestonesTodo: { color: 'rgba(249,246,241,0.7)', marginBottom: 6 },
  milestoneItem: { color: COLORS.Linen },
});
