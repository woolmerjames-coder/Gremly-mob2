import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
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
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={styles.iconWrap}>
            <Svg width={18} height={18} viewBox="0 0 24 24">
              <Path d="M4 6h16v12H4z" fill="none" stroke={COLORS.Moss} strokeWidth={2} />
              <Circle cx={7} cy={9} r={1.2} fill={COLORS.Moss} />
              <Circle cx={12} cy={9} r={1.2} fill={COLORS.Moss} />
              <Circle cx={17} cy={9} r={1.2} fill={COLORS.Moss} />
            </Svg>
          </View>
          <Text style={styles.title}>Talk to Gremly</Text>
          {showSparkle && (
            <Svg width={16} height={16} viewBox="0 0 24 24">
              <Path
                d="M12 2l2.2 4.8L19 9l-4.8 2.2L12 16l-2.2-4.8L5 9l4.8-2.2L12 2z"
                fill={COLORS.Pear}
              />
            </Svg>
          )}
        </View>
      </View>

      <Text style={styles.copy}>Ask a question or start a new chat about {spaceName}.</Text>

      <TouchableOpacity accessibilityRole="button" onPress={onPress} style={styles.btnSecondary}>
        <Text style={styles.btnSecondaryText}>Start Chat</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.Linen,
    borderRadius: RADII.card,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: 'rgba(21,51,38,0.12)',
  },
  iconWrap: {
    backgroundColor: 'rgba(46,85,64,0.08)',
    borderRadius: 10,
    padding: 6,
  },
  title: { color: COLORS.Deep, fontWeight: '700' },
  copy: { color: 'rgba(26,51,40,0.8)', marginTop: 6, marginBottom: 12 },
  btnSecondary: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.Sage,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnSecondaryText: { color: COLORS.Moss, fontWeight: '800' },
});
