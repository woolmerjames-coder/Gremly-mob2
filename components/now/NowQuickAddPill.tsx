/**
 * NowQuickAddPill - Pill button to trigger quick add modal
 * Light green (sageMist) background with circular Gremly face button
 */

import React from 'react';
import { TouchableOpacity, Image } from 'react-native';
import { Text } from '../../ui';
import { makeStyles } from '../../design/makeStyles';

interface NowQuickAddPillProps {
  onPress: () => void;
}

const useStyles = makeStyles((t) => ({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: t.colors.sageMist,
    paddingVertical: t.spacing[2],
    paddingHorizontal: t.spacing[4],
    borderRadius: 999, // Fully rounded
    marginTop: t.spacing[3],
    marginBottom: t.spacing[2],
    gap: t.spacing[2],
    ...t.elevation.md,
  },
  mascotIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  label: {
    fontSize: t.typography.size.sm,
    fontFamily: t.typography.fontFamily.medium,
    color: 'rgba(46,85,64,0.85)', // Same as MindDrop submitLabelDisabled
  },
}));

export function NowQuickAddPill({ onPress }: NowQuickAddPillProps) {
  const styles = useStyles();

  return (
    <TouchableOpacity style={styles.pill} onPress={onPress} activeOpacity={0.8}>
      <Image
        source={require('../../assets/buttonforHP.png')}
        style={styles.mascotIcon}
        resizeMode="contain"
      />
      <Text style={styles.label}>Add to Today's Focus</Text>
    </TouchableOpacity>
  );
}
