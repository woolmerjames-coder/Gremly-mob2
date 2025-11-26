/**
 * NOW Vault Bar Component (Collapsed)
 * Displays Mind Vault summary with quick access pills
 * Calm Intelligence design: subtle, flat, no colored boxes
 */

import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Box, Text } from '../../ui';
import { Icon } from '../ui/Icon';
import { makeStyles } from '../../design/makeStyles';
import type { MindVaultSummary } from '../../lib/now/nowTypes';

interface NowVaultBarProps {
  summary: MindVaultSummary;
  expanded: boolean;
  onToggleExpand: () => void;
}

const useStyles = makeStyles((t) => ({
  container: {
    backgroundColor: t.colors.bg, // Flat background, no colored box
    paddingVertical: t.spacing[2], // Compact: 8px vertical
    paddingHorizontal: t.spacing[4], // 16px horizontal
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: t.spacing[2], // 8px gap between icon and text
  },
  textContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing[2],
  },
  title: {
    fontSize: 14, // Small, subtle
    fontFamily: t.typography.fontFamily.medium,
    color: t.colors.text,
  },
  caption: {
    fontSize: 12, // Caption style
    fontFamily: t.typography.fontFamily.regular,
    color: t.colors.subtle,
    marginTop: 2,
    lineHeight: 16,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: t.spacing[2],
    marginTop: t.spacing[2],
  },
  pill: {
    backgroundColor: 'rgba(191, 216, 192, 0.15)', // Very light Sage Mist tint (10%)
    paddingHorizontal: t.spacing[2], // Compact
    paddingVertical: 4,
    borderRadius: 4, // Minimal radius
  },
  pillText: {
    fontSize: 12,
    fontFamily: t.typography.fontFamily.medium,
    color: t.colors.mossGreen,
  },
  expandButton: {
    paddingLeft: t.spacing[2],
  },
  expandIcon: {
    fontSize: 10,
    color: t.colors.subtle,
  },
}));

export function NowVaultBar({ summary, expanded, onToggleExpand }: NowVaultBarProps) {
  const styles = useStyles();

  // Calculate weekly summary stats
  const hasWeeklyData =
    summary.thisWeekStats.journalCount > 0 ||
    summary.thisWeekStats.ideaCount > 0 ||
    summary.thisWeekStats.personCount > 0;

  const weeklyParts: string[] = [];
  if (summary.thisWeekStats.journalCount > 0) {
    weeklyParts.push(
      `${summary.thisWeekStats.journalCount} journal${summary.thisWeekStats.journalCount !== 1 ? 's' : ''}`,
    );
  }
  if (summary.thisWeekStats.ideaCount > 0) {
    weeklyParts.push(
      `${summary.thisWeekStats.ideaCount} idea${summary.thisWeekStats.ideaCount !== 1 ? 's' : ''}`,
    );
  }
  if (summary.topThree.length > 0) {
    weeklyParts.push(`${summary.topThree.length} list${summary.topThree.length !== 1 ? 's' : ''}`);
  }
  if (summary.thisWeekStats.personCount > 0) {
    weeklyParts.push(
      `${summary.thisWeekStats.personCount} person note${summary.thisWeekStats.personCount !== 1 ? 's' : ''}`,
    );
  }
  const weeklySummary = weeklyParts.length > 0 ? `This week: ${weeklyParts.join(' • ')}` : '';

  const hasAnyData = summary.topThree.length > 0 || hasWeeklyData;

  // Build pills for lists
  const pills = [
    ...summary.topThree.map((list) => `${list.name} • ${list.itemCount}`),
    summary.overflowCount > 0 ? `+${summary.overflowCount} more` : null,
  ].filter(Boolean) as string[];

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onToggleExpand}
      activeOpacity={0.85}
      testID="vault-bar"
    >
      <Box style={styles.content}>
        <Box style={styles.left}>
          <Icon name="BookOpen" size="sm" color="#2E5540" />
          <Box style={styles.textContainer}>
            <Box style={styles.titleRow}>
              <Text style={styles.title}>Mind Vault</Text>
            </Box>

            {/* Empty state */}
            {!hasAnyData && (
              <Text style={styles.caption}>Capture lists, journals, and ideas here.</Text>
            )}

            {/* Weekly summary */}
            {hasAnyData && weeklySummary && <Text style={styles.caption}>{weeklySummary}</Text>}

            {/* Inline pills */}
            {pills.length > 0 && (
              <Box style={styles.pillsRow}>
                {pills.map((pill, index) => (
                  <Box key={index} style={styles.pill}>
                    <Text style={styles.pillText}>{pill}</Text>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>

        <TouchableOpacity style={styles.expandButton} onPress={onToggleExpand} activeOpacity={0.7}>
          <Text style={styles.expandIcon}>{expanded ? '▼' : '▶'}</Text>
        </TouchableOpacity>
      </Box>
    </TouchableOpacity>
  );
}
