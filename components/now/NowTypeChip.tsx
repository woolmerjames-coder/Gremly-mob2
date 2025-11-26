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

const useStyles = makeStyles((t) => ({
  container: {
    borderRadius: t.radius[1],
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: t.typography.size.xs,
    fontFamily: t.typography.fontFamily.medium,
    color: t.colors.subtle,
    textTransform: 'capitalize',
  },
  habit: {
    backgroundColor: '#EAF7ED',
  },
  todo: {
    backgroundColor: '#E6F0FF',
  },
}));
