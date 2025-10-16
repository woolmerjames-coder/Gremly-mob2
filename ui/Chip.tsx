/**
 * Chip Component - Selectable pill for frequencies/tags
 */

import React from 'react';
import { Pressable, ViewStyle, TextStyle } from 'react-native';
import { useTokens } from '../design/makeStyles';
import { Text } from './Text';

export interface ChipProps {
  /** Disallow className */
  className?: never;

  /** Chip label */
  label: string;

  /** Selected state */
  selected?: boolean;

  /** Press handler */
  onPress?: () => void;

  /** Test ID */
  testID?: string;
}

export const Chip: React.FC<ChipProps> = ({ label, selected = false, onPress, testID }) => {
  const t = useTokens();

  const chipStyle: ViewStyle = {
    paddingHorizontal: t.spacing[3],
    paddingVertical: t.spacing[2],
    borderRadius: t.radius[4],
    borderWidth: 1,
    borderColor: selected ? t.colors.primary : t.colors.border,
    backgroundColor: selected ? t.colors.primary : t.colors.surface,
  };

  const textStyle: TextStyle = {
    fontSize: t.typography.size.sm,
    fontWeight: '500',
    color: selected ? '#FFFFFF' : t.colors.text,
  };

  return (
    <Pressable
      style={({ pressed }) => [chipStyle, pressed && { opacity: 0.85 }]}
      onPress={onPress}
      testID={testID}
    >
      <Text style={textStyle}>{label}</Text>
    </Pressable>
  );
};
