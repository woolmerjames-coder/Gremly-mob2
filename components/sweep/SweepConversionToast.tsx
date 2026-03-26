import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Text } from '../../ui';
import { BRAND } from '../../design/brand';

type SweepConversionToastProps = {
  visible: boolean;
  message: string;
  onDismissed?: () => void;
};

export function SweepConversionToast({ visible, message, onDismissed }: SweepConversionToastProps) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.9);

  useEffect(() => {
    if (visible) {
      const easeIn = { duration: 200, easing: Easing.out(Easing.cubic) };
      opacity.value = withTiming(1, easeIn, () => {
        // Hold 2000ms then fade out
        opacity.value = withDelay(
          2000,
          withTiming(0, { duration: 400, easing: Easing.in(Easing.cubic) }, (finished) => {
            if (finished && onDismissed) {
              runOnJS(onDismissed)();
            }
          }),
        );
      });
      scale.value = withTiming(1.0, easeIn);
    } else {
      opacity.value = 0;
      scale.value = 0.9;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <View style={styles.inner}>
        <Check size={13} strokeWidth={2.5} color={BRAND.colors.mossGreen} />
        <Text style={styles.message}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignSelf: 'center',
    top: 70,
    zIndex: 50,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(46,85,64,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.12)',
  },
  message: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
    letterSpacing: 0.2,
    fontFamily: 'Inter-Medium',
  },
});
