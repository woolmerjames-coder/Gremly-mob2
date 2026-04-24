// components/worlds/ArchetypeWorldHero.tsx

import { View, StyleSheet } from 'react-native';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import MascotIcon from '../MascotIcon';
import type { World } from '../../lib/supabase/types';

interface ArchetypeWorldHeroProps {
  world: World;
  velocityDotColor: string;
  statusLine: string;
}

export function ArchetypeWorldHero({
  world,
  velocityDotColor,
  statusLine,
}: ArchetypeWorldHeroProps) {
  const title = world.display_name || world.name;
  const summary = world.summary?.trim() || null;

  return (
    <View style={styles.container}>
      {/* Name + velocity dot + accent circle row */}
      <View style={styles.topRow}>
        <View style={styles.titleColumn}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <View style={styles.statusRow}>
            <View style={[styles.velocityDot, { backgroundColor: velocityDotColor }]} />
            <Text style={styles.statusText} numberOfLines={1}>
              {statusLine}
            </Text>
          </View>
        </View>
        <View style={styles.mascotWrap}>
          <MascotIcon size={64} pose={world.world_type === 'project' ? 'celebrate' : 'neutral'} />
        </View>
      </View>

      {/* Serif summary (or placeholder) */}
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
    marginRight: 12,
  },
  title: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 40,
    fontWeight: '700',
    lineHeight: 44,
    letterSpacing: -0.8,
    color: lightTokens.colors.worldsInk,
  },
  statusRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  velocityDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: lightTokens.colors.warmGrey,
    flexShrink: 1,
  },
  mascotWrap: {
    flexShrink: 0,
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: {
    fontFamily: 'Inter-Regular',
    fontSize: 17,
    lineHeight: 25,
    color: lightTokens.colors.worldsInk,
  },
  summaryPlaceholder: {
    color: lightTokens.colors.warmGrey,
    fontStyle: 'italic',
  },
});
