/**
 * Gremly's speech bubble on Today while today's brief waits unread (Daily
 * brief in Chat), or in the evening while the wrap up waits. Tapping it opens
 * today's thread; it goes once the brief has been read. The wrap up's line
 * can be put away with its X. Sits beside Gremly in the Today header, like
 * the first-visit bubble. One size, all bold.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { X } from 'lucide-react-native';
import Reanimated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Text } from '../../ui/Text';
import { BRIEF } from './briefStyles';

export type BriefReadyBubbleProps = {
  lead: string;
  rest: string;
  onPress: () => void;
  /** Puts the line away for the day; shown as an X when given */
  onDismiss?: () => void;
};

export function BriefReadyBubble({ lead, rest, onPress, onDismiss }: BriefReadyBubbleProps) {
  return (
    <Reanimated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(200)}
      style={styles.container}
      pointerEvents="box-none"
    >
      <Pressable
        style={styles.bubble}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${lead} ${rest}`}
        testID="today-brief-ready"
      >
        <Text style={styles.text}>{`${lead} ${rest}`}</Text>
        {onDismiss ? (
          <Pressable
            onPress={onDismiss}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            testID="today-brief-ready-dismiss"
            style={styles.dismiss}
          >
            <X size={14} color={BRIEF.mossInk} strokeWidth={2.4} />
          </Pressable>
        ) : null}
      </Pressable>
      <View style={styles.tail} />
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 90,
    right: 20,
    alignItems: 'flex-end',
    zIndex: 1000,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRIEF.white,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    maxWidth: 250,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  text: {
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    fontSize: 15,
    lineHeight: 21,
    color: BRIEF.mossInk,
    flexShrink: 1,
  },
  dismiss: {
    marginLeft: 10,
  },
  tail: {
    position: 'absolute',
    top: -6,
    right: 24,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: BRIEF.white,
  },
});
