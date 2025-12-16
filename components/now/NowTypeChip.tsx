/**
 * Shared type chip for NOW + MindDrop parity
 */

import React from 'react';
import { Box, Text } from '../../ui';
import { makeStyles } from '../../design/makeStyles';

type NowType = 'habit' | 'todo';

interface NowTypeChipProps {
  type: NowType;
}

const LABELS: Record<NowType, string> = {
  habit: 'Habit',
  todo: 'Todo',
};

export function NowTypeChip({ type }: NowTypeChipProps) {
  const styles = useStyles();
  const variantStyle = type === 'habit' ? styles.habit : styles.todo;

  return (
    <Box style={[styles.container, variantStyle]}>
      <Text style={styles.label}>{LABELS[type]}</Text>
    </Box>
  );
}

/** Compact chip for meta line - minimal vertical footprint */
const useStyles = makeStyles((t) => ({
  container: {
    borderRadius: t.radius[1],
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  label: {
    fontSize: 11,
    fontFamily: t.typography.fontFamily.medium,
    color: t.colors.subtle,
    textTransform: 'capitalize',
    lineHeight: 13,
  },
  habit: {
    backgroundColor: '#EAF7ED',
  },
  todo: {
    backgroundColor: '#E6F0FF',
  },
}));
