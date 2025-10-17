/**
 * Common screen styles helper
 * Creates consistent styles across all screens
 */

import { StyleSheet } from 'react-native';
import type { Tokens } from './tokens';

export const createScreenStyles = (t: Tokens) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: t.colors.bg,
    },
    content: {
      flex: 1,
      paddingHorizontal: t.spacing[4],
    },
    sectionHeader: {
      marginTop: t.spacing[5],
      marginBottom: t.spacing[2],
      fontSize: t.typography.size.lg,
      lineHeight: t.typography.size.lg * t.typography.lineHeight.snug,
      fontWeight: '700',
      color: t.colors.text,
    },
    card: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius[3],
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
  });
