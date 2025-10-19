/**
 * PersonFields - Form fields for creating/editing people
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Input } from '../../../design-system/Input';

interface PersonFieldsProps {
  name: string;
  onNameChange: (value: string) => void;
  email: string;
  onEmailChange: (value: string) => void;
  disabled?: boolean;
}

export function PersonFields({
  name,
  onNameChange,
  email,
  onEmailChange,
  disabled = false,
}: PersonFieldsProps) {
  return (
    <View style={styles.container}>
      {/* Name field */}
      <View style={styles.section}>
        <Input
          label="Name"
          value={name}
          onChangeText={onNameChange}
          placeholder="e.g., John Doe"
          disabled={disabled}
          testID="person-name-input"
        />
      </View>

      {/* Email field */}
      <View style={styles.section}>
        <Input
          label="Email (optional)"
          value={email}
          onChangeText={onEmailChange}
          placeholder="john@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          disabled={disabled}
          testID="person-email-input"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 20,
  },
  section: {
    gap: 8,
  },
});
