import * as React from 'react';
import { View, TextInput, Text, type TextInputProps } from 'react-native';
import { tv, type VariantProps } from 'tailwind-variants';

const textarea = tv({
  slots: {
    container: 'w-full',
    label: 'text-sm font-medium text-text-primary mb-1',
    inputWrapper: 'border rounded-md bg-white',
    input: 'px-3 py-3 text-base text-text-primary',
    footer: 'flex-row justify-between items-center mt-1',
    error: 'text-sm text-error',
    helper: 'text-sm text-text-muted',
    counter: 'text-sm text-text-muted',
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
  },
  defaultVariants: {
    variant: 'default',
    state: 'default',
  },
});

export type TextareaVariants = VariantProps<typeof textarea>;

export interface TextareaProps
  extends Omit<TextInputProps, 'editable' | 'multiline'>,
    TextareaVariants {
  label?: string;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  maxLength?: number;
  rows?: number;
}

export const Textarea = React.forwardRef<React.ElementRef<typeof TextInput>, TextareaProps>(
  (
    {
      label,
      error,
      helperText,
      variant,
      disabled = false,
      maxLength,
      rows = 4,
      value,
      ...textInputProps
    },
    ref,
  ) => {
    const state = error ? 'error' : disabled ? 'disabled' : 'default';
    const styles = textarea({ variant, state });
    const charCount = value ? String(value).length : 0;

    return (
      <View className={styles.container()}>
        {label && <Text className={styles.label()}>{label}</Text>}
        <View className={styles.inputWrapper()}>
          <TextInput
            ref={ref}
            editable={!disabled}
            multiline
            numberOfLines={rows}
            placeholderTextColor="#9CA3AF"
            maxLength={maxLength}
            value={value}
            {...textInputProps}
            className={styles.input()}
            style={{ minHeight: rows * 24, textAlignVertical: 'top' }}
          />
        </View>
        <View className={styles.footer()}>
          <View className="flex-1">
            {error && <Text className={styles.error()}>{error}</Text>}
            {helperText && !error && <Text className={styles.helper()}>{helperText}</Text>}
          </View>
          {maxLength && (
            <Text className={styles.counter()}>
              {charCount}/{maxLength}
            </Text>
          )}
        </View>
      </View>
    );
  },
);

Textarea.displayName = 'Textarea';
