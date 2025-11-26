/**
 * NOW Weekly Summary Component
 * Displays this week's Mind Vault activity (lists, journals, ideas)
 */

import React from 'react';
import { View, Text } from 'react-native';
import { makeStyles } from '../../design/makeStyles';

interface NowWeeklySummaryProps {
  stats: {
    lists: number;
    journals: number;
    ideas: number;
  };
}

export function NowWeeklySummary({ stats }: NowWeeklySummaryProps) {
  const styles = useStyles();

  return (
    <View style={styles.wrapper}>
      <View style={styles.labelContainer}>
        <Text style={styles.label}>This week</Text>
      </View>
      <View style={styles.statsContainer}>
        <Text style={styles.statsLine}>
          {stats.lists} lists • {stats.journals} journals • {stats.ideas} ideas
        </Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrapper: {
    paddingHorizontal: t.spacing[4],
    marginTop: 0,
    marginBottom: 8,
    alignItems: 'center',
  },
  labelContainer: {
    marginTop: -8,
    marginBottom: 4,
    paddingHorizontal: 8,
    backgroundColor: t.colors.bg,
    alignSelf: 'center',
    zIndex: 1,
  },
  label: {
    fontSize: 12,
    fontFamily: t.typography.fontFamily.medium,
    color: t.colors.subtle,
    textAlign: 'center',
  },
  statsContainer: {
    alignItems: 'center',
  },
  statsLine: {
    fontSize: 14,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.subtle,
    textAlign: 'center',
  },
}));
