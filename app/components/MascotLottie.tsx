import React, {
  useRef,
  useCallback,
  useState,
  useImperativeHandle,
  forwardRef,
  memo,
  useEffect,
  useMemo,
} from 'react';
import { View, ViewStyle, StyleSheet, Platform } from 'react-native';
import LottieView from 'lottie-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { recolorLottieJson } from '../../lib/constants/gremlyPalettes';

// Lottie sources: 3 animations × 2 colorways (source props NEVER change at runtime)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const IDLE_GREY = require('../../assets/lottie/character1_A.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const IDLE_GREEN = require('../../assets/lottie/character1_B.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const DROP_GREY = require('../../assets/lottie/character2_A.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const DROP_GREEN = require('../../assets/lottie/character2_B.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const FED_GREY = require('../../assets/lottie/character3_A.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const FED_GREEN = require('../../assets/lottie/character3_B.json');

const MASCOT_WIDTH = 95;
const MASCOT_HEIGHT = 111;
const FILL_ANIMATION_DURATION = 1000;

// Character bounds (pixel-measured from rendered frames)
const FILL_OFFSET_BOTTOM = 14;
const FILL_OFFSET_TOP = 10;
const FILL_RANGE = MASCOT_HEIGHT - FILL_OFFSET_TOP - FILL_OFFSET_BOTTOM;

// Edge-compressed fill curve constants
const EDGE_GAUGE_RANGE = 0.1;
const EDGE_FILL_RANGE = 0.2;

function gaugeToFill(gaugeValue: number): number {
  const g = Math.min(Math.max(gaugeValue, 0), 1);
  if (g <= EDGE_GAUGE_RANGE) {
    return (g / EDGE_GAUGE_RANGE) * EDGE_FILL_RANGE;
  }
  if (g >= 1 - EDGE_GAUGE_RANGE) {
    const edgeProgress = (g - (1 - EDGE_GAUGE_RANGE)) / EDGE_GAUGE_RANGE;
    return 1 - EDGE_FILL_RANGE + edgeProgress * EDGE_FILL_RANGE;
  }
  const middleGaugeRange = 1 - 2 * EDGE_GAUGE_RANGE;
  const middleFillRange = 1 - 2 * EDGE_FILL_RANGE;
  const middleProgress = (g - EDGE_GAUGE_RANGE) / middleGaugeRange;
  return EDGE_FILL_RANGE + middleProgress * middleFillRange;
}

type AnimationMode = 'idle' | 'drop' | 'fed';

export type MascotLottieHandle = {
  celebrate: () => void;
  celebrateFed: () => void;
};

type Props = {
  style?: ViewStyle;
  showFullColor?: boolean;
  drainAnimation?: boolean;
  drainVisible?: boolean;
};

