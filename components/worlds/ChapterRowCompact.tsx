import { View, Pressable, StyleSheet } from 'react-native';
import { format, differenceInCalendarDays } from 'date-fns';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import { useWorldPalette, useWorldById } from '../../lib/store/worldsSelectors';
import { getDateService } from '../../lib/date';
import type { Chapter } from '../../lib/supabase/types';

interface ChapterRowCompactProps {
  chapter: Chapter;
  onPress: (chapterId: string) => void;
}

export function ChapterRowCompact({ chapter, onPress }: ChapterRowCompactProps) {
  const parentWorld = useWorldById(chapter.primary_world_id ?? '');
  const palette = useWorldPalette(chapter.primary_world_id ?? '');
  const worldName = parentWorld?.display_name || parentWorld?.name || '';

  const countdown = resolveCountdown(chapter);
  const phase = resolvePhaseBarState(chapter);

  return (
    <Pressable
      onPress={() => onPress(chapter.id)}
      style={styles.card}
      testID={`chapter-row-${chapter.id}`}
    >
      <View style={[styles.bar, { backgroundColor: palette.dot }]} />
      <View style={styles.row}>
        <View style={styles.left}>
          <Text style={styles.name}>{chapter.title}</Text>
          <Text style={styles.sub}>
            in {worldName} · {chapter.chapter_type}
            {chapter.start_date ? ` · since ${format(new Date(chapter.start_date), 'MMM d')}` : ''}
          </Text>
        </View>
        <View style={styles.date}>
          <Text style={styles.dateDay}>{countdown.primary}</Text>
          {countdown.secondary ? <Text style={styles.dateRem}>{countdown.secondary}</Text> : null}
        </View>
      </View>
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
    </Pressable>
  );
}

function resolveCountdown(chapter: Chapter): { primary: string; secondary: string | null } {
  const now = getDateService().now();
  if (chapter.end_date) {
    const end = new Date(chapter.end_date);
    const days = differenceInCalendarDays(end, now);
    return { primary: format(end, 'MMM d'), secondary: days >= 0 ? `${days} days` : 'past' };
  }
  if (chapter.start_date) {
    const start = new Date(chapter.start_date);
    const days = differenceInCalendarDays(now, start);
    return { primary: `day ${days}`, secondary: null };
  }
  return { primary: '', secondary: null };
}

function resolvePhaseBarState(chapter: Chapter): { segments: boolean[]; label: string } {
  if (chapter.phase_labels && chapter.current_phase_key) {
    const idx = chapter.phase_labels.indexOf(chapter.current_phase_key);
    const label = idx >= 0 ? chapter.phase_labels[idx].toUpperCase() : '';
    return {
      segments: chapter.phase_labels.map((_, i) => i <= idx),
      label,
    };
  }
  switch (chapter.chapter_type) {
    case 'bounded':
      return { segments: [true, false, false], label: 'STARTING' };
    case 'milestone':
      return { segments: [true, true, false], label: 'PROGRESSING' };
    case 'season':
    default:
      return { segments: [true, false, false], label: 'SETTLING' };
  }
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 14,
    backgroundColor: lightTokens.colors.oatCard,
    borderWidth: 1,
    borderColor: lightTokens.colors.oatCardBorder,
    borderRadius: 13,
    position: 'relative',
    overflow: 'hidden',
  },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  left: { flex: 1, paddingRight: 10 },
  name: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.1,
    color: lightTokens.colors.worldsInk,
  },
  sub: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    color: lightTokens.colors.warmGrey,
    marginTop: 2,
  },
  date: { alignItems: 'flex-end' },
  dateDay: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    fontWeight: '700',
    color: lightTokens.colors.worldsInk,
  },
  dateRem: {
    fontFamily: 'Inter-Regular',
    fontSize: 9,
    color: lightTokens.colors.warmGrey,
    marginTop: 3,
    letterSpacing: 0.3,
  },
  phaseRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 9 },
  phaseSeg: { height: 3, flex: 1, borderRadius: 2 },
  phaseLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginLeft: 8,
  },
});
