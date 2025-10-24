/**
 * InlineActionConfirmation - Phase 11.3
 * Renders action confirmations inline with chat messages instead of overlay toast
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { SpaceChatMessage } from '../../lib/types';
import { lightTokens } from '../../design/tokens';

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
  const actionType: ActionType = metadata.actionType || 'todo';
  const content = message.content || 'New item';

  const getActionIcon = () => {
    switch (actionType) {
      case 'habit':
        return '⚡';
      case 'todo':
        return '✓';
      case 'note':
        return '📝';
      default:
        return '✓';
    }
  };

  const getActionLabel = () => {
    switch (actionType) {
      case 'habit':
        return 'Habit';
      case 'todo':
        return 'Todo';
      case 'note':
        return 'Note';
      default:
        return 'Item';
    }
  };

  const handleConfirmPress = async () => {
    if (onConfirm) {
      await onConfirm();
    }
  };

  const handleEditPress = () => {
    if (onEdit) {
      onEdit();
    }
  };

  const handleCancelPress = () => {
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {getActionIcon()} {getActionLabel()}: {content}
        </Text>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, styles.confirmButton]}
          onPress={handleConfirmPress}
          testID={`${testID}-confirm`}
        >
          <Text style={[styles.buttonText, styles.confirmButtonText]}>Confirm</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.editButton]}
          onPress={handleEditPress}
          testID={`${testID}-edit`}
        >
          <Text style={styles.buttonText}>Edit</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.cancelButton]}
          onPress={handleCancelPress}
          testID={`${testID}-cancel`}
        >
          <Text style={styles.buttonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: lightTokens.colors.linenCream, // #F9F6F1
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 16,
    borderLeftWidth: 4,
    borderLeftColor: lightTokens.colors.mossGreen, // #2E5540
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: lightTokens.colors.charcoalInk, // #222222
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButton: {
    backgroundColor: lightTokens.colors.mossGreen, // #2E5540
  },
  editButton: {
    backgroundColor: lightTokens.colors.sageMist, // #BFD8C0
  },
  cancelButton: {
    backgroundColor: '#E8E8E8',
  },
  buttonText: {
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 14,
    color: '#FFFFFF',
  },
  confirmButtonText: {
    color: '#FFFFFF',
  },
});
