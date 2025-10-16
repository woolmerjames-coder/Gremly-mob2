/**
 * Input - DS-based implementation (migrated from Tailwind)
 * Wraps DS Input primitive with additional features
 */
import * as React from 'react';
import { View, TextInput, TextStyle, ViewStyle, type TextInputProps } from 'react-native';
import { useTokens } from '../design/makeStyles';
import { Text } from '../ui/Text';

type Variant = 'default' | 'filled';
type Size = 'sm' | 'md' | 'lg';

export interface InputProps extends Omit<TextInputProps, 'editable'> {
  /** Label text */
  label?: string;
  /** Error message */
  error?: string;
  /** Helper text */
  helperText?: string;
  /** Left icon */
  leftIcon?: React.ReactNode;
  /** Right icon */
  rightIcon?: React.ReactNode;
  /** Variant style */
  variant?: Variant;
  /** Input size */
  size?: Size;
  /** Disabled state */
  disabled?: boolean;
}

export const Input = React.forwardRef<React.ElementRef<typeof TextInput>, InputProps>(
  (
    {
      label,
      error,
      helperText,
      leftIcon,
      rightIcon,
      variant = 'default',
      size = 'md',
      disabled = false,
      ...textInputProps
    },
    ref,
  ) => {
    const t = useTokens();

    const getSizeStyle = (s: Size): { paddingVertical: number; fontSize: number } => {
      switch (s) {
        case 'sm':
          return { paddingVertical: t.spacing[2], fontSize: t.typography.size.sm };
        case 'md':
          return { paddingVertical: t.spacing[3], fontSize: t.typography.size.md };
        case 'lg':
          return { paddingVertical: t.spacing[4], fontSize: t.typography.size.lg };
      }
    };

    const sizeStyle = getSizeStyle(size);

    const containerStyle: ViewStyle = {
      width: '100%',
    };

    const inputWrapperStyle: ViewStyle = {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: error ? t.colors.danger : t.colors.border,
      borderRadius: t.radius[2],
      backgroundColor: variant === 'filled' ? t.colors.surface : '#FFFFFF',
      opacity: disabled ? 0.5 : 1,
    };

    const inputStyle: TextStyle = {
      flex: 1,
      paddingHorizontal: t.spacing[3],
      paddingVertical: sizeStyle.paddingVertical,
      fontSize: sizeStyle.fontSize,
      color: t.colors.text,
    };

    return (
      <View style={containerStyle}>
        {label && (
          <Text variant="label" style={{ marginBottom: t.spacing[1] }}>
            {label}
          </Text>
        )}
        <View style={inputWrapperStyle}>
          {leftIcon && <View style={{ marginLeft: t.spacing[3] }}>{leftIcon}</View>}
          <TextInput
            ref={ref}
            editable={!disabled}
            placeholderTextColor={t.colors.subtle}
            {...textInputProps}
            style={inputStyle}
          />
          {rightIcon && <View style={{ marginRight: t.spacing[3] }}>{rightIcon}</View>}
        </View>
        {error && (
          <Text variant="subtle" style={{ color: t.colors.danger, marginTop: t.spacing[1] }}>
            {error}
          </Text>
        )}
        {helperText && !error && (
          <Text variant="subtle" style={{ marginTop: t.spacing[1] }}>
            {helperText}
          </Text>
        )}
      </View>
    );
  },
);

Input.displayName = 'Input';
