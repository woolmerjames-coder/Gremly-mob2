import { View, StyleSheet } from 'react-native';
import { format } from 'date-fns';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import { useWorldPalette, useChapterDrops } from '../../lib/store/worldsSelectors';
import { resolveChapterLabel, resolveChapterPhases } from '../../lib/worlds/chapterDisplay';
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
  const targetText = chapter.target_description || chapter.target_summary || '';
  const targetDate = chapter.end_date ? format(new Date(chapter.end_date), 'MMM d') : '\u2014';
  const phases = resolveChapterPhases(chapter);

  return (
    <View style={styles.card}>
      <View style={[styles.bar, { backgroundColor: palette.dot }]} />
      <View style={styles.body}>
        <Text style={[styles.lbl, { color: palette.dot }]}>{label}</Text>
        <Text style={styles.title}>{chapter.title}</Text>
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
                  { backgroundColor: active ? palette.dot : lightTokens.colors.oatDeeper },
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
                    color: lightTokens.colors.deepForest,
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

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: 'rgba(250,244,222,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(26,58,40,0.06)',
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
    color: lightTokens.colors.deepForest,
  },
  target: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    lineHeight: 18,
    color: '#4d5a4f',
    marginTop: 8,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(26,58,40,0.06)',
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
    color: lightTokens.colors.deepForest,
  },
  phases: {
    marginTop: 14,
    padding: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(151,175,143,0.08)',
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
