/**
 * InsightsCard - Displays AI-generated summary and insights for a space
 */

import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, type ViewStyle } from 'react-native';
import { format } from 'date-fns';
import { lightTokens } from '../../design/tokens';

interface InsightsCardProps {
  summary?: string | null;
  loading?: boolean;
  lastUpdated?: string | null;
}

export function InsightsCard({ summary, loading, lastUpdated }: InsightsCardProps) {
  if (loading) {
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.icon}>✨</Text>
          <Text style={styles.title}>AI Insights</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={lightTokens.colors.primary} />
          <Text style={styles.loadingText}>Generating insights...</Text>
        </View>
      </View>
    );
  }

  if (!summary) {
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.icon}>✨</Text>
          <Text style={styles.title}>AI Insights</Text>
        </View>
        <Text style={styles.emptyText}>
          AI insights will appear here once you add some content to this space.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.icon}>✨</Text>
        <Text style={styles.title}>AI Insights</Text>
      </View>
      <Text style={styles.summary}>{summary}</Text>
      {lastUpdated && (
        <Text style={styles.timestamp}>
          Last updated:{' '}
          {format(new Date(lastUpdated), 'MMM d, yyyy')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: lightTokens.colors.accentPeri,
    borderRadius: lightTokens.radius[3],
    padding: lightTokens.spacing[4],
    ...lightTokens.elevation.sm,
  } as ViewStyle,
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: lightTokens.spacing[3],
  },
  icon: {
    fontSize: 24,
    marginRight: lightTokens.spacing[2],
  },
  title: {
    fontSize: lightTokens.typography.size.lg,
    fontWeight: '600',
    color: lightTokens.colors.text,
  },
  summary: {
    fontSize: lightTokens.typography.size.md,
    lineHeight: lightTokens.typography.lineHeight.relaxed * lightTokens.typography.size.md,
    color: lightTokens.colors.text,
    marginBottom: lightTokens.spacing[2],
  },
  timestamp: {
    fontSize: lightTokens.typography.size.xs,
    color: lightTokens.colors.subtle,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: lightTokens.spacing[4],
  },
  loadingText: {
    marginTop: lightTokens.spacing[2],
    fontSize: lightTokens.typography.size.sm,
    color: lightTokens.colors.subtle,
  },
  emptyText: {
    fontSize: lightTokens.typography.size.sm,
    color: lightTokens.colors.subtle,
    lineHeight: lightTokens.typography.lineHeight.normal * lightTokens.typography.size.sm,
  },
});
