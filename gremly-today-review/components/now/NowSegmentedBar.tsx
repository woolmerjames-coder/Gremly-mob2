import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { makeStyles } from '../../design/makeStyles';

type NowSegmentedBarProps = {
  progress: number;
  onPress?: () => void;
};

export function NowSegmentedBar({ progress, onPress }: NowSegmentedBarProps) {
  const styles = useStyles();
  const clamped = Math.max(0, Math.min(1, progress));
  const percent = Math.round(clamped * 100);
  const filledCount = Math.min(10, Math.round((percent / 100) * 10));

  const segments = Array.from({ length: 10 }, (_, index) => (
    <View
      key={`segment-${index}`}
      style={[
        styles.segment,
        index < filledCount ? styles.segmentFilled : styles.segmentEmpty,
        index < 9 && styles.segmentSpacing,
      ]}
    />
  ));

  const content = (
    <View style={styles.inner}>
      <View style={styles.segmentsRow}>{segments}</View>
      <Text style={styles.percentLabel}>{percent}%</Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={styles.container} accessibilityRole="button">
        {content}
      </Pressable>
    );
  }

  return <View style={styles.container}>{content}</View>;
}

const useStyles = makeStyles((t) => ({
  container: {
    paddingHorizontal: t.spacing[4],
    marginTop: t.spacing[2],
    marginBottom: t.spacing[1],
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  segmentsRow: {
    flexDirection: 'row',
    flex: 1,
  },
  segment: {
    flex: 1,
    height: 6,
    borderRadius: 999,
  },
  segmentFilled: {
    backgroundColor: t.colors.mossGreen,
  },
  segmentEmpty: {
    backgroundColor: t.colors.border,
  },
  segmentSpacing: {
    marginRight: 2,
  },
  percentLabel: {
    marginLeft: t.spacing[2],
    fontSize: t.typography.size.xs,
    fontFamily: t.typography.fontFamily.medium,
    color: t.colors.subtle,
  },
}));
