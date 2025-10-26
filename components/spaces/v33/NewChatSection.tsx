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
      <Text style={styles.sectionTitle}>Conversations</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.btnPrimary,
          pressed && { backgroundColor: 'rgba(46,85,64,0.85)', transform: [{ scale: 0.98 }] },
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
    backgroundColor: COLORS.SectionChatsTint,
    borderTopWidth: 1,
    borderTopColor: 'rgba(34,34,34,0.12)',
    paddingTop: SPACE.sectionY,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: `${COLORS.Moss}CC`, // Moss @80%
    letterSpacing: 0.3,
    marginBottom: 8,
    fontFamily: 'Inter-Medium',
  },
  btnPrimary: {
    backgroundColor: `${COLORS.Moss}E6`, // Moss @90%
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    height: 44,
    shadowColor: 'rgba(0,0,0,0.05)',
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  btnPrimaryText: {
    color: COLORS.Linen,
    fontWeight: '600',
    letterSpacing: 0.3,
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
});
