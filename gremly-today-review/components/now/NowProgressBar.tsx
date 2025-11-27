import React from 'react';
import { View, Text } from 'react-native';
import { makeStyles } from '../../design/makeStyles';

type NowProgressBarProps = {
  progress: number; // Expected range 0-1
};

export function NowProgressBar({ progress }: NowProgressBarProps) {
  const styles = useStyles();
  const clamped = Math.max(0, Math.min(1, progress ?? 0));
  const percent = Math.round(clamped * 100);

  return (
    <View
      style={styles.container}
      accessibilityRole="progressbar"
      accessibilityValue={{ now: percent, min: 0, max: 100 }}
    >
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percent}%` }]} />
      </View>
      <Text style={styles.label}>{percent}%</Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: t.spacing[4],
    marginTop: t.spacing[2],
    marginBottom: t.spacing[1],
  },
  track: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: t.colors.border,
    overflow: 'hidden',
    marginRight: t.spacing[2],
  },
  fill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: t.colors.mossGreen,
  },
  label: {
    fontSize: t.typography.size.xs,
    fontFamily: t.typography.fontFamily.medium,
    color: t.colors.subtle,
  },
}));
