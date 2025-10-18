/**
 * CatchAllForm - Phase 6
 * Minimal form for quick capture - classification handled by parent overlay
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TextInput } from 'react-native';
import { overlayStyles } from '../../app/styles/manualAdd.styles';
import { Button } from '../../design-system/Button';
import { CatchAllSchema } from '../../app/schemas/manualAdd';
import type { ManualAddPayload } from '../../app/schemas/manualAdd';
import type { AppRecord } from '../../lib/types';

interface CatchAllFormProps {
  onSubmit: (payload: ManualAddPayload) => void;
  mode?: 'create' | 'edit';
  initialValues?: Partial<AppRecord>;
}

export function CatchAllForm({ onSubmit, mode = 'create', initialValues }: CatchAllFormProps) {
  const [entry, setEntry] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Prefill in edit mode
  useEffect(() => {
    if (mode === 'edit' && initialValues) {
      console.log('[CatchAllForm] Prefilling from initialValues:', initialValues);
      if (initialValues.type === 'note' && initialValues.body) {
        setEntry(initialValues.body);
      }
    }
  }, [mode, initialValues]);

  const handleCapture = async () => {
    const inputText = entry?.trim() ?? '';
    if (!inputText) return;

    setIsSubmitting(true);

    try {
      // Validate with schema
      const data = CatchAllSchema.parse({ entry: inputText });

      // Pass to parent (ManualAddOverlay handles classification + save)
      onSubmit({
        type: 'catchall',
        data,
      });
    } catch (error) {
      console.error('Validation error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isValid = entry.trim().length > 0;

  return (
    <View testID="catchall-form">
      <Text style={overlayStyles.label}>Quick Capture *</Text>
      <TextInput
        style={[overlayStyles.textarea, { minHeight: 150 }]}
        value={entry}
        onChangeText={setEntry}
        placeholder="Capture anything on your mind..."
        maxLength={5000}
        multiline
        autoFocus
        testID="catchall-entry"
      />

      {/* Submit */}
      <View style={{ marginTop: 24 }}>
        <Button
          label={mode === 'edit' ? 'Save changes' : 'Capture'}
          variant="primary"
          onPress={handleCapture}
          disabled={!isValid || isSubmitting}
          testID={mode === 'edit' ? 'edit-save' : 'capture-catchall'}
        />
      </View>
    </View>
  );
}
