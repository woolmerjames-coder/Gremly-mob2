// components/worlds/ArchetypeWorldHero.tsx

import { View, StyleSheet } from 'react-native';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import MascotLottie from '../../app/components/MascotLottie';
import type { World } from '../../lib/supabase/types';
import type { PillColors } from './layouts/archetypeHelpers';

interface ArchetypeWorldHeroProps {
  world: World;
  statusLine: string;
  pillColors: PillColors;
}

export function ArchetypeWorldHero({ world, statusLine, pillColors }: ArchetypeWorldHeroProps) {
  const title = world.display_name || world.name;
  const summary = world.summary?.trim() || null;

  return (
    <View style={styles.container}>
      {/* Title + pill row + mascot */}
      <View style={styles.topRow}>
        <View style={styles.titleColumn}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <View style={styles.statusPillRow}>
            <View style={[styles.statusPill, { backgroundColor: pillColors.bg }]}>
              <View style={[styles.statusPillDot, { backgroundColor: pillColors.dot }]} />
              <Text style={[styles.statusPillText, { color: pillColors.text }]} numberOfLines={1}>
                {statusLine}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.mascotWrap}>
          <MascotLottie width={100} />
        </View>
      </View>

      {/* World summary */}
      {summary ? (
        <Text style={styles.summary}>{summary}</Text>
      ) : (
        <Text style={[styles.summary, styles.summaryPlaceholder]}>
          No summary yet. Gremly&apos;s classifier will write one after your next weekly run.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 24,
  },
  titleColumn: {
    flex: 1,
    marginRight: 14,
  },
  title: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 40,
    fontWeight: '700',
    lineHeight: 44,
    letterSpacing: -0.8,
    color: lightTokens.colors.worldsInk,
  },
  statusPillRow: {
    marginTop: 14,
    flexDirection: 'row',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  statusPillDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusPillText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    letterSpacing: 0.1,
  },
  mascotWrap: {
    flexShrink: 0,
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  summary: {
    marginTop: 28,
    fontFamily: 'Inter-Regular',
    fontSize: 17,
    lineHeight: 26,
    color: lightTokens.colors.worldsInk,
  },
  summaryPlaceholder: {
    color: lightTokens.colors.warmGrey,
    fontStyle: 'italic',
  },
});
