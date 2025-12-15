/**
 * ForgetSection - "So you don't forget..." section
 * Shows items that need attention (stale todos, ideas without spaces, etc.)
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';
import { colors, radii, spacing } from '../../theme/tokens';
import type { NeedsAttentionItem } from '../../lib/selectors/hubSelectors';
import type { HubItem } from '../HubItemCard';

export interface ForgetSectionProps {
  items: NeedsAttentionItem[];
  onItemPress: (item: NeedsAttentionItem) => void;
  toHubItem: (record: any) => HubItem;
}

function formatReasonLabel(item: NeedsAttentionItem): string {
  if (item.reason === 'todo_missing_due_date_stale') {
    return `No due date · ${item.ageInDays} days ago`;
  }
  if (item.reason === 'idea_stale') {
    return `Idea · ${item.ageInDays} days ago`;
  }
  if (item.reason === 'unorganized_stale') {
    return `Needs organizing · ${item.ageInDays} days ago`;
  }
  return `${item.ageInDays} days ago`;
}

export default function ForgetSection({ items, onItemPress, toHubItem }: ForgetSectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>So you don't forget…</Text>
        {items.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{items.length}</Text>
          </View>
        )}
      </View>
      {items.length > 0 ? (
        items.map((attentionItem) => {
          const record = attentionItem.item;
          const hubItem = toHubItem(record);
          return (
            <TouchableOpacity
              key={record.id}
              style={styles.attentionRow}
              onPress={() => onItemPress(attentionItem)}
              testID={`attention-item-${record.id}`}
            >
              <View style={styles.attentionContent}>
                <Text style={styles.attentionTitle} numberOfLines={1}>
                  {hubItem.title}
                </Text>
                <Text style={styles.attentionReason}>{formatReasonLabel(attentionItem)}</Text>
              </View>
            </TouchableOpacity>
          );
        })
      ) : (
        <View style={styles.attentionEmptyState} testID="attention-empty">
          <View style={styles.attentionEmptyContent}>
            <CheckCircle2 size={16} color={colors.gray400} style={{ marginRight: spacing.xs }} />
            <Text style={styles.attentionEmptyText}>All caught up</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing['2xl'],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.gray600,
    marginBottom: spacing.md,
    letterSpacing: 0.2,
  },
  countBadge: {
    marginLeft: spacing.xs,
    backgroundColor: colors.gray100,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.gray400,
  },
  attentionRow: {
    backgroundColor: colors.cream,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.gray200,
  },
  attentionContent: {
    flex: 1,
  },
  attentionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.ink,
    marginBottom: 2,
  },
  attentionReason: {
    fontSize: 12,
    color: colors.gray400,
  },
  attentionEmptyState: {
    paddingVertical: spacing.md,
  },
  attentionEmptyContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  attentionEmptyText: {
    fontSize: 14,
    color: colors.gray400,
  },
});
