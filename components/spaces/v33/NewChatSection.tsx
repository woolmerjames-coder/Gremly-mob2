import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { COLORS, RADII, SPACE } from './_tokens';
import Svg, { Path, Circle } from 'react-native-svg';

type Props = {
  spaceName: string;
  onPress?: () => void;
  inactiveDays?: number; // Optional sparkle if > 5
};

export default function NewChatSection({ spaceName, onPress, inactiveDays }: Props) {
  const showSparkle = (inactiveDays || 0) > 5;
  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.btnPrimary,
          pressed && { backgroundColor: 'rgba(46,85,64,0.9)', transform: [{ translateY: 2 }] },
        ]}
      >
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' }}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Path d="M4 6h16v12H4z" fill="none" stroke={COLORS.Linen} strokeWidth={2} />
            <Circle cx={7} cy={9} r={1.2} fill={COLORS.Linen} />
            <Circle cx={12} cy={9} r={1.2} fill={COLORS.Linen} />
            <Circle cx={17} cy={9} r={1.2} fill={COLORS.Linen} />
          </Svg>
          <Text style={styles.btnPrimaryText}>Start a new chat with Gremly</Text>
          {showSparkle && (
            <Svg width={16} height={16} viewBox="0 0 24 24">
              <Path
                d="M12 2l2.2 4.8L19 9l-4.8 2.2L12 16l-2.2-4.8L5 9l4.8-2.2L12 2z"
                fill={COLORS.Pear}
              />
            </Svg>
          )}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Simple wrapper, no card background
  },
  btnPrimary: {
    backgroundColor: COLORS.Moss,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    // soft shadow
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  btnPrimaryText: {
    color: COLORS.Linen,
    fontWeight: '800',
    letterSpacing: 0.3,
    fontSize: 16,
  },
});
