/**
 * NOW Vault Bar Component (Collapsed)
 * Displays Mind Vault summary with quick access pills
 */

import React from 'react';
import { ScrollView, TouchableOpacity } from 'react-native';
import { Box, Text } from '../../ui';
import { makeStyles } from '../../design/makeStyles';
import type { MindVaultSummary } from '../../lib/now/nowTypes';

interface NowVaultBarProps {
  summary: MindVaultSummary;
  expanded: boolean;
  onToggleExpand: () => void;
}

const useStyles = makeStyles((t) => ({
  container: {
    backgroundColor: t.colors.sageMist,
    paddingVertical: t.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: t.spacing[4],
    marginBottom: t.spacing[2],
  },
  headerText: {
    flex: 1,
    marginRight: t.spacing[2],
  },
  title: {
    fontSize: t.typography.size.md,
    fontFamily: t.typography.fontFamily.medium,
    color: t.colors.text,
  },
  subtitle: {
    fontSize: t.typography.size.xs,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.subtle,
    marginTop: t.spacing[0],
  },
  expandIcon: {
    fontSize: t.typography.size.xs,
    color: t.colors.subtle,
  },
  pillsContainer: {
    paddingHorizontal: t.spacing[4],
    gap: t.spacing[2],
  },
  pill: {
    backgroundColor: t.colors.surface,
    paddingHorizontal: t.spacing[3],
    paddingVertical: t.spacing[2],
    borderRadius: t.radius[4], // 20px - full pill
    borderWidth: 1,
    borderColor: t.colors.border,
    marginRight: t.spacing[2],
    ...t.elevation.sm,
  },
  pillText: {
    fontSize: t.typography.size.sm,
    fontFamily: t.typography.fontFamily.medium,
    color: t.colors.text,
  },
}));

export function NowVaultBar({ summary, expanded, onToggleExpand }: NowVaultBarProps) {
  const styles = useStyles();
  const pills = [
    ...summary.topThree.map((list) => `${list.name} • ${list.itemCount}`),
    summary.overflowCount > 0 ? `+${summary.overflowCount} more` : null,
  ].filter(Boolean) as string[];

  if (pills.length === 0) {
    return null;
  }

  return (
    <Box style={styles.container}>
      <TouchableOpacity style={styles.header} onPress={onToggleExpand} activeOpacity={0.7}>
        <Box style={styles.headerText}>
          <Text style={styles.title}>📚 Mind Vault</Text>
          {summary.topThree.length > 0 && (
            <Text style={styles.subtitle}>Your lists live here – groceries, packing, ideas.</Text>
          )}
        </Box>
        <Text style={styles.expandIcon}>{expanded ? '▼' : '▶'}</Text>
      </TouchableOpacity>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillsContainer}
      >
        {pills.map((pill, index) => (
          <TouchableOpacity
            key={index}
            style={styles.pill}
            onPress={onToggleExpand}
            activeOpacity={0.7}
          >
            <Text style={styles.pillText}>{pill}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </Box>
  );
}
