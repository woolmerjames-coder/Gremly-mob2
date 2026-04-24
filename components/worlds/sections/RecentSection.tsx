// components/worlds/sections/RecentSection.tsx
//
// Shared RECENT section primitive — renders the RECENT label + up to `limit`
// recent drop rows with date chips. Self-contained: fetches its own recent refs
// and resolves bodies from the world drops store.

import { View, StyleSheet } from 'react-native';
import { format } from 'date-fns';
import { lightTokens } from '../../../design/tokens';
import { Text } from '../../../ui';
import { useRecentDropsForWorld, useWorldDrops } from '../../../lib/store/worldsSelectors';

interface RecentSectionProps {
  worldId: string;
  /**
   * Max rows to show. Default 2.
   */
  limit?: number;
}

export function RecentSection({ worldId, limit = 2 }: RecentSectionProps) {
  const recentRefs = useRecentDropsForWorld(worldId, limit);
  const drops = useWorldDrops(worldId);

  const recentDrops = recentRefs
    .map((ref) => {
      if (ref.drop_type === 'todo') {
        const t = drops.todos.find((x) => x.id === ref.drop_id);
        return t
          ? {
              id: ref.drop_id,
              label: t.name || t.title || '(untitled)',
              type: 'todo' as const,
              created_at: t.created_at,
            }
          : null;
      }
      if (ref.drop_type === 'habit') {
        const h = drops.habits.find((x) => x.id === ref.drop_id);
        return h
          ? { id: ref.drop_id, label: h.name, type: 'habit' as const, created_at: h.created_at }
          : null;
      }
      if (ref.drop_type === 'note') {
        const n = drops.notes.find((x) => x.id === ref.drop_id);
        return n
          ? {
              id: ref.drop_id,
              label: n.title || n.body?.slice(0, 40) || '(note)',
              type: 'note' as const,
              created_at: n.created_at,
            }
          : null;
      }
      return null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (recentDrops.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>RECENT</Text>
      {recentDrops.map((drop, idx) => {
        const formattedDate = drop.created_at
          ? format(new Date(drop.created_at), 'MMM d').toUpperCase()
          : '';
        if (!formattedDate) return null;
        const isLast = idx === recentDrops.length - 1;
        return (
          <View key={drop.id} style={[styles.row, !isLast && styles.rowDivider]}>
            <Text style={styles.recentDate}>{formattedDate}</Text>
            <Text style={styles.recentBody} numberOfLines={1}>
              {drop.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginBottom: 26,
  },
  sectionLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: lightTokens.colors.warmGrey,
    textTransform: 'uppercase',
    paddingHorizontal: 2,
    marginBottom: 8,
  },
  row: {
    paddingVertical: 10,
    paddingHorizontal: 2,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightTokens.colors.worldsCardBorder,
  },
  recentDate: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    fontWeight: '600',
    color: lightTokens.colors.warmGrey,
    minWidth: 44,
    letterSpacing: 0.4,
    marginTop: 1,
  },
  recentBody: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 19,
    color: lightTokens.colors.worldsInk,
  },
});
