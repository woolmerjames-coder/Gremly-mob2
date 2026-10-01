/**
 * The top of Worlds: the person's story, opening the full story screen.
 * This card is glanceable, so it never shows a private item: the teaser is
 * the latest milestone that is not private, and the rest are counts.
 */

import { Pressable, StyleSheet, View } from 'react-native';
import { format, parseISO } from 'date-fns';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import { useOpenQuestions, useStory } from '../../lib/story/useStory';

const C = lightTokens.colors;

export function StoryHeroCard({ onPress }: { onPress: () => void }) {
  const { data: story } = useStory();
  const { data: questions } = useOpenQuestions();
  if (!story.items.length && !story.header.storyForThem) return null;

  const milestones = story.items.filter((i) => i.kind === 'milestone');
  const proud = story.items.filter((i) => i.kind === 'proud');
  const latest = [...milestones]
    .filter((m) => !m.private && m.period_start)
    .sort((a, b) => ((a.period_start ?? '') < (b.period_start ?? '') ? 1 : -1))[0];
  let latestWhen = '';
  try {
    latestWhen = latest?.period_start ? format(parseISO(latest.period_start), 'MMMM') : '';
  } catch {
    latestWhen = '';
  }
  const updated = story.header.writtenAt ? format(new Date(story.header.writtenAt), 'd MMM') : null;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]} accessibilityRole="button" accessibilityLabel="Open your story">
      <View style={styles.top}>
        <Text style={styles.kicker}>YOUR STORY</Text>
        {updated ? <Text style={styles.updated}>Updated {updated}</Text> : null}
      </View>
      <Text style={styles.title}>Everything Gremly has understood about you, so far.</Text>
      {latest ? (
        <Text style={styles.latest} numberOfLines={2}>
          Latest milestone: {latest.title}
          {latestWhen ? `, ${latestWhen}` : ''}
        </Text>
      ) : null}
      <View style={styles.chips}>
        {milestones.length ? <Chip label={`${milestones.length} milestone${milestones.length === 1 ? '' : 's'}`} /> : null}
        {proud.length ? <Chip label={`${proud.length} proud moment${proud.length === 1 ? '' : 's'}`} /> : null}
        {questions.length ? <Chip label={`${questions.length} question${questions.length === 1 ? '' : 's'}`} peri /> : null}
      </View>
    </Pressable>
  );
}

function Chip({ label, peri }: { label: string; peri?: boolean }) {
  return (
    <View style={[styles.chip, peri && { backgroundColor: 'rgba(156,166,224,0.28)' }]}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 18,
    borderRadius: 22,
    backgroundColor: C.worldsInk,
    gap: 10,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { fontFamily: 'Inter-Medium', fontSize: 10.5, fontWeight: '700', letterSpacing: 1.4, color: C.onInkLabel },
  updated: { fontFamily: 'Inter-Regular', fontSize: 11.5, color: C.onInkLabel },
  title: { fontFamily: 'Fraunces-Medium', fontSize: 20, lineHeight: 26, color: C.linenCream },
  latest: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 18, color: C.onInkBody },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(249,246,241,0.12)' },
  chipText: { fontFamily: 'Inter-Medium', fontSize: 12, fontWeight: '600', color: C.linenCream },
});
