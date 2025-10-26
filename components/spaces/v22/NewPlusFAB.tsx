import React from 'react';
import { Pressable, StyleSheet, View, Animated, Easing } from 'react-native';
import { COLORS } from './_tokens';
import { Plus } from '../../icons';

type Props = {
  onPress: () => void;
};

const GLOW = 'rgba(224,196,122,0.25)'; // Pear glow

export const NewPlusFAB: React.FC<Props> = ({ onPress }) => {
  const translateY = React.useMemo(() => new Animated.Value(0), []);
  const scale = React.useMemo(() => new Animated.Value(0.96), []);
  const glow = React.useMemo(() => new Animated.Value(0.5), []);

  React.useEffect(() => {
    // Gentle pulse for scale and glow
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1,
            duration: 1200,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0.96,
            duration: 1200,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(glow, {
            toValue: 1,
            duration: 1200,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
          }),
          Animated.timing(glow, {
            toValue: 0.5,
            duration: 1200,
            easing: Easing.in(Easing.quad),
            useNativeDriver: false,
          }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale, glow]);

  const handlePressIn = React.useCallback(() => {
    Animated.spring(translateY, {
      toValue: -2,
      useNativeDriver: true,
      speed: 30,
      bounciness: 6,
    }).start();
  }, [translateY]);

  const handlePressOut = React.useCallback(() => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      speed: 30,
      bounciness: 6,
    }).start();
  }, [translateY]);

  return (
    <Animated.View style={{ transform: [{ translateY }, { scale }] }}>
      <Animated.View style={[styles.glow, { opacity: glow }]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create"
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.btn}
      >
        <Plus color={COLORS.Linen} size={26} />
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  btn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.Moss,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 6,
  },
  glow: {
    position: 'absolute',
    alignSelf: 'center',
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: GLOW,
    top: -6,
    zIndex: -1,
  },
});

export default NewPlusFAB;
