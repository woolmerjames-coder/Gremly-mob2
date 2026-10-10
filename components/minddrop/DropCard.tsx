/**
 * DropCard: the Mind Drop card, look A from the prototype (Mind Drop rethink
 * stage 5, `Claude outputs/mind-drop-prototype.html`).
 *
 * A kind tile, the title in sentence case (wrapping, never cut), and one meta
 * line: the kind word, then when, how long, how often, the mood and where it
 * lives. Three states, driven by the item's fields (lib/minddrop/dropCardModel):
 *
 * - landed: your words in #3A4A42 on a linen tile with a breathing moss dot,
 *   and three sage dots that bob in the meta line. Nothing else.
 * - sorted: the tile fills to the kind's wash and pops, the icon scales in and
 *   draws its stroke, the words cross fade to the title (no fade when only the
 *   first capital differs), and the dots give way to the kind word.
 * - settled: the rest of the meta line fades in and rises 3px, the card takes
 *   one small breath, and on the newest card the talk row fades in. Then
 *   nothing moves.
 *
 * Slots for the ask strip and the duplicate line (stage 6, AskStrip and
 * DupeLine) and the split bar (stage 7). With reduced motion on, every change
 * is instant.
 *
 * Known gap: the prototype also blurs the outgoing words by 4px; React Native
 * cannot blur text on iOS, so the cross fade uses opacity alone.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  FadeInUp,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import {
  Calendar,
  Check,
  ChevronRight,
  CircleCheck,
  Clock,
  Compass,
  Heart,
  Lightbulb,
  MessageCircleQuestionMark,
  Moon,
  NotebookPen,
  Repeat,
  StickyNote,
  Sunrise,
  Sunset,
  type LucideIcon,
} from 'lucide-react-native';
import { useReducedMotion } from '../../design/animations';
import {
  KIND_COLORS,
  KIND_WORDS,
  cardAccessibilityLabel,
  onlyCapitalDiffers,
  type DropCardKind,
  type DropCardStage,
  type MetaIcon,
  type MetaPart,
} from '../../lib/minddrop/dropCardModel';

export const KIND_ICONS: Record<DropCardKind, LucideIcon> = {
  todo: CircleCheck,
  habit: Repeat,
  event: Calendar,
  journal: NotebookPen,
  idea: Lightbulb,
  note: StickyNote,
  ask: MessageCircleQuestionMark,
};

const META_ICONS: Record<MetaIcon, LucideIcon> = {
  calendar: Calendar,
  clock: Clock,
  repeat: Repeat,
  sunrise: Sunrise,
  sunset: Sunset,
  heart: Heart,
  compass: Compass,
  'sticky-note': StickyNote,
  moon: Moon,
  check: Check,
  'notebook-pen': NotebookPen,
};

// Tokens, from the prototype's look A
const C = {
  white: '#FFFFFF',
  linen2: '#F1EDE5',
  moss: '#2E5540',
  sage: '#BFD8C0',
  forest: '#1A3328',
  raw: '#3A4A42',
  muted: '#5C6660',
};
const EASE_OUT = Easing.bezier(0.2, 0.8, 0.2, 1);
const EASE_POP = Easing.bezier(0.2, 0.9, 0.3, 1.2);
const STROKE_DASH = 60;

export interface DropCardProps {
  kind: DropCardKind;
  stage: DropCardStage;
  /** the drop's own words, shown until the card is sorted */
  rawTitle: string;
  /** the title the card settles on */
  title: string;
  /** the meta line after the kind word (dropCardModel.metaParts) */
  meta: MetaPart[];
  onPress?: () => void;
  testID?: string;
  /** the newest card offers "Talk it through with Gremly" once settled */
  onTalk?: () => void;
  talkTestID?: string;
  /** stage 6: the question strip under the card body */
  askStrip?: React.ReactNode;
  /** stage 6: the quiet "You already have this" line */
  dupeLine?: React.ReactNode;
  /** stage 7: the split bar under a clear split's last piece */
  splitBar?: React.ReactNode;
  /** anything else under the meta line (a retry line, an older card's own line) */
  footer?: React.ReactNode;
  /**
   * Nothing is working on it (a drop that did not go through, waiting for its
   * Retry): no wait dots, and the tile's dot stays still.
   */
  stopped?: boolean;
  /** stage 6: changes when Keep just one folds a drop into this card, which pulses once */
  pulseKey?: number;
  /**
   * stage 9: where it lives, the last part of the meta line (a Chapter, else a
   * World), with one tap to change it. One that comes after the card settled
   * fades in alone.
   */
  place?: { text: string; onPress?: () => void } | null;
  style?: ViewStyle;
}

