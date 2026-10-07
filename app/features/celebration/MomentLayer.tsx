/**
 * MomentLayer: the fed moment and the age up, drawn at the root over the
 * tab bar. The controller owns the clock and tells this layer which phase it
 * is in; this layer only draws. Spec: the celebrations build plan and
 * prototype version 3 (Claude outputs/celebrations-prototype.html).
 *
 * Two kinds of host. When the Gremly home is on screen it hosts the wash
 * under its box (FedWash) and tells the controller where the box starts, so
 * this layer only grows the cover down over the box and the tab bar at the
 * charge. Anywhere else (the card deck, Today) there is no host, and this
 * layer does the whole rise from the bottom itself.
 */

/* eslint-disable react-hooks/immutability */
// Reanimated shared values are mutated through .value by design

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import LottieView, { type AnimationObject } from 'lottie-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import celebrationController, { type MomentPhase, type MomentState } from './CelebrationController';
import { BRAND } from '../../../design/brand';
import { recolorLottieJson } from '../../../lib/constants/gremlyPalettes';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import {
  AGE_KICKER,
  CARD_LABEL,
  FED_KICKER,
  HOOK_LINE,
  KEEP_GOING,
} from '../../../lib/speech/momentWords';
import { recordFrom } from '../../../lib/moment/record';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PARTY_GREEN = require('../../../assets/lottie/character3_P_CELEB_B.json');

const LINEN = BRAND.colors.linenCream;
const MOSS = BRAND.colors.mossGreen;
const FOREST = BRAND.colors.deepForest;
const PEAR_INK = '#6E5413';
const WASH: [string, string, string] = ['#C9DFC9', '#9CC4A3', '#5E9E6C'];
const BRIGHT: [string, string] = ['#CFE2CF', LINEN];
const BIT_COLORS = ['#9CA6E0', '#E0C47A', '#BFD8C0', '#2E5540'];

const OUT = Easing.bezier(0.2, 0.8, 0.2, 1);
const IN = Easing.bezier(0.6, 0, 0.8, 0.4);
const POP = Easing.bezier(0.2, 0.9, 0.3, 1.4);

const AGE_PHASES: MomentPhase[] = [
  'charge',
  'hop',
  'merge',
  'burst',
  'land',
  'line',
  'card',
  'record',
  'dots',
  'go',
];

/** Falling bits (18) and the bits flung from the number (16), fixed so a replay looks the same. */
const FALLING = Array.from({ length: 18 }, (_, n) => ({
  left: 4 + ((n * 37) % 92),
  color: BIT_COLORS[n % 4],
  delay: Math.round(((n * 0.11) % 1.2) * 1000),
}));
const FLUNG = Array.from({ length: 16 }, (_, n) => {
  const a = (n / 16) * Math.PI * 2 + 0.2;
  const r = 95 + ((n * 53) % 80);
  return {
    dx: Math.round(Math.cos(a) * r),
    dy: Math.round(Math.sin(a) * r * 0.8),
    color: BIT_COLORS[(n + 1) % 4],
    delay: Math.round(((n * 0.017) % 0.1) * 1000),
  };
});

export function MomentLayer() {
  const [moment, setMoment] = useState<MomentState | null>(null);
  const [mounted, setMounted] = useState(false);
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [hostTop, setHostTop] = useState<number | null>(null);
  const endTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return celebrationController.subscribe((payload) => {
      if (payload.kind !== 'moment' || !payload.moment) return;
      const m = payload.moment;
      if (m.phase === 'start') {
        setHostTop(celebrationController.getWashHostTop());
        if (endTimer.current) {
          clearTimeout(endTimer.current);
          endTimer.current = null;
        }
        setMounted(true);
      }
      setMoment(m);
    });
  }, []);

  if (!mounted || !moment) return null;
  return (
    <Moment
      key={moment.id}
      moment={moment}
      hostTop={hostTop}
      width={W}
      height={H}
      insetTop={insets.top}
      insetBottom={insets.bottom}
      onGone={() => {
        setMounted(false);
        setMoment(null);
      }}
    />
  );
}

interface MomentProps {
  moment: MomentState;
  hostTop: number | null;
  width: number;
  height: number;
  insetTop: number;
  insetBottom: number;
  onGone: () => void;
}

