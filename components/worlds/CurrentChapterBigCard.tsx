import { View, Pressable, StyleSheet } from 'react-native';
import { format, differenceInCalendarDays } from 'date-fns';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import { useWorldPalette } from '../../lib/store/worldsSelectors';
import { getDateService } from '../../lib/date';
import type { Chapter } from '../../lib/supabase/types';

interface CurrentChapterBigCardProps {
  chapter: Chapter;
  worldId: string;
  onPress: (chapterId: string) => void;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}

function resolveLabel(chapter: Chapter): string {
  const typePart = chapter.chapter_type.toUpperCase();
  if (chapter.start_date) {
    const since = format(new Date(chapter.start_date), 'MMM d');
    return `CURRENT CHAPTER · ${typePart} · SINCE ${since}`;
  }
  return `CURRENT CHAPTER · ${typePart}`;
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

function resolvePhaseBar(chapter: Chapter): { segments: boolean[]; label: string } {
  if (chapter.phase_labels && chapter.phase_labels.length > 0 && chapter.current_phase_key) {
    const idx = chapter.phase_labels.indexOf(chapter.current_phase_key);
    const label = idx >= 0 ? chapter.phase_labels[idx].toUpperCase() : '';
    return {
      segments: chapter.phase_labels.map((_, i) => i <= idx),
      label,
    };
  }
  switch (chapter.chapter_type) {
    case 'milestone':
      return { segments: [true, false, false], label: 'BUILDING' };
    case 'bounded':
      return { segments: [true, false, false], label: 'STARTING' };
    case 'season':
    default:
      return { segments: [true, false, false], label: 'EARLY' };
  }
}

export function CurrentChapterBigCard({ chapter, worldId, onPress }: CurrentChapterBigCardProps) {
  const palette = useWorldPalette(worldId);
  const label = resolveLabel(chapter);
  const countdown = resolveCountdown(chapter);
  const phase = resolvePhaseBar(chapter);
  const summary = chapter.target_summary ?? chapter.target_description ?? chapter.description;

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
        {summary ? <Text style={styles.summary}>{truncate(summary, 120)}</Text> : null}
        <View style={styles.footer}>
          <View style={styles.phaseRow}>
            {phase.segments.map((active, i) => (
              <View
                key={i}
                style={[
                  styles.phaseSeg,
                  { backgroundColor: active ? palette.dot : lightTokens.colors.oatDeeper },
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
    backgroundColor: lightTokens.colors.oatLight,
    borderWidth: 1,
    borderColor: lightTokens.colors.oatDeeper,
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
    color: lightTokens.colors.deepForest,
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
