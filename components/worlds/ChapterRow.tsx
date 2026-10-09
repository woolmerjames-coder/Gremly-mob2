/**
 * A Chapter as a quiet row: on the home screen under Up next, and on a
 * World's page. Closed Chapters have their own row, for Looking back.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import type { Chapter, World } from '../../lib/supabase/types';
import type { Todo } from '../../lib/types';
import { F, W } from '../../lib/worlds/look';
import {
  chapterGremly,
  closedWhen,
  countdown,
  nextStep,
  whenLine,
  worldName,
  worldTint,
} from '../../lib/worlds/model';
import { GremlyFace } from './GremlyFace';
import { stepTitle } from './UpNextCard';

/** The quiet row for any other open Chapter. */
export function ChapterRow({
  chapter,
  world,
  steps,
  today,
  ended,
  onOpen,
}: {
  chapter: Chapter;
  world: World | null;
  steps: Todo[];
  today: string;
  ended: boolean;
  onOpen: () => void;
}) {
  const cd = ended ? null : countdown(chapter, today);
  const next = nextStep(steps);
  const sub = ended
    ? 'It is over. Ready to close.'
    : next
      ? `Next: ${stepTitle(next)}`
      : steps.length
        ? 'Every step is ticked'
        : whenLine(chapter, today);
  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: 'rgba(46,85,64,0.04)' }]}
      accessibilityRole="button"
      accessibilityLabel={`${chapter.title}. ${sub}${cd ? `. ${cd.kind === 'days' ? `${cd.n} ${cd.label}` : `${cd.big} ${cd.label}`}` : ''}`}
      testID={`chapter-row-${chapter.id}`}
    >
      <GremlyFace slug={chapterGremly(chapter, world)} tint={worldTint(world)} size={44} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {chapter.title}
        </Text>
        <Text style={[styles.rowSub, ended && { color: W.pearInk }]} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      {cd ? (
        <View style={styles.n}>
          <Text style={[styles.nBig, cd.kind === 'word' && { fontSize: 16 }]}>
            {cd.kind === 'days' ? cd.n : cd.big}
          </Text>
          <Text style={styles.nSub}>
            {cd.kind === 'days' ? (cd.n === 1 ? 'day' : 'days') : cd.label}
          </Text>
        </View>
      ) : (
        <ChevronRight size={20} color={W.faint} />
      )}
    </Pressable>
  );
}

/** A closed Chapter in Looking back: when it was, and its World. */
export function ClosedRow({
  chapter,
  world,
  showWorld,
  first,
  onOpen,
}: {
  chapter: Chapter;
  world: World | null;
  showWorld: boolean;
  first: boolean;
  onOpen: () => void;
}) {
  const sub = [closedWhen(chapter), showWorld && world ? worldName(world) : '']
    .filter(Boolean)
    .join(', ');
  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [
        styles.lbr,
        !first && styles.lbrLine,
        pressed && { backgroundColor: '#FBFAF7' },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${chapter.title}. ${sub}`}
      testID={`closed-row-${chapter.id}`}
    >
      <GremlyFace slug={chapterGremly(chapter, world)} tint={worldTint(world)} size={36} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.lbTitle}>{chapter.title}</Text>
        {sub ? <Text style={styles.lbSub}>{sub}</Text> : null}
      </View>
      <ChevronRight size={16} color={W.faint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 9,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: W.line,
    borderRadius: 10,
  },
  rowTitle: { fontFamily: F.bodySemi, fontSize: 16, lineHeight: 20, color: W.forest },
  rowSub: { fontFamily: F.body, fontSize: 13.5, color: W.muted, marginTop: 2 },
  n: { alignItems: 'flex-end' },
  nBig: { fontFamily: F.ui, fontSize: 22, color: W.moss, fontVariant: ['tabular-nums'] },
  nSub: { fontFamily: F.body, fontSize: 13, color: W.muted, marginTop: 3 },
  lbr: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  lbrLine: { borderTopWidth: 1, borderTopColor: W.line },
  lbTitle: { fontFamily: F.bodySemi, fontSize: 15, lineHeight: 20, color: W.forest },
  lbSub: { fontFamily: F.body, fontSize: 13, color: W.muted, marginTop: 1 },
});