function Moment({
  moment,
  hostTop,
  width: W,
  height: H,
  insetTop,
  insetBottom,
  onGone,
}: MomentProps) {
  const { phase, day, reducedMotion: rm, ageOnly } = moment;
  const d = (ms: number) => (rm ? 0 : ms);
  const hosted = hostTop !== null && hostTop > 0 && hostTop < H && !ageOnly;
  const cut = hosted ? (hostTop as number) : 0;

  const gremlyColor = useGremlyStore((s) => s.gremlyColor);
  const partySource = useMemo(
    () => recolorLottieJson(PARTY_GREEN, gremlyColor) as AnimationObject,
    [gremlyColor],
  );
  const fedDays = useGremlyStore((s) => s.fedDays);
  const gremlyAge = useGremlyStore((s) => s.gremlyAge);
  const fedDaysCount = useGremlyStore((s) => s.fedDaysCount);
  const accountCreatedAt = useGremlyStore((s) => s.accountCreatedAt);
  const record = useMemo(
    () => recordFrom({ fedDays, age: gremlyAge, fedDaysCount, accountCreatedAt }),
    [fedDays, gremlyAge, fedDaysCount, accountCreatedAt],
  );

  // layout, from the prototype's 844 point frame
  const FED_TOP = Math.round(H * 0.289);
  const GREMLY_TOP = Math.max(insetTop - 6, 12);
  const LINE_TOP = Math.round(H * 0.483);
  const CARD_TOP = Math.round(H * 0.555);
  const RECORD_TOP = Math.round(H * 0.705);
  const DOTS_TOP = Math.round(H * 0.79);
  const [dotsCenter, setDotsCenter] = useState(Math.round(H * 0.344) + 54);
  const numberTop = dotsCenter - 54;

  // shared values
  const layerOpacity = useSharedValue(1);
  const coverHeight = useSharedValue(0);
  const bright = useSharedValue(0);
  const fedOpacity = useSharedValue(0);
  const wordsOpacity = useSharedValue(1);
  const wordsLift = useSharedValue(0);
  const dotScale = [useSharedValue(1), useSharedValue(1), useSharedValue(1)];
  const dotShift = [useSharedValue(0), useSharedValue(0), useSharedValue(0)];
  const dotsOpacity = useSharedValue(1);
  const gremlyOpacity = useSharedValue(0);
  const gremlyY = useSharedValue(26);
  const gremlyScale = useSharedValue(0.86);
  const kickerOpacity = useSharedValue(0);
  const numOpacity = useSharedValue(0);
  const numScale = useSharedValue(0.3);
  const oldY = useSharedValue(0);
  const newY = useSharedValue(132);
  const oldOpacity = useSharedValue(1);
  const flashOpacity = useSharedValue(0);
  const flashScale = useSharedValue(0.4);
  const flung = useSharedValue(0);
  const falling = useSharedValue(0);
  const lineOpacity = useSharedValue(0);
  const cardOpacity = useSharedValue(0);
  const recordOpacity = useSharedValue(0);
  const nextOpacity = useSharedValue(0);
  const goOpacity = useSharedValue(0);

  const coverTarget = hosted ? H - cut : H;

  // the beats, as the controller calls them
  useEffect(() => {
    switch (phase) {
      case 'wash':
        if (!hosted) coverHeight.value = withTiming(H, { duration: d(900), easing: OUT });
        break;
      case 'text':
        fedOpacity.value = withTiming(1, { duration: d(300) });
        dotScale[day - 1].value = withSequence(
          withTiming(0.5, { duration: 0 }),
          withTiming(1.35, { duration: d(300), easing: POP }),
          withTiming(1, { duration: d(200) }),
        );
        break;
      case 'fall':
        fedOpacity.value = withTiming(0, { duration: d(300) });
        if (!hosted) coverHeight.value = withTiming(0, { duration: d(600), easing: IN });
        break;
      case 'bubble':
        // a fed day's hosts keep the tint and the bubble; this layer is done
        layerOpacity.value = withTiming(0, { duration: d(250) });
        break;
      case 'charge':
        wordsOpacity.value = withTiming(0, { duration: d(300) });
        wordsLift.value = withTiming(-14, { duration: d(350) });
        for (const s of dotScale) {
          s.value = withSequence(
            withTiming(1.3, { duration: d(140) }),
            withTiming(1, { duration: d(210) }),
          );
        }
        coverHeight.value = withTiming(coverTarget, { duration: d(600), easing: OUT });
        break;
      case 'hop':
        bright.value = withTiming(1, { duration: d(800) });
        gremlyOpacity.value = withTiming(1, { duration: d(400) });
        gremlyY.value = withSequence(
          withTiming(-6, { duration: d(660), easing: OUT }),
          withTiming(0, { duration: d(440) }),
        );
        gremlyScale.value = withSequence(
          withTiming(1.03, { duration: d(660), easing: OUT }),
          withTiming(1, { duration: d(440) }),
        );
        break;
      case 'merge':
        dotShift[0].value = withTiming(22, { duration: d(500), easing: OUT });
        dotShift[2].value = withTiming(-22, { duration: d(500), easing: OUT });
        for (const s of dotScale) s.value = withTiming(0.6, { duration: d(500), easing: OUT });
        break;
      case 'burst':
        dotsOpacity.value = withTiming(0, { duration: d(120) });
        numOpacity.value = withTiming(1, { duration: d(200) });
        numScale.value = withSequence(
          withTiming(1.1, { duration: d(360), easing: POP }),
          withTiming(1, { duration: d(290) }),
        );
        oldY.value = withDelay(d(100), withTiming(-132, { duration: d(500), easing: POP }));
        oldOpacity.value = withDelay(d(100), withTiming(0.3, { duration: d(500) }));
        newY.value = withDelay(d(100), withTiming(0, { duration: d(500), easing: POP }));
        kickerOpacity.value = withDelay(d(100), withTiming(1, { duration: d(300) }));
        break;
      case 'land':
        if (!rm) {
          flashOpacity.value = withSequence(
            withTiming(0.95, { duration: 0 }),
            withTiming(0, { duration: 600 }),
          );
          flashScale.value = withSequence(
            withTiming(0.4, { duration: 0 }),
            withTiming(9, { duration: 600, easing: Easing.out(Easing.quad) }),
          );
          flung.value = withTiming(1, { duration: 1000, easing: Easing.bezier(0.1, 0.8, 0.3, 1) });
          falling.value = withTiming(1, {
            duration: 2800,
            easing: Easing.bezier(0.3, 0.1, 0.5, 1),
          });
        }
        gremlyScale.value = rm ? 1.1 : withSpring(1.1, { damping: 9, stiffness: 160 });
        break;
      case 'line':
        lineOpacity.value = withTiming(1, { duration: d(350) });
        break;
      case 'card':
        cardOpacity.value = withTiming(1, { duration: d(350) });
        break;
      case 'record':
        recordOpacity.value = withTiming(1, { duration: d(350) });
        break;
      case 'dots':
        nextOpacity.value = withTiming(1, { duration: d(350) });
        break;
      case 'go':
        goOpacity.value = withTiming(1, { duration: d(350) });
        break;
      case 'end':
        layerOpacity.value = withTiming(0, { duration: d(350) });
        break;
      default:
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // once the layer has faded, it unmounts
  useEffect(() => {
    if (phase !== 'end' && phase !== 'bubble') return;
    const t = setTimeout(onGone, d(400) + 20);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const layerStyle = useAnimatedStyle(() => ({ opacity: layerOpacity.value }));
  const coverStyle = useAnimatedStyle(() => ({ height: coverHeight.value }));
  const brightStyle = useAnimatedStyle(() => ({ opacity: bright.value }));
  const fedStyle = useAnimatedStyle(() => ({ opacity: fedOpacity.value }));
  const wordsStyle = useAnimatedStyle(() => ({
    opacity: wordsOpacity.value,
    transform: [{ translateY: wordsLift.value }],
  }));
  const dotsStyle = useAnimatedStyle(() => ({ opacity: dotsOpacity.value }));
  const dot0 = useAnimatedStyle(() => ({
    transform: [{ translateX: dotShift[0].value }, { scale: dotScale[0].value }],
  }));
  const dot1 = useAnimatedStyle(() => ({
    transform: [{ translateX: dotShift[1].value }, { scale: dotScale[1].value }],
  }));
  const dot2 = useAnimatedStyle(() => ({
    transform: [{ translateX: dotShift[2].value }, { scale: dotScale[2].value }],
  }));
  const dotStyles = [dot0, dot1, dot2];
  const gremlyStyle = useAnimatedStyle(() => ({
    opacity: gremlyOpacity.value,
    transform: [{ translateY: gremlyY.value }, { scale: gremlyScale.value }],
  }));
  const kickerStyle = useAnimatedStyle(() => ({ opacity: kickerOpacity.value }));
  const numStyle = useAnimatedStyle(() => ({
    opacity: numOpacity.value,
    transform: [{ scale: numScale.value }],
  }));
  const oldStyle = useAnimatedStyle(() => ({
    opacity: oldOpacity.value,
    transform: [{ translateY: oldY.value }],
  }));
  const newStyle = useAnimatedStyle(() => ({ transform: [{ translateY: newY.value }] }));
  const flashStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
    transform: [{ scale: flashScale.value }],
  }));
  const lineStyle = useAnimatedStyle(() => ({
    opacity: lineOpacity.value,
    transform: [{ translateY: (1 - lineOpacity.value) * 6 }],
  }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: (1 - cardOpacity.value) * 8 }],
  }));
  const recordStyle = useAnimatedStyle(() => ({ opacity: recordOpacity.value }));
  const nextStyle = useAnimatedStyle(() => ({ opacity: nextOpacity.value }));
  const goStyle = useAnimatedStyle(() => ({
    opacity: goOpacity.value,
    transform: [{ translateY: (1 - goOpacity.value) * 8 }],
  }));

  const onDotsLayout = useCallback(
    (e: { nativeEvent: { layout: { y: number; height: number } } }) => {
      const { y, height } = e.nativeEvent.layout;
      setDotsCenter(Math.round(FED_TOP + y + height / 2));
    },
    [FED_TOP],
  );

  const inAgeUp = AGE_PHASES.includes(phase);
  const canLeave = phase === 'go';
  const showFed = !ageOnly;
  const nextAgeText = moment.nextAge !== null ? String(moment.nextAge) : String(moment.age + 1);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.layer, layerStyle]}
      pointerEvents={canLeave ? 'auto' : 'none'}
    >
      {/* the cover: grows from the box's top when hosted, from the bottom otherwise */}
      <Animated.View
        style={[styles.cover, hosted ? { top: cut } : { bottom: 0 }, coverStyle]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={WASH}
          locations={[0, 0.48, 1]}
          style={[styles.gradient, { height: H }, hosted ? { top: -cut } : { bottom: 0 }]}
        />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, brightStyle]} pointerEvents="none">
        <LinearGradient colors={BRIGHT} locations={[0, 0.58]} style={StyleSheet.absoluteFill} />
      </Animated.View>

      {/* tap anywhere once Keep going is up */}
      {canLeave ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => celebrationController.endMoment()}
          accessibilityLabel={KEEP_GOING}
        />
      ) : null}

      {/* the falling bits and the flung bits */}
      {inAgeUp && !rm ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {FALLING.map((b, i) => (
            <FallingBit
              key={i}
              left={(b.left / 100) * W}
              color={b.color}
              delay={b.delay}
              progress={falling}
            />
          ))}
          {FLUNG.map((b, i) => (
            <FlungBit
              key={i}
              x={W / 2}
              y={dotsCenter}
              dx={b.dx}
              dy={b.dy}
              color={b.color}
              delay={b.delay}
              progress={flung}
            />
          ))}
          <Animated.View
            style={[styles.flash, { left: W / 2 - 20, top: dotsCenter - 20 }, flashStyle]}
          />
        </View>
      ) : null}

      {/* the fed block: kicker, his line, the dots, the count */}
      {showFed ? (
        <Animated.View style={[styles.fedBlock, { top: FED_TOP }, fedStyle]} pointerEvents="none">
          <Animated.Text style={[styles.kicker, wordsStyle]}>
            {FED_KICKER.toUpperCase()}
          </Animated.Text>
          <Animated.Text style={[styles.hero, wordsStyle]}>{moment.line}</Animated.Text>
          <Animated.View style={[styles.dots, dotsStyle]} onLayout={onDotsLayout}>
            {[0, 1, 2].map((i) => (
              <Animated.View
                key={i}
                style={[styles.dot, i < day ? styles.dotOn : null, dotStyles[i]]}
              />
            ))}
          </Animated.View>
          <Animated.Text style={[styles.count, wordsStyle]}>{moment.count}</Animated.Text>
        </Animated.View>
      ) : null}

      {/* the age up */}
      {inAgeUp ? (
        <>
          <Animated.View
            style={[styles.gremly, { top: GREMLY_TOP, left: W / 2 - 83 }, gremlyStyle]}
            pointerEvents="none"
          >
            <LottieView
              source={partySource}
              autoPlay
              loop
              style={styles.gremlyLottie}
              renderMode="SOFTWARE"
            />
          </Animated.View>
          <Animated.Text style={[styles.ageKicker, { top: numberTop - 36 }, kickerStyle]}>
            {AGE_KICKER.toUpperCase()}
          </Animated.Text>
          <Animated.View
            style={[styles.numWrap, { top: numberTop }, numStyle]}
            pointerEvents="none"
          >
            <View style={styles.numClip}>
              <Animated.Text style={[styles.num, oldStyle]}>{String(moment.age)}</Animated.Text>
              <Animated.Text style={[styles.num, styles.numNew, newStyle]}>
                {nextAgeText}
              </Animated.Text>
            </View>
          </Animated.View>
          <Animated.Text style={[styles.line, { top: LINE_TOP }, lineStyle]}>
            {moment.ageLine ?? ''}
          </Animated.Text>
          <Animated.View
            style={[styles.cardWrap, { top: CARD_TOP }, cardStyle]}
            pointerEvents="none"
          >
            <View style={styles.card}>
              <View style={styles.cardLabelRow}>
                <View style={styles.cardLabelDot} />
                <Text style={styles.cardLabel}>{CARD_LABEL.toUpperCase()}</Text>
              </View>
              <Text style={styles.cardText}>{moment.card}</Text>
            </View>
          </Animated.View>
          <Animated.View
            style={[styles.record, { top: RECORD_TOP }, recordStyle]}
            pointerEvents="none"
          >
            <RecordFigure value={String(record.fedDays)} label="fed days" />
            <RecordFigure value={String(record.bestRun)} label="best run" />
            {record.since ? <RecordFigure value={record.since} label="with you since" /> : null}
          </Animated.View>
          <Animated.View style={[styles.next, { top: DOTS_TOP }, nextStyle]} pointerEvents="none">
            <View style={styles.dots}>
              <View style={[styles.dot, styles.dotEmpty]} />
              <View style={[styles.dot, styles.dotEmpty]} />
              <View style={[styles.dot, styles.dotEmpty]} />
            </View>
            <Text style={styles.hook}>{HOOK_LINE}</Text>
          </Animated.View>
          <Animated.View
            style={[styles.go, { bottom: insetBottom + 10 }, goStyle]}
            pointerEvents={canLeave ? 'auto' : 'none'}
          >
            <Pressable
              style={({ pressed }) => [styles.goButton, pressed && styles.goPressed]}
              onPress={() => celebrationController.endMoment()}
              accessibilityRole="button"
              accessibilityLabel={KEEP_GOING}
              testID="moment-keep-going"
            >
              <Text style={styles.goText}>{KEEP_GOING}</Text>
            </Pressable>
          </Animated.View>
        </>
      ) : null}
    </Animated.View>
  );
}

