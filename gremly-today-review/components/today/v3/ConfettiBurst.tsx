import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

type Props = { trigger: number };

const EMOJI = ['\u2728', '\uD83C\uDF1F', '\uD83D\uDCAB', '\uD83C\uDF89', '\uD83C\uDF3C'];

export default function ConfettiBurst({ trigger }: Props) {
  const anims = useRef(Array.from({ length: 8 }, () => new Animated.Value(0))).current;

  useEffect(() => {
    const seq = anims.map((v) =>
      Animated.timing(v, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    anims.forEach((v) => v.setValue(0));
    Animated.stagger(60, seq).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  return (
    <View pointerEvents="none" style={styles.wrap}>
      {anims.map((v, i) => {
        const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [0, -80 - i * 2] });
        const translateX = v.interpolate({ inputRange: [0, 1], outputRange: [0, (i - 4) * 14] });
        const opacity = v.interpolate({ inputRange: [0, 0.8, 1], outputRange: [0, 1, 0] });
        const rotation = v.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', `${i % 2 ? 40 : -40}deg`],
        });
        return (
          <Animated.View
            key={i}
            style={{ transform: [{ translateX }, { translateY }, { rotate: rotation }], opacity }}
          >
            <Text style={styles.emoji}>{EMOJI[i % EMOJI.length]}</Text>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 0, top: -6, width: 120, height: 100, zIndex: 10 },
  emoji: { fontSize: 16 },
});
