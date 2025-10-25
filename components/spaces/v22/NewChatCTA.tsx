import React from 'react';
import { Pressable, StyleSheet, Text, View, Animated } from 'react-native';
import { COLORS, RADII } from './_tokens';
import { MessageSquarePlus } from '../../icons';

type Props = {
  onPress: () => void;
};

export const NewChatCTA: React.FC<Props> = ({ onPress }) => {
  const scale = React.useMemo(() => new Animated.Value(1), []);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Start a chat with Gremly"
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
        <Text style={styles.label}>Start a chat with Gremly</Text>
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
  label: {
    color: COLORS.Moss,
    fontWeight: '700',
    fontSize: 16,
  },
});

export default NewChatCTA;
