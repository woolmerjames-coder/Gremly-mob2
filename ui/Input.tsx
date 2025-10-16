/**
 * Input Component - TextInput with label and error support
 */

import React from 'react';
import { TextInput, View, ViewStyle, TextStyle, KeyboardTypeOptions } from 'react-native';
import { useTokens } from '../design/makeStyles';
import { Text } from './Text';

export interface InputProps {
  /** Disallow className */
  className?: never;

  /** Input value */
  value: string;

  /** Change handler */
  onChangeText: (text: string) => void;

  /** Placeholder text */
  placeholder?: string;

  /** Keyboard type */
  keyboardType?: KeyboardTypeOptions;

  /** Secure text entry for passwords */
  secureTextEntry?: boolean;

  /** Optional label */
  label?: string;

  /** Optional error message */
  errorText?: string;

  /** Test ID */
  testID?: string;
}

export const Input: React.FC<InputProps> = ({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  secureTextEntry,
  label,
  errorText,
  testID,
}) => {
  const t = useTokens();

  const containerStyle: ViewStyle = {
    gap: t.spacing[1],
  };

  const inputStyle: TextStyle = {
    height: 44,
    paddingHorizontal: t.spacing[3],
    paddingVertical: t.spacing[2],
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: errorText ? t.colors.danger : t.colors.border,
    borderRadius: t.radius[2],
    fontSize: t.typography.size.md,
    color: t.colors.text,
  };

  return (
    <View style={containerStyle}>
      {label && <Text variant="label">{label}</Text>}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.colors.subtle}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        style={inputStyle}
        testID={testID}
      />
      {errorText && (
        <Text variant="subtle" style={{ color: t.colors.danger }}>
          {errorText}
        </Text>
      )}
    </View>
  );
};
