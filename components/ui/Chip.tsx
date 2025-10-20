import React from 'react';
import { Text, View, Pressable, StyleSheet, ViewStyle, TextStyle } from 'react-native';

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
  testID?: string;
  disabled?: boolean;
};

export default function Chip({
  label,
  selected = false,
  onPress,
  onLongPress,
  leadingIcon,
  trailingIcon,
  style,
  textStyle,
  testID,
  disabled = false,
}: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        selected ? styles.selected : styles.unselected,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      {leadingIcon ? <View style={styles.icon}>{leadingIcon}</View> : null}
      <Text
        numberOfLines={1}
        style={[styles.text, selected ? styles.textSelected : styles.textUnselected, textStyle]}
      >
        {label}
      </Text>
      {trailingIcon ? <View style={styles.icon}>{trailingIcon}</View> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    maxWidth: 240,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    gap: 6,
  },
  unselected: {
    backgroundColor: 'rgba(0,0,0,0.02)',
    borderColor: 'rgba(0,0,0,0.08)',
  },
  selected: {
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderColor: 'rgba(0,0,0,0.16)',
  },
  pressed: { opacity: 0.9 },
  disabled: { opacity: 0.5 },
  text: { fontSize: 13, lineHeight: 16, fontWeight: '600' },
  textUnselected: { color: '#222' },
  textSelected: { color: '#111' },
  icon: { height: 16, width: 16, alignItems: 'center', justifyContent: 'center' },
});