function RecordFigure({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.figure}>
      <Text style={styles.figureValue}>{value}</Text>
      <Text style={styles.figureLabel}>{label}</Text>
    </View>
  );
}

function FallingBit({
  left,
  color,
  delay,
  progress,
}: {
  left: number;
  color: string;
  delay: number;
  progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, (progress.value * 2800 - delay) / 2800));
    const opacity = p <= 0 ? 0 : p < 0.12 ? p / 0.12 : 1 - (p - 0.12) / 0.88;
    return {
      opacity: Math.max(0, opacity * 0.95),
      transform: [{ translateY: p * 560 }, { rotate: `${45 + p * 180}deg` }],
    };
  });
  return <Animated.View style={[styles.bit, { left, backgroundColor: color }, style]} />;
}

function FlungBit({
  x,
  y,
  dx,
  dy,
  color,
  delay,
  progress,
}: {
  x: number;
  y: number;
  dx: number;
  dy: number;
  color: string;
  delay: number;
  progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, (progress.value * 1000 - delay) / 1000));
    return {
      opacity: progress.value === 0 ? 0 : 1 - p,
      transform: [
        { translateX: dx * p },
        { translateY: dy * p },
        { rotate: `${p * 260}deg` },
        { scale: 1 - p * 0.5 },
      ],
    };
  });
  return (
    <Animated.View
      style={[styles.spark, { left: x - 4, top: y - 4, backgroundColor: color }, style]}
    />
  );
}

