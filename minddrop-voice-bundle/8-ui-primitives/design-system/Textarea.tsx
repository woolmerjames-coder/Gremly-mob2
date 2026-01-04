/**
 * Textarea - DS-based implementation (migrated from Tailwind)
 */
import * as React from 'react';
import { TextInput, ViewStyle, TextStyle, type TextInputProps } from 'react-native';
import { useTokens } from '../design/makeStyles';
import { Box } from '../ui/Box';
import { Text } from '../ui/Text';

type Variant = 'default' | 'filled';

export interface TextareaProps extends Omit<TextInputProps, 'editable' | 'multiline'> {
  /** Label text */
  label?: string;
  /** Error message */
  error?: string;
  /** Helper text */
  helperText?: string;
  /** Variant style */
  variant?: Variant;
  /** Disabled state */
  disabled?: boolean;
  /** Max character length */
  maxLength?: number;
  /** Number of rows */
  rows?: number;
}

export const Textarea = React.forwardRef<React.ElementRef<typeof TextInput>, TextareaProps>(
  (
    {
      label,
      error,
      helperText,
      variant = 'default',
      disabled = false,
      maxLength,
      rows = 4,
      value,
      ...textInputProps
    },
    ref,
  ) => {
    const t = useTokens();
    const charCount = value ? String(value).length : 0;

    const containerStyle: ViewStyle = {
      width: '100%',
    };

    const inputWrapperStyle: ViewStyle = {
      borderWidth: 1,
      borderColor: error ? t.colors.danger : t.colors.border,
      borderRadius: t.radius[2],
      backgroundColor: variant === 'filled' ? t.colors.surface : '#FFFFFF',
      opacity: disabled ? 0.5 : 1,
    };

    const inputStyle: TextStyle = {
      paddingHorizontal: t.spacing[3],
      paddingVertical: t.spacing[3],
      fontSize: t.typography.size.md,
      color: t.colors.text,
      minHeight: rows * 24,
      textAlignVertical: 'top',
    };

    return (
      <Box style={containerStyle}>
        {label && (
          <Text variant="label" style={{ marginBottom: t.spacing[1] }}>
            {label}
          </Text>
        )}
        <Box style={inputWrapperStyle}>
          <TextInput
            ref={ref}
            editable={!disabled}
            multiline
            numberOfLines={rows}
            placeholderTextColor={t.colors.subtle}
            maxLength={maxLength}
            value={value}
            {...textInputProps}
            style={inputStyle}
          />
        </Box>
        <Box
          row
          style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: t.spacing[1] }}
        >
          <Box flex={1}>
            {error && (
              <Text variant="subtle" style={{ color: t.colors.danger }}>
                {error}
              </Text>
            )}
            {helperText && !error && <Text variant="subtle">{helperText}</Text>}
          </Box>
          {maxLength && (
            <Text variant="subtle">
              {charCount}/{maxLength}
            </Text>
          )}
        </Box>
      </Box>
    );
  },
);

Textarea.displayName = 'Textarea';
