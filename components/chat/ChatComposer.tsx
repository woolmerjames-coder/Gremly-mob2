/**
 * ChatComposer — best-in-class mobile chat input
 *
 * Design: let RN's TextInput auto-size between min/max heights. No manual
 * height state — simpler, more reliable on iOS than state-driven height.
 *
 * - Multiline by default; Enter inserts a newline
 * - Submits via Send button or Cmd+Enter (hardware keyboards)
 * - Grows from 1 line to 7 lines, then scrolls internally
 * - Send button anchored at bottom; placeholder/text flows from top
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Send } from 'lucide-react-native';
import { lightTokens } from '../../design/tokens';

const LINE_HEIGHT = 22;
const V_PADDING = 11;
const MIN_HEIGHT = LINE_HEIGHT + V_PADDING * 2; // 44 (1 line)
const MAX_HEIGHT = LINE_HEIGHT * 7 + V_PADDING * 2; // 176 (7 lines)

interface ChatComposerProps {
  onSend: (text: string) => void;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
  testID?: string;
  initialText?: string;
}

export function ChatComposer({
  onSend,
  onChangeText: onChangeTextProp,
  placeholder = 'Type a message...',
  disabled = false,
  testID,
  initialText,
}: ChatComposerProps) {
  const [text, setText] = useState(initialText || '');
  const inputRef = useRef<TextInput>(null);

  const canSend = text.trim().length > 0 && !disabled;

  const handleSend = useCallback(() => {
    if (!canSend) return;
    const messageToSend = text.trim();

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setText('');
    inputRef.current?.clear();
    onSend(messageToSend);

    requestAnimationFrame(() => inputRef.current?.focus());
  }, [canSend, text, onSend]);

  const handleTextChange = useCallback(
    (next: string) => {
      setText(next);
      onChangeTextProp?.(next);
    },
    [onChangeTextProp],
  );

  // Cmd+Enter on hardware keyboards submits. Plain Enter = newline.
  const handleKeyPress = useCallback(
    (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      const ne = e.nativeEvent as TextInputKeyPressEventData & {
        metaKey?: boolean;
      };
      if (ne.key === 'Enter' && ne.metaKey === true) {
        // @ts-expect-error preventDefault exists on hardware keyboard events
        e.preventDefault?.();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.inputContainer}>
        <TextInput
          ref={inputRef}
          style={styles.textInput}
          value={text}
          onChangeText={handleTextChange}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          placeholderTextColor="rgba(34, 34, 34, 0.4)"
          multiline
          textAlignVertical="top"
          editable={!disabled}
          returnKeyType="default"
          submitBehavior="newline"
          keyboardAppearance="light"
          testID={testID ? `${testID}-input` : undefined}
        />
        <TouchableOpacity
          style={[styles.sendButton, canSend ? styles.sendButtonActive : styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !canSend }}
          testID={testID ? `${testID}-send` : undefined}
        >
          <Send
            size={20}
            color={canSend ? lightTokens.colors.linenCream : 'rgba(34, 34, 34, 0.4)'}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'transparent',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end', // button anchored at bottom as field grows
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: LINE_HEIGHT,
    color: lightTokens.colors.charcoalInk,
    paddingTop: V_PADDING,
    paddingBottom: V_PADDING,
    paddingHorizontal: 0,
    textAlignVertical: 'top',
    minHeight: MIN_HEIGHT,
    maxHeight: MAX_HEIGHT,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    marginBottom: 6,
  },
  sendButtonActive: {
    backgroundColor: lightTokens.colors.mossGreen,
  },
  sendButtonDisabled: {
    backgroundColor: 'transparent',
  },
});
