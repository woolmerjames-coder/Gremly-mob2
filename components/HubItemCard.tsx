import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, radii, spacing, shadows } from '../theme/tokens';
import { type } from '../theme/typography';

export type HubKind = 'habit' | 'todo' | 'note';
export type Placement = 'ai' | 'user';

export type HubItem = {
  id: string;
  kind: HubKind;
  title: string;
  note?: string;
  date?: string; // ISO or pretty
  placedBy?: Placement; // 'ai' => show sparkle
};

const kindIcon: Record<HubKind, string> = { habit: '✅', todo: '🔔', note: '📝' };

export default function HubItemCard({
  item,
  onPress,
  onMove,
  showMove,
  testID,
}: {
  item: HubItem;
  onPress?: () => void;
  onMove?: () => void;
  showMove?: boolean;
  testID?: string;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.card, shadows.card]} testID={testID}>
      <View style={styles.row}>
        <Text style={styles.icon}>{kindIcon[item.kind]}</Text>
        <View style={styles.main}>
          <Text numberOfLines={1} style={styles.title}>
            {item.title}
          </Text>
          <View style={styles.metaRow}>
            {item.placedBy === 'ai' && <Text style={styles.sparkle}>🪄 placed by Gremly</Text>}
            {!!item.date && <Text style={styles.dot}> · </Text>}
            {!!item.date && <Text style={type.meta}>{item.date}</Text>}
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
  icon: { fontSize: 18, marginRight: spacing.md },
  main: { flex: 1 },
  title: { fontSize: 16, fontWeight: '700', color: colors.ink },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  sparkle: { fontSize: 12, color: colors.periwinkle, fontStyle: 'italic' },
  dot: { color: colors.gray400 },
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
