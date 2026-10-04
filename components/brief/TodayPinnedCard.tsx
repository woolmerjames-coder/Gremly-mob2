/**
 * The pinned Today card at the top of Chat's fresh home (Daily brief in
 * Chat): today's thread, one tap away. While the brief waits unread it says
 * so; after that its status line is the locked plan (count and next item) or
 * the shape of the rest of the day. In the evening its line is the wrap up:
 * waiting, where it was left, or done (lib/wrapup/words.ts, pinnedLine), and
 * while it is offered a tap starts it or picks it up. Its mark follows the
 * part of the day: the sun, the cup, the moon.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, Coffee, Moon, Sun } from 'lucide-react-native';
import type { HomePhase } from '../../lib/chat/homeChips';
import { useDayCard } from '../../lib/brief/useDayCard';
import { pinStatusLine, threadDateLabel } from '../../lib/brief/pinned';
import { BRIEF } from './briefStyles';

export type TodayPinnedCardProps = {
  /** The ritual day, YYYY-MM-DD */
  date: string;
  unread: boolean;
  onPress: () => void;
  /** The part of the day, for the mark; day when left out */
  phase?: HomePhase;
  /** The evening's line: the wrap up waiting, part way or done; null before the evening */
  wrapLine?: string | null;
  /** The wrap up is waiting to be noticed: a dot on the mark */
  wrapNudge?: boolean;
  /** Starts or picks up the wrap up, while it is offered */
  onWrapUp?: () => void;
};

const EVENING_INK = '#4A5486';

/** The card's line: the brief, the evening wrap up, or the shape of the day. */
export function todayCardLine(p: { unread: boolean; wrapLine?: string | null; dayLine: string }): {
  text: string;
  tone: 'ready' | 'evening' | 'plain';
} {
  if (p.unread) return { text: 'Your brief is ready', tone: 'ready' };
  if (p.wrapLine) return { text: p.wrapLine, tone: 'evening' };
  return { text: p.dayLine, tone: 'plain' };
}

export function TodayPinnedCard({
  date,
  unread,
  onPress,
  phase = 'day',
  wrapLine = null,
  wrapNudge = false,
  onWrapUp,
}: TodayPinnedCardProps) {
  const day = useDayCard(date);
  const line = todayCardLine({
    unread,
    wrapLine,
    dayLine: pinStatusLine(day.meetings, day.planned, day.now),
  });
  const wrapUp = line.tone === 'evening' && !!onWrapUp;
  const Mark = phase === 'evening' ? Moon : phase === 'morning' ? Sun : Coffee;
  const evening = phase === 'evening';
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={wrapUp ? onWrapUp : onPress}
      accessibilityRole="button"
      accessibilityLabel={`Today with Gremly, ${threadDateLabel(date)}. ${line.text}`}
      testID="today-pinned-card"
    >
      <View style={[styles.glyph, evening && styles.glyphEvening]}>
        <Mark size={20} color={evening ? EVENING_INK : BRIEF.moss} strokeWidth={1.8} />
        {unread || (wrapNudge && line.tone === 'evening') ? (
          <View
            style={[styles.markDot, !unread && styles.markDotEvening]}
            testID={unread ? 'today-pinned-unread' : 'today-pinned-wrap'}
          />
        ) : null}
      </View>
      <View style={styles.body}>
        <Text style={styles.kicker}>TODAY WITH GREMLY</Text>
        <Text style={styles.title}>{threadDateLabel(date)}</Text>
        <Text
          style={[
            styles.status,
            line.tone === 'ready' && styles.statusReady,
            line.tone === 'evening' && styles.statusEvening,
          ]}
          numberOfLines={1}
          testID="today-pinned-line"
        >
          {line.text}
        </Text>
      </View>
      <ChevronRight size={18} color="rgba(46,85,64,0.45)" strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: BRIEF.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BRIEF.line,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: BRIEF.mossInk,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  pressed: { opacity: 0.85 },
  glyph: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: BRIEF.sageWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  kicker: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 10,
    letterSpacing: 1,
    color: BRIEF.moss,
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: BRIEF.mossInk,
    marginTop: 1,
  },
  glyphEvening: { backgroundColor: '#E6E8F1' },
  // the brief waits unread: a dot on the mark
  markDot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#3F8A63',
    borderWidth: 2,
    borderColor: BRIEF.sageWash,
  },
  status: {
    flexShrink: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: BRIEF.muted,
    marginTop: 2,
  },
  markDotEvening: { backgroundColor: EVENING_INK, borderColor: '#E6E8F1' },
  statusReady: { fontFamily: 'Inter-SemiBold', color: '#2E6B4C' },
  statusEvening: { fontFamily: 'Inter-SemiBold', color: EVENING_INK },
});
