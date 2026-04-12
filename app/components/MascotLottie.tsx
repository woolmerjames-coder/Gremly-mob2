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

const MASCOT_WIDTH = 95;
const MASCOT_HEIGHT = 111;
const FILL_ANIMATION_DURATION = 1000;

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

/** @deprecated Use the `mode` prop instead of the imperative handle. */
export type MascotLottieHandle = {
  celebrate: () => void;
  celebrateFed: () => void;
};

type Props = {
  /** Controlled animation mode – when supplied the component is fully controlled. */
  mode?: AnimationMode;
  style?: ViewStyle;
  showFullColor?: boolean;
  drainAnimation?: boolean;
  drainVisible?: boolean;
  animationOverride?: AnimationMode;
};

const MascotLottieInner = forwardRef<MascotLottieHandle, Props>(
  (
    {
      mode: modeProp,
      style,
      showFullColor = false,
      drainAnimation = false,
      drainVisible = false,
      animationOverride,
    },
    ref,
  ) => {
    // Context-provided mode as fallback when no explicit prop is passed
    const { mode: contextMode } = useMascotMode();
    // Internal state only used by the deprecated imperative handle
    const [imperativeMode, setImperativeMode] = useState<AnimationMode>('idle');
    const isCelebratingRef = useRef(false);
    // Imperative mode wins during active celebrations; otherwise prop > context
    // The ref avoids async-state race conditions during celebrate —
    // setImperativeMode (state) always accompanies ref writes, forcing a re-render.
    /* eslint-disable react-hooks/refs */
    const mode: AnimationMode = isCelebratingRef.current
      ? imperativeMode
      : (modeProp ?? contextMode ?? 'idle');
    /* eslint-enable react-hooks/refs */
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
    const fedColored = useMemo(
      () => getCachedRecolor(FED_GREEN, 'fed', gremlyColor),
      [gremlyColor],
    );
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
    const isFedAnimating = useSharedValue(0);

    useEffect(() => {
      isFedShared.value = isFedToday ? 1 : 0;
    }, [isFedToday]);

    useEffect(() => {
      isFedAnimating.value = mode === 'fed' ? 1 : 0;
    }, [mode]);

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
        : isFedShared.value === 1 || isFedAnimating.value === 1
          ? MASCOT_HEIGHT
          : fillHeight.value,
    }));

    /** @deprecated Use the mode prop instead. */
    const celebrate = useCallback(() => {
      if (isCelebratingRef.current) return;
      isCelebratingRef.current = true;
      setImperativeMode('drop');
    }, []);

    /** @deprecated Use the mode prop instead. */
    const celebrateFed = useCallback(() => {
      if (isCelebratingRef.current) return;
      isCelebratingRef.current = true;
      fedPlayCountRef.current = 0;
      setImperativeMode('fed');
    }, []);

    const handleDropFinish = useCallback(() => {
      isCelebratingRef.current = false;
      setImperativeMode('idle');
    }, []);

    const handleFedFinish = useCallback(() => {
      fedPlayCountRef.current += 1;
      if (fedPlayCountRef.current < 2) {
        // Replay via ref (grey layer is hidden during fed)
        greenFedRef.current?.reset();
        greenFedRef.current?.play();
      } else {
        isCelebratingRef.current = false;
        setImperativeMode('idle');
      }
    }, []);

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

    useImperativeHandle(ref, () => ({ celebrate, celebrateFed }), [celebrate, celebrateFed]);

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
            />
          )}
          {mode === 'fallingAsleep' && (
            <LottieView
              source={fallAsleepColored}
              autoPlay={!reduceMotion}
              loop={false}
              renderMode="SOFTWARE"
              style={styles.lottieGreen}
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
            />
          )}
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
