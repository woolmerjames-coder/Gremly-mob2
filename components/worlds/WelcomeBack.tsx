/**
 * The welcome back on the Worlds home (Worlds rebuild, stage 3, the mockup's
 * card): after time away, the Chapters whose dates passed come as one card,
 * each with Gremly's guess, which they can change. Nothing changed while they
 * were away. Accept all does the lot and one Undo puts it all back; Later
 * leaves it as the question above the box (lib/worlds/questions.ts).
 */
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import type { Chapter } from '../../lib/supabase/types';
import { dateWords, dayOf, isSpan } from '../../lib/worlds/model';
import type { AskAct, WorldsQuestion } from '../../lib/worlds/questions';
import { F, SHADOW, W } from '../../lib/worlds/look';
import { Btn } from './Sheet';
import { numWord } from './Steps';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const WAVING = require('../../assets/mascot/gremlywaving.png');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export type AwayPick = Extract<AskAct, 'close' | 'going' | 'move'>;

/** What each pick says on its button. */
export const PICK_WORDS: Record<AwayPick, string> = {
  close: 'Close it',
  going: 'Still going',
  move: 'New dates',
};

/** Gremly's guess as the pick it starts from: nothing is closed on a guess it was unsure of. Pure. */
export function guessPick(q: WorldsQuestion): AwayPick {
  if (q.proposal.type === 'start') return 'going';
  const p = q.proposal;
  if (p.guess === 'over') return 'close';
  if (p.guess === 'moved' && (p.start_date || p.end_date)) return 'move';
  return 'going';
}

/** The picks a Chapter can have: moving it only when Gremly has its new days. Pure. */
export function picksFor(q: WorldsQuestion): AwayPick[] {
  const p = q.proposal;
  const moved = p.type !== 'start' && p.guess === 'moved' && !!(p.start_date || p.end_date);
  return moved ? ['close', 'going', 'move'] : ['close', 'going'];
}

/** The line under a Chapter: when it was. Pure. */
export function wasLine(c: Pick<Chapter, 'start_date' | 'end_date'>, today: string): string {
  const end = dayOf(c.end_date);
  const words = dateWords(c);
  if (!words) return 'No date';
  if (end && end >= today) return `Still ahead: ${words}`;
  return isSpan(c) ? `It was ${words}` : `Its day was ${words}`;
}

export function WelcomeBack({
  questions,
  chapters,
  picks,
  today,
  busy,
  onPick,
  onAcceptAll,
  onLater,
}: {
  questions: WorldsQuestion[];
  chapters: Chapter[];
  picks: Record<string, AwayPick>;
  today: string;
  busy?: boolean;
  /** Change one Chapter's pick */
  onPick: (q: WorldsQuestion) => void;
  onAcceptAll: () => void;
  onLater: () => void;
}) {
  const rows = questions
    .map((q) => ({
      q,
      c: chapters.find((x) => q.proposal.type !== 'start' && x.id === q.proposal.chapter_id),
    }))
    .filter((r): r is { q: WorldsQuestion; c: Chapter } => !!r.c);
  if (!rows.length) return null;
  const passed = rows.filter((r) => {
    const end = dayOf(r.c.end_date);
    return !end || end < today;
  }).length;
  const n = passed || rows.length;
  return (
    <View style={styles.card} testID="welcome-back">
      <View style={styles.head}>
        <Image source={WAVING} style={styles.g} resizeMode="contain" accessible={false} />
        <View style={{ flex: 1 }}>
          <Text style={styles.h} accessibilityRole="header">
            Welcome back
          </Text>
          <Text style={styles.p}>
            Nothing changed while you were away.{' '}
            {passed
              ? `${cap(numWord(n))} ${n === 1 ? 'Chapter' : 'Chapters'} passed ${n === 1 ? 'its' : 'their'} date.`
              : `${cap(numWord(n))} ${n === 1 ? 'Chapter is' : 'Chapters are'} still ahead.`}
          </Text>
        </View>
      </View>
      {rows.map(({ q, c }) => {
        const pick = picks[q.id] ?? guessPick(q);
        return (
          <View key={q.id} style={styles.row}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.t} numberOfLines={2}>
                {c.title}
              </Text>
              <Text style={styles.s}>{wasLine(c, today)}</Text>
            </View>
            <Pressable
              onPress={() => onPick(q)}
              disabled={busy}
              style={({ pressed }) => [styles.pick, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityLabel={`${c.title}: ${PICK_WORDS[pick]}. Change it`}
              testID={`away-pick-${q.id}`}
            >
              <Text style={styles.pickText}>{PICK_WORDS[pick]}</Text>
              <ChevronDown size={16} color={W.moss} />
            </Pressable>
          </View>
        );
      })}
      <View style={styles.acts}>
        <View style={{ flex: 1.6 }}>
          <Btn label="Accept all" onPress={onAcceptAll} disabled={busy} testID="away-accept" />
        </View>
        <View style={{ flex: 1 }}>
          <Btn label="Later" kind="sec" onPress={onLater} disabled={busy} testID="away-later" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: W.white,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    marginTop: 14,
    ...SHADOW,
  },
  head: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingBottom: 14 },
  g: { width: 68, height: 68 },
  h: { fontFamily: F.ui, fontSize: 22, lineHeight: 26, color: W.forest },
  p: { fontFamily: F.body, fontSize: 15, lineHeight: 21, color: W.muted, marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: W.line,
    paddingVertical: 12,
  },
  t: { fontFamily: F.uiSemi, fontSize: 16.5, lineHeight: 21, color: W.forest },
  s: { fontFamily: F.body, fontSize: 14, color: W.muted, marginTop: 2 },
  pick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: W.sageWash,
    borderRadius: 18,
    paddingHorizontal: 14,
    height: 40,
  },
  pickText: { fontFamily: F.uiSemi, fontSize: 14.5, color: W.moss },
  acts: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: W.line,
  },
});
