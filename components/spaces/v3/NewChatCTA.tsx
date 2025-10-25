import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { lightTokens as t } from '../../../design/tokens';

export type NewChatCTAProps = {
  onPress: () => void;
  disabled?: boolean;
};

export const NewChatCTA: React.FC<NewChatCTAProps> = ({ onPress, disabled }) => {
  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[styles.button, disabled && { opacity: 0.5 }]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Start a new chat"
        disabled={disabled}
      >
        <Text style={styles.plus}>＋</Text>
        <Text style={styles.label}>Start a new chat</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  button: {
    width: '100%',
    backgroundColor: t.colors.mossGreen,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  plus: {
    color: t.colors.linenCream,
    fontSize: 18,
    marginRight: 6,
  },
  label: {
    color: t.colors.linenCream,
    fontSize: t.typography.size.md,
    fontWeight: '600',
  },
});

export default NewChatCTA;
