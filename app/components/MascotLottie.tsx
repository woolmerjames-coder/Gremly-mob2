import React, { useRef, useState, useCallback, useImperativeHandle, forwardRef, memo } from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import LottieView from 'lottie-react-native';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';

const IDLE_ANIM = require('../../assets/lottie/character1_B.json');
const CELEBRATE_ANIM = require('../../assets/lottie/character2_B.json');

export type MascotLottieHandle = { celebrate: () => void };

type Props = { style?: ViewStyle };

const MascotLottieInner = forwardRef<MascotLottieHandle, Props>(({ style }, ref) => {
  const idleRef = useRef<LottieView>(null);
  const celebrateRef = useRef<LottieView>(null);
  const isCelebratingRef = useRef(false);
  const celebrateVisible = useSharedValue(0);
  const celebrateProgress = useSharedValue(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const celebrateStyle = useAnimatedStyle(() => ({
    opacity: celebrateVisible.value,
  }));

  const celebrate = useCallback(() => {
    if (isCelebratingRef.current) return;
    isCelebratingRef.current = true;
    idleRef.current?.pause();
    setIsPlaying(true);
    celebrateVisible.value = 1;
    requestAnimationFrame(() => celebrateRef.current?.play());
  }, [celebrateVisible]);

  const onCelebrateFinish = useCallback(() => {
    if (!isCelebratingRef.current) return;
    celebrateVisible.value = 0;
    idleRef.current?.resume();
    setIsPlaying(false);
    celebrateRef.current?.reset();
    isCelebratingRef.current = false;
  }, [celebrateVisible]);

  useImperativeHandle(ref, () => ({ celebrate }), [celebrate]);

  return (
    <View style={[styles.wrapper, style]}>
      <LottieView
        ref={idleRef}
        source={IDLE_ANIM}
        autoPlay
        loop
        style={StyleSheet.absoluteFillObject}
      />
      <Animated.View style={[StyleSheet.absoluteFillObject, celebrateStyle]}>
        <LottieView
          ref={celebrateRef}
          source={CELEBRATE_ANIM}
          autoPlay={false}
          loop={false}
          onAnimationFinish={onCelebrateFinish}
          style={StyleSheet.absoluteFillObject}
          {...(!isPlaying ? { progress: celebrateProgress } : {})}
        />
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { width: 95, height: 111, overflow: 'hidden' },
});

export default memo(MascotLottieInner);
