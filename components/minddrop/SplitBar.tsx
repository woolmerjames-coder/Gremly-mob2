/**
 * SplitBar: the line under a clear split's pieces while they are the newest
 * cards (Mind Drop rethink stage 7, the prototype's .splitbar). It says Split
 * into 3, and offers Keep as one: the pieces fold into one note with the
 * drop's words, and Gremly's bubble says One note it is.
 *
 * The classifier said the split was clear; this only offers the way back.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Split, Undo2 } from 'lucide-react-native';
import { eventBus } from '../../lib/events/EventBus';
import { useReducedMotion } from '../../design/animations';
import { keepPiecesAsOne, piecesOf } from '../../lib/minddrop/splitActions';
import { keptAsOneWord } from '../../lib/minddrop/dropCardModel';
import { DIDNT_GO, PlainError, wordsForError } from '../../lib/minddrop/plainError';

/** The pieces fold into the note (RecentDrops' fold), then Gremly says so. */
const FOLD_MS = 420;
const BUBBLE_MS = 4000;
const EASE_OUT = Easing.bezier(0.2, 0.8, 0.2, 1);

export function SplitBar({
  groupId,
  count,
  testID,
}: {
  groupId: string;
  count: number;
  testID?: string;
}) {
  const reduced = useReducedMotion();
  const [busy, setBusy] = React.useState(false);
  const busyRef = React.useRef(false);
  const [error, setError] = React.useState<string | null>(null);

  const shown = useSharedValue(reduced ? 1 : 0);
  React.useEffect(() => {
    if (reduced) {
      shown.value = 1;
      return;
    }
    shown.value = withTiming(1, { duration: 450, easing: EASE_OUT });
  }, [reduced, shown]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, shown.value * 1.3),
    transform: [{ translateY: (1 - shown.value) * -4 }],
  }));

  const keepAsOne = async () => {
    // a ref, so two quick taps cannot both start it
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const ids = piecesOf(groupId).map((p) => p.item.id);
    // the pieces wait in place while the note is saved, then fold into it
    if (ids.length) {
      eventBus.emit('minddrop:cards_leaving', { ids, hold: true, as: 'fold', into: ids[0] });
    }
    try {
      const kept = await keepPiecesAsOne(groupId);
      if (!kept) throw new PlainError(DIDNT_GO);
      // a piece that could not be archived stays where it is
      if (kept.stayed.length) eventBus.emit('minddrop:cards_stay', { ids: kept.stayed });
      eventBus.emit('minddrop:cards_go', { ids: kept.pieceIds });
      setTimeout(
        () =>
          eventBus.emit('gremly:speak', {
            message: `One ${keptAsOneWord(kept.kindWord)} it is.`,
            duration: BUBBLE_MS,
          }),
        reduced ? 0 : FOLD_MS,
      );
    } catch (err) {
      console.warn('[SplitBar] keeping the pieces as one did not go through', {
        groupId,
        error: String(err),
      });
      if (ids.length) eventBus.emit('minddrop:cards_stay', { ids });
      setError(wordsForError(err));
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <Reanimated.View style={[styles.bar, style]} testID={testID}>
      <View style={styles.said}>
        <Split size={14} strokeWidth={2} color={C.muted} />
        <Text style={styles.saidText} numberOfLines={1}>
          {error ?? `Split into ${count}`}
        </Text>
      </View>
      <Pressable
        onPress={() => void keepAsOne()}
        disabled={busy}
        style={({ pressed }) => [styles.keep, (pressed || busy) && styles.keepPressed]}
        accessibilityRole="button"
        accessibilityLabel="Keep as one"
        accessibilityState={{ disabled: busy }}
        testID={testID ? `${testID}-keep` : undefined}
      >
        <Undo2 size={14} strokeWidth={2} color={C.moss} />
        <Text style={styles.keepText}>Keep as one</Text>
      </Pressable>
    </Reanimated.View>
  );
}

const C = {
  moss: '#2E5540',
  muted: '#5C6660',
  white: '#FFFFFF',
  line2: 'rgba(46,85,64,0.2)',
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: -2,
    marginHorizontal: 2,
    paddingTop: 6,
    paddingHorizontal: 4,
    paddingBottom: 2,
  },
  said: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  saidText: { fontFamily: 'Inter-Regular', fontSize: 12.5, color: C.muted, flexShrink: 1 },
  keep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line2,
  },
  keepPressed: { opacity: 0.6 },
  keepText: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 12.5, color: C.moss },
});

export default SplitBar;
