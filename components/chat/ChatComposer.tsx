/**
 * ChatComposer - Phase 10.5 Space Chats v1
 * Multiline text input with Send icon for composing chat messages
 */

import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
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
  const [inputHeight, setInputHeight] = useState(56);

  const handleSend = () => {
    if (!text.trim() || disabled) return;

    onSend(text.trim());
    setText('');
    setInputHeight(56); // Reset to minimum height
  };

  const handleContentSizeChange = (event: { nativeEvent: { contentSize: { height: number } } }) => {
    const { height } = event.nativeEvent.contentSize;
    // Constrain height between 56pt and 120pt as specified
    const newHeight = Math.max(56, Math.min(120, height + 16)); // +16 for padding
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
          onContentSizeChange={handleContentSizeChange}
          scrollEnabled={inputHeight >= 120}
          blurOnSubmit={false}
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
    minHeight: 56,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    color: lightTokens.colors.text,
    maxHeight: 104, // 120 - 16 padding
    textAlignVertical: 'top',
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
