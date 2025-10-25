import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, RADII } from './_tokens';
import { MessageSquarePlus } from '../../icons';

type Props = {
  onPress: () => void;
};

export const NewChatCTA: React.FC<Props> = ({ onPress }) => {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Chat with Gremly"
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: pressed ? 'rgba(46,85,64,0.06)' : 'transparent', // Moss @ 6%
          borderColor: COLORS.Moss,
        },
      ]}
    >
      <View style={styles.row}>
        <MessageSquarePlus color={COLORS.Moss} size={20} />
        <Text style={styles.label}>Chat with Gremly</Text>
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