/** The kind icon, drawing its stroke in when the card sorts (unless reduced motion). */
function KindIcon({
  kind,
  draw,
  reduced,
}: {
  kind: DropCardKind;
  draw: boolean;
  reduced: boolean;
}) {
  const Icon = KIND_ICONS[kind];
  const [offset, setOffset] = React.useState<number | null>(draw && !reduced ? STROKE_DASH : null);
  React.useEffect(() => {
    if (!draw || reduced) {
      setOffset(null);
      return;
    }
    // .6s, starting .08s after the sort, eased out (the prototype's stroke draw)
    let frame = 0;
    let start: number | null = null;
    const tick = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, Math.max(0, (t - start - 80) / 600));
      const eased = 1 - Math.pow(1 - p, 3);
      setOffset(p >= 1 ? null : Math.round(STROKE_DASH * (1 - eased)));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    setOffset(STROKE_DASH);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [draw, reduced]);
  return (
    <Icon
      size={19}
      strokeWidth={2}
      color={KIND_COLORS[kind].ink}
      {...(offset === null ? {} : { strokeDasharray: STROKE_DASH, strokeDashoffset: offset })}
    />
  );
}

/** The breathing moss dot on a landed card's tile. */
function CatchDot({ reduced }: { reduced: boolean }) {
  const t = useSharedValue(0);
  React.useEffect(() => {
    if (reduced) return;
    t.value = withRepeat(
      withTiming(1, { duration: 550, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(t);
  }, [reduced, t]);
  const style = useAnimatedStyle(() => ({
    opacity: reduced ? 0.5 : 0.35 + 0.4 * t.value,
    transform: [{ scale: reduced ? 1 : 0.7 + 0.45 * t.value }],
  }));
  return <Reanimated.View style={[styles.catch, style]} testID="drop-card-catch" />;
}

/** A place that arrives after the card settled rises in alone (the prototype's .35s). */
const PLACE_LATE = FadeInUp.duration(350)
  .easing(EASE_OUT)
  .withInitialValues({ opacity: 0, transform: [{ translateY: 3 }] });

/** Where it lives, the meta line's last part: a tap changes it. */
function PlacePart({
  text,
  onPress,
  late,
  style,
}: {
  text: string;
  onPress?: () => void;
  late: boolean;
  style: object;
}) {
  // decided when it first shows: in time it comes with the rest of the line
  const [entering] = React.useState(() => (late ? PLACE_LATE : undefined));
  return (
    <Reanimated.View entering={entering} style={entering ? undefined : style}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        hitSlop={8}
        style={styles.metaPart}
        accessible={false}
        testID="drop-card-meta-place"
      >
        <Compass size={13} strokeWidth={2.2} color={C.muted} />
        <Text style={styles.metaText}>{text}</Text>
      </Pressable>
    </Reanimated.View>
  );
}

/** One of the three waiting dots in a landed card's meta line. */
function WaitDot({ delay, reduced }: { delay: number; reduced: boolean }) {
  const t = useSharedValue(0);
  React.useEffect(() => {
    if (reduced) return;
    t.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }), -1, true),
    );
    return () => cancelAnimation(t);
  }, [delay, reduced, t]);
  const style = useAnimatedStyle(() => ({
    opacity: reduced ? 0.6 : 0.35 + 0.65 * t.value,
    transform: [{ translateY: reduced ? 0 : -2 * t.value }],
  }));
  return <Reanimated.View style={[styles.waitDot, style]} />;
}

const TITLE_FADE_MS = 450;

/**
 * The card's words: the drop as typed until it is sorted, then its title.
 * Every change crossfades (the prototype's .45s), and the card holds the
 * taller of the two heights while it fades, so nothing under it jumps. With
 * reduced motion, or when only the first capital differs, it changes at once
 * (final check item 11). A card that mounts shows its words as they are.
 */
function CardTitle({ text, raw, reduced }: { text: string; raw: boolean; reduced: boolean }) {
  const shown = React.useRef({ text, raw });
  const height = React.useRef(0);
  const [prev, setPrev] = React.useState<{ text: string; raw: boolean } | null>(null);
  const [hold, setHold] = React.useState<number | null>(null);
  const fade = useSharedValue(1);
  const finish = React.useCallback(() => {
    setPrev(null);
    setHold(null);
  }, []);

  React.useEffect(() => {
    const before = shown.current;
    if (before.text === text && before.raw === raw) return;
    shown.current = { text, raw };
    if (reduced || onlyCapitalDiffers(before.text, text)) {
      cancelAnimation(fade);
      fade.value = 1;
      finish();
      return;
    }
    setPrev(before);
    setHold(height.current || null);
    fade.value = 0;
    fade.value = withTiming(1, { duration: TITLE_FADE_MS, easing: EASE_OUT }, (done) => {
      if (done) runOnJS(finish)();
    });
  }, [text, raw, reduced, fade, finish]);

  const inStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const outStyle = useAnimatedStyle(() => ({ opacity: 1 - fade.value }));

  return (
    <View
      style={hold ? { minHeight: hold } : undefined}
      testID="drop-card-title-box"
      onLayout={(e) => {
        if (!prev) height.current = e.nativeEvent.layout.height;
      }}
    >
      <Reanimated.Text
        style={[styles.title, raw && styles.rawTitle, prev ? inStyle : null]}
        testID="drop-card-title"
      >
        {text}
      </Reanimated.Text>
      {prev ? (
        <Reanimated.Text
          style={[styles.title, prev.raw && styles.rawTitle, styles.overlay, outStyle]}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {prev.text}
        </Reanimated.Text>
      ) : null}
    </View>
  );
}

