import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Calendar } from 'lucide-react-native';
import type { V07Card, V07TimelineBody } from '../../../../../lib/types';
import { v07 } from '../tokens';
import { SummaryCard, Eyebrow, Headline } from '../primitives';

interface TimelineCardProps {
  card: V07Card;
}

const DAY_ABBR: Record<string, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

function shortDay(day_of_week: string): string {
  return DAY_ABBR[day_of_week.toLowerCase()] ?? day_of_week.slice(0, 3);
}

const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** yyyy-mm-dd → "May 14" */
function monthDay(date: string): string {
  const parts = date.split('-');
  const month = parseInt(parts[1] ?? '1', 10) - 1;
  const day = parseInt(parts[2] ?? '1', 10);
  return `${MONTH_ABBR[month] ?? ''} ${day}`;
}

export function TimelineCard({ card }: TimelineCardProps) {
  const body = card.body as V07TimelineBody;
  const events = body.events;

  return (
    <SummaryCard>
      {/* 1 — Eyebrow */}
      <Eyebrow
        label={card.eyebrow ?? ''}
        icon={<Calendar size={14} color={v07.color.moss} strokeWidth={2} />}
      />

      {/* 2 — Headline (size='timeline' → 21/27) */}
      <Headline size="timeline">{body.headline}</Headline>

      {/* 3 — Event spine */}
      <View style={styles.spine}>
        {events.map((event, i) => {
          const isLast = i === events.length - 1;
          return (
            <View key={i} style={styles.eventRow}>
              {/* Connecting line — all but last */}
              {!isLast && <View style={styles.line} />}

              {/* Node */}
              <View style={styles.node} />

              {/* Text column */}
              <View style={styles.textCol}>
                <Text style={styles.dateLabel}>
                  {shortDay(event.day_of_week)} · {monthDay(event.date)}
                </Text>
                <Text style={styles.eventLabel}>{event.label}</Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* 4 — Footer (optional) */}
      {body.footer ? (
        <View style={styles.footerBox}>
          <Text style={styles.footerText}>{body.footer}</Text>
        </View>
      ) : null}
    </SummaryCard>
  );
}

const styles = StyleSheet.create({
  spine: {
    marginTop: 20,
    paddingLeft: 6,
  },
  eventRow: {
    flexDirection: 'row',
    gap: 14,
    paddingBottom: 16,
    position: 'relative',
  },
  line: {
    position: 'absolute',
    left: 5,
    top: 16,
    bottom: 0,
    width: 2,
    backgroundColor: v07.color.hair,
  },
  node: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: v07.color.linen,
    borderWidth: 2.5,
    borderColor: v07.color.moss,
    marginTop: 3,
    zIndex: 1,
  },
  textCol: {
    flex: 1,
  },
  dateLabel: {
    fontFamily: v07.font.ui,
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: v07.color.moss,
  },
  eventLabel: {
    fontFamily: v07.font.ui,
    fontSize: 13,
    lineHeight: 19,
    color: v07.color.ink,
    marginTop: 2,
  },
  footerBox: {
    marginTop: 18,
    backgroundColor: v07.color.sageSoft,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  footerText: {
    fontFamily: v07.font.ui,
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
    color: v07.color.textSoft,
  },
});
