/**
 * ChatComposer - Phase 10.5 Space Chats v1
 * Multiline text input with Send icon for composing chat messages
 */

import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  NativeSyntheticEvent,
  TextInputSubmitEditingEventData,
  TextInputKeyPressEventData,
} from 'react-native';
import { Send } from 'lucide-react-native';
import { lightTokens } from '../../design/tokens';

interface ChatComposerProps {
  onSend: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
  testID?: string;
}

export function ChatComposer({
  onSend,
  placeholder = 'Type a message...',
  disabled = false,
  testID,
}: ChatComposerProps) {
  const [text, setText] = useState('');
  const [inputHeight, setInputHeight] = useState(44);

  const handleSend = () => {
    if (!text.trim() || disabled) return;

    onSend(text.trim());
    setText('');
    setInputHeight(44); // Reset to minimum height
  };

  const handleContentSizeChange = (event: { nativeEvent: { contentSize: { height: number } } }) => {
    const { height } = event.nativeEvent.contentSize;
    // Constrain height between 44pt and 120pt (approx up to ~3 lines)
    const newHeight = Math.max(44, Math.min(120, height + 16)); // +16 for padding
    setInputHeight(newHeight);
  };

  const canSend = text.trim().length > 0 && !disabled;

  return (
    <View style={styles.container} testID={testID}>
      <View style={[styles.inputContainer, { height: inputHeight }]}>
        <TextInput
          style={styles.textInput}
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={lightTokens.colors.subtle}
          multiline
          numberOfLines={3}
          onContentSizeChange={handleContentSizeChange}
          scrollEnabled={true}
          blurOnSubmit={false}
          returnKeyType="send"
          onSubmitEditing={(_e: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
            // On iOS multiline, onSubmitEditing may not fire unless blurOnSubmit is true,
            // so also handle Enter in onKeyPress below.
            if (text.trim()) {
              handleSend();
            }
          }}
          onKeyPress={({ nativeEvent }: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
            if (nativeEvent.key === 'Enter') {
              // If Shift not held (best-effort; shiftKey may be undefined on some platforms), send.
              // RN does not expose preventDefault for newline; we clear text after sending.
              // @ts-expect-error - shiftKey may not exist on all platforms
              const shift = nativeEvent.shiftKey === true;
              if (!shift && text.trim()) {
                handleSend();
              }
            }
          }}
          editable={!disabled}
          testID={testID ? `${testID}-input` : undefined}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            canSend && styles.sendButtonActive,
            !canSend && styles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={!canSend}
          testID={testID ? `${testID}-send` : undefined}
        >
          <Send
            size={20}
            color={canSend ? lightTokens.colors.onPrimary : lightTokens.colors.subtle}
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
    backgroundColor: lightTokens.colors.bg,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: lightTokens.colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: lightTokens.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 44,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    color: lightTokens.colors.text,
    maxHeight: 104, // 120 - 16 padding
    textAlignVertical: 'top',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    marginBottom: 2, // Slight visual alignment
  },
  sendButtonActive: {
    backgroundColor: lightTokens.colors.primary,
  },
  sendButtonDisabled: {
    backgroundColor: 'transparent',
  },
});
