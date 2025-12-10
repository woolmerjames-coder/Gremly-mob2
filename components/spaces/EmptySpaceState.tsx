/**
 * EmptySpaceState - Guides users to the bottom bar actions
 *
 * No duplicate buttons - just friendly guidance to existing UI
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BRAND } from '../../design/brand';

interface EmptySpaceStateProps {
  spaceName: string;
}

export function EmptySpaceState({ spaceName }: EmptySpaceStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.message}>
        <Text style={styles.bold}>{spaceName}</Text> is ready.
      </Text>
      <Text style={styles.guidance}>
        Tap <Text style={styles.bold}>Add to Space</Text> to create todos, habits, or notes.{'\n'}
        Or chat with <Text style={styles.bold}>Gremly</Text> to brainstorm what belongs here.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 400,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 40, // Point toward bottom bar
  },
  message: {
    fontSize: 18,
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
    marginBottom: 16,
  },
  guidance: {
    fontSize: 15,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    lineHeight: 24,
  },
  bold: {
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },
});

export default EmptySpaceState;
