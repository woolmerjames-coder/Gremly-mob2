/**
 * InlineActionConfirmation - Phase 11.3 / Phase 11.4
 * Renders action confirmations inline with chat messages instead of overlay toast
 * Updated: Clean styling with brand colors, no emojis
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { SpaceChatMessage } from '../../lib/types';

type ActionType = 'habit' | 'todo' | 'note';

export interface InlineActionConfirmationProps {
  message: SpaceChatMessage;
  onConfirm?: () => void | Promise<void>;
  onEdit?: () => void;
  onCancel?: () => void;
  testID?: string;
}

export function InlineActionConfirmation({
  message,
  onConfirm,
  onEdit,
  onCancel,
  testID,
}: InlineActionConfirmationProps) {
  const metadata = message.metadata_json || {};
  const actionType: ActionType = (metadata.actionType as ActionType) || 'todo';
  // Phase 11.7+: Use contextual summary if available, otherwise fall back to content
  const displayText = metadata.summary || message.content || 'New item';

  const getTypeLabel = () => {
    switch (actionType) {
      case 'habit':
        return 'HABIT';
      case 'todo':
        return 'TASK';
      case 'note':
        return 'NOTE';
      default:
        return 'ITEM';
    }
  };

  const handleConfirmPress = async () => {
    console.log('[InlineActionConfirmation] Confirm button pressed');
    console.log('[InlineActionConfirmation] onConfirm handler:', typeof onConfirm);
    if (onConfirm) {
      try {
        console.log('[InlineActionConfirmation] Calling onConfirm...');
        await onConfirm();
        console.log('[InlineActionConfirmation] onConfirm completed successfully');
      } catch (error) {
        console.error('[InlineActionConfirmation] onConfirm failed:', error);
      }
    } else {
      console.warn('[InlineActionConfirmation] No onConfirm handler provided!');
    }
  };

  const handleEditPress = () => {
    console.log('[InlineActionConfirmation] Edit button pressed');
    console.log('[InlineActionConfirmation] onEdit handler:', typeof onEdit);
    if (onEdit) {
      onEdit();
    } else {
      console.warn('[InlineActionConfirmation] No onEdit handler provided!');
    }
  };

  const handleCancelPress = () => {
    console.log('[InlineActionConfirmation] Cancel button pressed');
    console.log('[InlineActionConfirmation] onCancel handler:', typeof onCancel);
    if (onCancel) {
      onCancel();
    } else {
      console.warn('[InlineActionConfirmation] No onCancel handler provided!');
    }
  };

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.header}>
        <Text style={styles.typeLabel}>{getTypeLabel()}</Text>
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {displayText}
      </Text>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.confirmButton]}
          onPress={() => {
            console.log('[Button] Confirm press detected');
            handleConfirmPress();
          }}
          onPressIn={() => console.log('[Button] Confirm press in')}
          onPressOut={() => console.log('[Button] Confirm press out')}
          testID={`${testID}-confirm`}
          activeOpacity={0.7}
        >
          <Text style={[styles.buttonText, styles.confirmText]}>Confirm</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.editButton]}
          onPress={() => {
            console.log('[Button] Edit press detected');
            handleEditPress();
          }}
          onPressIn={() => console.log('[Button] Edit press in')}
          onPressOut={() => console.log('[Button] Edit press out')}
          testID={`${testID}-edit`}
          activeOpacity={0.7}
        >
          <Text style={[styles.buttonText, styles.editText]}>Edit</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.cancelButton]}
          onPress={() => {
            console.log('[Button] Cancel press detected');
            handleCancelPress();
          }}
          onPressIn={() => console.log('[Button] Cancel press in')}
          onPressOut={() => console.log('[Button] Cancel press out')}
          testID={`${testID}-cancel`}
          activeOpacity={0.7}
        >
          <Text style={[styles.buttonText, styles.cancelText]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(249, 246, 241, 0.98)', // Linen Cream with slight transparency
    borderRadius: 14,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(46, 85, 64, 0.1)', // Subtle Moss Green border
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  typeLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2E5540', // Moss Green
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222222', // Charcoal Ink
    paddingRight: 8,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 14,
  },
  button: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  confirmButton: {
    backgroundColor: '#2E5540', // Moss Green - primary action
  },
  editButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#BFD8C0', // Sage Mist border
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#E0E0E0', // Light gray border
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  confirmText: {
    color: '#F9F6F1', // Linen Cream on dark background
  },
  editText: {
    color: '#2E5540', // Moss Green
  },
  cancelText: {
    color: '#666666', // Gray
  },
});
