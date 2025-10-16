/**
 * Button - DS-based implementation (migrated from Tailwind)
 * Maps old variants to DS primitives
 */
import * as React from 'react';
import { ActivityIndicator, Pressable, ViewStyle, type PressableProps } from 'react-native';
import { useTokens } from '../design/makeStyles';
import { Text } from '../ui/Text';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'disabled'> {
  /** Button label text */
  label: string;
  /** Button variant (maps: primary→primary, secondary/outline/ghost→neutral) */
  variant?: Variant;
  /** Button size */
  size?: Size;
  /** Disabled state */
  disabled?: boolean;
  /** Full width */
  fullWidth?: boolean;
  /** Loading state */
  isLoading?: boolean;
  /** Left icon */
  leftIcon?: React.ReactNode;
  /** Right icon */
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<React.ElementRef<typeof Pressable>, ButtonProps>(
  (
    {
      label,
      variant = 'primary',
      size = 'md',
      disabled,
      fullWidth,
      isLoading = false,
      leftIcon,
      rightIcon,
      ...pressableProps
    },
    ref,
  ) => {
    const t = useTokens();

    // Map old variants to DS variants
    const getDSVariant = (v: Variant): { bg: string; textColor: string; border?: string } => {
      switch (v) {
        case 'primary':
          return { bg: t.colors.primary, textColor: '#FFFFFF' };
        case 'secondary':
        case 'ghost':
          return { bg: t.colors.surface, textColor: t.colors.text };
        case 'outline':
          return { bg: 'transparent', textColor: t.colors.primary, border: t.colors.primary };
      }
    };

    const getSizeStyle = (
      s: Size,
    ): { height: number; paddingHorizontal: number; fontSize: number } => {
      switch (s) {
        case 'sm':
          return { height: 32, paddingHorizontal: t.spacing[3], fontSize: t.typography.size.sm };
        case 'md':
          return { height: 44, paddingHorizontal: t.spacing[4], fontSize: t.typography.size.md };
        case 'lg':
          return { height: 56, paddingHorizontal: t.spacing[5], fontSize: t.typography.size.lg };
      }
    };

    const variantStyle = getDSVariant(variant);
    const sizeStyle = getSizeStyle(size);

    const buttonStyle: ViewStyle = {
      height: sizeStyle.height,
      paddingHorizontal: sizeStyle.paddingHorizontal,
      backgroundColor: variantStyle.bg,
      borderRadius: t.radius[2],
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: t.spacing[2],
      opacity: disabled || isLoading ? 0.5 : 1,
      ...(variantStyle.border && { borderWidth: 2, borderColor: variantStyle.border }),
      ...(fullWidth && { width: '100%' }),
    };

    return (
      <Pressable
        ref={ref}
        disabled={disabled || isLoading}
        {...pressableProps}
        style={({ pressed }) => [
          buttonStyle,
          pressed && !disabled && !isLoading && { opacity: 0.7 },
        ]}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={variantStyle.textColor} />
        ) : (
          <>
            {leftIcon}
            <Text
              style={{
                color: variantStyle.textColor,
                fontSize: sizeStyle.fontSize,
                fontWeight: '600',
              }}
            >
              {label}
            </Text>
            {rightIcon}
          </>
        )}
      </Pressable>
    );
  },
);

Button.displayName = 'Button';
