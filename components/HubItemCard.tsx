import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, radii, spacing, shadows } from '../theme/tokens';
import { type } from '../theme/typography';
import type { Tag } from '../lib/types';
import { Icon } from './ui/Icon';
import { Lock } from 'lucide-react-native';

export type HubKind = 'habit' | 'todo' | 'note';
export type Placement = 'ai' | 'user';

export type HubItem = {
  id: string;
  kind: HubKind;
  title: string;
  note?: string;
  date?: string; // ISO or pretty
  placedBy?: Placement; // 'ai' => show sparkle
  tags?: Tag[]; // Up to 2 tags to display
  spaceName?: string; // Space name to display (only when scope is "Everywhere")
  showSpaceChip?: boolean; // Whether to show space chip (true when scope is Everywhere)
  spaceId?: string | null; // Space ID for navigation
  private?: boolean; // Phase L7: Private mode for logs
};

const kindIconName: Record<HubKind, 'Activity' | 'CheckCircle2' | 'FileText'> = {
  habit: 'Activity',
  todo: 'CheckCircle2',
  note: 'FileText',
};

export default function HubItemCard({
  item,
  onPress,
  onMove,
  showMove,
  onSpacePress,
  testID,
}: {
  item: HubItem;
  onPress?: () => void;
  onMove?: () => void;
  showMove?: boolean;
  onSpacePress?: (spaceId: string) => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.card, shadows.card]} testID={testID}>
      <View style={styles.row}>
        <View style={styles.iconContainer}>
          <Icon name={kindIconName[item.kind]} size="sm" color={colors.deepTeal} />
        </View>
        <View style={styles.main}>
          <View style={styles.titleRow}>
            <Text numberOfLines={1} style={[styles.title, { flex: 1 }]}>
              {item.title}
            </Text>
            {item.kind === 'note' && item.private === true && (
              <Lock size={12} color="#777" style={{ marginLeft: 4 }} />
            )}
          </View>
          {/* Meta row: [AI badge] [Space chip] [Tag chips] [Date] */}
          <View style={styles.metaRow}>
            {/* AI badge */}
            {item.placedBy === 'ai' && (
              <View style={styles.aiBadge} testID="ai-badge">
                <Icon name="Sparkles" size="xs" color={colors.white} />
                <Text style={styles.aiBadgeText}>AI</Text>
              </View>
            )}

            {/* Space chip (only when showSpaceChip is true and spaceName exists) */}
            {item.showSpaceChip && item.spaceName && item.spaceId && (
              <TouchableOpacity
                style={styles.spaceChip}
                onPress={() => onSpacePress?.(item.spaceId!)}
                testID="space-chip"
              >
                <Icon name="MapPin" size="xs" color={colors.deepTeal} />
                <Text style={styles.spaceChipText}>{item.spaceName}</Text>
              </TouchableOpacity>
            )}

            {/* Tag chips (show up to 2) */}
            {item.tags && item.tags.length > 0 && (
              <>
                {item.tags.slice(0, 2).map((tag) => (
                  <View
                    key={tag.id}
                    style={[
                      styles.tagChip,
                      tag.color && { backgroundColor: tag.color, borderColor: tag.color },
                    ]}
                    testID={`tag-chip-${tag.id}`}
                  >
                    <Text style={styles.tagChipText}>{tag.name}</Text>
                  </View>
                ))}
                {item.tags.length > 2 && (
                  <Text style={styles.tagMore}>+{item.tags.length - 2}</Text>
                )}
              </>
            )}

            {/* Date (for todos) */}
            {!!item.date && <Text style={[type.meta, styles.dateText]}>{item.date}</Text>}
          </View>
        </View>
        {showMove && (
          <TouchableOpacity onPress={onMove} style={styles.moveBtn} testID="move-btn">
            <Text style={styles.moveText}>Move</Text>
          </TouchableOpacity>
        )}
      </View>
      {/* Optionally show a single-line note preview */}
      {!!item.note && (
        <Text numberOfLines={2} style={styles.notePreview}>
          {item.note}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radii['2xl'],
    padding: spacing.md,
    marginVertical: spacing.xs,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  iconContainer: {
    marginRight: spacing.md,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: { fontSize: 18, marginRight: spacing.md },
  main: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  title: { fontSize: 16, fontWeight: '700', color: colors.ink, flex: 1 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  aiBadge: {
    backgroundColor: colors.periwinkle,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radii.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  aiBadgeText: { fontSize: 10, color: colors.white, fontWeight: '600' },
  spaceChip: {
    backgroundColor: colors.mint,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.mint,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  spaceChipText: {
    fontSize: 10,
    color: colors.deepTeal,
    fontWeight: '600',
  },
  tagChip: {
    backgroundColor: colors.deepTeal,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  tagChipText: {
    fontSize: 10,
    color: colors.white,
    fontWeight: '600',
  },
  tagMore: {
    fontSize: 10,
    color: colors.gray600,
    fontWeight: '600',
  },
  dateText: {
    marginLeft: 'auto', // Push date to the right
  },
  moveBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.mint,
  },
  moveText: { color: colors.deepTeal, fontWeight: '600' },
  notePreview: { marginTop: spacing.xs, color: colors.gray600, fontSize: 13 },
});
