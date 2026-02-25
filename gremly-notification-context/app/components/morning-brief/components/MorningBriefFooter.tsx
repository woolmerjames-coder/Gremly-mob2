/**
 * MorningBriefFooter
 *
 * Bottom action bar for Morning Brief.
 * Single "Looks good" button to confirm and close.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Diamond } from 'lucide-react-native';
import { BRAND } from '../../../../design/brand';

interface MorningBriefFooterProps {
  onComplete: () => void;
  isLoading?: boolean;
  showLockIn?: boolean;
  onLockInPress?: () => void;
}

export function MorningBriefFooter({
  onComplete,
  isLoading = false,
  showLockIn = false,
  onLockInPress,
}: MorningBriefFooterProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.buttonRow}>
        {showLockIn && (
          <Pressable
            style={styles.lockInButton}
            onPress={onLockInPress}
            testID="morning-brief-lock-in"
          >
            <Diamond size={16} color="#2E5540" />
            <Text style={styles.lockInButtonText}>Lock in</Text>
          </Pressable>
        )}
        <Pressable
          style={({ pressed }) => [
            styles.button,
            isLoading && styles.buttonDisabled,
            showLockIn && styles.buttonFlex,
            pressed && !isLoading && { backgroundColor: '#D9E8DD' },
          ]}
          onPress={onComplete}
          disabled={isLoading}
          testID="morning-brief-complete"
        >
          <Text style={styles.buttonText}>{isLoading ? 'Saving...' : 'Looks good'}</Text>
        </Pressable>
      </View>
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
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    backgroundColor: '#E8F0EB',
    borderRadius: BRAND.radius.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonFlex: {
    flex: 1,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#2E5540',
  },
  lockInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: BRAND.radius.md,
    borderWidth: 1.5,
    borderColor: '#2E5540',
    backgroundColor: 'transparent',
  },
  lockInButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#2E5540',
  },
});
