/**
 * Gremly's speech bubble on Today while today's brief waits unread (Daily
 * brief in Chat). Tapping it opens today's thread; it goes once the brief has
 * been read. Sits beside Gremly in the Today header, like the first-visit
 * bubble.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Reanimated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Text } from '../../ui/Text';
import { BRIEF } from './briefStyles';

export type BriefReadyBubbleProps = {
  lead: string;
  rest: string;
  onPress: () => void;
};

export function BriefReadyBubble({ lead, rest, onPress }: BriefReadyBubbleProps) {
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
        <Text style={styles.text}>
          <Text style={styles.lead}>{lead}</Text> {rest}
        </Text>
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
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    lineHeight: 21,
    color: BRIEF.mossInk,
  },
  lead: {
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
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
