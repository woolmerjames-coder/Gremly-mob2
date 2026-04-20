/**
 * ChatComposer — best-in-class mobile chat input
 *
 * Behavior (matches iMessage / WhatsApp / Slack / ChatGPT mobile):
 * - Multiline by default; Enter inserts a newline (never submits on soft keyboard)
 * - Submits via tap on Send button, or Cmd+Enter on hardware keyboards (iPad)
 * - Auto-grows from 1 line up to ~6 lines, then scrolls internally
 * - Smooth height animation via LayoutAnimation
 * - Send button anchored to bottom as field grows
 * - Haptic on send, disabled state when empty
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
  TextInputContentSizeChangeEventData,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Send } from 'lucide-react-native';
import { lightTokens } from '../../design/tokens';

// Enable LayoutAnimation on Android (iOS is enabled by default)
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const LINE_HEIGHT = 22;
const V_PADDING = 11; // paddingTop / paddingBottom inside TextInput
const MIN_HEIGHT = LINE_HEIGHT + V_PADDING * 2; // 44 — one line
const MAX_LINES = 7;
const MAX_HEIGHT = LINE_HEIGHT * MAX_LINES + V_PADDING * 2; // 154 — six lines

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
  const [contentHeight, setContentHeight] = useState(MIN_HEIGHT);
  const inputRef = useRef<TextInput>(null);

  const canSend = text.trim().length > 0 && !disabled;

  const handleSend = useCallback(() => {
    if (!canSend) return;
    const messageToSend = text.trim();

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Animate collapse back to one line
    LayoutAnimation.configureNext({
      duration: 140,
      update: { type: 'easeInEaseOut' },
    });
    setText('');
    setContentHeight(MIN_HEIGHT);
    inputRef.current?.clear();

    onSend(messageToSend);

    // Keep keyboard open
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [canSend, text, onSend]);

  const handleContentSizeChange = useCallback(
    (e: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
      const measured = e.nativeEvent.contentSize.height + V_PADDING * 2;
      const next = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, measured));
      setContentHeight((prev) => {
        if (prev === next) return prev;
        LayoutAnimation.configureNext({
          duration: 100,
          update: { type: 'easeInEaseOut' },
        });
        return next;
      });
    },
    [],
  );

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
        // @ts-expect-error preventDefault exists on web/hardware keyboard events
        e.preventDefault?.();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <View style={styles.container} testID={testID}>
      <View style={[styles.inputContainer, { height: contentHeight }]}>
        <TextInput
          ref={inputRef}
          style={styles.textInput}
          value={text}
          onChangeText={handleTextChange}
          onContentSizeChange={handleContentSizeChange}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          placeholderTextColor="rgba(34, 34, 34, 0.4)"
          multiline
          scrollEnabled
          textAlignVertical="top"
          editable={!disabled}
          returnKeyType="default"
          // iOS 14+ / RN 0.73+: explicit newline behavior for multiline
          submitBehavior="newline"
          keyboardAppearance="light"
          testID={testID ? `${testID}-input` : undefined}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            canSend ? styles.sendButtonActive : styles.sendButtonDisabled,
            // Center the button at single-line height, anchor to bottom once expanded
            contentHeight <= MIN_HEIGHT
              ? { alignSelf: 'center', marginBottom: 0 }
              : { alignSelf: 'flex-end', marginBottom: 6 },
          ]}
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
    // alignItems default 'stretch' so TextInput fills container vertically.
    // Send button uses alignSelf: 'flex-end' to anchor at bottom.
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    paddingHorizontal: 16,
    paddingVertical: 0,
    minHeight: MIN_HEIGHT,
    maxHeight: MAX_HEIGHT,
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
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendButtonActive: {
    backgroundColor: lightTokens.colors.mossGreen,
  },
  sendButtonDisabled: {
    backgroundColor: 'transparent',
  },
});
