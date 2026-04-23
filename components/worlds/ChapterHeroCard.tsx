import { View, StyleSheet } from 'react-native';
import { format } from 'date-fns';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import { useWorldPalette, useChapterDrops } from '../../lib/store/worldsSelectors';
import {
  resolveChapterLabel,
  resolveChapterPhases,
  type PhaseBarState,
} from '../../lib/worlds/chapterDisplay';
import type { Chapter } from '../../lib/supabase/types';

interface ChapterHeroCardProps {
  chapter: Chapter;
}

export function ChapterHeroCard({ chapter }: ChapterHeroCardProps) {
  const palette = useWorldPalette(chapter.primary_world_id ?? '');
  const drops = useChapterDrops(chapter.id);
  const openCount = drops.todos.filter((t) => !t.completed_at).length;
  const doneCount = drops.todos.filter((t) => !!t.completed_at).length;
  const label = resolveChapterLabel(chapter);
  const summary = chapter.summary?.trim() || null;
  const targetText = chapter.target_description || chapter.target_summary || '';
  const targetDate = chapter.end_date ? format(new Date(chapter.end_date), 'MMM d') : '\u2014';
  const phases = buildPhaseBar(chapter);

  return (
    <View style={styles.card}>
      <View style={[styles.bar, { backgroundColor: palette.dot }]} />
      <View style={styles.body}>
        <Text style={[styles.lbl, { color: palette.dot }]}>{label}</Text>
        <Text style={styles.title}>{chapter.title}</Text>
        {summary ? <Text style={styles.summary}>{summary}</Text> : null}
        {targetText ? <Text style={styles.target}>{targetText}</Text> : null}
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLbl}>TARGET</Text>
            <Text style={styles.metaVal}>{targetDate}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLbl}>OPEN</Text>
            <Text style={styles.metaVal}>{openCount}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLbl}>DONE</Text>
            <Text style={styles.metaVal}>{doneCount}</Text>
          </View>
        </View>
        <View style={styles.phases}>
          <View style={styles.phaseSegRow}>
            {phases.segments.map((active, i) => (
              <View
                key={i}
                style={[
                  styles.phaseSeg,
                  { backgroundColor: active ? palette.dot : lightTokens.colors.worldsCardBorder },
                ]}
              />
            ))}
          </View>
          <View style={styles.phaseLbls}>
            {phases.labels.map((lb, i) => (
              <Text
                key={lb}
                style={[
                  styles.phaseLbl,
                  i === phases.currentIndex && {
                    color: lightTokens.colors.worldsInk,
                    fontWeight: '700',
                  },
                ]}
              >
                {lb}
              </Text>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

function buildPhaseBar(chapter: import('../../lib/supabase/types').Chapter): PhaseBarState {
  const authoredLabels = chapter.phase_labels;
  const authoredCurrent = chapter.current_phase_key;
  if (authoredLabels && authoredLabels.length > 0) {
    const current = authoredCurrent ?? authoredLabels[0];
    const idx = Math.max(authoredLabels.indexOf(current), 0);
    return {
      segments: authoredLabels.map((_, i) => i <= idx),
      labels: authoredLabels.map((l) => l.toUpperCase()),
      currentIndex: idx,
      label: authoredLabels[idx]?.toUpperCase() ?? '',
    };
  }
  return resolveChapterPhases(chapter);
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: lightTokens.colors.oatCard,
    borderWidth: 1,
    borderColor: lightTokens.colors.oatCardBorder,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  body: { padding: 14, paddingLeft: 20, paddingRight: 16 },
  lbl: {
    fontFamily: 'Inter-Medium',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.9,
    marginBottom: 6,
  },
  title: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 24,
    color: lightTokens.colors.worldsInk,
  },
  target: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    lineHeight: 18,
    color: lightTokens.colors.subtleGreen,
    marginTop: 8,
  },
  summary: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    lineHeight: 19,
    color: lightTokens.colors.worldsInk,
    marginTop: 6,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: lightTokens.colors.oatCardBorder,
  },
  metaItem: { flex: 1 },
  metaLbl: {
    fontFamily: 'Inter-Medium',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: lightTokens.colors.warmGrey,
    textTransform: 'uppercase',
  },
  metaVal: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
    color: lightTokens.colors.worldsInk,
  },
  phases: {
    marginTop: 14,
    padding: 10,
    paddingHorizontal: 12,
    backgroundColor: lightTokens.colors.chapterDecorBg,
    borderRadius: 10,
  },
  phaseSegRow: { flexDirection: 'row', gap: 4, marginBottom: 5 },
  phaseSeg: { height: 3, flex: 1, borderRadius: 2 },
  phaseLbls: { flexDirection: 'row', justifyContent: 'space-between' },
  phaseLbl: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    color: lightTokens.colors.warmGrey,
    letterSpacing: 0.3,
  },
});
