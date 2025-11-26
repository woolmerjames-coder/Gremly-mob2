/**
 * NOW Weekly Summary Component
 * Displays this week's Mind Vault activity (lists, journals, ideas)
 */

import React from 'react';
import { Pressable, View, Text } from 'react-native';
import { makeStyles } from '../../design/makeStyles';

interface NowWeeklySummaryProps {
  stats: {
    lists: number;
    journals: number;
    ideas: number;
  };
  onPress?: () => void;
}

export function NowWeeklySummary({ stats, onPress }: NowWeeklySummaryProps) {
  const styles = useStyles();

  const Container = onPress ? Pressable : View;

  const total = stats.lists + stats.journals + stats.ideas;
  if (total === 0) {
    // If you prefer to always show zeros, remove this early return.
    // For now we keep it visible so layout is stable:
    // return null;
  }

  return (
    <Container
      style={styles.container}
      onPress={onPress}
      // optional better touch feedback
      {...(onPress ? { android_ripple: { color: '#00000010' } } : null)}
    >
      <Text style={styles.label}>This week…</Text>

      <View style={styles.row}>
        <Text style={styles.stat}>{stats.lists} lists</Text>
        <Text style={styles.stat}>{stats.journals} journals</Text>
        <Text style={styles.stat}>{stats.ideas} ideas</Text>
      </View>
    </Container>
  );
}

const useStyles = makeStyles((t) => ({
  container: {
    paddingHorizontal: t.spacing[3],
    paddingTop: 0,
    paddingBottom: t.spacing[3],
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: t.typography.fontFamily.medium,
    color: t.colors.subtle,
    marginBottom: t.spacing[3],
  },
  row: {
    marginTop: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stat: {
    fontSize: 12,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.subtle,
  },
}));
