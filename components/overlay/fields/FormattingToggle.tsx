/**
 * FormattingToggle - Reusable formatting selector for Journal, Notes, and Person notes
 * Provides options for bullet lists, numbered lists, and checkboxes
 */
import React from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import { Icon } from '../../ui/Icon';

// ============================================================================
// Types
// ============================================================================

export type FormattingType = 'bullets' | 'numbers' | 'checkboxes' | null;

interface FormattingToggleProps {
  value: FormattingType;
  onChange: (value: FormattingType) => void;
  disabled?: boolean;
  label?: string;
}

interface FormattingOptionProps {
  icon: 'Circle' | 'FileText' | 'CheckCircle2';
  label: string;
  value: FormattingType;
  selected: boolean;
  onPress: () => void;
  testID: string;
  disabled?: boolean;
}

// ============================================================================
// Helper Components
// ============================================================================

function FormattingOption({
  icon,
  label,
  value,
  selected,
  onPress,
  testID,
  disabled = false,
}: FormattingOptionProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={[styles.option, selected && styles.optionSelected, disabled && styles.optionDisabled]}
    >
      <Icon
        name={icon}
        size="xs"
        color={selected ? '#2E7D6A' : '#666666'}
        strokeWidth={selected ? 2.5 : 2}
      />
      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text>
    </Pressable>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * FormattingToggle Component
 *
 * Usage:
 * ```tsx
 * const [formatting, setFormatting] = useState<FormattingType>(null);
 *
 * <FormattingToggle
 *   value={formatting}
 *   onChange={setFormatting}
 *   label="List formatting"
 * />
 * ```
 */
export function FormattingToggle({
  value,
  onChange,
  disabled = false,
  label = 'Format',
}: FormattingToggleProps) {
  const handlePress = (newValue: FormattingType) => {
    // Toggle off if clicking the same option
    if (value === newValue) {
      onChange(null);
    } else {
      onChange(newValue);
    }
  };

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.optionsRow}>
        <FormattingOption
          icon="Circle"
          label="Bullets"
          value="bullets"
          selected={value === 'bullets'}
          onPress={() => handlePress('bullets')}
          testID="fmt-bullets"
          disabled={disabled}
        />
        <FormattingOption
          icon="FileText"
          label="Numbers"
          value="numbers"
          selected={value === 'numbers'}
          onPress={() => handlePress('numbers')}
          testID="fmt-numbers"
          disabled={disabled}
        />
        <FormattingOption
          icon="CheckCircle2"
          label="Checkboxes"
          value="checkboxes"
          selected={value === 'checkboxes'}
          onPress={() => handlePress('checkboxes')}
          testID="fmt-checkboxes"
          disabled={disabled}
        />
      </View>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 4,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    minWidth: 100,
  },
  optionSelected: {
    backgroundColor: '#E8F5F3',
    borderColor: '#4CAF93',
  },
  optionDisabled: {
    opacity: 0.5,
  },
  optionText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666666',
  },
  optionTextSelected: {
    color: '#2E7D6A',
    fontWeight: '600',
  },
});
