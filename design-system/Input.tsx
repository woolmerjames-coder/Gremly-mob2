import React from 'react';
import { View, TextInput, Text, type TextInputProps } from 'react-native';
import { tv, type VariantProps } from 'tailwind-variants';

const input = tv({
  slots: {
    container: 'w-full',
    label: 'text-sm font-medium text-text-primary mb-1',
    inputWrapper: 'flex-row items-center border rounded-md bg-white',
    input: 'flex-1 px-3 py-3 text-base text-text-primary',
    error: 'text-sm text-error mt-1',
    helper: 'text-sm text-text-muted mt-1',
  },
  variants: {
    variant: {
      default: {
        inputWrapper: 'border-border',
      },
      filled: {
        inputWrapper: 'border-transparent bg-bg-100',
      },
    },
    state: {
      default: {},
      error: {
        inputWrapper: 'border-error',
      },
      disabled: {
        inputWrapper: 'opacity-50 bg-bg-100',
        input: 'opacity-50',
      },
    },
    size: {
      sm: {
        input: 'py-2 text-sm',
      },
      md: {
        input: 'py-3 text-base',
      },
      lg: {
        input: 'py-4 text-lg',
      },
    },
  },
  defaultVariants: {
    variant: 'default',
    state: 'default',
    size: 'md',
  },
});

export type InputVariants = VariantProps<typeof input>;

export interface InputProps extends Omit<TextInputProps, 'editable'>, InputVariants {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
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
      variant,
      size,
      disabled = false,
      ...textInputProps
    },
    ref,
  ) => {
    const state = error ? 'error' : disabled ? 'disabled' : 'default';
    const styles = input({ variant, size, state });

    return (
      <View className={styles.container()}>
        {label && <Text className={styles.label()}>{label}</Text>}
        <View className={styles.inputWrapper()}>
          {leftIcon && <View className="ml-3">{leftIcon}</View>}
          <TextInput
            ref={ref}
            editable={!disabled}
            placeholderTextColor="#9CA3AF"
            {...textInputProps}
            className={styles.input()}
          />
          {rightIcon && <View className="mr-3">{rightIcon}</View>}
        </View>
        {error && <Text className={styles.error()}>{error}</Text>}
        {helperText && !error && <Text className={styles.helper()}>{helperText}</Text>}
      </View>
    );
  },
);

Input.displayName = 'Input';