export function DropCard({
  kind,
  stage,
  rawTitle,
  title,
  meta,
  onPress,
  testID,
  onTalk,
  talkTestID,
  askStrip,
  dupeLine,
  splitBar,
  footer,
  stopped = false,
  pulseKey,
  place,
  style,
}: DropCardProps) {
  const reduced = useReducedMotion();
  const sorted = stage !== 'landed';
  const settled = stage === 'settled';
  const colors = KIND_COLORS[kind];

  // A card that mounts already sorted or settled shows its final state at once;
  // only a change while it is on screen animates.
  const [firstStage] = React.useState(stage);
  const sortedV = useSharedValue(sorted ? 1 : 0);
  const settledV = useSharedValue(settled ? 1 : 0);
  const tileScale = useSharedValue(1);
  const breath = useSharedValue(1);
  const [drawIcon, setDrawIcon] = React.useState(false);

  React.useEffect(() => {
    if (!sorted) return;
    if (reduced || firstStage !== 'landed') {
      sortedV.value = 1;
      return;
    }
    if (sortedV.value === 1) return;
    sortedV.value = withTiming(1, { duration: 450, easing: EASE_OUT });
    tileScale.value = withSequence(
      withTiming(0.86, { duration: 0 }),
      withTiming(1.07, { duration: 300, easing: EASE_POP }),
      withTiming(1, { duration: 200, easing: EASE_OUT }),
    );
    setDrawIcon(true);
  }, [sorted, reduced, firstStage, sortedV, tileScale]);

  React.useEffect(() => {
    if (!settled) return;
    if (reduced || firstStage === 'settled') {
      settledV.value = 1;
      return;
    }
    if (settledV.value === 1) return;
    settledV.value = withTiming(1, { duration: 350, easing: EASE_OUT });
    breath.value = withSequence(
      withTiming(1.012, { duration: 170, easing: EASE_OUT }),
      withTiming(1, { duration: 250, easing: EASE_OUT }),
    );
  }, [settled, reduced, firstStage, settledV, breath]);

  // Keep just one: a 4px ring, once, as the drop folds into this card
  const ring = useSharedValue(0);
  React.useEffect(() => {
    if (!pulseKey || reduced) return;
    ring.value = withSequence(
      withTiming(1, { duration: 175, easing: EASE_OUT }),
      withTiming(0, { duration: 325, easing: EASE_OUT }),
    );
  }, [pulseKey, reduced, ring]);
  const ringStyle = useAnimatedStyle(() => ({ opacity: ring.value }));

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: breath.value }] }));
  const tileStyle = useAnimatedStyle(() => ({ transform: [{ scale: tileScale.value }] }));
  const washStyle = useAnimatedStyle(() => ({ opacity: sortedV.value }));
  const iconStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, sortedV.value * 1.8),
    transform: [{ scale: 0.6 + 0.4 * sortedV.value }],
  }));
  const kindWordStyle = useAnimatedStyle(() => ({ opacity: sortedV.value }));
  const laterStyle = useAnimatedStyle(() => ({
    opacity: settledV.value,
    transform: [{ translateY: 3 * (1 - settledV.value) }],
  }));

  // the card has been seen settled: a place that arrives now fades in alone
  const [settledSeen, setSettledSeen] = React.useState(settled);
  React.useEffect(() => {
    if (settled) setSettledSeen(true);
  }, [settled]);

  const placeText = settled && place?.text ? place.text : null;
  const label = [
    stopped && !sorted
      ? rawTitle
      : cardAccessibilityLabel(kind, sorted ? title : rawTitle, meta, stage),
    placeText,
  ]
    .filter(Boolean)
    .join('. ');
  const talk = settled && !!onTalk;
  const hasBelow = !!(dupeLine || footer || askStrip || talk);

  const card = (
    <Reanimated.View style={[styles.card, cardStyle, style]}>
      <Reanimated.View pointerEvents="none" style={[styles.ring, ringStyle]} />
      <Pressable
        onPress={onPress}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityActions={
          placeText && place?.onPress
            ? [{ name: 'place', label: 'Change where it lives' }]
            : undefined
        }
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'place') place?.onPress?.();
        }}
        style={[styles.row, hasBelow && styles.rowAbove]}
      >
        <Reanimated.View style={[styles.tile, tileStyle]} testID="drop-card-tile">
          <Reanimated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              styles.tileWash,
              { backgroundColor: colors.wash },
              washStyle,
            ]}
          />
          {sorted ? (
            <Reanimated.View style={iconStyle} testID={`drop-card-icon-${kind}`}>
              <KindIcon kind={kind} draw={drawIcon} reduced={reduced} />
            </Reanimated.View>
          ) : (
            <CatchDot reduced={reduced || stopped} />
          )}
        </Reanimated.View>

        <View style={styles.body}>
          <CardTitle text={sorted ? title : rawTitle} raw={!sorted} reduced={reduced} />

          <View style={styles.meta} testID="drop-card-meta">
            {!sorted && stopped ? null : !sorted ? (
              <View style={styles.wait} testID="drop-card-wait">
                <WaitDot delay={0} reduced={reduced} />
                <WaitDot delay={150} reduced={reduced} />
                <WaitDot delay={300} reduced={reduced} />
              </View>
            ) : (
              <>
                <Reanimated.Text
                  style={[styles.metaText, styles.kindWord, { color: colors.ink }, kindWordStyle]}
                  testID="drop-card-kind-word"
                >
                  {KIND_WORDS[kind]}
                </Reanimated.Text>
                {settled
                  ? meta.map((part) => {
                      const Icon = part.icon ? META_ICONS[part.icon] : null;
                      return (
                        <Reanimated.View
                          key={part.key}
                          style={[styles.metaPart, laterStyle]}
                          testID={`drop-card-meta-${part.key}`}
                        >
                          {Icon ? <Icon size={13} strokeWidth={2.2} color={C.muted} /> : null}
                          <Text style={styles.metaText}>{part.text}</Text>
                        </Reanimated.View>
                      );
                    })
                  : null}
                {placeText ? (
                  <PlacePart
                    text={placeText}
                    onPress={place?.onPress}
                    late={settledSeen && !reduced}
                    style={laterStyle}
                  />
                ) : null}
              </>
            )}
          </View>
        </View>
      </Pressable>
      {/* Under the body, beside the card's own tap rather than inside it, so each
          answer is a button of its own (and for VoiceOver), and a tap on the
          strip never opens the item */}
      {hasBelow ? (
        <View style={styles.below}>
          {dupeLine}
          {footer}
          {askStrip}
          {talk ? (
            <Reanimated.View style={laterStyle}>
              <Pressable
                onPress={onTalk}
                style={styles.talk}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Talk it through with Gremly"
                testID={talkTestID}
              >
                <Text style={styles.talkText}>Talk it through with Gremly</Text>
                <ChevronRight size={16} strokeWidth={2} color={C.moss} />
              </Pressable>
            </Reanimated.View>
          ) : null}
        </View>
      ) : null}
    </Reanimated.View>
  );
  if (!splitBar) return card;
  return (
    <View>
      {card}
      {splitBar}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.08)',
    shadowColor: '#1A3328',
    shadowOpacity: 0.08,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingTop: 12,
    paddingRight: 14,
    paddingBottom: 12,
    paddingLeft: 12,
  },
  // the row's own bottom padding moves under whatever sits below it
  rowAbove: { paddingBottom: 0 },
  // under the body column: the card's left padding, the tile and the gap
  below: { paddingLeft: 12 + 38 + 12, paddingRight: 14, paddingBottom: 12 },
  tile: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.linen2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tileWash: { borderRadius: 12 },
  catch: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.moss },
  body: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 15.5,
    lineHeight: 21,
    color: C.forest,
  },
  rawTitle: { color: C.raw },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  meta: {
    marginTop: 3,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 10,
    rowGap: 2,
    minHeight: 19,
  },
  metaPart: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    lineHeight: 19,
    color: C.muted,
  },
  kindWord: { fontFamily: 'Inter-SemiBold' },
  wait: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 19 },
  talk: {
    marginTop: 10,
    paddingTop: 9,
    minHeight: 32,
    borderTopWidth: 1,
    borderTopColor: 'rgba(46,85,64,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  talkText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13.5,
    color: C.moss,
  },
  waitDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.sage },
  ring: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: 'rgba(46,85,64,0.14)',
  },
});

export default DropCard;
