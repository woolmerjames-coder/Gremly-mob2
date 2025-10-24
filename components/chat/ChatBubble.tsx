/**
 * ChatBubble - Phase 10.5 Space Chats v1 + Harmonic Glass Design
 * Message bubble component with glass effect styling and entrance animations
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { FadeIn, SlideInRight, Layout } from 'react-native-reanimated';
import { Text } from '../../ui/Text';
import { SpaceChatMessage } from '../../lib/types';
import { lightTokens } from '../../design/tokens';

interface ChatBubbleProps {
  message: SpaceChatMessage;
  testID?: string;
}

export function ChatBubble({ message, testID }: ChatBubbleProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  // User messages: slide in from right
  const userAnimation = SlideInRight.duration(150).springify().mass(0.8);

  // Assistant messages: fade in with gentle rise
  const assistantAnimation = FadeIn.duration(200)
    .delay(120)
    .withInitialValues({
      transform: [{ translateY: 10 }],
    });

  return (
    <Animated.View
      entering={isUser ? userAnimation : assistantAnimation}
      layout={Layout.springify()}
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
    </Animated.View>
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
    borderRadius: 14, // 12-14px for glass effect
    paddingVertical: 12,
    paddingHorizontal: 16,
    maxWidth: '85%',
    minWidth: 40,
  },
  userBubble: {
    backgroundColor: lightTokens.colors.mossGreen,
    marginRight: 12, // Slightly tighter to edge
    // Glass effect shadow
    ...lightTokens.elevation.chatUser,
    // Optional inner glow
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  assistantBubble: {
    backgroundColor: lightTokens.colors.sageMistTranslucent,
    // Glass effect shadow (more subtle)
    ...lightTokens.elevation.chatGremly,
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
  },
  userText: {
    color: lightTokens.colors.linenCream,
  },
  assistantText: {
    color: lightTokens.colors.charcoalInk,
  },
});
