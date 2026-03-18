import React, { useRef, useCallback, useState, useImperativeHandle, forwardRef, memo } from 'react';
import { View, ViewStyle, StyleSheet, Platform } from 'react-native';
import LottieView from 'lottie-react-native';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const IDLE_ANIM = require('../../assets/lottie/character1_B.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const CELEBRATE_ANIM = require('../../assets/lottie/character2_B.json');

export type MascotLottieHandle = { celebrate: () => void };

type Props = { style?: ViewStyle };

const MascotLottieInner = forwardRef<MascotLottieHandle, Props>(({ style }, ref) => {
  const lottieRef = useRef<LottieView>(null);
  const isCelebratingRef = useRef(false);
  const [mode, setMode] = useState<'idle' | 'celebrate'>('idle');

  const celebrate = useCallback(() => {
    if (isCelebratingRef.current) return;
    isCelebratingRef.current = true;
    setMode('celebrate');
  }, []);

  const handleAnimationFinish = useCallback(() => {
    if (!isCelebratingRef.current) return;
    isCelebratingRef.current = false;
    setMode('idle');
  }, []);

  useImperativeHandle(ref, () => ({ celebrate }), [celebrate]);

  return (
    <View style={[styles.wrapper, style]}>
      <LottieView
        ref={lottieRef}
        source={mode === 'idle' ? IDLE_ANIM : CELEBRATE_ANIM}
        autoPlay
        loop={mode === 'idle'}
        onAnimationFinish={handleAnimationFinish}
        renderMode="HARDWARE"
        cacheComposition
        style={styles.lottie}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { width: 95, height: 111, overflow: 'hidden' },
  lottie: { width: 95, height: 111 },
});

export default memo(MascotLottieInner);
