/**
 * The pinned Today card at the top of Chat's fresh home (Daily brief in
 * Chat): today's thread, one tap away. While the brief waits unread it says
 * so; after that its status line is the locked plan (count and next item) or
 * the shape of the rest of the day.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, Coffee } from 'lucide-react-native';
import { useDayCard } from '../../lib/brief/useDayCard';
import { pinStatusLine, threadDateLabel } from '../../lib/brief/pinned';
import { BRIEF } from './briefStyles';

export type TodayPinnedCardProps = {
  /** The ritual day, YYYY-MM-DD */
  date: string;
  unread: boolean;
  onPress: () => void;
};

export function TodayPinnedCard({ date, unread, onPress }: TodayPinnedCardProps) {
  const day = useDayCard(date);
  const status = unread ? 'Your brief is ready' : pinStatusLine(day.meetings, day.planned, day.now);
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Today with Gremly, ${threadDateLabel(date)}. ${status}`}
      testID="today-pinned-card"
    >
      <View style={styles.glyph}>
        <Coffee size={20} color={BRIEF.moss} strokeWidth={1.8} />
      </View>
      <View style={styles.body}>
        <Text style={styles.kicker}>TODAY WITH GREMLY</Text>
        <Text style={styles.title}>{threadDateLabel(date)}</Text>
        <View style={styles.statusRow}>
          {unread ? <View style={styles.dot} testID="today-pinned-unread" /> : null}
          <Text style={styles.status} numberOfLines={1}>
            {status}
          </Text>
        </View>
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
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: BRIEF.moss },
  status: { flexShrink: 1, fontFamily: 'Inter-Regular', fontSize: 13, color: BRIEF.muted },
});
