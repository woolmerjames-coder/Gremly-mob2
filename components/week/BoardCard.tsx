/**
 * The week's board as it sits in today's thread: Gremly's line about the week
 * as he has spread it, then a card with a ring for each day's room and the
 * button that opens the board. While the spread is being made the card says
 * so; when it could not be made, it offers to try again or to place things by
 * hand. To the approved prototype (Weekly sweep prototype, "the week itself").
 */
import React from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { WEEK_COPY } from '../../lib/week/review/words';
import { WEEK, weekStyles } from './weekStyles';
import { WEEK_MASCOTS } from './weekMascots';

const R = 14;
const AROUND = 2 * Math.PI * R;

/** A day's room as a ring: how much of it is taken, with a count inside when given. */
export function DayRing({
  size,
  fraction,
  ring,
  track,
  count,
  countColor,
}: {
  size: number;
  /** How much of the day's room is taken, 0 to 1 */
  fraction: number;
  ring: string;
  track: string;
  count?: number;
  countColor?: string;
}) {
  const taken = Math.max(0, Math.min(1, fraction));
  return (
    <Svg width={size} height={size} viewBox="0 0 36 36">
      <Circle cx={18} cy={18} r={R} fill="none" stroke={track} strokeWidth={5} />
      {taken > 0 ? (
        <Circle
          cx={18}
          cy={18}
          r={R}
          fill="none"
          stroke={ring}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`${(taken * AROUND).toFixed(1)} ${AROUND.toFixed(1)}`}
          transform="rotate(-90 18 18)"
        />
      ) : null}
      {count != null ? (
        <SvgText
          x={18}
          y={22}
          textAnchor="middle"
          fontSize={12}
          fontWeight="800"
          fill={countColor ?? WEEK.ink}
        >
          {count}
        </SvgText>
      ) : null}
    </Svg>
  );
}

export interface BoardCardDay {
  day: string;
  /** "Mon" */
  short: string;
  /** How many todos are on the day */
  count: number;
  fraction: number;
  tone: 'ok' | 'busy' | 'over';
}

export interface BoardCardProps {
  /** Gremly's line above the card */
  intro: string | null;
  state: 'fitting' | 'failed' | 'ready';
  days: BoardCardDay[];
  /** "Plan my week" before they have opened it, "Open your week" after */
  cta: string;
  /** The board can be opened from here: the review is on this step */
  live: boolean;
  disabled?: boolean;
  onOpen: () => void;
  onRetry: () => void;
}

const RING = { ok: WEEK.green, busy: WEEK.amberDeep, over: '#C2410C' } as const;

export function BoardCard(p: BoardCardProps) {
  return (
    <View style={styles.wrap} testID="week-board-card">
      {p.intro ? (
        <View style={styles.said}>
          <View style={styles.markRow}>
            <View style={styles.mark} />
            <Text style={styles.markText}>GREMLY</Text>
          </View>
          <Text style={styles.saidText}>{p.intro}</Text>
        </View>
      ) : null}
      {p.state === 'fitting' ? (
        <View style={[weekStyles.card, styles.fitting]} testID="week-board-fitting">
          <Image source={WEEK_MASCOTS.laptop} style={styles.mascot} />
          <View style={weekStyles.grow}>
            <Text style={styles.title}>{WEEK_COPY.fitting}</Text>
            <Text style={weekStyles.hint}>{WEEK_COPY.fittingHint}</Text>
          </View>
          <ActivityIndicator color={WEEK.green} />
        </View>
      ) : (
        <View style={styles.card}>
          <View style={styles.rings}>
            {p.days.map((d) => (
              <View key={d.day} style={styles.ringCol}>
                <Text style={styles.ringDay}>{d.short}</Text>
                <DayRing size={36} fraction={d.fraction} ring={RING[d.tone]} track={WEEK.soft} />
                <Text style={styles.ringCount}>{d.count}</Text>
              </View>
            ))}
          </View>
          {p.live ? (
            <>
              {p.state === 'failed' ? (
                <TouchableOpacity
                  style={[weekStyles.second, p.disabled && weekStyles.off]}
                  onPress={p.onRetry}
                  disabled={p.disabled}
                  accessibilityRole="button"
                  testID="week-board-retry"
                >
                  <Text style={weekStyles.secondText}>{WEEK_COPY.tryAgain}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.open, p.disabled && weekStyles.off]}
                onPress={p.onOpen}
                disabled={p.disabled}
                accessibilityRole="button"
                testID="week-board-open"
              >
                <Image source={WEEK_MASCOTS.clipboard} style={styles.openMascot} />
                <Text style={styles.openText}>{p.cta}</Text>
                <ChevronRight size={18} color={WEEK.green} strokeWidth={2.6} />
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  said: { alignSelf: 'flex-start', maxWidth: 340, gap: 6 },
  markRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mark: {
    width: 8,
    height: 8,
    borderRadius: 1.5,
    backgroundColor: '#9CA6E0',
    transform: [{ rotate: '45deg' }],
  },
  markText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 10.5,
    letterSpacing: 0.6,
    color: 'rgba(46,85,64,0.55)',
  },
  saidText: { fontFamily: 'Inter-Regular', fontSize: 16, lineHeight: 25, color: '#1F1F1F' },
  fitting: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mascot: { width: 56, height: 56 },
  title: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 15, color: WEEK.ink },
  card: {
    backgroundColor: WEEK.white,
    borderRadius: 20,
    padding: 14,
    gap: 12,
    borderWidth: 1.5,
    borderColor: WEEK.green,
  },
  rings: { flexDirection: 'row', gap: 4 },
  ringCol: { flex: 1, alignItems: 'center', gap: 4 },
  ringDay: { fontFamily: 'Inter-SemiBold', fontSize: 11, color: WEEK.muted },
  ringCount: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 12, color: WEEK.ink },
  open: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  openMascot: { width: 48, height: 48 },
  openText: { flex: 1, fontFamily: 'PlusJakartaSans-Bold', fontSize: 15, color: WEEK.ink },
});
