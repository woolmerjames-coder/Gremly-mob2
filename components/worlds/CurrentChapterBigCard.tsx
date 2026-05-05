import { View, Pressable, StyleSheet } from 'react-native';
import { differenceInCalendarDays } from 'date-fns';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import { useWorldPalette } from '../../lib/store/worldsSelectors';
import { getDateService } from '../../lib/date';
import { resolveChapterLabel, resolveChapterPhases } from '../../lib/worlds/chapterDisplay';
import type { Chapter } from '../../lib/supabase/types';

interface CurrentChapterBigCardProps {
  chapter: Chapter;
  worldId: string;
  onPress: (chapterId: string) => void;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}

function resolveCountdown(chapter: Chapter): string | null {
  const now = getDateService().now();
  if (chapter.chapter_type === 'bounded' || chapter.chapter_type === 'milestone') {
    if (!chapter.end_date) return null;
    const days = differenceInCalendarDays(new Date(chapter.end_date), now);
    if (days < 0) return 'Ended';
    if (days === 0) return 'Ends today';
    return `${days} day${days === 1 ? '' : 's'} remaining`;
  }
  // season: days elapsed
  if (chapter.start_date) {
    const days = differenceInCalendarDays(now, new Date(chapter.start_date));
    return `Day ${Math.max(days, 0) + 1}`;
  }
  return null;
}

export function CurrentChapterBigCard({ chapter, worldId, onPress }: CurrentChapterBigCardProps) {
  const palette = useWorldPalette(worldId);
  const label = resolveChapterLabel(chapter);
  const countdown = resolveCountdown(chapter);
  const phase = resolveChapterPhases(chapter);
  const targetLine = chapter.target_summary?.trim() || chapter.target_description || null;
  const cardSubtitle = chapter.card_subtitle?.trim() || null;

  return (
    <Pressable
      onPress={() => onPress(chapter.id)}
      style={styles.card}
      testID={`current-chapter-big-${chapter.id}`}
    >
      <View style={[styles.leftBar, { backgroundColor: palette.dot }]} />
      <View style={styles.body}>
        <Text style={[styles.label, { color: palette.base }]}>{label}</Text>
        <Text style={styles.title}>{chapter.title}</Text>
        {cardSubtitle ? <Text style={styles.cardSubtitle}>{cardSubtitle}</Text> : null}
        {targetLine ? <Text style={styles.summary}>{truncate(targetLine, 120)}</Text> : null}
        <View style={styles.footer}>
          <View style={styles.phaseRow}>
            {phase.segments.map((active, i) => (
              <View
                key={i}
                style={[
                  styles.phaseSeg,
                  { backgroundColor: active ? palette.dot : lightTokens.colors.worldsCardBorder },
                ]}
              />
            ))}
            <Text style={[styles.phaseLabel, { color: palette.base }]}>{phase.label}</Text>
          </View>
          {countdown ? (
            <Text style={[styles.countdown, { color: palette.base }]}>{countdown}</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: lightTokens.colors.oatCard,
    borderWidth: 1,
    borderColor: lightTokens.colors.worldsCardBorder,
    borderRadius: 14,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  leftBar: {
    width: 5,
  },
  body: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  label: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    fontFamily: 'Inter-Medium',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: lightTokens.colors.worldsInk,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    lineHeight: 16,
    color: lightTokens.colors.warmGrey,
    marginBottom: 4,
  },
  summary: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    lineHeight: 19,
    color: lightTokens.colors.warmGrey,
    marginBottom: 10,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  phaseSeg: {
    width: 24,
    height: 4,
    borderRadius: 2,
  },
  phaseLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginLeft: 4,
  },
  countdown: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    letterSpacing: 0.2,
  },
});
