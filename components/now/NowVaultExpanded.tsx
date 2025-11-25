/**
 * NOW Vault Expanded Component
 * Displays detailed Mind Vault view with lists and stats
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import { Box, Text } from '../../ui';
import type { MindVaultSummary } from '../../lib/now/nowTypes';

interface NowVaultExpandedProps {
  summary: MindVaultSummary;
}

export function NowVaultExpanded({ summary }: NowVaultExpandedProps) {
  const recentLists = summary.topThree.map((list) => ({
    name: list.name,
    count: list.itemCount,
  }));

  const weekStats = {
    journals: summary.thisWeekStats.journalCount,
    ideas: summary.thisWeekStats.ideaCount,
    persons: summary.thisWeekStats.personCount,
  };

  return (
    <Box style={styles.container}>
      <Text style={styles.sectionTitle}>Recent Lists:</Text>
      {recentLists.map((list, index) => (
        <Box key={index} style={styles.listRow}>
          <Text style={styles.listName}>{list.name}</Text>
          <Text style={styles.listCount}>{list.count} items</Text>
        </Box>
      ))}

      <Box style={styles.divider} />

      <Text style={styles.sectionTitle}>This Week:</Text>
      <Box style={styles.statsRow}>
        <Text style={styles.statText}>{weekStats.journals} journals</Text>
        <Text style={styles.statText}>{weekStats.ideas} ideas</Text>
        <Text style={styles.statText}>{weekStats.persons} persons</Text>
      </Box>
    </Box>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 8,
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  listName: {
    fontSize: 14,
    color: '#424242',
  },
  listCount: {
    fontSize: 14,
    color: '#757575',
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  statText: {
    fontSize: 13,
    color: '#757575',
  },
});
