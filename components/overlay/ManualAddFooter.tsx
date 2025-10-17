/**
 * ManualAddFooter - Phase 6 (Brand Refresh)
 * Footer with Exit (ghost) and Submit (primary) buttons + Send icon
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Send } from 'lucide-react-native';
import { overlayStyles } from '../../app/styles/manualAdd.styles';
import { theme } from '../../app/design/theme';

interface ManualAddFooterProps {
  onExit: () => void;
  onSubmit?: () => void;
  submitDisabled?: boolean;
}

export function ManualAddFooter({
  onExit,
  onSubmit,
  submitDisabled = false,
}: ManualAddFooterProps) {
  return (
    <View style={overlayStyles.footer}>
      <TouchableOpacity onPress={onExit} testID="footer-exit">
        <Text style={styles.exitText}>Exit</Text>
      </TouchableOpacity>
      {onSubmit && (
        <TouchableOpacity
          onPress={onSubmit}
          disabled={submitDisabled}
          testID="footer-submit"
          style={[styles.submitButton, submitDisabled && styles.submitDisabled]}
        >
          <Text style={styles.submitText}>Submit</Text>
          <Send size={18} color="#fff" style={{ marginLeft: 6 }} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  exitText: {
    ...theme.textStyles.label,
    color: theme.colors.deepTeal,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.deepTeal,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radii.md,
  },
  submitDisabled: {
    opacity: 0.5,
  },
  submitText: {
    ...theme.textStyles.label,
    color: '#fff',
  },
});