const MascotLottieInner = forwardRef<MascotLottieHandle, Props>(
  ({ style, showFullColor = false, drainAnimation = false, drainVisible = false }, ref) => {
    const [mode, setMode] = useState<AnimationMode>('idle');
    const isCelebratingRef = useRef(false);
    const fedPlayCountRef = useRef(0);
    const reduceMotion = useReducedMotion();

    // Refs for green LottieViews
    const greenIdleRef = useRef<LottieView>(null);
    const greenDropRef = useRef<LottieView>(null);
    const greenFedRef = useRef<LottieView>(null);

    // Refs for grey LottieViews
    const greyIdleRef = useRef<LottieView>(null);
    const greyDropRef = useRef<LottieView>(null);
    const greyFedRef = useRef<LottieView>(null);

    // Store subscriptions
    const feedingGaugeValue = useGremlyStore((s) => s.feedingGaugeValue);
    const isFedToday = useGremlyStore((s) => s.isFedToday);
    const gremlyColor = useGremlyStore((s) => s.gremlyColor);

    // Recolor green Lottie sources for the active palette
    const idleColored = useMemo(() => recolorLottieJson(IDLE_GREEN, gremlyColor), [gremlyColor]);
    const dropColored = useMemo(() => recolorLottieJson(DROP_GREEN, gremlyColor), [gremlyColor]);
    const fedColored = useMemo(() => recolorLottieJson(FED_GREEN, gremlyColor), [gremlyColor]);

    // Brief fade to mask animation restart on color change (showFullColor only)
    const prevColorRef = useRef(gremlyColor);
    const fadeOpacity = useSharedValue(1);
    useEffect(() => {
      if (showFullColor && prevColorRef.current !== gremlyColor) {
        prevColorRef.current = gremlyColor;
        fadeOpacity.value = 0.85;
        fadeOpacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
      }
    }, [gremlyColor, showFullColor]);
    const fadeStyle = useAnimatedStyle(() => ({ opacity: fadeOpacity.value }));

    // Drain animation (onboarding step 3): starts full, drains to empty on visibility
    const drainHeight = useSharedValue(MASCOT_HEIGHT);
    const hasDrainedRef = useRef(false);
    useEffect(() => {
      if (drainAnimation && drainVisible && !hasDrainedRef.current) {
        hasDrainedRef.current = true;
        drainHeight.value = MASCOT_HEIGHT;
        drainHeight.value = withDelay(
          800,
          withTiming(FILL_OFFSET_BOTTOM, {
            duration: 2000,
            easing: Easing.inOut(Easing.cubic),
          }),
        );
      }
    }, [drainAnimation, drainVisible]);
    const drainClipStyle = useAnimatedStyle(() => ({ height: drainHeight.value }));

    // Fill height
    const initialClamp = Math.min(Math.max(feedingGaugeValue, 0), 1);
    const initialFill = gaugeToFill(initialClamp);
    const fillHeight = useSharedValue(FILL_OFFSET_BOTTOM + initialFill * FILL_RANGE);

    const isFedShared = useSharedValue(isFedToday ? 1 : 0);

    useEffect(() => {
      isFedShared.value = isFedToday ? 1 : 0;
    }, [isFedToday]);

    useEffect(() => {
      const clampedValue = Math.min(Math.max(feedingGaugeValue, 0), 1);
      const fillPercent = gaugeToFill(clampedValue);
      const target = FILL_OFFSET_BOTTOM + fillPercent * FILL_RANGE;
      fillHeight.value = reduceMotion
        ? target
        : withTiming(target, {
            duration: FILL_ANIMATION_DURATION,
            easing: Easing.out(Easing.cubic),
          });
    }, [feedingGaugeValue]);

    const clipAnimatedStyle = useAnimatedStyle(() => ({
      height: showFullColor
        ? MASCOT_HEIGHT
        : isFedShared.value === 1
          ? MASCOT_HEIGHT
          : fillHeight.value,
    }));

    // Play one-shot animations when mode changes
    useEffect(() => {
      if (mode === 'drop') {
        greenDropRef.current?.reset();
        greenDropRef.current?.play();
        greyDropRef.current?.reset();
        greyDropRef.current?.play();
      } else if (mode === 'fed') {
        greenFedRef.current?.reset();
        greenFedRef.current?.play();
        greyFedRef.current?.reset();
        greyFedRef.current?.play();
      }
    }, [mode]);

    const celebrate = useCallback(() => {
      if (isCelebratingRef.current) return;
      isCelebratingRef.current = true;
      setMode('drop');
    }, []);

    const celebrateFed = useCallback(() => {
      if (isCelebratingRef.current) return;
      isCelebratingRef.current = true;
      fedPlayCountRef.current = 0;
      setMode('fed');
    }, []);

    const handleDropFinish = useCallback(() => {
      if (mode !== 'drop') return;
      isCelebratingRef.current = false;
      setMode('idle');
    }, [mode]);

    const handleFedFinish = useCallback(() => {
      if (mode !== 'fed') return;
      fedPlayCountRef.current += 1;
      if (fedPlayCountRef.current < 2) {
        // Replay: reset and play without changing mode or source
        greenFedRef.current?.reset();
        greenFedRef.current?.play();
        greyFedRef.current?.reset();
        greyFedRef.current?.play();
      } else {
        isCelebratingRef.current = false;
        setMode('idle');
      }
    }, [mode]);

    useImperativeHandle(ref, () => ({ celebrate, celebrateFed }), [celebrate, celebrateFed]);

    const isActive = (m: AnimationMode) => mode === m;

    // ─── Simplified render for onboarding (showFullColor) ───
    if (showFullColor && !drainAnimation) {
      return (
        <Animated.View
          style={[styles.wrapper, style, fadeStyle]}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden={true}
        >
          <LottieView
            source={idleColored}
            autoPlay={!reduceMotion}
            loop={!reduceMotion}
            speed={0.5}
            renderMode="HARDWARE"
            style={styles.lottie}
          />
        </Animated.View>
      );
    }

    // ─── Drain render for onboarding step 3 ───
    if (drainAnimation) {
      return (
        <View
          style={[styles.wrapper, style]}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden={true}
        >
          {/* Grey layer underneath */}
          <LottieView
            source={IDLE_GREY}
            autoPlay={!reduceMotion}
            loop={!reduceMotion}
            speed={0.5}
            renderMode="HARDWARE"
            style={styles.lottie}
          />
          {/* Colored layer clipped by drain */}
          <Animated.View style={[styles.clipContainer, drainClipStyle]}>
            <LottieView
              source={idleColored}
              autoPlay={!reduceMotion}
              loop={!reduceMotion}
              speed={0.5}
              renderMode="HARDWARE"
              style={styles.lottieGreen}
            />
          </Animated.View>
        </View>
      );
    }

    return (
      <View
        style={[styles.wrapper, style]}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden={true}
      >
        {/* ─── GREY LAYER (bottom, hidden when fed or showFullColor) ─── */}
        {!isFedToday && !showFullColor && (
          <View style={styles.greyContainer}>
            <LottieView
              ref={greyIdleRef}
              source={IDLE_GREY}
              autoPlay={!reduceMotion}
              loop={!reduceMotion}
              renderMode="HARDWARE"
              cacheComposition
              style={[styles.lottie, { opacity: isActive('idle') ? 1 : 0 }]}
            />
            <LottieView
              ref={greyDropRef}
              source={DROP_GREY}
              autoPlay={false}
              loop={false}
              renderMode="HARDWARE"
              cacheComposition
              style={[styles.lottie, { opacity: isActive('drop') ? 1 : 0 }]}
            />
            <LottieView
              ref={greyFedRef}
              source={FED_GREY}
              autoPlay={false}
              loop={false}
              renderMode="HARDWARE"
              cacheComposition
              style={[styles.lottie, { opacity: isActive('fed') ? 1 : 0 }]}
            />
          </View>
        )}

        {/* ─── GREEN LAYER (top, clipped from bottom up) ─── */}
        <Animated.View style={[styles.clipContainer, clipAnimatedStyle]}>
          <LottieView
            ref={greenIdleRef}
            source={idleColored}
            autoPlay={!reduceMotion}
            loop={!reduceMotion}
            renderMode="HARDWARE"
            cacheComposition
            style={[styles.lottieGreen, { opacity: isActive('idle') ? 1 : 0 }]}
          />
          <LottieView
            ref={greenDropRef}
            source={dropColored}
            autoPlay={false}
            loop={false}
            onAnimationFinish={handleDropFinish}
            renderMode="HARDWARE"
            cacheComposition
            style={[styles.lottieGreen, { opacity: isActive('drop') ? 1 : 0 }]}
          />
          <LottieView
            ref={greenFedRef}
            source={fedColored}
            autoPlay={false}
            loop={false}
            onAnimationFinish={handleFedFinish}
            renderMode="HARDWARE"
            cacheComposition
            style={[styles.lottieGreen, { opacity: isActive('fed') ? 1 : 0 }]}
          />
        </Animated.View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  wrapper: {
    width: MASCOT_WIDTH,
    height: MASCOT_HEIGHT,
    position: 'relative',
  },
  greyContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: MASCOT_WIDTH,
    height: MASCOT_HEIGHT,
  },
  lottie: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: MASCOT_WIDTH,
    height: MASCOT_HEIGHT,
  },
  clipContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: MASCOT_WIDTH,
    overflow: 'hidden',
  },
  lottieGreen: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: MASCOT_WIDTH,
    height: MASCOT_HEIGHT,
  },
});

export default memo(MascotLottieInner);
