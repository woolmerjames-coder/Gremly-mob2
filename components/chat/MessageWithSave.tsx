/**
 * MessageWithSave - Wraps an assistant message with an optional Save button
 *
 * This component wraps existing message bubbles without requiring changes
 * to the message bubble component itself. The Save button appears below
 * the message when saveable content is detected.
 *
 * @example
 * ```tsx
 * const { getButtonStateForMessage, startSaving, dismissSaveButton } = useSaveButtonState();
 * const buttonState = getButtonStateForMessage(message.id);
 *
 * <MessageWithSave
 *   messageId={message.id}
 *   saveableResult={buttonState?.result ?? null}
 *   showSaveButton={buttonState?.isVisible ?? false}
 *   isSaving={buttonState?.isSaving ?? false}
 *   onSave={(result) => {
 *     startSaving();
 *     openSaveOverlay(result);
 *   }}
 *   onDismiss={dismissSaveButton}
 * >
 *   <MessageBubble message={message} />
 * </MessageWithSave>
 * ```
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import SaveButton from './SaveButton';
import type { SaveableResult } from '../../lib/chat/saveableTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface MessageWithSaveProps {
  /** The message bubble content */
  children: React.ReactNode;
  /** ID of this message */
  messageId: string;
  /** Detection result, null if none */
  saveableResult: SaveableResult | null;
  /** Whether to show the button */
  showSaveButton: boolean;
  /** Whether save is in progress */
  isSaving: boolean;
  /** Called when Save tapped */
  onSave: (result: SaveableResult) => void;
  /** Called when dismissed */
  onDismiss: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function MessageWithSave({
  children,
  messageId: _messageId,
  saveableResult,
  showSaveButton,
  isSaving,
  onSave,
  onDismiss,
}: MessageWithSaveProps): React.JSX.Element {
  return (
    <View style={styles.container}>
      {children}
      {showSaveButton && saveableResult && (
        <View style={styles.saveButtonWrapper}>
          <SaveButton
            suggestedType={saveableResult.suggestedType}
            onSave={() => onSave(saveableResult)}
            onDismiss={onDismiss}
            visible={showSaveButton}
            disabled={isSaving}
          />
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    // Standard wrapper, no special styling
  },
  saveButtonWrapper: {
    marginTop: 8,
    alignItems: 'flex-start', // Left-aligned like assistant messages
  },
});
