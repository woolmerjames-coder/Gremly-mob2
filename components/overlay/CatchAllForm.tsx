/**
 * CatchAllForm - Phase 6
 * Minimal form for quick capture
 */

import React, { useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { overlayStyles } from '../../app/styles/manualAdd.styles';
import { Button } from '../../design-system/Button';
import { CatchAllSchema } from '../../app/schemas/manualAdd';
import type { ManualAddPayload } from '../../app/schemas/manualAdd';

interface CatchAllFormProps {
  onSubmit: (payload: ManualAddPayload) => void;
}

export function CatchAllForm({ onSubmit }: CatchAllFormProps) {
  const [entry, setEntry] = useState('');

  console.log('[CatchAllForm] RENDER');

  const handleSubmit = () => {
    try {
      const data = CatchAllSchema.parse({ entry });

      onSubmit({
        type: 'catchall',
        data,
      });
    } catch (error) {
      console.error('Validation error:', error);
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
          label="Capture"
          variant="primary"
          onPress={handleSubmit}
          disabled={!isValid}
          testID="catchall-submit"
        />
      </View>
    </View>
  );
}
