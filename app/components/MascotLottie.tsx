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
  const initialClamp = Math.min(Math.max(feedingGaugeValue, 0), 1);
  const fillHeight = useSharedValue(FILL_OFFSET_BOTTOM + initialClamp * FILL_RANGE);

  useEffect(() => {
    const clamped = Math.min(Math.max(feedingGaugeValue, 0), 1);
    // Map gauge 0-1 to the character's visible vertical range
    // At 0%: height = FILL_OFFSET_BOTTOM (clip covers only empty space below feet, no visible green)
    // At 100%: height = FILL_OFFSET_BOTTOM + FILL_RANGE (clip covers up to ears, fully green)
    const targetHeight = FILL_OFFSET_BOTTOM + clamped * FILL_RANGE;
    fillHeight.value = withTiming(targetHeight, {
      duration: FILL_ANIMATION_DURATION,
      easing: Easing.out(Easing.cubic),
    });
  }, [feedingGaugeValue, fillHeight]);

  const clipAnimatedStyle = useAnimatedStyle(() => ({
    height: fillHeight.value,
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
      {/* Bottom layer: grey Gremly (always fully visible) */}
      <LottieView
        source={getSource(mode, 'grey')}
        autoPlay
        loop={mode === 'idle'}
        renderMode="HARDWARE"
        cacheComposition
        style={styles.lottie}
      />

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
