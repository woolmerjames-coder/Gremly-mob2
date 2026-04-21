import React, { useRef, useCallback, memo, useEffect, useMemo } from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
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
import { recolorLottieJson, GREMLY_PALETTES } from '../../lib/constants/gremlyPalettes';
import type { AnimationMode } from '../../lib/types';
import { useMascotMode } from '../../contexts/MascotModeContext';

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

// NEW — Waving (grey + colored, gauge-visible)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const WAVING_GREY = require('../../assets/lottie/character1_WAVING_A.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const WAVING_GREEN = require('../../assets/lottie/character1_WAVING_B.json');

// NEW — Falling asleep (grey + colored, gauge-visible)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const FALL_ASLEEP_GREY = require('../../assets/lottie/character4_F_ASLEEP_A.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const FALL_ASLEEP_GREEN = require('../../assets/lottie/character4_F_ASLEEP_B.json');

// NEW — Sleeping loop (grey + colored, gauge-visible)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SLEEPING_GREY = require('../../assets/lottie/character5_SLEEPING_A.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SLEEPING_GREEN = require('../../assets/lottie/character5_SLEEPING_B.json');

// NEW — Waking up (grey + colored, gauge-visible)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const WAKE_UP_GREY = require('../../assets/lottie/character6_W_UP_A.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const WAKE_UP_GREEN = require('../../assets/lottie/character6_W_UP_B.json');

// Intrinsic dimensions of the mascot Lottie artwork. All render sizing
// scales proportionally from these reference values.
const INTRINSIC_WIDTH = 95;
const INTRINSIC_HEIGHT = 111;
const INTRINSIC_FILL_OFFSET_BOTTOM = 14;
const INTRINSIC_FILL_OFFSET_TOP = 10;
const FILL_ANIMATION_DURATION = 1000;

function makeStyles(renderWidth: number, renderHeight: number) {
  return StyleSheet.create({
    wrapper: {
      width: renderWidth,
      height: renderHeight,
      position: 'relative',
    },
    greyContainer: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: renderWidth,
      height: renderHeight,
    },
    lottie: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: renderWidth,
      height: renderHeight,
    },
    clipContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      width: renderWidth,
      overflow: 'hidden',
    },
    lottieGreen: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      width: renderWidth,
      height: renderHeight,
    },
  });
}

// Module-level cache for recolored Lottie JSON (preserves object identity across renders)
const recolorCache = new Map<string, object>();
function getCachedRecolor(source: object, key: string, paletteId: string): any {
  const cacheKey = `${key}:${paletteId}`;
  let cached = recolorCache.get(cacheKey);
  if (!cached) {
    cached = recolorLottieJson(source, paletteId);
    recolorCache.set(cacheKey, cached);
  }
  return cached;
}

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

type Props = {
  /** Controlled animation mode – when supplied the component is fully controlled. */
  mode?: AnimationMode;
  style?: ViewStyle;
  showFullColor?: boolean;
  drainAnimation?: boolean;
  drainVisible?: boolean;
  animationOverride?: AnimationMode;
  /**
   * Render width in px. Height and fill offsets scale proportionally from
   * the intrinsic 95x111 mascot artwork. Defaults to 95 (intrinsic size).
   */
  width?: number;
};

