/**
 * Simple Placeholder component for disabled features
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../../ui/Text';
import { lightTokens } from '../../design/tokens';

interface PlaceholderProps {
  text: string;
  testID?: string;
}

export function Placeholder({ text, testID }: PlaceholderProps) {
  return (
    <View style={styles.container} testID={testID}>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: lightTokens.colors.bg,
    padding: lightTokens.spacing[4],
  },
  text: {
    fontSize: lightTokens.typography.size.lg,
    color: lightTokens.colors.subtle,
    textAlign: 'center',
  },
});
