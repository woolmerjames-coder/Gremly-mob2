/**
 * AskStrip: the one way a drop card asks (Mind Drop rethink stage 6, the ask
 * strip in `Claude outputs/mind-drop-prototype.html`).
 *
 * It opens under the card body with a height reveal (.45s) and a hairline top
 * border: Gremly's face beside the question, any extra rows (the item a
 * relation means, or a split's pieces), the answers as buttons that rise in
 * 50ms apart, and a foot with a small hint and Not now. On a tap the chosen
 * button fills moss, the others fade to .25, and the answer runs after .26s;
 * the host then closes the strip. Something else opens a one line field with
 * Go, so a question never leaves anyone stuck.
 *
 * Presentational only: the words and what each answer does come from the host
 * (CardAsk). With reduced motion on, it opens and closes at once.
 */
import React from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Pencil, type LucideIcon } from 'lucide-react-native';
import { useReducedMotion } from '../../design/animations';

/** The chosen answer shows for this long before it runs (the prototype's .26s). */
export const ASK_CHOSEN_MS = 260;
/** The strip's height reveal as it opens, and its close. */
export const ASK_OPEN_MS = 450;
export const ASK_CLOSE_MS = 300;

const C = {
  forest: '#1A3328',
  moss: '#2E5540',
  linen: '#F9F6F1',
  sageWash: '#EAF2E8',
  muted: '#5C6660',
  line: 'rgba(46,85,64,0.12)',
  field: 'rgba(46,85,64,0.2)',
};
const EASE_OUT = Easing.bezier(0.2, 0.8, 0.2, 1);
const EASE_POP = Easing.bezier(0.2, 0.9, 0.3, 1.2);

export interface AskButton {
  key: string;
  label: string;
  icon?: LucideIcon;
  testID?: string;
  onPress: () => void;
}

export interface AskStripProps {
  /** false while it closes; the host unmounts it afterwards */
  open: boolean;
  question: string;
  /** rows between the question and the answers (the item, or the pieces) */
  extra?: React.ReactNode;
  buttons: AskButton[];
  /** Something else: what they type, as their own answer */
  onFreeText?: (text: string) => void;
  hint?: string | null;
  /** words for an answer that did not go through, in place of the hint */
  error?: string | null;
  onNotNow?: () => void;
  testID?: string;
}

/** One answer, rising in after the strip opens. */
function Rise({
  index,
  reduced,
  children,
}: {
  index: number;
  reduced: boolean;
  children: React.ReactNode;
}) {
  const t = useSharedValue(reduced ? 1 : 0);
  React.useEffect(() => {
    if (reduced) {
      t.value = 1;
      return;
    }
    t.value = withDelay(index * 50 + 120, withTiming(1, { duration: 400, easing: EASE_POP }));
  }, [index, reduced, t]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, t.value * 1.3),
    transform: [{ translateY: 4 * (1 - t.value) }],
  }));
  return <Reanimated.View style={style}>{children}</Reanimated.View>;
}

