/**
 * The one Chapter that leads the home screen, on the dark card: its World,
 * its name, the countdown and its next step, which can be ticked from here.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import type { Chapter, World } from '../../lib/supabase/types';
import type { Todo } from '../../lib/types';
import { F, W } from '../../lib/worlds/look';
import {
  countdown,
  dateWords,
  dueWords,
  nextStep,
  stepsLine,
  whenLine,
  worldGremly,
  worldName,
  worldTint,
  type Countdown,
} from '../../lib/worlds/model';
import { GremlyFace } from './GremlyFace';

export const stepTitle = (t: Pick<Todo, 'name' | 'title'>) => (t.name || t.title || '').trim();
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function CountdownBlock({
  cd,
  sub,
  big = 54,
  wordBig = 34,
}: {
  cd: Countdown;
  sub?: string;
  big?: number;
  wordBig?: number;
}) {
  if (cd.kind === 'days') {
    return (
      <View style={styles.count}>
        <Text style={[styles.countBig, { fontSize: big, lineHeight: big * 0.98 }]}>{cd.n}</Text>
        <View style={{ paddingBottom: 5, flexShrink: 1 }}>
          <Text style={styles.countLabel}>{cd.label}</Text>
          {sub ? <Text style={styles.countSub}>{sub}</Text> : null}
        </View>
      </View>
    );
  }
  return (
    <View style={styles.countWord}>
      <Text style={[styles.countBig, { fontSize: wordBig, lineHeight: wordBig * 1.06 }]}>
        {cd.big}
      </Text>
      <View>
        <Text style={styles.countLabel}>{cd.label}</Text>
        {sub ? <Text style={styles.countSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

export function UpNextCard({
  chapter,
  world,
  steps,
  today,
  onOpen,
  onTick,
}: {
  chapter: Chapter;
  world: World | null;
  steps: Todo[];
  today: string;
  onOpen: () => void;
  onTick: (step: Todo) => void;
}) {
  const cd = countdown(chapter, today);
  const next = nextStep(steps);
  const sl = stepsLine(steps);
  const sub = [dateWords(chapter), sl].filter(Boolean).join(', ');
  const due = next ? dueWords(next, today) : '';
  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [styles.hero, pressed && { transform: [{ scale: 0.992 }] }]}
      accessibilityRole="button"
      accessibilityLabel={`Up next: ${chapter.title}. Open it`}
      accessibilityActions={
        next
          ? [{ name: 'activate' }, { name: 'tick', label: `Tick off: ${stepTitle(next)}` }]
          : undefined
      }
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'tick' && next) onTick(next);
        else onOpen();
      }}
      testID="up-next"
    >
      <View style={styles.glow} pointerEvents="none" />
      <View style={styles.top}>
        <Text style={styles.eyebrow}>Up next</Text>
        {world ? (
          <View style={styles.world}>
            <GremlyFace slug={worldGremly(world)} tint={worldTint(world)} size={24} />
            <Text style={styles.worldText} numberOfLines={1}>
              {worldName(world)}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.title}>{chapter.title}</Text>
      {cd ? (
        <CountdownBlock cd={cd} sub={sub} />
      ) : (
        <Text style={styles.nodate}>
          {[whenLine(chapter, today), sl].filter(Boolean).join(', ')}
        </Text>
      )}
      {next ? (
        <View style={styles.next}>
          <Pressable
            onPress={() => onTick(next)}
            style={({ pressed }) => [
              styles.tick,
              pressed && { backgroundColor: W.sage, borderColor: W.sage },
            ]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Tick off: ${stepTitle(next)}`}
            testID="up-next-tick"
          >
            <Check size={14} strokeWidth={3} color="transparent" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.nextTitle}>{stepTitle(next)}</Text>
            <Text style={styles.nextSub}>
              {due ? `Next step, ${lowerFirst(due)}` : 'Next step'}
            </Text>
          </View>
        </View>
      ) : (
        <View style={[styles.next, { paddingVertical: 11 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.nextTitle}>
              {steps.length ? 'Every step is ticked' : 'No steps yet'}
            </Text>
            <Text style={styles.nextSub}>Open it to add one</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: W.forest,
    borderRadius: 28,
    paddingVertical: 16,
    paddingHorizontal: 18,
    overflow: 'hidden',
    shadowColor: '#1A3328',
    shadowOpacity: 0.22,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
  glow: {
    position: 'absolute',
    right: -70,
    top: -90,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(191,216,192,0.10)',
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  eyebrow: {
    fontFamily: F.ui,
    fontSize: 13,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: W.sage,
  },
  world: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 30,
    paddingLeft: 3,
    paddingRight: 11,
    borderRadius: 15,
    backgroundColor: W.onDarkWash,
    flexShrink: 1,
  },
  worldText: { fontFamily: F.bodySemi, fontSize: 13, color: W.linen, flexShrink: 1 },
  title: {
    marginTop: 12,
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 27,
    lineHeight: 30,
    letterSpacing: -0.4,
    color: W.linen,
  },
  count: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 6 },
  countWord: { marginTop: 10, gap: 5 },
  countBig: { fontFamily: F.ui, color: W.pear, letterSpacing: -1.2, fontVariant: ['tabular-nums'] },
  countLabel: { fontFamily: F.body, fontSize: 15, lineHeight: 20, color: W.onDark },
  countSub: { fontFamily: F.body, fontSize: 13, lineHeight: 17, color: W.onDarkSoft },
  nodate: { marginTop: 8, fontFamily: F.body, fontSize: 15, color: 'rgba(249,246,241,0.8)' },
  next: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    backgroundColor: 'rgba(249,246,241,0.10)',
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  tick: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(249,246,241,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextTitle: { fontFamily: F.bodySemi, fontSize: 15.5, lineHeight: 20, color: W.linen },
  nextSub: { fontFamily: F.body, fontSize: 13, color: W.onDarkSoft, marginTop: 2 },
});
