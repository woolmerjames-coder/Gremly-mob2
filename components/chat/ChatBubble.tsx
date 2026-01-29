/**
 * ChatBubble - Phase 10.5 Space Chats v1 + Harmonic Glass Design
 * Message bubble component with glass effect styling and entrance animations
 */

import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import Animated, { FadeIn, SlideInRight, Layout } from 'react-native-reanimated';
import { Text } from '../../ui/Text';
import { SpaceChatMessage } from '../../lib/types';
import { lightTokens } from '../../design/tokens';
import { renderFormattedContent } from '../../lib/markdown/renderFormattedContent';
import SaveButton from './SaveButton';
import { InlineStreamingCursor } from './StreamingCursor';
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
  /** Called when user taps to retry a failed streaming message */
  onRetryStream?: (messageId: string) => void;
}

function ChatBubbleInner({
  message,
  testID,
  onSavePress,
  onEditPress,
  onDismissSaveable,
  onRetryStream,
}: ChatBubbleProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  // Streaming state
  const isStreaming = (message as any).isStreaming === true;
  const streamingFailed = (message as any).streamingCancelled === true;
  const isSearching = (message as any).isSearching === true;
  const searchQuery = (message as any).searchQuery as string | null;

  // Debug logging for save button visibility
  if (isAssistant && __DEV__) {
    console.log('[ChatBubble] Rendering assistant message:', {
      messageId: message.id,
      hasSaveable: !!message.saveable,
      saveableDismissed: message.saveableDismissed,
      isStreaming,
      saveable: message.saveable,
      willShowSaveButton: !!message.saveable && !message.saveableDismissed && !isStreaming,
    });
    console.log('[ChatBubble] Message content:', message.content?.substring(0, 100));
  }

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
          <View style={{ paddingVertical: 2 }}>
            {isSearching ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
                <ActivityIndicator size="small" color="#8B5CF6" />
                <Text
                  style={{ marginLeft: 8, color: '#6B7280', fontSize: 14, fontStyle: 'italic' }}
                >
                  Searching: {searchQuery}
                </Text>
              </View>
            ) : (
              <>
                {renderFormattedContent(message.content)}
                {isStreaming && (
                  <View style={{ flexDirection: 'row', marginTop: 4 }}>
                    <InlineStreamingCursor visible={true} />
                  </View>
                )}
                {streamingFailed && message.content && (
                  <View
                    style={{
                      marginTop: 8,
                      paddingTop: 8,
                      borderTopWidth: 1,
                      borderTopColor: 'rgba(0,0,0,0.1)',
                    }}
                  >
                    <Text style={{ fontSize: 13, color: '#666', fontStyle: 'italic' }}>
                      Hmm, I lost my train of thought.{' '}
                      <Text
                        style={{ color: '#E0C47A', fontWeight: '500' }}
                        onPress={() => onRetryStream?.(message.id)}
                      >
                        Tap to continue
                      </Text>
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        ) : (
          <Text style={[styles.text, isUser && styles.userText]}>{message.content}</Text>
        )}
      </View>

      {/* Saveable card - render if exists, not dismissed, and not streaming */}
      {isAssistant &&
        message.saveable &&
        !message.saveableDismissed &&
        !isStreaming &&
        (() => {
          const saveable = message.saveable!;
          // Determine button state from saveable data
          const isSaving = saveable.isSaving === true;
          const isSaved = !!saveable.savedItemId;

          // Derive button state
          let buttonState: 'initial' | 'loading' | 'confirmed' = 'initial';
          if (isSaved) {
            buttonState = 'confirmed';
          } else if (isSaving) {
            buttonState = 'loading';
          }

          // Map savedItemType to SavedItemType for confirmed display
          const savedType = saveable.savedItemType as 'habit' | 'todo' | 'log' | undefined;

          if (__DEV__) {
            console.log('[ChatBubble] SaveButton state:', {
              messageId: message.id,
              isSaving,
              isSaved,
              buttonState,
              savedType,
              savedItemId: saveable.savedItemId,
            });
          }

          return (
            <View style={styles.saveableCardContainer}>
              <SaveButton
                suggestedType={getSaveableType(saveable.type)}
                state={buttonState}
                savedType={savedType}
                savedItemId={saveable.savedItemId}
                onSave={() => onSavePress?.(saveable)}
                onEdit={() => onEditPress?.(saveable)}
                onDismiss={() => onDismissSaveable?.(message.id)}
                visible={true}
                disabled={isSaving}
              />
            </View>
          );
        })()}
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
    maxWidth: '100%', // Use full available width
    marginLeft: -4, // Shift accent line left, more margin from bullets
    marginTop: -6, // Integrated, not floating
  },
  saveableCardContainer: {
    marginTop: 16, // More space between message and save card
    marginLeft: 0, // Align with message content
    width: '100%',
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
