/**
 * Example: Using Design Tokens in StyleSheet
 *
 * This shows the correct pattern for styling with tokens.
 */

import { StyleSheet } from 'react-native';
import { colors, radius, spacing, shadow, typography } from './tokens';

// Example StyleSheet using tokens
export const exampleStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.card,
  },
  title: {
    ...typography.h2,
    color: colors.deepTeal,
    marginBottom: spacing.sm,
  },
  button: {
    backgroundColor: colors.deepTeal,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    ...shadow.button,
  },
  buttonText: {
    ...typography.label,
    color: colors.white,
  },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    ...typography.body,
    color: colors.ink,
  },
});
