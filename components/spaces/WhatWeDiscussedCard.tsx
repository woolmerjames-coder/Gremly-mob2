/**
 * Phase 10.8: WhatWeDiscussedCard
 * Displays rolling Space Insight summary with gentle actions
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, type ViewStyle } from 'react-native';
import { lightTokens } from '../../design/tokens';

export interface WhatWeDiscussedCardProps {
  summary: string;
  bullets?: string[];
  onSaveAsNote?: () => void;
  onAddTodos?: () => void;
  lastUpdated?: string;
}

export function WhatWeDiscussedCard({
  summary,
  bullets = [],
  onSaveAsNote,
  onAddTodos,
  lastUpdated,
}: WhatWeDiscussedCardProps) {
  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.icon}>💬</Text>
        <Text style={styles.title}>What we discussed</Text>
      </View>

      {/* Summary text */}
      <Text style={styles.summary}>{summary}</Text>

      {/* Bullets (if any) */}
      {bullets.length > 0 && (
        <View style={styles.bulletsContainer}>
          {bullets.map((bullet, idx) => (
            <View key={idx} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{bullet}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Actions (gentle, non-pushy) */}
      <View style={styles.actions}>
        {onSaveAsNote && (
          <TouchableOpacity style={styles.actionButton} onPress={onSaveAsNote}>
            <Text style={styles.actionIcon}>📝</Text>
            <Text style={styles.actionText}>Save as note</Text>
          </TouchableOpacity>
        )}
        {onAddTodos && (
          <TouchableOpacity style={styles.actionButton} onPress={onAddTodos}>
            <Text style={styles.actionIcon}>✅</Text>
            <Text style={styles.actionText}>Add next step</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Timestamp */}
      {lastUpdated && (
        <Text style={styles.timestamp}>
          Updated{' '}
          {new Date(lastUpdated).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
          })}
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
    marginVertical: lightTokens.spacing[3],
    ...lightTokens.elevation.sm,
  } as ViewStyle,
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: lightTokens.spacing[3],
  },
  icon: {
    fontSize: 20,
    marginRight: lightTokens.spacing[2],
  },
  title: {
    fontSize: lightTokens.typography.size.md,
    fontWeight: '600',
    color: lightTokens.colors.text,
  },
  summary: {
    fontSize: lightTokens.typography.size.md,
    lineHeight: lightTokens.typography.lineHeight.relaxed * lightTokens.typography.size.md,
    color: lightTokens.colors.text,
    marginBottom: lightTokens.spacing[3],
  },
  bulletsContainer: {
    marginBottom: lightTokens.spacing[3],
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom: lightTokens.spacing[2],
  },
  bulletDot: {
    fontSize: lightTokens.typography.size.md,
    color: lightTokens.colors.primary,
    marginRight: lightTokens.spacing[2],
    width: 16,
  },
  bulletText: {
    flex: 1,
    fontSize: lightTokens.typography.size.sm,
    lineHeight: lightTokens.typography.lineHeight.relaxed * lightTokens.typography.size.sm,
    color: lightTokens.colors.text,
  },
  actions: {
    flexDirection: 'row',
    gap: lightTokens.spacing[2],
    marginBottom: lightTokens.spacing[2],
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: lightTokens.spacing[3],
    paddingVertical: lightTokens.spacing[2],
    backgroundColor: lightTokens.colors.surface,
    borderRadius: lightTokens.radius[2],
    borderWidth: 1,
    borderColor: lightTokens.colors.border,
  },
  actionIcon: {
    fontSize: 14,
    marginRight: lightTokens.spacing[1],
  },
  actionText: {
    fontSize: lightTokens.typography.size.sm,
    color: lightTokens.colors.text,
    fontWeight: '500',
  },
  timestamp: {
    fontSize: lightTokens.typography.size.xs,
    color: lightTokens.colors.subtle,
  },
});
