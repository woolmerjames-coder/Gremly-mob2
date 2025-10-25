import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { lightTokens as t } from '../../../design/tokens';

export type FocusCardProps = {
  spaceType: 'habit' | 'trip' | 'goal' | 'other';
  summaryText: string;
  onPress?: () => void;
};

export const FocusCard: React.FC<FocusCardProps> = ({ spaceType, summaryText, onPress }) => {
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={onPress ? 0.85 : 1}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={styles.icon}>□</Text>
        <Text style={styles.text} numberOfLines={2}>
          {summaryText}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: t.colors.linenCream,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  icon: { fontSize: 18, marginRight: 10, color: t.colors.charcoalInk },
  text: { color: t.colors.charcoalInk, fontSize: t.typography.size.md },
});

export default FocusCard;
