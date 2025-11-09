/**
 * TagsField - Inline tag editor for overlay forms
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  NativeSyntheticEvent,
  TextInputSubmitEditingEventData,
} from 'react-native';
import { addTag, normalizeTag, normalizeTags, removeTag } from '../../../lib/tags/normalize';

export interface TagsFieldProps {
  value: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  testID?: string;
  removedRef?: React.MutableRefObject<Set<string>>;
}

export function TagsField({
  value,
  onChange,
  disabled = false,
  testID,
  removedRef,
}: TagsFieldProps) {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const displayTags = useMemo(() => normalizeTags(value), [value]);

  const makeTestKey = (tag: string): string => {
    const sanitized = tag.replace(/[^a-zA-Z0-9_-]/g, '');
    return sanitized.length > 0 ? sanitized : 'tag';
  };

  const tryAddTag = (rawInput: string): boolean => {
    if (!rawInput.trim()) {
      return false;
    }

    const { tag, error: parseError } = normalizeTag(rawInput);

    if (parseError) {
      setError(parseError);
      return false;
    }

    if (!tag) {
      return false;
    }

    const next = addTag(value, rawInput);
    onChange(next);
    setError(null);
    return true;
  };

  const handleChangeText = (text: string) => {
    if (disabled) {
      setInputValue(text);
      return;
    }

    if (text.includes(',')) {
      const segments = text.split(',');
      const lastSegment = segments.pop() ?? '';

      segments.forEach((segment) => {
        tryAddTag(segment);
      });

      setInputValue(lastSegment);
      return;
    }

    setInputValue(text);
  };

  const handleSubmitEditing = (
    event: NativeSyntheticEvent<TextInputSubmitEditingEventData>,
  ): void => {
    if (disabled) {
      return;
    }

    const submitted = event.nativeEvent.text;
    const added = tryAddTag(submitted.length ? submitted : inputValue);

    if (added) {
      setInputValue('');
    }
  };

  const handleBlur = () => {
    if (disabled) {
      return;
    }

    const added = tryAddTag(inputValue);
    if (added) {
      setInputValue('');
    }
  };

  const handleRemove = (tagToRemove: string) => {
    if (disabled) {
      return;
    }

    setError(null);
    removedRef?.current.add(tagToRemove.toLowerCase());
    const next = removeTag(value, tagToRemove);
    onChange(next);
  };

  return (
    <View style={styles.container} testID={testID}>
      {displayTags.length > 0 && (
        <View style={styles.tagsContainer}>
          {displayTags.map((tag) => (
            <View key={tag} style={styles.chip}>
              <Text style={styles.chipText}>{tag}</Text>
              {!disabled && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${tag}`}
                  onPress={() => handleRemove(tag)}
                  style={styles.removeButton}
                  testID={testID ? `${testID}-remove-${makeTestKey(tag)}` : undefined}
                >
                  <Text style={styles.removeButtonText}>×</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}

      <TextInput
        style={[styles.input, disabled && styles.inputDisabled]}
        value={inputValue}
        onChangeText={handleChangeText}
        onSubmitEditing={handleSubmitEditing}
        onBlur={handleBlur}
        placeholder="Add tag…"
        placeholderTextColor="#9CA3AF"
        editable={!disabled}
        autoCapitalize="none"
        autoCorrect={false}
        blurOnSubmit={false}
        testID={testID ? `${testID}-input` : 'tags-field-input'}
      />

      <Text style={styles.hint}>
        Press Enter or comma to add. Prefix @ (person), * (type), # (topic/emotion). Bare words
        become #topic.
      </Text>

      {error && (
        <Text style={styles.errorText} testID={testID ? `${testID}-error` : 'tags-field-error'}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
  },
  chipText: {
    fontSize: 14,
    color: '#111827',
  },
  removeButton: {
    marginLeft: 8,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: '#E5E7EB',
  },
  removeButtonText: {
    fontSize: 14,
    lineHeight: 16,
    color: '#4B5563',
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    color: '#6B7280',
  },
  inputDisabled: {
    backgroundColor: '#F9FAFB',
    color: '#9CA3AF',
  },
  errorText: {
    marginTop: 6,
    color: '#DC2626',
    fontSize: 12,
  },
});
