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
  const DEBUG = (process.env.EXPO_PUBLIC_DEBUG_CORTEX ?? 'false') === 'true';

  if (DEBUG) {
    console.log('[CATCHALL][FORM] render, entry length:', entry.length);
  }

  const handleSubmit = () => {
    if (DEBUG) {
      console.log(
        '[CATCHALL][CAPTURE] submit dispatched, text:',
        entry.trim().substring(0, 50) + (entry.length > 50 ? '...' : ''),
      );
    }

    try {
      const data = CatchAllSchema.parse({ entry });

      if (DEBUG) {
        console.log('[CATCHALL][FORM] validation success, submitting payload');
      }

      onSubmit({
        type: 'catchall',
        data,
      });

      if (DEBUG) {
        console.log('[CATCHALL][FORM] onSubmit dispatched');
      }
    } catch (error) {
      if (DEBUG) {
        console.error('[CATCHALL][FORM] validation error:', error);
      } else {
        console.error('Validation error:', error);
      }
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
          testID="capture-catchall"
        />
      </View>
    </View>
  );
}
