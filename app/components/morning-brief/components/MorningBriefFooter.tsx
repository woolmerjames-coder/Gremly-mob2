/**
 * MorningBriefFooter
 *
 * Bottom action bar for Morning Brief.
 * Single "Looks good" button to confirm and close.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND } from '../../../../design/brand';

interface MorningBriefFooterProps {
  onComplete: () => void;
  isLoading?: boolean;
}

export function MorningBriefFooter({ onComplete, isLoading = false }: MorningBriefFooterProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
      <Pressable
        style={[styles.button, isLoading && styles.buttonDisabled]}
        onPress={onComplete}
        disabled={isLoading}
        testID="morning-brief-complete"
      >
        <Text style={styles.buttonText}>{isLoading ? 'Saving...' : 'Looks good'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.borderSubtle,
    backgroundColor: BRAND.colors.linenCream,
  },
  button: {
    backgroundColor: '#2E5540',
    borderRadius: BRAND.radius.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
