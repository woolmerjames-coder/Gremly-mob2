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
  withRepeat,
  withSequence,
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
  const fillHeight = useSharedValue(0);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    const clamped = Math.min(Math.max(feedingGaugeValue, 0), 1);
    fillHeight.value = withTiming(clamped * MASCOT_HEIGHT, {
      duration: FILL_ANIMATION_DURATION,
      easing: Easing.out(Easing.cubic),
    });
  }, [feedingGaugeValue, fillHeight]);

  useEffect(() => {
    if (isFedToday) {
      glowOpacity.value = withSequence(
        withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }),
        withRepeat(
          withSequence(
            withTiming(0.5, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
            withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          ),
          -1,
          true,
        ),
      );
    } else {
      glowOpacity.value = withTiming(0, { duration: 300 });
    }
  }, [isFedToday, glowOpacity]);

  const clipAnimatedStyle = useAnimatedStyle(() => ({
    height: fillHeight.value,
  }));

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
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
    <View style={[styles.outerWrapper, style]}>
      {/* Glow layer (behind mascot, only visible when fed) */}
      <Animated.View style={[styles.glow, glowAnimatedStyle]} />

      {/* Mascot layers */}
      <View style={styles.wrapper}>
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
    </View>
  );
});

const styles = StyleSheet.create({
  outerWrapper: {
    width: MASCOT_WIDTH + 24,
    height: MASCOT_HEIGHT + 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: MASCOT_WIDTH + 16,
    height: MASCOT_HEIGHT + 16,
    borderRadius: (MASCOT_WIDTH + 16) / 2,
    backgroundColor: 'rgba(74, 103, 65, 0.15)',
    shadowColor: '#4A6741',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
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