export function AskStrip({
  open,
  question,
  extra,
  buttons,
  onFreeText,
  hint,
  error,
  onNotNow,
  testID,
}: AskStripProps) {
  const reduced = useReducedMotion();
  const [chosen, setChosen] = React.useState<string | null>(null);
  // holds within a frame, where two quick taps would both see no choice yet
  const chosenRef = React.useRef<string | null>(null);
  const [typing, setTyping] = React.useState(false);
  const [text, setText] = React.useState('');
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  // an answer that did not go through lets them choose again
  React.useEffect(() => {
    if (!error) return;
    chosenRef.current = null;
    setChosen(null);
  }, [error]);

  const choose = (key: string, run: () => void) => {
    if (chosenRef.current) return;
    chosenRef.current = key;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setChosen(key);
    timer.current = setTimeout(run, ASK_CHOSEN_MS);
  };

  const canGo = text.trim().length >= 2;
  const submitFreeText = () => {
    if (!onFreeText || !canGo) return;
    const said = text.trim();
    choose('freetext', () => onFreeText(said));
  };

  const all: Array<AskButton & { other?: boolean }> = [...buttons];
  if (onFreeText && !typing) {
    all.push({
      key: 'something-else',
      label: 'Something else',
      icon: Pencil,
      testID: testID ? `${testID}-something-else` : undefined,
      onPress: () => setTyping(true),
      other: true,
    });
  }

  const body = (
    <View style={styles.ask} testID={testID}>
      <View style={styles.q}>
        <Image
          source={require('../../assets/buttonforHP.png')}
          style={styles.face}
          accessibilityIgnoresInvertColors
        />
        <Text style={styles.question} accessibilityRole="header">
          {question}
        </Text>
      </View>
      {extra}
      <View style={styles.opts}>
        {all.map((b, i) => {
          const Icon = b.icon;
          const isChosen = chosen === b.key;
          const gone = !!chosen && !isChosen;
          return (
            <Rise key={b.key} index={i} reduced={reduced}>
              <Pressable
                testID={b.testID}
                accessibilityRole="button"
                accessibilityLabel={b.label}
                accessibilityState={{ disabled: !!chosen }}
                disabled={!!chosen}
                onPress={() => (b.other ? b.onPress() : choose(b.key, b.onPress))}
                style={({ pressed }) => [
                  styles.opt,
                  isChosen && styles.optChosen,
                  gone && styles.optGone,
                  pressed && !chosen && styles.optPressed,
                ]}
              >
                {Icon ? (
                  <Icon size={15} strokeWidth={2.2} color={isChosen ? C.linen : C.moss} />
                ) : null}
                <Text style={[styles.optText, isChosen && styles.optTextChosen]}>{b.label}</Text>
              </Pressable>
            </Rise>
          );
        })}
      </View>
      {onFreeText && typing ? (
        <View style={styles.freeRow}>
          <TextInput
            testID={testID ? `${testID}-field` : undefined}
            value={text}
            onChangeText={setText}
            placeholder="Say it in your own words"
            placeholderTextColor={C.muted}
            style={styles.field}
            autoFocus
            returnKeyType="go"
            onSubmitEditing={submitFreeText}
            editable={!chosen}
            accessibilityLabel="Your answer"
          />
          <Pressable
            testID={testID ? `${testID}-go` : undefined}
            accessibilityRole="button"
            accessibilityLabel="Go"
            accessibilityState={{ disabled: !canGo || !!chosen }}
            disabled={!canGo || !!chosen}
            onPress={submitFreeText}
            style={({ pressed }) => [
              styles.go,
              (!canGo || (!!chosen && chosen !== 'freetext')) && styles.optGone,
              pressed && styles.optPressed,
            ]}
          >
            <Text style={styles.goText}>Go</Text>
          </Pressable>
        </View>
      ) : null}
      {error || hint || onNotNow ? (
        <View style={styles.foot}>
          <Text
            style={[styles.hint, error ? styles.error : null]}
            accessibilityLiveRegion={error ? 'polite' : undefined}
          >
            {error || hint || ''}
          </Text>
          {onNotNow ? (
            <Pressable
              testID={testID ? `${testID}-not-now` : undefined}
              accessibilityRole="button"
              accessibilityLabel="Not now"
              disabled={!!chosen}
              onPress={onNotNow}
              hitSlop={6}
              style={({ pressed }) => [styles.later, pressed && styles.optPressed]}
            >
              <Text style={styles.laterText}>Not now</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return <Reveal open={open}>{body}</Reveal>;
}

/**
 * A height reveal: the content is measured at its own height and the frame
 * grows to it from 0 (.45s), or shrinks back as it closes (.3s). With reduced
 * motion on, it shows and hides at once. Shared by the strip and the quiet
 * duplicate line.
 */
export function Reveal({ open, children }: { open: boolean; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const [contentH, setContentH] = React.useState(0);
  const h = useSharedValue(0);
  React.useEffect(() => {
    const target = open ? contentH : 0;
    if (reduced) {
      h.value = target;
      return;
    }
    h.value = withTiming(target, { duration: open ? ASK_OPEN_MS : ASK_CLOSE_MS, easing: EASE_OUT });
  }, [open, contentH, reduced, h]);
  const style = useAnimatedStyle(() => ({ height: h.value }));
  if (reduced) return open ? <>{children}</> : null;
  return (
    <Reanimated.View style={[styles.reveal, style]}>
      {/* laid out at its own height, so the reveal can measure it */}
      <View
        style={styles.measure}
        onLayout={(e) => setContentH(Math.ceil(e.nativeEvent.layout.height))}
      >
        {children}
      </View>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  reveal: { overflow: 'hidden' },
  measure: { position: 'absolute', top: 0, left: 0, right: 0 },
  ask: {
    marginTop: 10,
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: C.line,
    gap: 10,
  },
  q: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  face: { width: 24, height: 24, marginTop: -1 },
  question: {
    flex: 1,
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 14.5,
    lineHeight: 20,
    color: C.forest,
  },
  opts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opt: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: C.sageWash,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  optChosen: { backgroundColor: C.moss },
  optGone: { opacity: 0.25 },
  optPressed: { opacity: 0.7 },
  optText: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 13.5, color: C.moss },
  optTextChosen: { color: C.linen },
  freeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  field: {
    flex: 1,
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.field,
    backgroundColor: C.linen,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: C.forest,
  },
  go: {
    minHeight: 38,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: C.moss,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goText: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 13.5, color: C.linen },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  hint: { flex: 1, fontFamily: 'Inter-Regular', fontSize: 12, color: C.muted },
  error: { color: '#9A6232' },
  later: { minHeight: 32, justifyContent: 'center', paddingLeft: 8 },
  laterText: { fontFamily: 'Inter-Medium', fontSize: 12.5, color: C.muted },
});

export default AskStrip;
