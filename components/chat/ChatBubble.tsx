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
import { renderFormattedContent } from '../../lib/markdown/renderFormattedContent';
import SaveButton from './SaveButton';
import type { SaveableType } from '../../lib/chat/saveableTypes';

interface ChatBubbleProps {
  message: SpaceChatMessage;
  testID?: string;
  /** Called when user taps save on the saveable card (instant save) */
  onSavePress?: (saveable: NonNullable<SpaceChatMessage['saveable']>) => void;
  /** Called when user taps edit on the saveable card (opens overlay) */
  onEditPress?: (saveable: NonNullable<SpaceChatMessage['saveable']>) => void;
  /** Called when user dismisses the saveable card */
  onDismissSaveable?: (messageId: string) => void;
}

function ChatBubbleInner({
  message,
  testID,
  onSavePress,
  onEditPress,
  onDismissSaveable,
}: ChatBubbleProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  // Skip animations in test environment
  const isTestEnv = process.env.JEST_WORKAROUND === '1';

  // User messages: slide in from right
  const userAnimation = isTestEnv ? undefined : SlideInRight.duration(150).springify().mass(0.8);

  // Assistant messages: fade in with gentle rise
  const assistantAnimation = isTestEnv
    ? undefined
    : FadeIn.duration(200)
        .delay(120)
        .withInitialValues({
          transform: [{ translateY: 10 }],
        });

  // Layout animation
  const layoutAnimation = isTestEnv ? undefined : Layout.springify();

  // Use regular View in tests, Animated.View in prod
  const ViewComponent = isTestEnv ? View : Animated.View;

  // Map saveable type from message to SaveableType
  const getSaveableType = (type: string): SaveableType => {
    if (type === 'todo') return 'todo';
    if (type === 'habit') return 'habit';
    return 'log-general'; // 'note' maps to 'log-general'
  };

  return (
    <ViewComponent
      entering={isUser ? userAnimation : assistantAnimation}
      layout={layoutAnimation}
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
        {isAssistant ? (
          <View style={{ paddingVertical: 2 }}>{renderFormattedContent(message.content)}</View>
        ) : (
          <Text style={[styles.text, isUser && styles.userText]}>{message.content}</Text>
        )}
      </View>

      {/* Saveable card - render if exists and not dismissed */}
      {isAssistant && message.saveable && !message.saveableDismissed && (
        <View style={styles.saveableCardContainer}>
          <SaveButton
            suggestedType={getSaveableType(message.saveable.type)}
            onSave={() => onSavePress?.(message.saveable!)}
            onEdit={() => onEditPress?.(message.saveable!)}
            onDismiss={() => onDismissSaveable?.(message.id)}
            visible={true}
            disabled={false}
          />
        </View>
      )}
    </ViewComponent>
  );
}

const styles = StyleSheet.create({
  // Container for each message
  container: {
    marginVertical: 4, // Base spacing between messages
    paddingHorizontal: 16,
  },
  userContainer: {
    alignItems: 'flex-end',
    marginBottom: 16, // Extra space after user message before assistant reply
  },
  assistantContainer: {
    alignItems: 'flex-start',
    marginBottom: 4, // Tight spacing between assistant messages
  },
  bubble: {
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    maxWidth: '85%',
    minWidth: 40,
  },
  // User message bubble - lighter and more refined
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(92, 107, 90, 0.87)', // 87% opacity
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    maxWidth: '85%',
    // Glass effect shadow
    ...lightTokens.elevation.chatUser,
    // Subtle inner glow
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  // Assistant message bubble - subtle editorial accent bar
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
    paddingLeft: 14, // Breathing room between accent line and text
    borderLeftWidth: 2, // Thin accent bar
    borderLeftColor: 'rgba(212, 164, 74, 0.60)', // Golden Pear at 60% opacity - warm but calm
    borderRadius: 0,
    maxWidth: '95%',
    marginLeft: -4, // Shift accent line left, more margin from bullets
    marginTop: -6, // Integrated, not floating
  },
  saveableCardContainer: {
    marginTop: 12,
    alignItems: 'flex-start',
  },
  text: {
    fontSize: 15,
    lineHeight: 21, // fontSize × 1.4
    fontWeight: '400',
    letterSpacing: -0.2,
  },
  userText: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 21, // fontSize × 1.4
    fontWeight: '400',
    letterSpacing: -0.2,
  },
  assistantText: {
    color: '#2D2D2D', // Softer than pure black
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '400',
    letterSpacing: -0.2,
  },
});

// Memoized export to prevent unnecessary re-renders in FlatList
export const ChatBubble = React.memo(ChatBubbleInner);
