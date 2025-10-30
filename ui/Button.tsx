/**
 * Button Component - Pressable button with variants and sizes
 */

import React, { ReactNode } from 'react';
import { Pressable, ViewStyle, TextStyle } from 'react-native';
import { useTokens } from '../design/makeStyles';
import { Text } from './Text';

type ButtonVariant = 'primary' | 'neutral' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  /** Disallow className */
  className?: never;

  /** Button label text */
  title?: string;

  /** Alternate label prop for design-system parity */
  label?: string;

  /** Press handler */
  onPress: () => void | Promise<void>;

  /** Button variant */
  variant?: ButtonVariant;

  /** Button size */
  size?: ButtonSize;

  /** Disabled state */
  disabled?: boolean;

  /** Icon to display on the left */
  iconLeft?: ReactNode;

  /** Icon to display on the right */
  iconRight?: ReactNode;

  /** Test ID */
  testID?: string;

  /** Accessibility label */
  accessibilityLabel?: string;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  iconLeft,
  iconRight,
  testID,
  accessibilityLabel,
}) => {
  const t = useTokens();
  const buttonLabel = label ?? title;
  if (!buttonLabel) {
    throw new Error('Button requires either `label` or `title`.');
  }

  const getSizeStyle = (s: ButtonSize): { height: number; paddingHorizontal: number } => {
    switch (s) {
      case 'sm':
        return { height: 36, paddingHorizontal: t.spacing[3] };
      case 'md':
        return { height: 44, paddingHorizontal: t.spacing[4] };
      case 'lg':
        return { height: 52, paddingHorizontal: t.spacing[5] };
    }
  };

  const getVariantStyle = (v: ButtonVariant): { bg: string; textColor: string } => {
    switch (v) {
      case 'primary':
        return { bg: t.colors.primary, textColor: '#FFFFFF' };
      case 'neutral':
      case 'ghost':
        return { bg: t.colors.surface, textColor: t.colors.text };
      case 'danger':
        return { bg: t.colors.danger, textColor: '#FFFFFF' };
    }
  };

  const sizeStyle = getSizeStyle(size);
  const variantStyle = getVariantStyle(variant);

  const buttonStyle: ViewStyle = {
    height: sizeStyle.height,
    paddingHorizontal: sizeStyle.paddingHorizontal,
    backgroundColor: variantStyle.bg,
    borderRadius: t.radius[2],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing[2],
    opacity: disabled ? 0.5 : 1,
  };

  const textStyle: TextStyle = {
    color: variantStyle.textColor,
    fontSize: size === 'sm' ? t.typography.size.sm : t.typography.size.md,
    fontWeight: '600',
  };

  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? buttonLabel}
      style={({ pressed }) => [buttonStyle, pressed && !disabled && { opacity: 0.85 }]}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
    >
      {iconLeft}
      <Text style={textStyle}>{buttonLabel}</Text>
      {iconRight}
    </Pressable>
  );
};
