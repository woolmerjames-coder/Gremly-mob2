import React, {
  useRef,
  useCallback,
  useState,
  useImperativeHandle,
  forwardRef,
  memo,
  useEffect,
} from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import LottieView from 'lottie-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useGremlyStore } from '../../lib/store/useGremlyStore';

// Lottie sources: 3 animations × 2 colorways
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

// Pixel-accurate character bounds (measured by rendering all 720 animation frames)
// Bottom: character feet end at y=243 of 280px canvas = 14px in component coords
// Top: character ears peak at y=32 of 280px canvas = 12.7px in component, using 10px for safe margin
const FILL_OFFSET_BOTTOM = 14;
const FILL_OFFSET_TOP = 10;
const FILL_RANGE = MASCOT_HEIGHT - FILL_OFFSET_TOP - FILL_OFFSET_BOTTOM; // ~72px of visible character

/**
 * Maps gauge value (0-1) to fill percentage (0-1) using a piecewise curve
 * that compresses the edges and preserves 50% = 50%.
 *
 * Problem: The character is narrow at feet and ears, wide in the body.
 * A linear mapping means the bottom and top 10% of fill look like nothing happened.
 *
 * Solution: The bottom 10% of gauge maps to 20% of fill height (feet covered fast),
 * the middle 80% is linear (50% = 50%), the top 10% maps to 20% of fill height
 * (head/ears only fill in the final stretch, keeping grey visible until truly fed).
 *
 * These constants can be tuned visually:
 * - EDGE_GAUGE_RANGE: how much gauge range is "edge" (default 0.10 = 10%)
 * - EDGE_FILL_RANGE: how much fill height that edge covers (default 0.20 = 20%)
 */
const EDGE_GAUGE_RANGE = 0.1;
const EDGE_FILL_RANGE = 0.2;

function gaugeToFill(gaugeValue: number): number {
  const g = Math.min(Math.max(gaugeValue, 0), 1);

  // Bottom edge: gauge 0 to EDGE_GAUGE_RANGE maps to fill 0 to EDGE_FILL_RANGE
  if (g <= EDGE_GAUGE_RANGE) {
    return (g / EDGE_GAUGE_RANGE) * EDGE_FILL_RANGE;
  }

  // Top edge: gauge (1 - EDGE_GAUGE_RANGE) to 1 maps to fill (1 - EDGE_FILL_RANGE) to 1
  if (g >= 1 - EDGE_GAUGE_RANGE) {
    const edgeProgress = (g - (1 - EDGE_GAUGE_RANGE)) / EDGE_GAUGE_RANGE;
    return 1 - EDGE_FILL_RANGE + edgeProgress * EDGE_FILL_RANGE;
  }

  // Middle: linear mapping from (EDGE_GAUGE_RANGE, EDGE_FILL_RANGE) to (1 - EDGE_GAUGE_RANGE, 1 - EDGE_FILL_RANGE)
  const middleGaugeRange = 1 - 2 * EDGE_GAUGE_RANGE;
  const middleFillRange = 1 - 2 * EDGE_FILL_RANGE;
  const middleProgress = (g - EDGE_GAUGE_RANGE) / middleGaugeRange;
  return EDGE_FILL_RANGE + middleProgress * middleFillRange;
}

type AnimationMode = 'idle' | 'drop' | 'fed';

function getSource(mode: AnimationMode, colorway: 'grey' | 'green') {
  if (mode === 'drop') return colorway === 'grey' ? DROP_GREY : DROP_GREEN;
  if (mode === 'fed') return colorway === 'grey' ? FED_GREY : FED_GREEN;
  return colorway === 'grey' ? IDLE_GREY : IDLE_GREEN;
}

export type MascotLottieHandle = {
  celebrate: () => void;
  celebrateFed: () => void;
};

type Props = { style?: ViewStyle };

const MascotLottieInner = forwardRef<MascotLottieHandle, Props>(({ style }, ref) => {
  const [mode, setMode] = useState<AnimationMode>('idle');
  const isCelebratingRef = useRef(false);
  const fedPlayCountRef = useRef(0);

  // Gauge fill animation
  const feedingGaugeValue = useGremlyStore((s) => s.feedingGaugeValue);
  const isFedToday = useGremlyStore((s) => s.isFedToday);
  const initialClamp = Math.min(Math.max(feedingGaugeValue, 0), 1);
  const initialFill = gaugeToFill(initialClamp);
  const fillHeight = useSharedValue(FILL_OFFSET_BOTTOM + initialFill * FILL_RANGE);

  const isFedShared = useSharedValue(isFedToday ? 1 : 0);

  useEffect(() => {
    isFedShared.value = isFedToday ? 1 : 0;
  }, [isFedToday]);

  useEffect(() => {
    const clamped = Math.min(Math.max(feedingGaugeValue, 0), 1);
    const fillPercent = gaugeToFill(clamped);
    const targetHeight = FILL_OFFSET_BOTTOM + fillPercent * FILL_RANGE;
    fillHeight.value = withTiming(targetHeight, {
      duration: FILL_ANIMATION_DURATION,
      easing: Easing.out(Easing.cubic),
    });
  }, [feedingGaugeValue, fillHeight]);

  const clipAnimatedStyle = useAnimatedStyle(() => ({
    height: isFedShared.value === 1 ? MASCOT_HEIGHT : fillHeight.value,
  }));

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

  const handleAnimationFinish = useCallback(() => {
    if (mode === 'drop') {
      isCelebratingRef.current = false;
      setMode('idle');
    } else if (mode === 'fed') {
      fedPlayCountRef.current += 1;
      if (fedPlayCountRef.current < 2) {
        setMode('idle');
        requestAnimationFrame(() => setMode('fed'));
      } else {
        isCelebratingRef.current = false;
        setMode('idle');
      }
    }
  }, [mode]);

  useImperativeHandle(ref, () => ({ celebrate, celebrateFed }), [celebrate, celebrateFed]);

  return (
    <View style={[styles.wrapper, style]}>
      {/* Bottom layer: grey Gremly (hidden when fed) */}
      {!isFedToday && (
        <LottieView
          source={getSource(mode, 'grey')}
          autoPlay
          loop={mode === 'idle'}
          renderMode="HARDWARE"
          cacheComposition
          style={styles.lottie}
        />
      )}

      {/* Top layer: green Gremly (clipped from bottom up based on gauge) */}
      <Animated.View style={[styles.clipContainer, clipAnimatedStyle]}>
        <LottieView
          source={getSource(mode, 'green')}
          autoPlay
          loop={mode === 'idle'}
          onAnimationFinish={handleAnimationFinish}
          renderMode="HARDWARE"
          cacheComposition
          style={styles.lottieGreen}
        />
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    width: MASCOT_WIDTH,
    height: MASCOT_HEIGHT,
    position: 'relative',
  },
  lottie: {
    width: MASCOT_WIDTH,
    height: MASCOT_HEIGHT,
    position: 'absolute',
    top: 0,
    left: 0,
  },
  clipContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: MASCOT_WIDTH,
    overflow: 'hidden',
  },
  lottieGreen: {
    width: MASCOT_WIDTH,
    height: MASCOT_HEIGHT,
    position: 'absolute',
    bottom: 0,
    left: 0,
  },
});

export default memo(MascotLottieInner);