const styles = StyleSheet.create({
  layer: { zIndex: 9999, elevation: 9999 },
  cover: { position: 'absolute', left: 0, right: 0, overflow: 'hidden' },
  gradient: { position: 'absolute', left: 0, right: 0 },
  fedBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 28,
    gap: 16,
  },
  kicker: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 12.5,
    letterSpacing: 2,
    color: FOREST,
    opacity: 0.75,
  },
  hero: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -0.8,
    color: FOREST,
    textAlign: 'center',
  },
  dots: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 2,
    borderColor: 'rgba(26,51,40,0.35)',
  },
  dotOn: { backgroundColor: FOREST, borderColor: FOREST },
  dotEmpty: { backgroundColor: 'rgba(255,255,255,0.75)', borderColor: 'rgba(46,85,64,0.35)' },
  count: {
    fontFamily: 'Inter-Medium',
    fontSize: 16,
    lineHeight: 22,
    color: FOREST,
    opacity: 0.85,
    textAlign: 'center',
  },
  gremly: { position: 'absolute', width: 166, height: 194 },
  gremlyLottie: { width: 166, height: 194 },
  ageKicker: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 12.5,
    letterSpacing: 2,
    color: PEAR_INK,
  },
  numWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  numClip: {
    height: 108,
    minWidth: 120,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  num: {
    position: 'absolute',
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 100,
    lineHeight: 108,
    letterSpacing: -4,
    color: MOSS,
    includeFontPadding: false,
  },
  numNew: {},
  flash: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  bit: { position: 'absolute', top: -14, width: 10, height: 10, borderRadius: 2 },
  spark: { position: 'absolute', width: 9, height: 9, borderRadius: 2 },
  line: {
    position: 'absolute',
    left: 30,
    right: 30,
    textAlign: 'center',
    fontFamily: 'Inter-Regular',
    fontSize: 18,
    lineHeight: 25,
    color: BRAND.colors.charcoalInk,
  },
  cardWrap: { position: 'absolute', left: 24, right: 24 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.10)',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    ...BRAND.elevation.one,
  },
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 5 },
  cardLabelDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: BRAND.colors.sageMist },
  cardLabel: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 11,
    letterSpacing: 1.3,
    color: PEAR_INK,
  },
  cardText: {
    fontFamily: 'Inter-Regular',
    fontSize: 14.5,
    lineHeight: 21,
    color: BRAND.colors.charcoalInk,
  },
  record: {
    position: 'absolute',
    left: 24,
    right: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 22,
  },
  figure: { alignItems: 'center', gap: 1 },
  figureValue: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 19,
    color: FOREST,
    fontVariant: ['tabular-nums'],
  },
  figureLabel: { fontFamily: 'Inter-Regular', fontSize: 11.5, color: BRAND.colors.inkMuted },
  next: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 9 },
  hook: { fontFamily: 'Inter-Regular', fontSize: 13.5, color: BRAND.colors.inkMuted },
  go: { position: 'absolute', left: 24, right: 24 },
  goButton: {
    height: 50,
    borderRadius: 16,
    backgroundColor: MOSS,
    alignItems: 'center',
    justifyContent: 'center',
    ...BRAND.elevation.two,
  },
  goPressed: { transform: [{ scale: 0.985 }] },
  goText: { fontFamily: 'Inter-SemiBold', fontSize: 16, color: LINEN },
});
