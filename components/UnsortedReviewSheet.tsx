/**
 * UnsortedReviewSheet
 * Shows AI-placed items awaiting user confirmation
 * Phase 7: Simple confirm action that flips ai_placed=false
 */

import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { colors, radii, spacing, shadows } from '../theme/tokens';
import { type as typeStyles } from '../theme/typography';
import type { AppRecord } from '../lib/types';

export type UnsortedItem = {
  id: string;
  type: 'habit' | 'todo' | 'note';
  title: string;
  subtype?: string;
};

const typeIcon: Record<string, string> = { habit: '✅', todo: '🔔', note: '📝' };

export default function UnsortedReviewSheet({
  items,
  onConfirm,
  onClose,
  testID,
}: {
  items: UnsortedItem[];
  onConfirm: (id: string) => void;
  onClose: () => void;
  testID?: string;
}) {
  const renderItem = ({ item }: { item: UnsortedItem }) => (
    <View style={[styles.itemCard, shadows.card]} testID={`unsorted-item-${item.id}`}>
      <View style={styles.itemRow}>
        <Text style={styles.icon}>{typeIcon[item.type] || '📄'}</Text>
        <View style={styles.itemMain}>
          <Text numberOfLines={2} style={styles.itemTitle}>
            {item.title}
          </Text>
          {item.subtype && (
            <Text style={styles.itemSubtype}>{item.type === 'note' ? `${item.subtype}` : ''}</Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => onConfirm(item.id)}
          style={styles.confirmBtn}
          testID={`confirm-${item.id}`}
        >
          <Text style={styles.confirmText}>Confirm</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🌀 Unsorted Items</Text>
        <TouchableOpacity onPress={onClose} testID="unsorted-close">
          <Text style={styles.closeBtn}>✕</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.description}>
        These items were placed by Gremly AI. Review and confirm their type & placement.
      </Text>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No unsorted items</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    paddingTop: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    ...typeStyles.h2,
    fontSize: 20,
  },
  closeBtn: {
    fontSize: 24,
    color: colors.gray400,
    padding: spacing.xs,
  },
  description: {
    ...typeStyles.body,
    color: colors.gray600,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  itemCard: {
    backgroundColor: colors.cream,
    borderRadius: radii['2xl'],
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    fontSize: 18,
    marginRight: spacing.md,
  },
  itemMain: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  itemSubtype: {
    fontSize: 12,
    color: colors.gray600,
    marginTop: 2,
  },
  confirmBtn: {
    backgroundColor: colors.deepTeal,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
  },
  confirmText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
  empty: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    ...typeStyles.body,
    color: colors.gray400,
  },
});
