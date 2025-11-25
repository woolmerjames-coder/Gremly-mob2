/**
 * NOW Week Indicator Component
 * Shows weekly habit status at a glance with half-circle visual
 */

import React from 'react';
import { View } from 'react-native';
import { Box, Text } from '../../ui';
import { makeStyles } from '../../design/makeStyles';
import type { WeekStatus } from '../../lib/now/useNowData';

interface NowWeekIndicatorProps {
  status: WeekStatus;
}

const useStyles = makeStyles((t) => ({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing[2],
    paddingVertical: t.spacing[1],
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  halfCircle: {
    width: 8,
    height: 16,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
}));

export function NowWeekIndicator({ status }: NowWeekIndicatorProps) {
  const styles = useStyles();

  // Use design tokens for colors
  const getStatusStyle = () => {
    switch (status) {
      case 'ahead':
        return {
          borderColor: '#2E5540', // mossGreen - full circle
          backgroundColor: '#2E5540',
        };
      case 'on_track':
        return {
          borderColor: '#2E5540', // mossGreen border
          backgroundColor: 'transparent', // half filled
        };
      case 'needs_attention':
        return {
          borderColor: '#BFD8C0', // sageMist - empty circle
          backgroundColor: 'transparent',
        };
    }
  };

  const statusStyle = getStatusStyle();

  return (
    <Box style={styles.container}>
      <Text style={styles.label}>WEEK:</Text>
      <View style={[styles.circle, { borderColor: statusStyle.borderColor }]}>
        {status === 'on_track' && (
          <View style={[styles.halfCircle, { backgroundColor: statusStyle.borderColor }]} />
        )}
        {status === 'ahead' && (
          <View
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: statusStyle.backgroundColor,
            }}
          />
        )}
      </View>
    </Box>
  );
}
