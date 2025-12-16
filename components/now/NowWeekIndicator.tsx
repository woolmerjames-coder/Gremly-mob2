/**
 * NOW Week Indicator Component
 * Shows weekly habit status at a glance with circle indicators
 */

import React from 'react';
import { View } from 'react-native';
import { Box, Text } from '../../ui';
import { makeStyles } from '../../design/makeStyles';

// Local type definition - decoupled from legacy hook
export type WeekStatus = 'ahead' | 'on_track' | 'needs_attention';

interface NowWeekIndicatorProps {
  status: WeekStatus;
}

const useStyles = makeStyles((t) => ({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing[2],
  },
  label: {
    fontSize: t.typography.size.xs, // 12px
    fontFamily: t.typography.fontFamily.medium,
    color: t.colors.subtle,
    letterSpacing: 0.5,
  },
  circle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    position: 'relative',
  },
  circleAhead: {
    backgroundColor: '#2E5540', // mossGreen - filled
    borderColor: '#2E5540',
  },
  circleOnTrack: {
    backgroundColor: 'transparent',
    borderColor: '#2E5540', // mossGreen - outline
    overflow: 'hidden',
  },
  halfFill: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: '50%',
    height: 20,
    backgroundColor: '#2E5540', // mossGreen
  },
  circleNeedsAttention: {
    backgroundColor: 'transparent',
    borderColor: '#BFD8C0', // sageMist - outline only
  },
}));

export function NowWeekIndicator({ status }: NowWeekIndicatorProps) {
  const styles = useStyles();

  // Map status to circle style
  const getCircleStyle = () => {
    switch (status) {
      case 'ahead':
        return styles.circleAhead;
      case 'on_track':
        return styles.circleOnTrack;
      case 'needs_attention':
        return styles.circleNeedsAttention;
    }
  };

  return (
    <Box style={styles.container}>
      <Text style={styles.label}>WEEK:</Text>
      <View style={[styles.circle, getCircleStyle()]}>
        {status === 'on_track' && <View style={styles.halfFill} />}
      </View>
    </Box>
  );
}
