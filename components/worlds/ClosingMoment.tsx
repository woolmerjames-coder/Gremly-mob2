/**
 * The moment a Chapter closes: Gremly in his scarf, what it was, and the
 * memory Gremly writes for the person's story, which they can rewrite. Keep
 * it, or leave the Chapter open after all.
 */
import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar, Check, Pencil, StickyNote } from 'lucide-react-native';
import type { Chapter, World } from '../../lib/supabase/types';
import { F, SHADOW, W } from '../../lib/worlds/look';
import { dateWords, dayOf, daysFrom, isSpan, worldName } from '../../lib/worlds/model';
import { GremlyImage } from './GremlyFace';
import { Diamond, plural } from './parts';
import { Btn } from './Sheet';

export type MemoryState = 'writing' | 'ready' | 'missing';

export function ClosingMoment({
  chapter,
  world,
  stepsDone,
  keptCount,
  memory,
  memoryState,
  onRewrite,
  onKeep,
  onNotYet,
}: {
  chapter: Chapter;
  world: World | null;
  stepsDone: number;
  keptCount: number;
  memory: string | null;
  memoryState: MemoryState;
  onRewrite: () => void;
  onKeep: () => void;
  onNotYet: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [fade] = useState(() => new Animated.Value(0));
  const [hop] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled())
      .then((reduce) => !!reduce)
      .catch(() => false)
      .then((still) => {
        Animated.timing(fade, {
          toValue: 1,
          duration: still ? 0 : 300,
          useNativeDriver: true,
        }).start();
        if (still) hop.setValue(1);
        else
          Animated.spring(hop, {
            toValue: 1,
            friction: 4,
            tension: 60,
            useNativeDriver: true,
          }).start();
      });
    AccessibilityInfo.announceForAccessibility(`Chapter closed: ${chapter.title}`);
  }, [fade, hop, chapter.title]);

  const s = dayOf(chapter.start_date);
  const e = dayOf(chapter.end_date);
  const days = isSpan(chapter) && s && e ? daysFrom(s, e) + 1 : 0;
  const when = [dateWords(chapter), world ? worldName(world) : ''].filter(Boolean).join(', ');

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { opacity: fade, zIndex: 50 }]}
      accessibilityViewIsModal
      testID="closing"
    >
      <LinearGradient
        colors={[W.pearWash, W.linen]}
        locations={[0, 0.58]}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        contentContainerStyle={[
          styles.in,
          { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 18 },
        ]}
      >
        <Animated.View
          style={{
            transform: [
              { translateY: hop.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
              { scale: hop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
            ],
          }}
        >
          <GremlyImage slug="cozyscarf_gremly" size={150} />
        </Animated.View>
        <Text style={styles.k}>Chapter closed</Text>
        <Text style={styles.h} accessibilityRole="header">
          {chapter.title}
        </Text>
        {when ? <Text style={styles.when}>{when}</Text> : null}

        <Pressable
          onPress={onRewrite}
          disabled={memoryState === 'writing'}
          style={styles.mem}
          accessibilityRole="button"
          accessibilityLabel={
            memoryState === 'ready' && memory
              ? `The memory: ${memory}. Tap to rewrite`
              : memoryState === 'writing'
                ? 'Gremly is writing the memory'
                : 'Write the memory yourself'
          }
          testID="closing-memory"
        >
          <View style={styles.memTop}>
            <View style={styles.gmark}>
              <Diamond />
              <Text style={styles.gmarkText}>The memory</Text>
            </View>
            {memoryState !== 'writing' ? (
              <View style={styles.tapnote}>
                <Pencil size={12} color={W.faint} />
                <Text style={styles.tapnoteText}>
                  {memoryState === 'ready' ? 'Tap to rewrite' : 'Tap to write'}
                </Text>
              </View>
            ) : null}
          </View>
          {memoryState === 'writing' ? (
            <View style={styles.writing}>
              <ActivityIndicator size="small" color={W.peri} />
              <Text style={styles.writingText}>Gremly is writing it now</Text>
            </View>
          ) : memoryState === 'ready' && memory ? (
            <Text style={styles.memText}>{memory}</Text>
          ) : (
            <Text style={styles.writingText}>
              Gremly did not write a memory for this one. Write your own, or keep it as it is.
            </Text>
          )}
        </Pressable>

        <View style={styles.memk}>
          {stepsDone ? (
            <View style={styles.chip}>
              <Check size={13} strokeWidth={2.6} color={W.moss} />
              <Text style={styles.chipText}>{plural(stepsDone, 'step', 'steps')} done</Text>
            </View>
          ) : null}
          {keptCount ? (
            <View style={styles.chip}>
              <StickyNote size={13} color={W.moss} />
              <Text style={styles.chipText}>{keptCount} kept</Text>
            </View>
          ) : null}
          {days > 1 ? (
            <View style={styles.chip}>
              <Calendar size={13} color={W.moss} />
              <Text style={styles.chipText}>{days} days</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.acts}>
          <Btn label="Keep it in my story" onPress={onKeep} testID="closing-keep" />
          <Pressable
            onPress={onNotYet}
            style={styles.notYet}
            accessibilityRole="button"
            testID="closing-not-yet"
          >
            <Text style={styles.notYetText}>Not yet, leave it open</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  in: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 22 },
  k: {
    fontFamily: F.ui,
    fontSize: 13,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: W.pearInk,
    marginTop: 6,
  },
  h: {
    fontFamily: F.ui,
    fontSize: 28,
    lineHeight: 32,
    color: W.moss,
    textAlign: 'center',
    marginTop: 6,
  },
  when: { fontFamily: F.body, fontSize: 15, color: W.muted, marginTop: 6, textAlign: 'center' },
  mem: {
    alignSelf: 'stretch',
    backgroundColor: W.white,
    borderWidth: 1,
    borderColor: W.line,
    borderRadius: 18,
    paddingTop: 13,
    paddingBottom: 15,
    paddingHorizontal: 16,
    marginTop: 16,
    ...SHADOW,
  },
  memTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  gmark: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gmarkText: {
    fontFamily: F.bodySemi,
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: 'rgba(46,85,64,0.55)',
  },
  tapnote: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tapnoteText: { fontFamily: F.body, fontSize: 13, color: W.faint },
  memText: { fontFamily: F.body, fontSize: 16, lineHeight: 24, letterSpacing: -0.2, color: W.ink },
  writing: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  writingText: { fontFamily: F.body, fontSize: 15, lineHeight: 22, color: W.muted },
  memk: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 30,
    paddingHorizontal: 11,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  chipText: { fontFamily: F.bodySemi, fontSize: 13, color: W.moss },
  acts: { alignSelf: 'stretch', marginTop: 'auto', paddingTop: 16, gap: 8 },
  notYet: { height: 44, alignItems: 'center', justifyContent: 'center' },
  notYetText: { fontFamily: F.bodySemi, fontSize: 14.5, color: W.moss },
});
