/**
 * SweepGremlyHeader Component
 *
 * Displays Gremly mascot with context-aware speech text above the SweepCard.
 * Provides a "Chat about this" button to open entity chat.
 */

import React from 'react';
import { View, Text, Image, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { BRAND } from '../../design/brand';
import type { SweepCandidate, SweepCardMeta } from '../../lib/sweep/types';

export interface SweepGremlyHeaderProps {
  candidate: SweepCandidate;
  meta: SweepCardMeta;
  onOpenChat?: (presetHint?: string) => void;
  onMascotPress?: () => void;
}

/**
 * Get context-aware speech text based on card type and state
 */
function getSpeechText(candidate: SweepCandidate, meta: SweepCardMeta): string {
  switch (candidate.kind) {
    case 'todo':
      if (meta.todoStatus === 'unscheduled') {
        return 'When do you want to do this?';
      }
      if (meta.todoStatus === 'overdue') {
        return 'This was due — still need it?';
      }
      if (meta.todoStatus === 'due_today') {
        return 'Due today — done or reschedule?';
      }
      // due_tomorrow or future date
      return 'Check in on this date';

    case 'note':
      if (meta.logSubtype === 'idea') {
        return "Got an idea here — what's next?";
      }
      if (meta.logSubtype === 'journal') {
        return 'A thought to revisit';
      }
      // general or other
      return 'What should happen to this?';

    case 'habit':
      return 'When should this habit begin?';

    default:
      return 'What would you like to do?';
  }
}

/**
 * Get chat button text based on entity type.
 * Makes it clear you're chatting about the card content, not Gremly's question.
 */
function getChatButtonText(candidate: SweepCandidate): string {
  switch (candidate.kind) {
    case 'todo':
      return 'Chat about this todo →';
    case 'habit':
      return 'Chat about this habit →';
    case 'note':
      return 'Chat about this thought →';
    default:
      return 'Chat about this →';
  }
}

export function SweepGremlyHeader({
  candidate,
  meta,
  onOpenChat,
  onMascotPress,
}: SweepGremlyHeaderProps): React.ReactElement {
  const speechText = getSpeechText(candidate, meta);

  const handleChatPress = () => {
    onOpenChat?.(speechText);
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={onMascotPress} disabled={!onMascotPress}>
        <Image
          source={require('../../assets/mascot/gremly-mascot.png')}
          style={styles.mascot}
          resizeMode="contain"
        />
      </Pressable>
      <View style={styles.contentContainer}>
        <View style={styles.speechBubble}>
          <Text style={styles.speechText}>{speechText}</Text>
        </View>
        {onOpenChat && (
          <TouchableOpacity style={styles.chatButton} onPress={handleChatPress} activeOpacity={0.7}>
            <Text style={styles.chatButtonText}>{getChatButtonText(candidate)}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  mascot: {
    width: 48,
    height: 48,
    marginRight: 12,
  },
  contentContainer: {
    flex: 1,
  },
  speechBubble: {
    backgroundColor: 'rgba(191, 216, 192, 0.3)', // sageMist at 30%
    borderRadius: 16,
    padding: 12,
  },
  speechText: {
    fontSize: 15,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
    lineHeight: 22,
  },
  chatButton: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(199, 206, 234, 0.5)', // periwinkleSmoke at 50% - differentiates chat/AI action from sage card actions
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  chatButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5B6494', // Darker periwinkle for contrast
  },
});

export default SweepGremlyHeader;
