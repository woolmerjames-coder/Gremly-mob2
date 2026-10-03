/**
 * The day card in the morning brief: the date (and a countdown when the
 * context has one), a strip of the day with meetings, planned items and now,
 * and a row each for Meetings, Todos, Habits and Sweep. Every number comes
 * from the store (lib/brief/useDayCard.ts), drawn live each time it is shown.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  CalendarDays,
  ChevronRight,
  CircleCheck,
  Flag,
  Inbox,
  Repeat,
  type LucideIcon,
} from 'lucide-react-native';
import { busyBlocks, stripPercent } from '../../lib/brief/dayCard';
import { BLOCK_MINUTES, DEFAULT_PLAN_END } from '../../lib/brief/dayRecord';
import type { DayCardData } from '../../lib/brief/useDayCard';
import { getDateService } from '../../lib/date/DateService';
import { BRIEF } from './briefStyles';

export type DayCardRow = 'meetings' | 'todos' | 'habits' | 'sweep';

type Props = {
  data: DayCardData;
  onRow: (row: DayCardRow) => void;
};

function dateLabel(date: string): string {
  const d = getDateService().fromLocalDate(date);
  if (!d) return date;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getMonth()
  ];
  return `${wd} ${d.getDate()} ${mo}`;
}

function Row({
  icon: Icon,
  title,
  line,
  warn,
  onPress,
  testID,
}: {
  icon: LucideIcon;
  title: string;
  line: string;
  warn?: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${line}`}
      testID={testID}
      activeOpacity={0.7}
    >
      <View style={styles.rowIcon}>
        <Icon size={16} color={BRIEF.moss} strokeWidth={2} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={[styles.rowLine, warn && styles.warn]} numberOfLines={1}>
          {line}
        </Text>
      </View>
      <ChevronRight size={16} color="rgba(46,85,64,0.4)" strokeWidth={2} />
    </TouchableOpacity>
  );
}

export function DayStrip({
  data,
}: {
  data: Pick<DayCardData, 'meetings' | 'planned' | 'now'> & Partial<Pick<DayCardData, 'record'>>;
}) {
  const blocks = busyBlocks(data.meetings);
  const record = data.record;
  // after they set off the day is travel, not free time
  const away = record && record.planEnd < DEFAULT_PLAN_END ? record.planEnd : null;
  return (
    <View style={styles.strip} testID="day-strip">
      <View style={styles.track}>
        {away !== null ? (
          <View
            testID="day-strip-travel"
            style={[
              styles.block,
              styles.travelling,
              {
                left: `${stripPercent(away)}%`,
                width: `${Math.max(0.8, 100 - stripPercent(away))}%`,
              },
            ]}
          />
        ) : null}
        {blocks.map(([s, e]) => (
          <View
            key={`m${s}`}
            style={[
              styles.block,
              styles.meeting,
              e <= data.now && styles.past,
              {
                left: `${stripPercent(s)}%`,
                width: `${Math.max(0.8, stripPercent(e) - stripPercent(s))}%`,
              },
            ]}
          />
        ))}
        {(record?.blocks ?? []).map((b) => (
          <View
            key={`f${b.id}`}
            style={[
              styles.block,
              styles.fixed,
              {
                left: `${stripPercent(b.start)}%`,
                width: `${Math.max(0.8, stripPercent(b.end ?? b.start + BLOCK_MINUTES) - stripPercent(b.start))}%`,
              },
            ]}
          />
        ))}
        {data.planned.map((p) => (
          <View
            key={`p${p.id}`}
            style={[
              styles.block,
              styles.planned,
              {
                left: `${stripPercent(p.start)}%`,
                width: `${Math.max(0.8, stripPercent(p.end) - stripPercent(p.start))}%`,
              },
            ]}
          />
        ))}
        <View style={[styles.now, { left: `${stripPercent(data.now)}%` }]} />
      </View>
      <View style={styles.scale}>
        <Text style={[styles.scaleLabel, { left: '0%' }]}>6a</Text>
        <Text style={[styles.scaleLabel, { left: `${stripPercent(720)}%` }]}>12p</Text>
        <Text style={[styles.scaleLabel, { left: `${stripPercent(1080)}%` }]}>6p</Text>
        <Text style={[styles.scaleLabel, styles.scaleEnd]}>10p</Text>
      </View>
    </View>
  );
}

export function DayCard({ data, onRow }: Props) {
  // On a return day the same facts show in a calm colour
  const warn = !data.returnDay;
  return (
    <View style={styles.card} testID="brief-day-card">
      <View style={styles.head}>
        <Text style={styles.date}>{dateLabel(data.date).toUpperCase()}</Text>
        {data.chip ? (
          <View style={styles.chip} testID="brief-countdown-chip">
            <Flag size={13} color={BRIEF.pearInk} strokeWidth={2} />
            <Text style={styles.chipText}>{data.chip}</Text>
          </View>
        ) : null}
      </View>
      <DayStrip data={data} />
      <Row
        icon={CalendarDays}
        title="Meetings"
        line={data.lines.meetings}
        onPress={() => onRow('meetings')}
        testID="day-card-meetings"
      />
      <Row
        icon={CircleCheck}
        title="Todos"
        line={data.lines.todos}
        onPress={() => onRow('todos')}
        testID="day-card-todos"
      />
      <Row
        icon={Repeat}
        title="Habits"
        line={data.lines.habits.text}
        warn={warn && data.lines.habits.warn}
        onPress={() => onRow('habits')}
        testID="day-card-habits"
      />
      <Row
        icon={Inbox}
        title="Sweep"
        line={data.lines.sweep.text}
        warn={warn && data.lines.sweep.warn}
        onPress={() => onRow('sweep')}
        testID="day-card-sweep"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: BRIEF.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BRIEF.line,
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 4,
    gap: 8,
  },
  date: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 11.5,
    letterSpacing: 1.4,
    color: BRIEF.faint,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: BRIEF.pearWash,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 9,
    flexShrink: 1,
  },
  chipText: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 12,
    color: BRIEF.pearInk,
  },
  strip: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
  },
  track: {
    height: 14,
    borderRadius: 7,
    backgroundColor: BRIEF.linen2,
    overflow: 'hidden',
  },
  block: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 3,
  },
  meeting: {
    backgroundColor: BRIEF.meeting,
  },
  past: {
    opacity: 0.55,
  },
  planned: {
    backgroundColor: BRIEF.peri,
  },
  fixed: {
    backgroundColor: BRIEF.mossInk,
  },
  travelling: {
    backgroundColor: BRIEF.pearWash,
  },
  now: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    width: 2,
    marginLeft: -1,
    backgroundColor: '#E0C47A',
  },
  scale: {
    height: 16,
    marginTop: 4,
  },
  scaleLabel: {
    position: 'absolute',
    fontFamily: 'Inter-Regular',
    fontSize: 10.5,
    color: BRIEF.faint,
  },
  scaleEnd: {
    right: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: BRIEF.line,
  },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: BRIEF.sageWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 14,
    color: BRIEF.mossInk,
  },
  rowLine: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: BRIEF.muted,
    marginTop: 1,
  },
  warn: {
    color: BRIEF.warn,
  },
});
