/**
 * NowVaultExpanded - Expanded Mind Vault view with Recent Lists and This Week stats
 */

import React from 'react';
import { Animated, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Box, Text } from '../../ui';
import type { MindVaultSummary } from '../../lib/now/nowTypes';

interface NowVaultExpandedProps {
  summary: MindVaultSummary;
  onPressList: (id: string) => void;
  onSeeAll: () => void;
  onCollapse: () => void;
}

export function NowVaultExpanded({
  summary,
  onPressList,
  onSeeAll,
  onCollapse,
}: NowVaultExpandedProps) {
  return (
    <Animated.View style={styles.container}>
      <Box style={styles.header}>
        <Text style={styles.title}>📚 MIND VAULT</Text>
      </Box>

      <ScrollView style={styles.content}>
        {/* Recent Lists Section */}
        {summary.topThree.length > 0 && (
          <Box style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Lists</Text>
            {summary.topThree.map((list) => (
              <TouchableOpacity
                key={list.id}
                style={styles.listRow}
                onPress={() => onPressList(list.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.listName}>{list.name}</Text>
                <Text style={styles.listCount}>({list.itemCount} left) →</Text>
              </TouchableOpacity>
            ))}
          </Box>
        )}

        {/* This Week Section */}
        <Box style={styles.section}>
          <Text style={styles.sectionTitle}>This Week</Text>
          <Box style={styles.statsRow}>
            <Box style={styles.statItem}>
              <Text style={styles.statValue}>{summary.thisWeekStats.journalCount}</Text>
              <Text style={styles.statLabel}>Journal</Text>
            </Box>
            <Box style={styles.statItem}>
              <Text style={styles.statValue}>{summary.thisWeekStats.ideaCount}</Text>
              <Text style={styles.statLabel}>Ideas</Text>
            </Box>
            <Box style={styles.statItem}>
              <Text style={styles.statValue}>{summary.thisWeekStats.personCount}</Text>
              <Text style={styles.statLabel}>Person Notes</Text>
            </Box>
          </Box>
        </Box>
      </ScrollView>

      {/* Action Buttons */}
      <Box style={styles.buttons}>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={onSeeAll}
          activeOpacity={0.7}
        >
          <Text style={styles.primaryButtonText}>See all</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={onCollapse}
          activeOpacity={0.7}
        >
          <Text style={styles.secondaryButtonText}>Collapse</Text>
        </TouchableOpacity>
      </Box>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
  },
  content: {
    maxHeight: 400,
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#757575',
    textTransform: 'uppercase',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#FAFAFA',
  },
  listName: {
    fontSize: 16,
    color: '#212121',
    fontWeight: '500',
    flex: 1,
  },
  listCount: {
    fontSize: 14,
    color: '#757575',
    marginLeft: 8,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1976D2',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#757575',
  },
  buttons: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#F5F5F5',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#1976D2',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  secondaryButton: {
    backgroundColor: '#F5F5F5',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#757575',
  },
});
