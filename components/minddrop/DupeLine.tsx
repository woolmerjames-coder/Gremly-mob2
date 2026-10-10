/**
 * DupeLine: the quiet duplicate line (Mind Drop rethink stage 6, Already on
 * your list in `Claude outputs/mind-drop-prototype.html`).
 *
 * When the drop is one they already have and that was known by the settle,
 * the card files as normal and this line opens under its meta line: You
 * already have this, the item's state (due today, due Fri, every morning),
 * and Keep just one. Nothing is asked; left alone, the wrap up asks.
 */
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ListChecks } from 'lucide-react-native';
import { useReducedMotion } from '../../design/animations';
import { Reveal } from './AskStrip';

const C = {
  linen: '#F9F6F1',
  white: '#FFFFFF',
  moss: '#2E5540',
  forest: '#1A3328',
  muted: '#5C6660',
  off: '#4B6A50',
  line2: 'rgba(46,85,64,0.2)',
};

export interface DupeLineProps {
  /** the item they already have, as words: due today, due Fri, every morning */
  state: string | null;
  /** words for a Keep just one that did not go through, in place of the line */
  error?: string | null;
  onKeepOne: () => void;
  /** a tap is being saved */
  busy?: boolean;
  open?: boolean;
  testID?: string;
}

export function DupeLine({ state, error, onKeepOne, busy, open = true, testID }: DupeLineProps) {
  const reduced = useReducedMotion();
  const fade = useSharedValue(reduced ? 1 : 0);
  React.useEffect(() => {
    if (reduced) {
      fade.value = open ? 1 : 0;
      return;
    }
    fade.value = open
      ? withDelay(100, withTiming(1, { duration: 350 }))
      : withTiming(0, { duration: 200 });
  }, [open, reduced, fade]);
  const style = useAnimatedStyle(() => ({ opacity: fade.value }));

  return (
    <Reveal open={open}>
      <Reanimated.View style={[styles.line, style]} testID={testID}>
        <ListChecks size={14} strokeWidth={2.2} color={C.off} />
        {error ? (
          <Text style={[styles.words, styles.error]} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : (
          <Text style={styles.words}>
            You already have this
            {state ? (
              <>
                {', '}
                <Text style={styles.state}>{state}</Text>
              </>
            ) : null}
          </Text>
        )}
        <Pressable
          testID={testID ? `${testID}-keep-one` : undefined}
          accessibilityRole="button"
          accessibilityLabel="Keep just one"
          accessibilityState={{ disabled: !!busy }}
          disabled={busy}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onKeepOne();
          }}
          style={({ pressed }) => [styles.keep, (pressed || busy) && styles.pressed]}
        >
          <Text style={styles.keepText}>Keep just one</Text>
        </Pressable>
      </Reanimated.View>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  line: {
    marginTop: 9,
    paddingVertical: 6,
    paddingRight: 6,
    paddingLeft: 10,
    borderRadius: 11,
    backgroundColor: C.linen,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  words: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'Inter-Regular',
    fontSize: 12.5,
    lineHeight: 17,
    color: C.muted,
  },
  state: { fontFamily: 'Inter-SemiBold', color: C.forest },
  error: { color: '#9A6232' },
  keep: {
    minHeight: 32,
    paddingHorizontal: 11,
    borderRadius: 9,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
  keepText: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 12.5, color: C.moss },
});

export default DupeLine;
