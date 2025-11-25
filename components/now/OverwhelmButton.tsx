/**
 * Overwhelm Button Component
 * Floating action button for when users feel stuck
 */

import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Text } from '../../ui';
import { makeStyles } from '../../design/makeStyles';

interface OverwhelmButtonProps {
  onPress: () => void;
}

const useStyles = makeStyles((t) => ({
  container: {
    position: 'absolute',
    bottom: 80,
    right: t.spacing[4],
    backgroundColor: t.colors.mossGreen, // Moss Green FAB
    borderRadius: t.radius[4], // 20px - pill shaped
    paddingVertical: t.spacing[3],
    paddingHorizontal: t.spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing[2],
    ...t.elevation.lg, // Large elevation for FAB
  },
  text: {
    fontSize: 20,
  },
  label: {
    fontSize: t.typography.size.sm,
    fontFamily: t.typography.fontFamily.medium,
    color: '#FFFFFF',
  },
}));

export function OverwhelmButton({ onPress }: OverwhelmButtonProps) {
  const styles = useStyles();

  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <Text style={styles.text}>😮‍💨</Text>
      <Text style={styles.label}>Feeling stuck?</Text>
    </TouchableOpacity>
  );
}
