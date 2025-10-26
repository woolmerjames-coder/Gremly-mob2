import React from 'react';
import { Pressable, StyleSheet, Text, View, Animated, Easing } from 'react-native';
import { COLORS, RADII } from './_tokens';
import { MessageSquarePlus } from '../../icons';

type Props = {
  onPress: () => void;
};

export const NewChatCTA: React.FC<Props> = ({ onPress }) => {
  const scale = React.useMemo(() => new Animated.Value(1), []);
  // Tiny animated Gremly wave/blink (emoji-based, independent of mascot provider)
  const wave = React.useMemo(() => new Animated.Value(0), []);
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wave, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(wave, {
          toValue: 0,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [wave]);
  const waveStyle = {
    transform: [
      {
        rotate: wave.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '8deg'] }),
      },
      {
        translateY: wave.interpolate({ inputRange: [0, 1], outputRange: [0, -1] }),
      },
    ],
  } as const;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Talk to Gremly about this Space"
      onPress={() => {
        // quick pulse on icon then fire
        Animated.sequence([
          Animated.timing(scale, { toValue: 0.92, duration: 80, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true }),
        ]).start();
        onPress();
      }}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: pressed ? 'rgba(46,85,64,0.06)' : 'transparent', // Moss @ 6%
          borderColor: COLORS.Moss,
        },
      ]}
    >
      <View style={styles.row}>
        <Animated.View style={{ transform: [{ scale }] }}>
          <MessageSquarePlus color={COLORS.Moss} size={20} />
        </Animated.View>
        <Animated.Text style={[styles.mascot, waveStyle]} accessibilityLabel="Gremly waving">
          🐨
        </Animated.Text>
        <Text style={styles.label}>Talk to Gremly about this Space.</Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  btn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: RADII.btn,
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  mascot: {
    marginLeft: 4,
    marginRight: 2,
  },
  label: {
    color: COLORS.Moss,
    fontWeight: '700',
    fontSize: 16,
  },
});

export default NewChatCTA;
