/**
 * ChatBubble - Phase 10.5 Space Chats v1
 * Message bubble component with Gremly brand colors (palette v4.2)
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../../ui/Text';
import { SpaceChatMessage } from '../../lib/types';

interface ChatBubbleProps {
  message: SpaceChatMessage;
  testID?: string;
}

export function ChatBubble({ message, testID }: ChatBubbleProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  return (
    <View
      style={[
        styles.container,
        isUser && styles.userContainer,
        isAssistant && styles.assistantContainer,
      ]}
      testID={testID}
    >
      <View
        style={[styles.bubble, isUser && styles.userBubble, isAssistant && styles.assistantBubble]}
      >
        <Text style={[styles.text, isUser && styles.userText, isAssistant && styles.assistantText]}>
          {message.content}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    paddingHorizontal: 16,
  },
  userContainer: {
    alignItems: 'flex-end',
  },
  assistantContainer: {
    alignItems: 'flex-start',
  },
  bubble: {
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 16,
    maxWidth: '85%',
    minWidth: 40,
  },
  userBubble: {
    backgroundColor: '#2E5540', // Moss Green from brand palette v4.2
  },
  assistantBubble: {
    backgroundColor: '#BFD8C0', // Sage Mist from brand palette v4.2
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
  },
  userText: {
    color: '#F9F6F1', // Linen Cream
  },
  assistantText: {
    color: '#222222', // Charcoal Ink
  },
});
