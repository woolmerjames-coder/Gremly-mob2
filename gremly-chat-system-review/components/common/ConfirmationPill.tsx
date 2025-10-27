/**
 * Phase 10.3: Confirmation Pill
 * Displays friendly AI decision confirmations
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../../ui/Text';
import { lightTokens } from '../../design/tokens';

interface ConfirmationPillProps {
  text: string;
  testID?: string;
}

export function ConfirmationPill({ text, testID }: ConfirmationPillProps) {
  return (
    <View style={styles.container} testID={testID}>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: lightTokens.spacing[2],
    paddingHorizontal: lightTokens.spacing[3],
    borderRadius: lightTokens.radius[3],
    backgroundColor: '#BFD8C0', // Sage Mist for confirmations
    marginTop: lightTokens.spacing[2],
    marginBottom: lightTokens.spacing[1],
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: lightTokens.typography.size.sm,
    color: '#0E3B3A', // Dark green for contrast
    fontWeight: '500',
  },
});