const MascotLottieInner = ({
  mode: modeProp,
  style,
  showFullColor = false,
  drainAnimation = false,
  drainVisible = false,
  animationOverride,
  width,
}: Props) => {
  // Derive render dimensions from the width prop. All offsets scale uniformly
  // from the artwork's intrinsic size so the gauge fill stays anatomically
  // correct at any size.
  const renderWidth = width ?? INTRINSIC_WIDTH;
  const scale = renderWidth / INTRINSIC_WIDTH;
  const renderHeight = INTRINSIC_HEIGHT * scale;
  const fillOffsetBottom = INTRINSIC_FILL_OFFSET_BOTTOM * scale;
  const fillOffsetTop = INTRINSIC_FILL_OFFSET_TOP * scale;
  const fillRange = renderHeight - fillOffsetTop - fillOffsetBottom;
  const styles = useMemo(() => makeStyles(renderWidth, renderHeight), [renderWidth, renderHeight]);

  // Context-provided mode as fallback when no explicit prop is passed
  const { mode: contextMode, signalAnimationFinish } = useMascotMode();
  const mode: AnimationMode = modeProp ?? contextMode ?? 'idle';
  const fedPlayCountRef = useRef(0);
  const reduceMotion = useReducedMotion();

  // Only fed needs a ref (for 2× replay via reset+play)
  const greenFedRef = useRef<LottieView>(null);

  // Store subscriptions
  const feedingGaugeValue = useGremlyStore((s) => s.feedingGaugeValue);
  const isFedToday = useGremlyStore((s) => s.isFedToday);
  const gremlyColor = useGremlyStore((s) => s.gremlyColor);

  // Pre-compute all palette variants of idle animation once (stable sources, no remount)
  const allIdleVariants = useMemo(
    () =>
      GREMLY_PALETTES.map((p) => ({
        id: p.id,
        source: recolorLottieJson(IDLE_GREEN, p.id) as any,
      })),
    [],
  );

  // Recolor green Lottie sources for the active palette (stable refs on repeat selections)
  const idleColored = useMemo(
    () => getCachedRecolor(IDLE_GREEN, 'idle', gremlyColor),
    [gremlyColor],
  );
  const dropColored = useMemo(
    () => getCachedRecolor(DROP_GREEN, 'drop', gremlyColor),
    [gremlyColor],
  );
  const fedColored = useMemo(() => getCachedRecolor(FED_GREEN, 'fed', gremlyColor), [gremlyColor]);
  const wavingColored = useMemo(
    () => getCachedRecolor(WAVING_GREEN, 'waving', gremlyColor),
    [gremlyColor],
  );
  const fallAsleepColored = useMemo(
    () => getCachedRecolor(FALL_ASLEEP_GREEN, 'fallAsleep', gremlyColor),
    [gremlyColor],
  );
  const sleepingColored = useMemo(
    () => getCachedRecolor(SLEEPING_GREEN, 'sleeping', gremlyColor),
    [gremlyColor],
  );
  const wakeUpColored = useMemo(
    () => getCachedRecolor(WAKE_UP_GREEN, 'wakeUp', gremlyColor),
    [gremlyColor],
  );

  // Drain animation (onboarding step 3): starts full, drains to empty on visibility
  const drainHeight = useSharedValue(renderHeight);
  const hasDrainedRef = useRef(false);
  useEffect(() => {
    if (drainAnimation && drainVisible && !hasDrainedRef.current) {
      hasDrainedRef.current = true;
      drainHeight.value = renderHeight;
      drainHeight.value = withDelay(
        800,
        withTiming(fillOffsetBottom, {
          duration: 2000,
          easing: Easing.inOut(Easing.cubic),
        }),
      );
    }
  }, [drainAnimation, drainVisible, fillOffsetBottom, renderHeight]);
  const drainClipStyle = useAnimatedStyle(() => ({ height: drainHeight.value }));

  // Fill height
  const initialClamp = Math.min(Math.max(feedingGaugeValue, 0), 1);
  const initialFill = gaugeToFill(initialClamp);
  const fillHeight = useSharedValue(fillOffsetBottom + initialFill * fillRange);

  const isFedShared = useSharedValue(isFedToday ? 1 : 0);
  const isFedAnimating = useSharedValue(0);

  useEffect(() => {
    isFedShared.value = isFedToday ? 1 : 0;
  }, [isFedToday]);

  useEffect(() => {
    isFedAnimating.value = mode === 'fed' ? 1 : 0;
  }, [mode]);

  useEffect(() => {
    if (mode === 'fed') {
      fedPlayCountRef.current = 0;
    }
  }, [mode]);

  useEffect(() => {
    const clampedValue = Math.min(Math.max(feedingGaugeValue, 0), 1);
    const fillPercent = gaugeToFill(clampedValue);
    const target = fillOffsetBottom + fillPercent * fillRange;
    fillHeight.value = reduceMotion
      ? target
      : withTiming(target, {
          duration: FILL_ANIMATION_DURATION,
          easing: Easing.out(Easing.cubic),
        });
  }, [feedingGaugeValue, fillOffsetBottom, fillRange, reduceMotion]);

  const clipAnimatedStyle = useAnimatedStyle(() => ({
    height: showFullColor
      ? renderHeight
      : isFedShared.value === 1 || isFedAnimating.value === 1
        ? renderHeight
        : fillHeight.value,
  }));

  const handleDropFinish = useCallback(() => {
    signalAnimationFinish('drop');
  }, [signalAnimationFinish]);

  const handleFedFinish = useCallback(() => {
    fedPlayCountRef.current += 1;
    if (fedPlayCountRef.current < 2) {
      // Replay the fed animation a second time via the Lottie ref.
      greenFedRef.current?.reset();
      greenFedRef.current?.play();
    } else {
      signalAnimationFinish('fed');
    }
  }, [signalAnimationFinish]);

  const onDropFinish = useCallback(
    (isCancelled: boolean) => {
      if (!isCancelled) handleDropFinish();
    },
    [handleDropFinish],
  );

  const onFedFinish = useCallback(
    (isCancelled: boolean) => {
      if (!isCancelled) handleFedFinish();
    },
    [handleFedFinish],
  );

  const onWavingFinish = useCallback(
    (isCancelled: boolean) => {
      if (!isCancelled) signalAnimationFinish('waving');
    },
    [signalAnimationFinish],
  );

  const onFallingAsleepFinish = useCallback(
    (isCancelled: boolean) => {
      if (!isCancelled) signalAnimationFinish('fallingAsleep');
    },
    [signalAnimationFinish],
  );

  const onWakingUpFinish = useCallback(
    (isCancelled: boolean) => {
      if (!isCancelled) signalAnimationFinish('wakingUp');
    },
    [signalAnimationFinish],
  );

  // ─── Simplified render for onboarding (showFullColor) ───
  if (showFullColor && !drainAnimation) {
    if (animationOverride === 'waving') {
      return (
        <View
          style={[styles.wrapper, style]}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden={true}
        >
          <LottieView
            source={getCachedRecolor(WAVING_GREEN, 'waving', gremlyColor)}
            autoPlay={!reduceMotion}
            loop={!reduceMotion}
            speed={0.5}
            renderMode="SOFTWARE"
            style={styles.lottie}
          />
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
        {allIdleVariants.map((variant) => (
          <LottieView
            key={variant.id}
            source={variant.source}
            autoPlay={!reduceMotion}
            loop={!reduceMotion}
            speed={0.5}
            renderMode="SOFTWARE"
            style={[
              styles.lottie,
              { position: 'absolute', opacity: gremlyColor === variant.id ? 1 : 0 },
            ]}
          />
        ))}
      </View>
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
          renderMode="SOFTWARE"
          style={styles.lottie}
        />
        {/* Colored layer clipped by drain */}
        <Animated.View style={[styles.clipContainer, drainClipStyle]}>
          <LottieView
            source={idleColored}
            autoPlay={!reduceMotion}
            loop={!reduceMotion}
            speed={0.5}
            renderMode="SOFTWARE"
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
      {/* ─── GREY LAYER (one LottieView per mode, conditionally mounted) ─── */}
      {!isFedToday && mode !== 'fed' && !showFullColor && (
        <View style={styles.greyContainer}>
          {mode === 'idle' && (
            <LottieView
              source={IDLE_GREY}
              autoPlay={!reduceMotion}
              loop
              renderMode="SOFTWARE"
              style={styles.lottie}
            />
          )}
          {mode === 'drop' && (
            <LottieView
              source={DROP_GREY}
              autoPlay={!reduceMotion}
              loop={false}
              renderMode="SOFTWARE"
              style={styles.lottie}
            />
          )}
          {mode === 'waving' && (
            <LottieView
              source={WAVING_GREY}
              autoPlay={!reduceMotion}
              loop={false}
              renderMode="SOFTWARE"
              style={styles.lottie}
            />
          )}
          {mode === 'fallingAsleep' && (
            <LottieView
              source={FALL_ASLEEP_GREY}
              autoPlay={!reduceMotion}
              loop={false}
              renderMode="SOFTWARE"
              style={styles.lottie}
            />
          )}
          {mode === 'sleeping' && (
            <LottieView
              source={SLEEPING_GREY}
              autoPlay={!reduceMotion}
              loop
              renderMode="SOFTWARE"
              style={styles.lottie}
            />
          )}
          {mode === 'wakingUp' && (
            <LottieView
              source={WAKE_UP_GREY}
              autoPlay={!reduceMotion}
              loop={false}
              renderMode="SOFTWARE"
              style={styles.lottie}
            />
          )}
        </View>
      )}

      {/* ─── GREEN LAYER (one LottieView per mode, clipped from bottom up) ─── */}
      <Animated.View style={[styles.clipContainer, clipAnimatedStyle]}>
        {mode === 'idle' && (
          <LottieView
            source={idleColored}
            autoPlay={!reduceMotion}
            loop
            renderMode="SOFTWARE"
            style={styles.lottieGreen}
          />
        )}
        {mode === 'drop' && (
          <LottieView
            source={dropColored}
            autoPlay={!reduceMotion}
            loop={false}
            renderMode="SOFTWARE"
            style={styles.lottieGreen}
            onAnimationFinish={onDropFinish}
          />
        )}
        {mode === 'fed' && (
          <LottieView
            ref={greenFedRef}
            source={fedColored}
            autoPlay={!reduceMotion}
            loop={false}
            renderMode="SOFTWARE"
            style={styles.lottieGreen}
            onAnimationFinish={onFedFinish}
          />
        )}
        {mode === 'waving' && (
          <LottieView
            source={wavingColored}
            autoPlay={!reduceMotion}
            loop={false}
            renderMode="SOFTWARE"
            style={styles.lottieGreen}
            onAnimationFinish={onWavingFinish}
          />
        )}
        {mode === 'fallingAsleep' && (
          <LottieView
            source={fallAsleepColored}
            autoPlay={!reduceMotion}
            loop={false}
            renderMode="SOFTWARE"
            style={styles.lottieGreen}
            onAnimationFinish={onFallingAsleepFinish}
          />
        )}
        {mode === 'sleeping' && (
          <LottieView
            source={sleepingColored}
            autoPlay={!reduceMotion}
            loop
            renderMode="SOFTWARE"
            style={styles.lottieGreen}
          />
        )}
        {mode === 'wakingUp' && (
          <LottieView
            source={wakeUpColored}
            autoPlay={!reduceMotion}
            loop={false}
            renderMode="SOFTWARE"
            style={styles.lottieGreen}
            onAnimationFinish={onWakingUpFinish}
          />
        )}
      </Animated.View>
    </View>
  );
};

export default memo(MascotLottieInner);
