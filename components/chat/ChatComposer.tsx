/**
 * ChatComposer - Phase 10.5 Space Chats v1 + Harmonic Glass Design
 * Multiline text input with Send icon and glass effect styling
 */

import React, { useState, useRef } from 'react';
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
import * as Haptics from 'expo-haptics';
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
  const inputRef = useRef<TextInput>(null);
  const shouldPreventNextChange = useRef(false);

  const handleSend = () => {
    if (!text.trim() || disabled) return;

    const messageToSend = text.trim();

    // Haptic feedback on send
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Mark that we're sending to prevent newline
    shouldPreventNextChange.current = true;

    // Clear input and reset height IMMEDIATELY before any async operations
    setText('');
    setInputHeight(44);

    // Also clear the native input to ensure no residual text
    if (inputRef.current) {
      inputRef.current.clear();
      inputRef.current.setNativeProps({ text: '' });
    }

    // Send message (async operation happens after clearing)
    onSend(messageToSend);

    // Keep keyboard open and focused
    setTimeout(() => {
      inputRef.current?.focus();
      shouldPreventNextChange.current = false;
    }, 50);
  };

  const handleContentSizeChange = (event: { nativeEvent: { contentSize: { height: number } } }) => {
    const { height } = event.nativeEvent.contentSize;
    // Constrain height between 44pt and 120pt (approx up to ~3 lines)
    // Account for padding: content height + container padding
    const newHeight = Math.max(44, Math.min(120, height + 16));
    setInputHeight(newHeight);
  };

  const handleTextChange = (newText: string) => {
    // If we just sent a message, ignore text changes briefly
    if (shouldPreventNextChange.current) {
      return;
    }
    setText(newText);
  };

  const canSend = text.trim().length > 0 && !disabled;

  return (
    <View style={styles.container} testID={testID}>
      <View style={[styles.inputContainer, { height: inputHeight }]}>
        <TextInput
          ref={inputRef}
          style={styles.textInput}
          value={text}
          onChangeText={handleTextChange}
          placeholder={placeholder}
          placeholderTextColor="rgba(34, 34, 34, 0.4)"
          multiline
          numberOfLines={3}
          onContentSizeChange={handleContentSizeChange}
          scrollEnabled={true}
          blurOnSubmit={true} // Prevent adding newline on submit
          returnKeyType="send"
          onSubmitEditing={(_e: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
            if (text.trim()) {
              handleSend();
            }
          }}
          onKeyPress={({ nativeEvent }: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
            if (nativeEvent.key === 'Enter') {
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
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    // Glass effect background
    backgroundColor: 'rgba(249, 246, 241, 0.7)', // Semi-translucent Linen Cream
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
    paddingHorizontal: 16,
    paddingVertical: 0,
    minHeight: 44,
    // Subtle shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    color: lightTokens.colors.charcoalInk,
    maxHeight: 104, // 120 - 16 padding
    textAlignVertical: 'center',
    // Consistent padding on all platforms
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 0,
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
    backgroundColor: lightTokens.colors.mossGreen,
  },
  sendButtonDisabled: {
    backgroundColor: 'transparent',
  },
});
