/**
 * Overwhelm Button Component
 * Floating action button for when users feel stuck
 */
// LEGACY: replaced by NowOverwhelmCard on NowScreenV1. Kept only if used elsewhere.

import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Text } from '../../ui';
import { Icon } from '../ui/Icon';
import { makeStyles, useTokens } from '../../design/makeStyles';

interface OverwhelmButtonProps {
  onPress: () => void;
}

const useStyles = makeStyles((t) => ({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.colors.linenCream,
    borderRadius: 999,
    paddingVertical: t.spacing[1],
    paddingHorizontal: t.spacing[3],
    borderWidth: 1,
    borderColor: t.colors.mossGreen,
    ...t.elevation.sm,
  },
  icon: {
    marginRight: t.spacing[1],
  },
  label: {
    fontSize: 13,
    fontFamily: t.typography.fontFamily.medium,
    color: t.colors.mossGreen,
  },
}));

export function OverwhelmButton({ onPress }: OverwhelmButtonProps) {
  const styles = useStyles();
  const tokens = useTokens();

  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <Icon name="HelpCircle" size="sm" color={tokens.colors.mossGreen} />
      <Text style={styles.label}>Feeling overwhelmed?</Text>
    </TouchableOpacity>
  );
}
