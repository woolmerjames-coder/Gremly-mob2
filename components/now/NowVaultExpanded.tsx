/**
 * NowVaultExpanded - Expanded Mind Vault view with Recent Lists and This Week stats
 * Calm Intelligence design: flat, clean, Hub-style list rows
 */

import React, { useEffect, useMemo } from 'react';
import { Animated, TouchableOpacity, ScrollView } from 'react-native';
import { Box, Text } from '../../ui';
import { Icon } from '../ui/Icon';
import { makeStyles } from '../../design/makeStyles';
import { fadeSlideIn } from '../../lib/today/motion';
import { useReducedMotion } from '../../design/animations';
import type { MindVaultSummary } from '../../lib/now/nowTypes';

interface NowVaultExpandedProps {
  summary: MindVaultSummary;
  onPressList: (id: string) => void;
  onSeeAll: () => void;
  onCollapse: () => void;
}

const useStyles = makeStyles((t) => ({
  container: {
    backgroundColor: t.colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  header: {
    padding: t.spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing[2],
  },
  title: {
    fontSize: 14,
    fontFamily: t.typography.fontFamily.medium,
    color: t.colors.text,
    letterSpacing: 0.5,
  },
  content: {
    maxHeight: 400,
  },
  section: {
    padding: t.spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  helper: {
    fontSize: 12,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.subtle,
    marginBottom: t.spacing[2],
    lineHeight: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: t.typography.fontFamily.medium,
    color: t.colors.subtle,
    textTransform: 'uppercase',
    marginBottom: t.spacing[3],
    letterSpacing: 0.8,
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: t.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  listName: {
    fontSize: 15,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.text,
    flex: 1,
  },
  listCount: {
    fontSize: 13,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.subtle,
    marginLeft: t.spacing[2],
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: t.spacing[2],
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontFamily: t.typography.fontFamily.bold,
    color: t.colors.mossGreen,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.subtle,
  },
  buttons: {
    flexDirection: 'row',
    padding: t.spacing[4],
    gap: t.spacing[2],
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
  },
  button: {
    flex: 1,
    paddingVertical: t.spacing[3],
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: t.colors.mossGreen,
  },
  primaryButtonText: {
    fontSize: 15,
    fontFamily: t.typography.fontFamily.medium,
    color: '#FFFFFF',
  },
  secondaryButton: {
    backgroundColor: 'rgba(191, 216, 192, 0.15)',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontFamily: t.typography.fontFamily.medium,
    color: t.colors.mossGreen,
  },
}));

export function NowVaultExpanded({
  summary,
  onPressList,
  onSeeAll,
  onCollapse,
}: NowVaultExpandedProps) {
  const styles = useStyles();
  const reducedMotion = useReducedMotion();
  const opacity = useMemo(() => new Animated.Value(0), []);
  const translateY = useMemo(() => new Animated.Value(20), []);

  useEffect(() => {
    fadeSlideIn(opacity, translateY, reducedMotion);
  }, [opacity, translateY, reducedMotion]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <Box style={styles.header}>
        <Box style={styles.titleRow}>
          <Icon name="BookOpen" size="sm" color="#2E5540" />
          <Text style={styles.title}>MIND VAULT</Text>
        </Box>
      </Box>

      <ScrollView style={styles.content}>
        {/* Recent Lists Section */}
        {summary.topThree.length > 0 && (
          <Box style={styles.section}>
            <Text style={styles.helper}>
              Quick access to your go-to lists (groceries, packing, workflows).
            </Text>
            <Text style={styles.sectionTitle}>Recent Lists</Text>
            {summary.topThree.map((list) => (
              <TouchableOpacity
                key={list.id}
                testID={`vault-list-${list.id}`}
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
