import React, { useEffect, useRef, useMemo } from 'react';
import { Image, StyleSheet, Animated } from 'react-native';

type MascotProps = {
  size?: number;
  topOffset?: number; // Legacy prop for absolute positioning (if needed elsewhere)
  hidden?: boolean;
  testID?: string;
};

export default function Mascot({ size = 96, topOffset, hidden = false, testID }: MascotProps) {
  const bobAnim = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    if (hidden) return;

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(bobAnim, {
          toValue: -2,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(bobAnim, {
          toValue: 2,
          duration: 1500,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => animation.stop();
  }, [hidden, bobAnim]);

  if (hidden) return null;

  // If topOffset is provided, use absolute positioning (legacy mode)
  if (topOffset !== undefined) {
    return (
      <Animated.View
        testID={testID}
        style={[
          styles.mascotAbsolute,
          {
            top: topOffset,
            width: size,
            height: size,
            transform: [{ translateY: bobAnim }],
          },
        ]}
      >
        <Image
          source={require('../../../assets/mascot/running-removebg.png')}
          style={styles.image}
          resizeMode="contain"
        />
      </Animated.View>
    );
  }

  // Default: inline positioning (for Header)
  return (
    <Animated.View
      testID={testID}
      style={[
        styles.mascot,
        {
          width: size,
          height: size,
          transform: [{ translateY: bobAnim }],
        },
      ]}
    >
      <Image
        source={require('../../../assets/mascot/running-removebg.png')}
        style={styles.image}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  mascot: {
    opacity: 0.95,
  },
  mascotAbsolute: {
    position: 'absolute',
    right: 16,
    opacity: 0.95,
    zIndex: 10,
    shadowColor: 'rgba(0,0,0,0.08)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 3,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
